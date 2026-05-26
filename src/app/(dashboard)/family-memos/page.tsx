import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { FamilyMemoModerationQueue } from "@/components/family/memo-moderation-queue";

// Phase 4 follow-up: admin moderation queue.
//
// Family members upload voice memos via the family portal; each memo
// lands as `moderation_status='pending'` and the audio sits in the
// private `family-memos` bucket. This page is the admin's queue for
// approving (→ Whisper transcription + thread update) or rejecting
// (→ audio deleted, no transcript) those uploads.

interface MemoRow {
  id: string;
  created_at: string;
  duration_seconds: number | null;
  moderation_status: string;
  moderated_at: string | null;
  moderation_reason: string | null;
  transcript: string | null;
  audio_deleted_at: string | null;
  residents: { id: string; first_name: string; last_name: string } | null;
  family_user_links: {
    family_contacts: { name: string; relationship: string } | null;
  } | null;
}

export default async function FamilyMemosModerationPage() {
  const user = await requireAdmin();
  const supabase = await createClient();

  // Pending first, then the most recent 25 of the historical decisions
  // so admins can spot-check past moderation calls.
  const { data: memosData } = await supabase
    .from("family_voice_memos")
    .select(
      `id, created_at, duration_seconds, moderation_status,
       moderated_at, moderation_reason, transcript, audio_deleted_at,
       residents(id, first_name, last_name),
       family_user_links(family_contacts(name, relationship))`
    )
    .eq("organization_id", user.organization_id)
    .order("created_at", { ascending: false })
    .limit(100);

  const memos = ((memosData ?? []) as unknown) as MemoRow[];
  const pending = memos.filter((m) => m.moderation_status === "pending");
  const decided = memos.filter((m) => m.moderation_status !== "pending");

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Family voice memos</h2>
        <p className="text-sm text-muted-foreground">
          Review and approve family-uploaded recordings before they&apos;re
          transcribed and merged into the resident&apos;s care record.
          Audio is deleted immediately on approve or reject.
        </p>
      </header>

      <FamilyMemoModerationQueue
        pending={pending.map(toDisplay)}
        decided={decided.map(toDisplay)}
      />
    </div>
  );
}

function toDisplay(m: MemoRow) {
  return {
    id: m.id,
    createdAt: m.created_at,
    durationSeconds: m.duration_seconds,
    moderationStatus: m.moderation_status as
      | "pending"
      | "approved"
      | "rejected",
    moderatedAt: m.moderated_at,
    moderationReason: m.moderation_reason,
    transcript: m.transcript,
    audioDeletedAt: m.audio_deleted_at,
    residentName: m.residents
      ? `${m.residents.first_name} ${m.residents.last_name}`.trim()
      : "Unknown resident",
    residentId: m.residents?.id ?? null,
    contactName: m.family_user_links?.family_contacts?.name ?? "—",
    contactRelationship:
      m.family_user_links?.family_contacts?.relationship ?? null,
  };
}

export type MemoDisplay = ReturnType<typeof toDisplay>;
