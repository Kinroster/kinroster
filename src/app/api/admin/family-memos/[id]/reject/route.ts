import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

// Phase 4: admin moderation — reject a pending family voice memo.
// Audio is deleted; no transcription, no notes row, no thread update.

interface RejectBody {
  reason: string;
}

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

  let body: RejectBody;
  try {
    body = (await request.json()) as RejectBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.reason?.trim()) {
    return NextResponse.json(
      { error: "Rejection reason required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: memoRow } = await admin
    .from("family_voice_memos")
    .select("id, organization_id, storage_path, moderation_status")
    .eq("id", memoId)
    .single();
  const memo = memoRow as
    | {
        id: string;
        organization_id: string;
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

  // Delete the audio first (don't leave PHI behind on a rejected memo).
  if (memo.storage_path) {
    await admin.storage.from("family-memos").remove([memo.storage_path]);
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("family_voice_memos")
    .update({
      moderation_status: "rejected",
      moderated_by_user_id: user.id,
      moderated_at: nowIso,
      moderation_reason: body.reason.trim(),
      storage_path: null,
      audio_deleted_at: nowIso,
    })
    .eq("id", memoId);

  await logAudit({
    organizationId: memo.organization_id,
    userId: user.id,
    eventType: "family_memo_rejected",
    objectType: "family_voice_memo",
    objectId: memo.id,
    request,
    metadata: { reason: body.reason.trim() },
  });

  return NextResponse.json({ status: "rejected" });
}
