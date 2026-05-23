import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

// Phase 4: family-side voice memo upload.
//
// Two-step pipeline:
//   POST /api/family/memos       (this route, action=request-upload)
//     Mints a signed PUT URL for the family-memos bucket and creates a
//     family_voice_memos row with moderation_status='pending'. Returns
//     { uploadUrl, memoId }.
//   PUT <uploadUrl>              (direct to Supabase storage from the
//                                 client)
//     Family client uploads the audio blob directly. No Kinroster
//     server hop with the audio in flight.
//
// Whisper / structuring does NOT happen here — it's deferred until the
// admin approves the memo via /api/admin/family-memos/[id]/approve.

interface RequestUploadBody {
  residentId: string;
  /** family_user_links.id confirming which (user, resident) pair the upload is against. */
  familyUserLinkId: string;
  /** Optional metadata for the moderation queue display. */
  durationSeconds?: number;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestUploadBody;
  try {
    body = (await request.json()) as RequestUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.residentId || !body.familyUserLinkId) {
    return NextResponse.json(
      { error: "residentId and familyUserLinkId required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify the link belongs to this user, is active, and is for this resident.
  // The RLS INSERT policy on family_voice_memos enforces the same check, but
  // failing here gives the user a cleaner error than an RLS denial.
  const { data: linkRow } = await admin
    .from("family_user_links")
    .select(
      "id, organization_id, link_status, family_contact_id, family_contacts(resident_id)"
    )
    .eq("id", body.familyUserLinkId)
    .eq("user_id", user.id)
    .single();
  const link = linkRow as
    | {
        id: string;
        organization_id: string;
        link_status: string;
        family_contact_id: string;
        family_contacts: { resident_id: string } | null;
      }
    | null;
  if (!link || !link.family_contacts) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  if (link.link_status !== "active") {
    return NextResponse.json(
      { error: "Link not active" },
      { status: 403 }
    );
  }
  if (link.family_contacts.resident_id !== body.residentId) {
    return NextResponse.json(
      { error: "Link does not cover this resident" },
      { status: 403 }
    );
  }

  // Verify recording consent class 'family_about_resident' is active.
  const { data: consentRow } = await admin
    .from("resident_recording_consents")
    .select("id")
    .eq("resident_id", body.residentId)
    .eq("consent_class", "family_about_resident")
    .is("withdrawn_at", null)
    .limit(1);
  if (!consentRow || (consentRow as Array<unknown>).length === 0) {
    return NextResponse.json(
      {
        error:
          "Family recording consent not on file for this resident. Ask an admin to capture it.",
        code: "no_consent",
      },
      { status: 403 }
    );
  }

  // Create the memo row first so we have an id for the storage path.
  const { data: memoRow, error: insertError } = await admin
    .from("family_voice_memos")
    .insert({
      organization_id: link.organization_id,
      resident_id: body.residentId,
      family_user_link_id: link.id,
      uploaded_by_user_id: user.id,
      duration_seconds: body.durationSeconds ?? null,
      moderation_status: "pending",
    })
    .select("id")
    .single();
  if (insertError || !memoRow) {
    return NextResponse.json(
      { error: "Failed to create memo row", details: insertError?.message },
      { status: 500 }
    );
  }
  const memoId = (memoRow as { id: string }).id;
  const storagePath = `${link.organization_id}/${body.residentId}/${memoId}.webm`;

  // Mint a signed upload URL (1h validity).
  const { data: signedData, error: signedError } = await admin.storage
    .from("family-memos")
    .createSignedUploadUrl(storagePath);
  if (signedError || !signedData?.signedUrl) {
    // Roll back the memo row so we don't leave orphans.
    await admin.from("family_voice_memos").delete().eq("id", memoId);
    return NextResponse.json(
      { error: "Failed to mint upload URL", details: signedError?.message },
      { status: 500 }
    );
  }

  // Stamp the path on the memo. The client will PUT to signedData.signedUrl
  // and then the admin moderation flow takes over.
  await admin
    .from("family_voice_memos")
    .update({ storage_path: storagePath })
    .eq("id", memoId);

  await logAudit({
    organizationId: link.organization_id,
    userId: user.id,
    eventType: "family_memo_uploaded",
    objectType: "family_voice_memo",
    objectId: memoId,
    request,
    metadata: {
      resident_id: body.residentId,
      family_user_link_id: link.id,
      duration_seconds: body.durationSeconds ?? null,
    },
  });

  return NextResponse.json({
    memoId,
    storagePath,
    uploadUrl: signedData.signedUrl,
    token: signedData.token,
  });
}
