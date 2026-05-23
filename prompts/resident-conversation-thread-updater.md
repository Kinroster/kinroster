---
id: resident-conversation-thread-updater
version: 2026-05-22-v1
prior_version: null
status: active
runtime: claude-api
model: claude-haiku-4-5
languages: [en, zh-TW, vi, id]
variables:
  - resident_first_name
  - resident_last_name
  - conditions
  - care_notes_context
  - prior_thread_body
  - new_note_structured
  - new_note_raw_excerpt
  - new_note_created_at
  - new_note_author_name
  - new_note_author_type
owner: ai-team
last_reviewed_by: pouya
last_reviewed_at: 2026-05-22
---

# Purpose

Maintain a single rolling "conversation thread" per resident — one Claude-maintained JSON body that every voice call (caregiver, admin, clinician) and async voice memo (family) reads from and writes to. Replaces the previous per-call grounding pattern (stitch last 5 notes + 14 days of incidents) with a coherent narrative + structured slices that survive across shifts and parties.

# When to use

Triggered by the `thread/note-structured` Inngest event emitted from `src/lib/services/structure-note.ts` after every successful structuring. The handler (`src/lib/services/thread-update.ts`, registered in `src/lib/inngest/functions.ts` as `threadUpdateOnNoteStructured`) runs with per-resident `concurrency: { key: "event.data.residentId", limit: 1 }` so updates for the same resident are serialized.

The merged body is written via CAS optimistic locking (`UPDATE WHERE id=? AND version=N`) so concurrent updates and Inngest at-least-once redeliveries are safe. Per-note idempotency is enforced by checking for an existing `resident_conversation_thread_versions` row with the same `triggering_note_id`.

# Cache structure

Three of Anthropic's 4-breakpoint cache cap are used:

| Block | Content | TTL | Reuse pattern |
|---|---|---|---|
| #1 system | `THREAD_UPDATE_SYSTEM_PROMPT` (~1200 tok) | 5m | Across every thread update in the org |
| #2 system suffix | per-resident static (name, conditions, care context, ~300 tok) | 5m | Across every update for this resident in the next 5m |
| #3 user prefix | prior thread body JSON (~500-2000 tok) | 5m | Across the family-memo + clinician-call + caregiver-shift triad on a hot resident |

The volatile tail (new note structured output + raw excerpt + author info) is uncached. See `src/lib/services/thread-update.ts` and `src/lib/claude.ts` (`callClaudeWithUsage` with `userPromptCachedPrefix` + `cacheTtl: '5m'`).

# Output shape

```json
{
  "schema_version": "v1",
  "narrative": "200-400 words",
  "active_concerns": [{"concern", "since", "trend": "improving|stable|worsening|resolved"}],
  "baselines": {"mood", "appetite", "mobility", "sleep"},
  "recent_incidents": [{"date", "summary"}],
  "follow_ups_open": [{"item", "since"}],
  "open_questions": [{"question", "asked_by_author_type", "asked_at", "status": "pending|addressed"}],
  "family_safe_summary": "200 words, sensitive content stripped",
  "clinician_clinical_summary": "200 words, clinical focus",
  "notes_consumed_count": <integer>
}
```

# Critical rules (from system prompt)

1. Carry forward EVERYTHING the new note doesn't change.
2. Tag conflicts: "(previously X as of <date>; now Y as of <new date>)".
3. NEVER invent facts.
4. Move concerns to 'resolved' only on EXPLICIT statement; drop after 14 days.
5. Drop incidents older than 30 days from `recent_incidents`.
6. `family_safe_summary` filters out `care_team_only`, `billing_ops_only`, `sensitive_restricted`.
7. `clinician_clinical_summary` filters out only `billing_ops_only`.
8. `author_type='family'` content is treated as REPORTED, not authoritative.
9. Family-authored content MUST NOT update `baselines{}`.
10. Conflicts between family and caregiver same-day → keep BOTH, tagged with source.
11. `open_questions` carry across parties; status flips to 'addressed' when a later note answers.

# Failure behavior

- On parse failure or shape mismatch: increment `update_attempts`, store the error, do NOT overwrite the prior body. After 3 consecutive failures, flip `update_giving_up=true` — voice calls keep grounding on the last-good body; the admin UI surfaces a "thread stale" badge.
- On CAS conflict: throw — Inngest retries (re-read the latest version, re-run the prompt against the now-newer prior body).
