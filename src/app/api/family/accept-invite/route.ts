import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { checkRate } from "@/lib/rate-limit";
import { hashInviteToken } from "@/lib/family/invite-token";

// Phase 4 follow-up: family invite acceptance.
//
// POST target for the /family-portal/verify landing page's "Open the
// family portal" button. POST (not GET) so email link-scanners can't
// pre-consume the single-use token by following the link.
//
// Flow:
//   1. Hash the supplied token, look up family_invite_tokens.
//   2. Validate: not consumed, not revoked, not expired, link not revoked.
//   3. Mark the token consumed; flip family_user_links to active.
//   4. Mint a Supabase session for the family auth user by generating a
//      magic-link token server-side and immediately verifying it on the
//      cookie-writing SSR client (the standard "custom auth → Supabase
//      session" pattern). The Supabase token is created + consumed within
//      this request, so its own short TTL never matters.
//   5. Return the redirect target.
//
// Callable WITHOUT a logged-in session — the token IS the auth proof.

interface AcceptBody {
  token: string;
}

export async function POST(request: NextRequest) {
  let body: AcceptBody;
  try {
    body = (await request.json()) as AcceptBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.token?.trim() || body.token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  // Throttle brute-force token guessing by IP. 10 attempts / 10 min.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const rl = checkRate(`family-accept-${ip}`, 10, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429 }
    );
  }

  const admin = createAdminClient();
  const tokenHash = hashInviteToken(body.token);

  const { data: tokenRow } = await admin
    .from("family_invite_tokens")
    .select(
      "id, organization_id, family_user_link_id, email_at_send, expires_at, consumed_at, revoked_at"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const token = tokenRow as
    | {
        id: string;
        organization_id: string;
        family_user_link_id: string;
        email_at_send: string;
        expires_at: string;
        consumed_at: string | null;
        revoked_at: string | null;
      }
    | null;

  if (!token) {
    return NextResponse.json({ error: "Link not recognised", code: "not_found" }, { status: 404 });
  }
  if (token.revoked_at) {
    return NextResponse.json({ error: "Link revoked", code: "revoked" }, { status: 403 });
  }
  if (token.consumed_at) {
    return NextResponse.json({ error: "Link already used", code: "consumed" }, { status: 409 });
  }
  if (new Date(token.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Link expired", code: "expired" }, { status: 410 });
  }

  // Load the link row to confirm it's still pending/active and grab the user.
  const { data: linkRow } = await admin
    .from("family_user_links")
    .select("id, user_id, link_status, family_contact_id")
    .eq("id", token.family_user_link_id)
    .single();
  const link = linkRow as
    | {
        id: string;
        user_id: string;
        link_status: string;
        family_contact_id: string;
      }
    | null;
  if (!link) {
    return NextResponse.json({ error: "Link not found", code: "not_found" }, { status: 404 });
  }
  if (link.link_status === "revoked") {
    return NextResponse.json({ error: "Link revoked", code: "revoked" }, { status: 403 });
  }

  // Consume the token + activate the link (idempotent-friendly: if the
  // session mint below fails, a retry re-reads consumed_at and trips the
  // "already used" branch — the user just requests a fresh invite).
  const nowIso = new Date().toISOString();
  await admin
    .from("family_invite_tokens")
    .update({ consumed_at: nowIso, consumed_by_user_id: link.user_id })
    .eq("id", token.id);
  await admin
    .from("family_user_links")
    .update({ link_status: "active", phone_verified_at: null })
    .eq("id", link.id);

  // Mint a session: generate a magic-link token for the family user,
  // then verify it on the cookie-writing SSR client to set the session.
  const { data: linkData, error: genError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: token.email_at_send,
    });
  const hashedToken = (
    linkData?.properties as { hashed_token?: string } | undefined
  )?.hashed_token;
  if (genError || !hashedToken) {
    return NextResponse.json(
      {
        error: "Failed to establish session",
        details: genError?.message,
      },
      { status: 500 }
    );
  }

  const ssr = await createClient();
  const { error: verifyError } = await ssr.auth.verifyOtp({
    token_hash: hashedToken,
    type: "email",
  });
  if (verifyError) {
    return NextResponse.json(
      { error: "Failed to establish session", details: verifyError.message },
      { status: 500 }
    );
  }

  await logAudit({
    organizationId: token.organization_id,
    userId: link.user_id,
    eventType: "family_invite_verified",
    objectType: "family_user_link",
    objectId: link.id,
    request,
    metadata: {
      family_contact_id: link.family_contact_id,
      channel: "email_link",
    },
  });

  return NextResponse.json({ status: "active", redirectTo: "/family-portal" });
}
