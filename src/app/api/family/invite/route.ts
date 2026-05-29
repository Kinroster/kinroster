import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { checkRate } from "@/lib/rate-limit";
import { sendFamilyInvite } from "@/lib/resend";
import {
  generateInviteToken,
  defaultInviteExpiresAt,
} from "@/lib/family/invite-token";

// Phase 4 follow-up: admin-initiated family invite via email magic-link.
//
// Replaces the SMS-OTP path (Twilio) with a $0-marginal email link
// delivered through Resend. The route:
//   1. Validates the contact belongs to admin's org + has an email.
//   2. Reuses an existing family auth user for this email, or creates one.
//   3. Upserts users(role='family') + family_user_links(pending).
//   4. Generates a single-use token, stores its hash, emails the link.
//   5. Rate-limits at 3/day/family_contact_id (bounds abuse).
//
// The SMS path (src/lib/external/sms-otp.ts) is left dormant for orgs
// that later opt into Twilio.

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://kinroster.com";

interface InviteBody {
  familyContactId: string;
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();
  const typedUser = appUser as
    | { organization_id: string; role: string }
    | null;
  if (!typedUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (typedUser.role !== "admin" && typedUser.role !== "compliance_admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body: InviteBody;
  try {
    body = (await request.json()) as InviteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.familyContactId) {
    return NextResponse.json(
      { error: "familyContactId required" },
      { status: 400 }
    );
  }

  // Rate limit: 3 invites per family_contact_id per 24h. Bounds both
  // accidental double-clicks and deliberate abuse. Done before any
  // write so a throttled caller doesn't create orphan rows.
  const rl = checkRate(
    `family-invite-${body.familyContactId}`,
    3,
    24 * 60 * 60 * 1000
  );
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Too many invites for this contact. Try again later.",
        retryAfterMs: rl.retryAfterMs,
      },
      { status: 429 }
    );
  }

  // Load the contact + cross-check org.
  const { data: contactRow } = await supabase
    .from("family_contacts")
    .select("id, name, email, resident_id, residents(first_name, organization_id)")
    .eq("id", body.familyContactId)
    .single();
  const contact = contactRow as
    | {
        id: string;
        name: string;
        email: string | null;
        resident_id: string;
        residents: { first_name: string; organization_id: string } | null;
      }
    | null;
  if (!contact || !contact.residents) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  if (contact.residents.organization_id !== typedUser.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!contact.email || !isEmail(contact.email)) {
    return NextResponse.json(
      { error: "Contact has no valid email on file. Add one first." },
      { status: 400 }
    );
  }
  const email = contact.email.toLowerCase();

  const admin = createAdminClient();

  // Reuse an existing family auth user for this email (a family member
  // may be linked to several residents in the same facility — the
  // family_user_links table is many-to-many for exactly this). Look up
  // by the public.users mirror, which stores the real email for family
  // accounts.
  const { data: existingUserRow } = await admin
    .from("users")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();
  const existingUser = existingUserRow as
    | { id: string; role: string }
    | null;

  let authUserId: string;
  if (existingUser) {
    if (existingUser.role !== "family") {
      return NextResponse.json(
        {
          error:
            "That email already belongs to a staff account. Use a different email for the family contact.",
          code: "email_belongs_to_staff",
        },
        { status: 409 }
      );
    }
    authUserId = existingUser.id;
  } else {
    const { data: authData, error: createError } =
      await admin.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: { role: "family", invited_by: user.id },
      });
    if (createError || !authData?.user?.id) {
      return NextResponse.json(
        { error: "Failed to create auth user", details: createError?.message },
        { status: 500 }
      );
    }
    authUserId = authData.user.id;

    await admin.from("users").upsert(
      {
        id: authUserId,
        organization_id: typedUser.organization_id,
        email,
        full_name: contact.name,
        role: "family",
      },
      { onConflict: "id" }
    );
  }

  // Insert/update the link row (pending until the token is redeemed).
  const { data: linkRow, error: linkError } = await admin
    .from("family_user_links")
    .upsert(
      {
        organization_id: typedUser.organization_id,
        user_id: authUserId,
        family_contact_id: contact.id,
        verification_method: "email_link",
        link_status: "pending",
        invited_by_user_id: user.id,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "user_id,family_contact_id" }
    )
    .select("id")
    .single();
  if (linkError || !linkRow) {
    return NextResponse.json(
      { error: "Failed to create link", details: linkError?.message },
      { status: 500 }
    );
  }
  const linkId = (linkRow as { id: string }).id;

  // Mint + store the single-use token.
  const { unsigned, hash } = generateInviteToken();
  const expiresAt = defaultInviteExpiresAt();
  const { error: tokenError } = await admin
    .from("family_invite_tokens")
    .insert({
      organization_id: typedUser.organization_id,
      family_user_link_id: linkId,
      token_hash: hash,
      email_at_send: email,
      expires_at: expiresAt.toISOString(),
      created_by: user.id,
    });
  if (tokenError) {
    return NextResponse.json(
      { error: "Failed to create invite token", details: tokenError.message },
      { status: 500 }
    );
  }

  // Org name + reply-to for the email envelope.
  const { data: orgRow } = await admin
    .from("organizations")
    .select("name, email_reply_to")
    .eq("id", typedUser.organization_id)
    .single();
  const org = orgRow as
    | { name: string; email_reply_to: string | null }
    | null;
  const facilityName = org?.name ?? "Your care facility";
  const replyTo = org?.email_reply_to ?? "support@kinroster.com";

  const inviteUrl = `${SITE_URL}/family-portal/verify?token=${unsigned}`;

  try {
    await sendFamilyInvite({
      to: email,
      contactName: contact.name,
      residentFirstName: contact.residents.first_name,
      facilityName,
      fromName: facilityName,
      replyTo,
      inviteUrl,
      expiresAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to send invite email",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  await logAudit({
    organizationId: typedUser.organization_id,
    userId: user.id,
    eventType: "family_invite_sent",
    objectType: "family_user_link",
    objectId: linkId,
    request,
    metadata: {
      family_contact_id: contact.id,
      resident_id: contact.resident_id,
      channel: "email_link",
    },
  });

  return NextResponse.json({ linkId, status: "invite_sent" });
}
