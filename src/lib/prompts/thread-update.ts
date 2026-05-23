// Thread updater prompt — Phase 1.
//
// Single resident-conversation-thread maintainer. Reads the prior thread
// body + the newly-structured note, returns a merged thread body. Runs
// per-resident-serialized (Inngest concurrency key) with CAS optimistic
// locking; redeliveries are idempotent via triggering_note_id dedupe.
//
// Cache breakpoints (3 of Anthropic's 4-max):
//   #1  THREAD_UPDATE_SYSTEM_PROMPT      (ephemeral, ~1200 tok)
//   #2  resident static context           (ephemeral, ~300 tok)
//   #3  prior thread body JSON            (ephemeral, 5m TTL)
// Volatile tail: new note + author info.
//
// Spec lives at prompts/resident-conversation-thread-updater.md (created
// in same PR).

import type { Json } from "@/types/database";

export const THREAD_UPDATE_SYSTEM_PROMPT = `You are a clinical scribe maintaining a single rolling care record for a long-term-care resident. Your job is to MERGE a newly-arrived structured note into the resident's existing conversation thread and return the updated thread body as JSON. You are not a clinician; you do not diagnose, recommend treatment, or speculate.

CRITICAL RULES — violations break the trust contract with care staff:

1. Carry forward EVERYTHING the new note doesn't change. Never drop information just because the latest note didn't mention it. The thread is cumulative.
2. Tag conflicts explicitly: when the new note contradicts the prior thread, write the narrative as "(previously X as of <date>; now Y as of <new date>)" rather than silently overwriting.
3. NEVER invent facts. If the new note doesn't address a topic, do not infer about it.
4. Move concerns to 'resolved' only on EXPLICIT statement of resolution. Drop resolved concerns after 14 days.
5. Drop incidents older than 30 days from recent_incidents (they remain in the source notes; the thread surface stays scoped).
6. family_safe_summary MUST filter out disclosure_class values of 'care_team_only', 'billing_ops_only', or 'sensitive_restricted'. Family sees only 'family_shareable_*' content.
7. clinician_clinical_summary filters out only 'billing_ops_only' — clinicians may see everything else.
8. When the author_type is 'family', treat the content as REPORTED, not authoritative: phrase as "Daughter reports X" / "Spouse reports Y", never as ground-truth observation.
9. Conflicts between family-authored and caregiver-authored content on the same day: KEEP BOTH, tagged with source.
10. Family-authored notes MUST NOT update baselines{}. Carry baselines forward from the prior thread unchanged when author_type='family'.
11. open_questions: extract any unanswered question the new note raised; mark questions from prior thread as 'addressed' if the new note answers them.

OUTPUT SHAPE — return ONLY a JSON object, no prose, no code fences:

{
  "schema_version": "v1",
  "narrative": "200-400 word free-text running narrative of the resident's recent state",
  "active_concerns": [
    { "concern": "<short label>", "since": "<YYYY-MM-DD>", "trend": "improving|stable|worsening|resolved" }
  ],
  "baselines": { "mood": "<...>", "appetite": "<...>", "mobility": "<...>", "sleep": "<...>" },
  "recent_incidents": [
    { "date": "<YYYY-MM-DD>", "summary": "<one sentence>" }
  ],
  "follow_ups_open": [
    { "item": "<...>", "since": "<YYYY-MM-DD>" }
  ],
  "open_questions": [
    { "question": "<...>", "asked_by_author_type": "caregiver|admin|clinician|family", "asked_at": "<YYYY-MM-DD>", "status": "pending|addressed" }
  ],
  "family_safe_summary": "<200-word family-facing recap, sensitive content stripped>",
  "clinician_clinical_summary": "<200-word clinically-focused recap>",
  "notes_consumed_count": <integer>
}

If the prior thread is empty (first note for this resident), build the full body from the single note. Preserve caregiver phrasing in quoted excerpts where it adds clinical detail; do not paraphrase.`;

export interface ThreadBody {
  schema_version: "v1";
  narrative: string;
  active_concerns: Array<{
    concern: string;
    since: string;
    trend: "improving" | "stable" | "worsening" | "resolved";
  }>;
  baselines: Record<string, string>;
  recent_incidents: Array<{ date: string; summary: string }>;
  follow_ups_open: Array<{ item: string; since: string }>;
  open_questions: Array<{
    question: string;
    asked_by_author_type: "caregiver" | "admin" | "clinician" | "family";
    asked_at: string;
    status: "pending" | "addressed";
  }>;
  family_safe_summary: string;
  clinician_clinical_summary: string;
  notes_consumed_count: number;
}

export const EMPTY_THREAD_BODY: ThreadBody = {
  schema_version: "v1",
  narrative: "",
  active_concerns: [],
  baselines: {},
  recent_incidents: [],
  follow_ups_open: [],
  open_questions: [],
  family_safe_summary: "",
  clinician_clinical_summary: "",
  notes_consumed_count: 0,
};

/**
 * Best-effort check that the parsed body has the expected top-level
 * shape. We don't enforce inner field types — the prompt is what
 * controls quality, and rigid validation here would cause us to drop
 * recoverable updates.
 */
export function isThreadBodyShape(value: unknown): value is ThreadBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.narrative === "string" &&
    Array.isArray(v.active_concerns) &&
    typeof v.baselines === "object" &&
    Array.isArray(v.recent_incidents) &&
    Array.isArray(v.follow_ups_open) &&
    Array.isArray(v.open_questions) &&
    typeof v.family_safe_summary === "string" &&
    typeof v.clinician_clinical_summary === "string" &&
    typeof v.notes_consumed_count === "number"
  );
}

/**
 * Best-effort token approximation: 1 token ≈ 4 chars of English text.
 * Good enough for compaction-queue decisions; the precise count comes
 * back in the next API call's usage object.
 */
export function approximateTokens(body: ThreadBody): number {
  return Math.ceil(JSON.stringify(body).length / 4);
}

/**
 * Coerce a value pulled from JSONB into a ThreadBody, falling back to
 * EMPTY_THREAD_BODY if the shape is unexpected. Defensive — corrupted
 * thread state should NEVER take down voice/start.
 */
export function threadBodyOrEmpty(value: Json | null | undefined): ThreadBody {
  if (isThreadBodyShape(value)) return value;
  return EMPTY_THREAD_BODY;
}

export interface BuildThreadUpdatePromptInput {
  residentFirstName: string;
  residentLastName: string;
  conditions: string | null;
  careNotesContext: string | null;
  /** Prior thread body, or EMPTY_THREAD_BODY for first-note residents. */
  priorBody: ThreadBody;
  /** The new note's structured_output (parsed JSON). */
  newNoteStructured: unknown;
  /** The new note's raw_input excerpt — first ~500 chars. */
  newNoteRawExcerpt: string;
  newNoteCreatedAt: string;
  newNoteAuthorName: string;
  newNoteAuthorType: "caregiver" | "admin" | "clinician" | "family";
}

export interface ThreadUpdatePromptParts {
  /** Static per-resident block — cache breakpoint #2. */
  residentStaticBlock: string;
  /** Prior thread body JSON block — cache breakpoint #3 (5m TTL). */
  priorThreadBlock: string;
  /** Per-note volatile tail — uncached. */
  volatileTail: string;
}

export function buildThreadUpdatePromptParts(
  input: BuildThreadUpdatePromptInput
): ThreadUpdatePromptParts {
  const residentStaticBlock = `Resident: ${input.residentFirstName} ${input.residentLastName}
Conditions: ${input.conditions ?? "None documented"}
Care context: ${input.careNotesContext ?? "None provided"}`;

  const priorThreadBlock = `Prior thread body (merge new note INTO this):
${JSON.stringify(input.priorBody, null, 2)}`;

  const truncatedRaw = input.newNoteRawExcerpt.slice(0, 500);
  const truncatedRawHadMore = input.newNoteRawExcerpt.length > 500;

  const volatileTail = `NEW NOTE arrived at ${input.newNoteCreatedAt}
Author: ${input.newNoteAuthorName} (author_type: ${input.newNoteAuthorType})

Structured output of the new note:
${JSON.stringify(input.newNoteStructured, null, 2)}

Raw input excerpt (${truncatedRawHadMore ? "truncated to 500 chars" : "full"}):
"""
${truncatedRaw}
"""

Return the updated thread body as JSON only.`;

  return { residentStaticBlock, priorThreadBlock, volatileTail };
}
