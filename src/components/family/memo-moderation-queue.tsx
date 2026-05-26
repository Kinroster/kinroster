"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LocalDate } from "@/components/ui/local-date";
import { toast } from "sonner";
import { Check, X, Loader2, Play, Inbox, MicOff } from "lucide-react";

type Status = "pending" | "approved" | "rejected";

interface MemoDisplay {
  id: string;
  createdAt: string;
  durationSeconds: number | null;
  moderationStatus: Status;
  moderatedAt: string | null;
  moderationReason: string | null;
  transcript: string | null;
  audioDeletedAt: string | null;
  residentName: string;
  residentId: string | null;
  contactName: string;
  contactRelationship: string | null;
}

export function FamilyMemoModerationQueue({
  pending,
  decided,
}: {
  pending: MemoDisplay[];
  decided: MemoDisplay[];
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">
            Pending review{" "}
            <Badge
              variant="outline"
              className={
                pending.length > 0
                  ? "text-amber-700 border-amber-500/50"
                  : ""
              }
            >
              {pending.length}
            </Badge>
          </h3>
        </div>
        {pending.length === 0 ? (
          <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-1">
            <Inbox className="h-5 w-5" />
            No memos awaiting review.
          </div>
        ) : (
          <ul className="space-y-3">
            {pending.map((m) => (
              <PendingRow key={m.id} memo={m} />
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-medium">Recent decisions</h3>
          <ul className="space-y-2">
            {decided.map((m) => (
              <DecidedRow key={m.id} memo={m} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PendingRow({ memo }: { memo: MemoDisplay }) {
  const router = useRouter();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [submitting, setSubmitting] = useState<null | "approve" | "reject">(
    null
  );

  async function loadAudio() {
    if (audioUrl) return; // already loaded
    setLoadingAudio(true);
    try {
      const res = await fetch(
        `/api/admin/family-memos/${memo.id}/audio-url`
      );
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to load audio");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      setAudioUrl(url);
    } finally {
      setLoadingAudio(false);
    }
  }

  async function handleApprove() {
    if (
      !window.confirm(
        "Approve this memo? The audio will be transcribed by Whisper and merged into the resident's conversation thread. The original audio is deleted on approve."
      )
    ) {
      return;
    }
    setSubmitting("approve");
    try {
      const res = await fetch(
        `/api/admin/family-memos/${memo.id}/approve`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to approve");
        return;
      }
      toast.success("Memo approved. Transcription queued.");
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  async function handleReject() {
    const reason = window.prompt(
      "Reason for rejecting this memo (recorded in the audit log):"
    );
    if (!reason?.trim()) return;
    setSubmitting("reject");
    try {
      const res = await fetch(
        `/api/admin/family-memos/${memo.id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to reject");
        return;
      }
      toast.success("Memo rejected. Audio deleted.");
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <li className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="font-medium">{memo.residentName}</p>
          <p className="text-xs text-muted-foreground">
            From {memo.contactName}
            {memo.contactRelationship ? ` (${memo.contactRelationship})` : ""}
            {" · "}
            <LocalDate value={memo.createdAt} />
            {memo.durationSeconds != null && (
              <> · {memo.durationSeconds}s</>
            )}
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-xs text-amber-700 border-amber-500/50"
        >
          Pending
        </Badge>
      </div>

      {audioUrl ? (
        <audio controls src={audioUrl} className="w-full" preload="auto" />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={loadAudio}
          disabled={loadingAudio}
        >
          {loadingAudio ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Loading…
            </>
          ) : (
            <>
              <Play className="mr-1 h-3 w-3" />
              Load audio
            </>
          )}
        </Button>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={submitting !== null}
          className="flex-1"
        >
          {submitting === "approve" ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Approving…
            </>
          ) : (
            <>
              <Check className="mr-1 h-3 w-3" />
              Approve
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReject}
          disabled={submitting !== null}
          className="flex-1"
        >
          {submitting === "reject" ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Rejecting…
            </>
          ) : (
            <>
              <X className="mr-1 h-3 w-3" />
              Reject
            </>
          )}
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        On approve, audio is sent to Whisper, transcribed, attributed to
        the family member, and merged into the conversation thread. On
        reject, audio is deleted with no transcript ever produced.
      </p>
    </li>
  );
}

function DecidedRow({ memo }: { memo: MemoDisplay }) {
  const approved = memo.moderationStatus === "approved";
  return (
    <li className="rounded-md border p-3 text-xs space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{memo.residentName}</span>
        <Badge
          variant="outline"
          className={
            approved
              ? "text-green-700 border-green-500/50"
              : "text-destructive border-destructive/50"
          }
        >
          {approved ? <Check className="mr-1 h-3 w-3" /> : <MicOff className="mr-1 h-3 w-3" />}
          {memo.moderationStatus}
        </Badge>
      </div>
      <p className="text-muted-foreground">
        From {memo.contactName}
        {memo.contactRelationship ? ` (${memo.contactRelationship})` : ""}
        {" · uploaded "}
        <LocalDate value={memo.createdAt} />
        {memo.moderatedAt && (
          <>
            {" · moderated "}
            <LocalDate value={memo.moderatedAt} />
          </>
        )}
      </p>
      {!approved && memo.moderationReason && (
        <p className="text-muted-foreground">
          Reason: {memo.moderationReason}
        </p>
      )}
      {approved && memo.transcript && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">View transcript</summary>
          <p className="mt-1 whitespace-pre-wrap">{memo.transcript}</p>
        </details>
      )}
    </li>
  );
}
