import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { inngest } from "@/lib/inngest/client";
import { transcribeAudioBlob } from "@/lib/transcription";

// Phase 4: admin moderation — approve a pending family voice memo.
//
// The approval flow:
//   1. Verify admin in caller's org owns this memo.
//   2. Download the audio from the private bucket using the
//      service-role client.
//   3. Send to Whisper for transcription.
//   4. Create a notes row with author_type='family', raw_input set
//      to the transcript. The structuring pipeline is upstream — we
//      don't call structureNote here; we call the existing
//      /api/claude/structure route's underlying service via the
//      same path used by the voice webhook.
//   5. Delete the audio from the bucket; stamp audio_deleted_at.
//   6. Flip moderation_status to 'approved'.
//   7. The structureNote call (via Inngest event) will emit
//      thread/note-structured naturally on success.
//
// Inline transcription keeps the moderation flow simple. If a flood
// arrives, we can move the transcription step to its own Inngest
// function in a follow-up.

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: memoId } = await context.params;
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

  const admin = createAdminClient();

  // Load the memo + cross-check org + status.
  const { data: memoRow } = await admin
    .from("family_voice_memos")
    .select(
      "id, organization_id, resident_id, family_user_link_id, uploaded_by_user_id, storage_path, moderation_status"
    )
    .eq("id", memoId)
    .single();
  const memo = memoRow as
    | {
        id: string;
        organization_id: string;
        resident_id: string;
        family_user_link_id: string;
        uploaded_by_user_id: string;
        storage_path: string | null;
        moderation_status: string;
      }
    | null;
  if (!memo) {
    return NextResponse.json({ error: "Memo not found" }, { status: 404 });
  }
  if (memo.organization_id !== typedUser.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (memo.moderation_status !== "pending") {
    return NextResponse.json(
      { error: `Memo is already ${memo.moderation_status}` },
      { status: 409 }
    );
  }
  if (!memo.storage_path) {
    return NextResponse.json(
      { error: "Memo has no uploaded audio" },
      { status: 400 }
    );
  }

  // Download the audio.
  const { data: audioBlob, error: downloadError } = await admin.storage
    .from("family-memos")
    .download(memo.storage_path);
  if (downloadError || !audioBlob) {
    return NextResponse.json(
      {
        error: "Failed to download audio",
        details: downloadError?.message,
      },
      { status: 500 }
    );
  }

  // Transcribe with Deepgram (same provider Vapi uses for live calls).
  let transcript = "";
  try {
    transcript = await transcribeAudioBlob(audioBlob);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("family_voice_memos")
      .update({ transcription_error: message.slice(0, 500) })
      .eq("id", memoId);
    return NextResponse.json(
      { error: "Transcription failed", details: message },
      { status: 502 }
    );
  }

  if (!transcript) {
    return NextResponse.json(
      { error: "Transcription returned empty text" },
      { status: 502 }
    );
  }

  // Create a notes row prefixed with attribution so downstream
  // consumers (Claude structuring, the thread updater) treat the
  // content as REPORTED.
  const { data: noteRow, error: noteError } = await admin
    .from("notes")
    .insert({
      organization_id: memo.organization_id,
      resident_id: memo.resident_id,
      author_id: memo.uploaded_by_user_id,
      author_type: "family",
      note_type: "observation",
      raw_input: transcript,
      metadata: {
        source: "family_voice_memo",
        family_voice_memo_id: memo.id,
      },
    })
    .select("id")
    .single();
  if (noteError || !noteRow) {
    return NextResponse.json(
      { error: "Failed to create note", details: noteError?.message },
      { status: 500 }
    );
  }
  const noteId = (noteRow as { id: string }).id;

  // Stamp memo + delete audio.
  const nowIso = new Date().toISOString();
  await admin
    .from("family_voice_memos")
    .update({
      moderation_status: "approved",
      moderated_by_user_id: user.id,
      moderated_at: nowIso,
      transcript,
      note_id: noteId,
      audio_deleted_at: nowIso,
      storage_path: null,
    })
    .eq("id", memoId);

  // Best-effort delete the audio file. If this fails the row points
  // at a non-existent path; we don't fail the whole request.
  await admin.storage.from("family-memos").remove([memo.storage_path]);

  // Kick structuring via the same Inngest event the voice webhook
  // uses for caregiver notes — keeps the pipeline uniform.
  try {
    await inngest.send({
      name: "notes/structure-requested",
      data: { noteId },
    });
  } catch {
    // Non-blocking: structuring can be retried by the failed-
    // structuring cron.
  }

  await logAudit({
    organizationId: memo.organization_id,
    userId: user.id,
    eventType: "family_memo_approved",
    objectType: "family_voice_memo",
    objectId: memo.id,
    request,
    metadata: {
      resident_id: memo.resident_id,
      note_id: noteId,
    },
  });

  return NextResponse.json({ status: "approved", noteId });
}
