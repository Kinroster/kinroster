import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Phase 4 follow-up: short-lived signed-URL for the admin moderation
// queue's audio player. The bucket is private; admin reads the
// transcript-less memo via this endpoint, which mints a signed GET URL
// valid for 60 seconds. Approve/Reject endpoints handle the
// transcription + bucket delete after moderation.

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
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
  const { data: memoRow } = await admin
    .from("family_voice_memos")
    .select("id, organization_id, storage_path, audio_deleted_at")
    .eq("id", id)
    .single();
  const memo = memoRow as
    | {
        id: string;
        organization_id: string;
        storage_path: string | null;
        audio_deleted_at: string | null;
      }
    | null;
  if (!memo) {
    return NextResponse.json({ error: "Memo not found" }, { status: 404 });
  }
  if (memo.organization_id !== typedUser.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!memo.storage_path || memo.audio_deleted_at) {
    return NextResponse.json(
      { error: "Audio no longer available" },
      { status: 410 }
    );
  }

  const { data: signed, error: signError } = await admin.storage
    .from("family-memos")
    .createSignedUrl(memo.storage_path, 60);
  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to sign URL", details: signError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: signed.signedUrl });
}
