import { inngest } from "./client";
import { runWeeklySummaries } from "@/lib/jobs/weekly-summaries";
import { runRetryFailedStructuring } from "@/lib/jobs/retry-failed-structuring";
import { updateThreadFromStructuredNote } from "@/lib/services/thread-update";

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
  async ({ event }: { event: { data?: Record<string, unknown> } }) => {
    const data = event.data as
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
    return result;
  }
);
