import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { sendSmsOtp } from "@/lib/external/sms-otp";

// Phase 4: admin-initiated family invite.
//
// Admin opens a family_contacts card, clicks "Invite to portal". The
// route:
//   1. Validates the contact belongs to admin's org.
//   2. Confirms phone is present and looks like E.164.
//   3. Creates an auth.users row with phone-primary auth (or reuses
//      an existing one if the phone is already known).
//   4. Creates a `users` row with role='family' (if not already there).
//   5. Inserts family_user_links with link_status='pending'.
//   6. Triggers SMS OTP via Supabase Auth phone provider.
//
// Rate limit (TODO follow-up): 3/day/family_contact_id at this route.

interface InviteBody {
  familyContactId: string;
}

function isE164(s: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(s);
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

  // Load the contact + cross-check org.
  const { data: contactRow } = await supabase
    .from("family_contacts")
    .select("id, name, phone, resident_id, residents(organization_id)")
    .eq("id", body.familyContactId)
    .single();
  const contact = contactRow as
    | {
        id: string;
        name: string;
        phone: string | null;
        resident_id: string;
        residents: { organization_id: string } | null;
      }
    | null;
  if (!contact || !contact.residents) {
    return NextResponse.json(
      { error: "Contact not found" },
      { status: 404 }
    );
  }
  if (contact.residents.organization_id !== typedUser.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!contact.phone || !isE164(contact.phone)) {
    return NextResponse.json(
      { error: "Contact phone missing or not E.164" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Create the auth.users row. Supabase Auth dedupes on phone — if the
  // family member was previously invited (e.g., a sibling at another
  // facility), createUser returns "already_registered". We surface that
  // as a 409 rather than silently dedup, because taking over an account
  // belonging to a different org's family contact is a real privilege-
  // escalation risk. The admin's workflow in that case is to revoke
  // the prior link first (or contact ops for a manual merge).
  const { data: authData, error: createError } =
    await admin.auth.admin.createUser({
      phone: contact.phone,
      phone_confirm: false,
      user_metadata: { role: "family", invited_by: user.id },
    });
  if (createError || !authData?.user?.id) {
    const alreadyRegistered =
      createError && /already.*registered/i.test(createError.message);
    return NextResponse.json(
      {
        error: alreadyRegistered
          ? "A family account already exists for this phone number. Revoke the existing link before re-inviting, or contact support to merge."
          : "Failed to create auth user",
        details: createError?.message,
        code: alreadyRegistered ? "already_registered" : "create_failed",
      },
      { status: alreadyRegistered ? 409 : 500 }
    );
  }
  const authUserId = authData.user.id;

  // Ensure a `users` row exists for this auth user with role='family'.
  // handle_new_user trigger covers normal signup; admin-created users
  // don't fire it, so we upsert explicitly.
  await admin.from("users").upsert(
    {
      id: authUserId,
      organization_id: typedUser.organization_id,
      email: `family-${authUserId}@kinroster.local`,
      full_name: contact.name,
      role: "family",
    },
    { onConflict: "id" }
  );

  // Insert or update the family_user_links row.
  const { data: linkRow, error: linkError } = await admin
    .from("family_user_links")
    .upsert(
      {
        organization_id: typedUser.organization_id,
        user_id: authUserId,
        family_contact_id: contact.id,
        phone_at_verification: contact.phone,
        verification_method: "sms_otp",
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

  // Dispatch the OTP.
  const otp = await sendSmsOtp(contact.phone);
  if (!otp.ok) {
    return NextResponse.json(
      { error: "Failed to send OTP", details: otp.error },
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
      phone_last4: contact.phone.slice(-4),
    },
  });

  return NextResponse.json({ linkId, status: "otp_sent" });
}
