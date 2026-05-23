// Phase 1 follow-up: thread compaction prompt.
//
// When approximate_token_count exceeds 3000, the thread updater emits a
// `thread/compaction-requested` Inngest event. This prompt rewrites the
// narrative to ≤200 words preserving structured slices, recomputes the
// family + clinician summaries, and returns the same ThreadBody shape.
//
// IMPORTANT: compaction MUST NOT add new clinical content. It rephrases
// for brevity only. Active concerns, baselines, and follow_ups_open are
// the structured ground truth and are preserved verbatim from the prior
// body (carried through by the prompt instructions; the runtime also
// merges them post-hoc as defense in depth).

export const THREAD_COMPACT_SYSTEM_PROMPT = `You are a clinical scribe COMPACTING a resident's existing conversation thread body. You do NOT add new clinical content. You rephrase the narrative to be more concise — at most 200 words — and recompute the family_safe_summary and clinician_clinical_summary against the compacted narrative.

CRITICAL RULES:

1. Keep ALL active_concerns entries verbatim. Do not drop, merge, or relabel them.
2. Keep ALL baselines entries verbatim.
3. Keep ALL follow_ups_open entries verbatim.
4. Keep open_questions entries verbatim.
5. recent_incidents: drop any entry older than 30 days.
6. Narrative: reduce to ≤200 words. Preserve every active_concerns mention. Drop:
   - resolved concerns last referenced >14 days ago
   - routine baseline mentions already captured in baselines{}
   - verbatim caregiver quotes >2 weeks old
7. family_safe_summary: recompute against the compacted narrative, ≤200 words. Strip 'care_team_only', 'billing_ops_only', 'sensitive_restricted' content.
8. clinician_clinical_summary: recompute against the compacted narrative, ≤200 words. Strip only 'billing_ops_only'.
9. NEVER add facts. If a topic is not in the input, do not invent it.
10. Return ONLY a JSON object — no prose, no code fences.

The output shape is identical to the thread updater: { schema_version, narrative, active_concerns, baselines, recent_incidents, follow_ups_open, open_questions, family_safe_summary, clinician_clinical_summary, notes_consumed_count }.`;

export interface BuildCompactPromptInput {
  residentFirstName: string;
  residentLastName: string;
  /** Current (uncompacted) thread body as JSON. */
  currentBody: unknown;
  /** Today's date in YYYY-MM-DD; used by the prompt to apply the 14/30-day cutoffs. */
  todayIso: string;
}

export interface ThreadCompactPromptParts {
  /** Static per-resident block — cache breakpoint #2. */
  residentStaticBlock: string;
  /** Current thread body block — uncached (changes every compaction). */
  volatileTail: string;
}

export function buildThreadCompactPromptParts(
  input: BuildCompactPromptInput
): ThreadCompactPromptParts {
  const residentStaticBlock = `Resident: ${input.residentFirstName} ${input.residentLastName}`;

  const volatileTail = `Today's date: ${input.todayIso}

Current thread body (compact this in place — do not add content):
${JSON.stringify(input.currentBody, null, 2)}

Return the compacted thread body as JSON only.`;

  return { residentStaticBlock, volatileTail };
}
