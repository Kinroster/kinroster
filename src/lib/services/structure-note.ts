// Single source of truth for "convert a note's raw_input into structured_output".
// Used by:
//   - the user-facing /api/claude/structure route (with quota check upstream),
//   - the voice webhook (alongside voice-sanity),
//   - the auto-retry cron + admin manual-retry endpoint.
//
// Implements Gap 2 from docs/PRE-PILOT-CORRECTNESS-FIXES.md.
//
// Failure semantics:
//   - structuring_attempts is incremented on every run (success or failure)
//     so a process crash mid-Claude-call is still observable.
//   - Errors are classified retryable (HTTP 429, 5xx, network/timeout) vs
//     non-retryable (parse failure, schema mismatch, 4xx-other-than-429).
//     Non-retryable flips structuring_giving_up immediately. Retryable flips
//     it once attempts >= MAX_ATTEMPTS.

import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaudeWithUsage, parseJsonResponse } from "@/lib/claude";
import { redactPhiText } from "@/lib/redaction";
import {
  SHIFT_NOTE_SYSTEM_PROMPT,
  buildShiftNoteUserPromptParts,
  type StructuredNoteOutput,
} from "@/lib/prompts/shift-note";
import type { ResidentLocaleContext } from "@/lib/i18n/locale";
import { inngest } from "@/lib/inngest/client";

export const MAX_STRUCTURING_ATTEMPTS = 5;

export interface StructureNoteOptions {
  /** Cultural + linguistic context for the resident; threaded into the prompt. */
  localeContext?: ResidentLocaleContext | null;
  /** Extra metadata fields to merge into notes.metadata on success.
   *  Voice webhook uses this for { source: 'voice_call', voice_session_id, ... }. */
  extraMetadata?: Record<string, unknown>;
}

export interface StructureNoteResult {
  success: boolean;
  /** Parsed structured output on success. */
  structured?: StructuredNoteOutput;
  /** Error message on failure. */
  error?: string;
  /** Whether the cron should re-attempt this note. */
  retryable: boolean;
  /** Total attempts after this run (1-based). */
  attempts: number;
  /** Whether structuring_giving_up was flipped to true on this run. */
  gaveUp: boolean;
}

/** Anthropic SDK errors and fetch errors carry a numeric status. Treat 429 +
 *  5xx + network-style errors as retryable; everything else (parse failure,
 *  4xx-other) as a hard fail. */
function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const maybeStatus = (err as { status?: unknown }).status;
    if (typeof maybeStatus === "number") {
      if (maybeStatus === 429) return true;
      if (maybeStatus >= 500 && maybeStatus < 600) return true;
      return false;
    }
    // No status → likely a network / abort / timeout — retry.
    const msg = err.message.toLowerCase();
    if (
      msg.includes("timeout") ||
      msg.includes("network") ||
      msg.includes("fetch failed") ||
      msg.includes("econnreset") ||
      msg.includes("aborted")
    ) {
      return true;
    }
    return false;
  }
  return false;
}

interface NoteRow {
  id: string;
  raw_input: string;
  created_at: string;
  author_id: string;
  organization_id: string;
  resident_id: string;
  structuring_attempts: number;
  residents:
    | {
        first_name: string;
        last_name: string;
        care_notes_context: string | null;
        conditions: string | null;
      }
    | null;
}

export async function structureNote(
  supabase: SupabaseClient,
  noteId: string,
  options: StructureNoteOptions = {}
): Promise<StructureNoteResult> {
  // 1. Fetch the note + resident in one round-trip. The cron uses a service-
  // role client (no user); the route uses an authed client whose RLS already
  // gates org membership.
  const { data: noteData } = await supabase
    .from("notes")
    .select(
      "id, raw_input, created_at, author_id, organization_id, resident_id, structuring_attempts, residents(first_name, last_name, care_notes_context, conditions)"
    )
    .eq("id", noteId)
    .single();

  const note = noteData as NoteRow | null;
  if (!note) {
    return {
      success: false,
      error: "Note not found",
      retryable: false,
      attempts: 0,
      gaveUp: false,
    };
  }

  const resident = note.residents;
  if (!resident) {
    return {
      success: false,
      error: "Resident not found",
      retryable: false,
      attempts: note.structuring_attempts ?? 0,
      gaveUp: false,
    };
  }

  // 2. Increment attempts + stamp last_attempt_at BEFORE the Claude call so a
  // process crash mid-call still leaves a trace. Read-then-write is fine here:
  // the cron runs serially with a 5-min cooldown, and the route is one call
  // per user click.
  const newAttempts = (note.structuring_attempts ?? 0) + 1;
  await supabase
    .from("notes")
    .update({
      structuring_attempts: newAttempts,
      last_structuring_attempt_at: new Date().toISOString(),
    })
    .eq("id", noteId);

  // 3. Author name (best-effort; falls back to "Unknown").
  const { data: author } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", note.author_id)
    .single();

  // 4. Call Claude, parse, persist on success. The user prompt is split
  // into a cached per-resident prefix (name + context + conditions +
  // cultural register) and a volatile tail (timestamp + caregiver + raw
  // input). With cacheTtl: '1h', the cached prefix amortizes the cache-
  // write cost across every note a caregiver dictates about this
  // resident in a shift — typically 3-8 calls per shift per resident.
  try {
    const { cachedPrefix, volatileTail } = buildShiftNoteUserPromptParts({
      residentFirstName: resident.first_name,
      residentLastName: resident.last_name,
      careNotesContext: resident.care_notes_context
        ? redactPhiText(resident.care_notes_context)
        : null,
      conditions: resident.conditions
        ? redactPhiText(resident.conditions)
        : null,
      timestamp: note.created_at,
      caregiverName:
        (author as { full_name: string } | null)?.full_name || "Unknown",
      rawInput: redactPhiText(note.raw_input),
      localeContext: options.localeContext ?? undefined,
    });

    const { text: raw, usage } = await callClaudeWithUsage({
      systemPrompt: SHIFT_NOTE_SYSTEM_PROMPT,
      userPromptCachedPrefix: cachedPrefix,
      userPrompt: volatileTail,
      cacheTtl: "1h",
    });

    const structured = parseJsonResponse<StructuredNoteOutput>(raw);

    const hasFlags = !!(structured.flags && structured.flags.length > 0);
    const sections = Array.isArray(structured.sections) ? structured.sections : [];

    const baseMetadata: Record<string, unknown> = {
      categories: sections.map((s) => s.name),
      flags: structured.flags || [],
      ai_classification: hasFlags ? "possible_incident" : "routine",
      model_used: "claude-sonnet-4-6",
      tokens_used: {
        input: usage.input_tokens,
        output: usage.output_tokens,
        cache_read: usage.cache_read_input_tokens,
        cache_creation: usage.cache_creation_input_tokens,
      },
      structured_output_version: "v2",
    };

    const metadata = { ...baseMetadata, ...(options.extraMetadata ?? {}) };

    await supabase
      .from("notes")
      .update({
        structured_output: JSON.stringify(structured),
        is_structured: true,
        structuring_error: null,
        structuring_giving_up: false,
        metadata,
        flagged_as_incident: hasFlags,
        sensitive_flag: structured.sensitive_flag === true,
        sensitive_category: structured.sensitive_category ?? null,
      })
      .eq("id", noteId);

    // Phase 1: kick off the per-resident conversation-thread updater.
    // Fire-and-forget — Inngest enforces per-resident concurrency=1
    // and idempotency via triggering_note_id, so a missed trigger here
    // would just delay the thread update until the next note. We
    // intentionally don't fail structuring if the event-send fails.
    try {
      await inngest.send({
        name: "thread/note-structured",
        data: {
          noteId: note.id,
          residentId: note.resident_id,
          organizationId: note.organization_id,
        },
      });
    } catch (sendErr) {
      console.error("thread/note-structured event send failed", {
        noteId: note.id,
        error: sendErr instanceof Error ? sendErr.message : sendErr,
      });
    }

    return {
      success: true,
      structured,
      retryable: false,
      attempts: newAttempts,
      gaveUp: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const retryable = isRetryableError(err);
    const giveUp = !retryable || newAttempts >= MAX_STRUCTURING_ATTEMPTS;

    await supabase
      .from("notes")
      .update({
        is_structured: false,
        structuring_error: message,
        structuring_giving_up: giveUp,
      })
      .eq("id", noteId);

    return {
      success: false,
      error: message,
      retryable,
      attempts: newAttempts,
      gaveUp: giveUp,
    };
  }
}
