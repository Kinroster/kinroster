import { inngest } from "./client";
import { runWeeklySummaries } from "@/lib/jobs/weekly-summaries";
import { runRetryFailedStructuring } from "@/lib/jobs/retry-failed-structuring";
import { updateThreadFromStructuredNote } from "@/lib/services/thread-update";
import { compactThread } from "@/lib/services/thread-compact";

// Hourly trigger. The job itself filters per-org for "Sunday 6 PM in this
// org's local time", so each timezone gets its summary once a week without
// needing per-org schedules.
export const weeklySummariesCron = inngest.createFunction(
  {
    id: "weekly-summaries",
    name: "Weekly summaries",
    triggers: [{ cron: "0 * * * *" }],
  },
  async () => runWeeklySummaries()
);

// Every-15-minutes auto-retry for notes whose Claude structuring failed.
// Vercel Hobby cron is daily-only, so we schedule this through Inngest
// alongside the weekly-summaries trigger. The job consults
// RETRY_FAILED_STRUCTURING_ENABLED internally and short-circuits when off.
export const retryFailedStructuringCron = inngest.createFunction(
  {
    id: "retry-failed-structuring",
    name: "Retry failed note structuring",
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async () => runRetryFailedStructuring()
);

/**
 * Phase 1: per-resident rolling conversation thread updater.
 *
 * Subscribes to `thread/note-structured` events emitted from
 * structure-note.ts on every successful structuring. The per-resident
 * `concurrency: { key, limit: 1 }` ensures updates for the same
 * resident are serialized — combined with the CAS optimistic lock in
 * the service, redeliveries and concurrent triggers are safe. The
 * global cap of 50 protects against pathological fan-out.
 *
 * `triggering_note_id` dedupe inside the service handles Inngest's
 * at-least-once delivery semantics.
 *
 * Retries: 3. After exhaustion, the service flips
 * `update_giving_up=true` on the thread row and the prior body is
 * preserved (voice/start keeps grounding on last-good).
 */
export const threadUpdateOnNoteStructured = inngest.createFunction(
  {
    id: "thread-update-on-note-structured",
    name: "Update resident conversation thread on new structured note",
    triggers: [{ event: "thread/note-structured" }],
    concurrency: [
      { key: "event.data.residentId", limit: 1 },
      { limit: 50 },
    ],
    retries: 3,
  },
  async ({ event, step }) => {
    const data = (event as { data?: Record<string, unknown> }).data as
      | { noteId?: string; residentId?: string; organizationId?: string }
      | undefined;
    if (!data?.noteId || !data?.residentId || !data?.organizationId) {
      return { skipped: "invalid_event_data" };
    }
    const result = await updateThreadFromStructuredNote({
      noteId: data.noteId,
      residentId: data.residentId,
      organizationId: data.organizationId,
    });
    // Throwing on retryable failure tells Inngest to retry per the
    // function-level retries config above.
    if (!result.success && result.retryable) {
      throw new Error(
        `thread update failed (retryable): ${result.error ?? "unknown"}`
      );
    }
    // When the updated body crosses the compaction threshold, emit a
    // sibling event. The compaction function shares the same
    // per-resident concurrency key, so it queues behind any further
    // updates for this resident (and the next update can't race
    // ahead of compaction).
    if (
      result.success &&
      result.approximateTokenCount &&
      result.approximateTokenCount > 3000
    ) {
      await step.sendEvent("queue-compaction", {
        name: "thread/compaction-requested",
        data: {
          residentId: data.residentId,
          organizationId: data.organizationId,
        },
      });
    }
    return result;
  }
);

/**
 * Phase 1 follow-up: thread compaction.
 *
 * Triggered by `thread/compaction-requested` whenever a thread update
 * crosses the 3000 approximate-token threshold. Same per-resident
 * concurrency=1 as the updater — both functions share the residentId
 * key so compaction queues behind any in-flight or queued update.
 *
 * Anti-loop guard lives in the service: it skips with `cooldown` if
 * last_compacted_at < 6h ago. Retries are kept low (1) because a
 * failed compaction doesn't break voice/start — the larger body keeps
 * working; the next note's compaction trigger will retry naturally.
 */
export const threadCompactionRequested = inngest.createFunction(
  {
    id: "thread-compaction-requested",
    name: "Compact resident conversation thread",
    triggers: [{ event: "thread/compaction-requested" }],
    concurrency: [
      { key: "event.data.residentId", limit: 1 },
      { limit: 20 },
    ],
    retries: 1,
  },
  async ({ event }) => {
    const data = (event as { data?: Record<string, unknown> }).data as
      | { residentId?: string; organizationId?: string }
      | undefined;
    if (!data?.residentId || !data?.organizationId) {
      return { skipped: "invalid_event_data" };
    }
    // Look up the thread for this resident — the compaction event
    // doesn't carry threadId because compaction is per-resident, and
    // there's exactly one thread per resident (UNIQUE constraint).
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data: threadRow } = await admin
      .from("resident_conversation_threads")
      .select("id")
      .eq("resident_id", data.residentId)
      .maybeSingle();
    if (!threadRow) return { skipped: "no_thread" };

    const result = await compactThread({
      threadId: (threadRow as { id: string }).id,
      residentId: data.residentId,
      organizationId: data.organizationId,
    });
    if (!result.success && result.retryable) {
      throw new Error(
        `thread compaction failed (retryable): ${result.error ?? "unknown"}`
      );
    }
    return result;
  }
);
