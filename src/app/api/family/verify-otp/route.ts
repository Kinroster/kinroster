import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { verifySmsOtp } from "@/lib/external/sms-otp";

// Phase 4: family-side OTP verification.
//
// The family member receives the SMS code, opens
// /family/verify?link=<id> in their browser, enters the code, and
// POSTs here. On success:
//   1. Confirms the auth.users row via verifyOtp (Supabase Auth flips
//      phone_confirmed_at).
//   2. Flips family_user_links.link_status to 'active' and stamps
//      phone_verified_at.
//   3. Returns a redirect target (the family portal dashboard).
//
// Rate limit (TODO follow-up): 6/hour/phone at this route; captcha
// after 3 failed verifications.

interface VerifyBody {
  linkId: string;
  token: string;
}

export async function POST(request: NextRequest) {
  // This route is intentionally callable WITHOUT a logged-in session —
  // the family member hasn't logged in yet; the OTP IS the auth flow.
  // The linkId from the body proves which pending row they're verifying.

  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.linkId?.trim() || !body.token?.trim()) {
    return NextResponse.json(
      { error: "linkId and token required" },
      { status: 400 }
    );
  }
  if (!/^\d{6}$/.test(body.token)) {
    return NextResponse.json(
      { error: "Token must be 6 digits" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Load the pending link.
  const { data: linkRow } = await admin
    .from("family_user_links")
    .select(
      "id, organization_id, user_id, family_contact_id, phone_at_verification, link_status"
    )
    .eq("id", body.linkId)
    .single();
  const link = linkRow as
    | {
        id: string;
        organization_id: string;
        user_id: string;
        family_contact_id: string;
        phone_at_verification: string;
        link_status: string;
      }
    | null;
  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  if (link.link_status === "revoked") {
    return NextResponse.json(
      { error: "Link has been revoked" },
      { status: 403 }
    );
  }
  if (link.link_status === "active") {
    return NextResponse.json({ status: "already_active" });
  }

  // Verify the OTP.
  const verify = await verifySmsOtp(link.phone_at_verification, body.token);
  if (!verify.ok) {
    return NextResponse.json(
      { error: "OTP verification failed", details: verify.error },
      { status: 401 }
    );
  }
  if (verify.userId !== link.user_id) {
    // Defensive: the auth.users.id returned by verifyOtp must match the
    // link's user_id. If it doesn't, someone is trying to verify a
    // different account against this link.
    return NextResponse.json(
      { error: "Verified user does not match link" },
      { status: 403 }
    );
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("family_user_links")
    .update({
      link_status: "active",
      phone_verified_at: nowIso,
    })
    .eq("id", link.id);

  await logAudit({
    organizationId: link.organization_id,
    userId: link.user_id,
    eventType: "family_invite_verified",
    objectType: "family_user_link",
    objectId: link.id,
    request,
    metadata: {
      family_contact_id: link.family_contact_id,
    },
  });

  // Sign the user in by writing the auth cookies on the server.
  const supabase = await createClient();
  await supabase.auth.verifyOtp({
    phone: link.phone_at_verification,
    token: body.token,
    type: "sms",
  });

  return NextResponse.json({
    status: "active",
    linkId: link.id,
    redirectTo: "/family",
  });
}
