---
id: family-update
version: 2026-06-06-faithfulness-v1
prior_version: 2026-05-02-multilingual-v1
status: active
runtime: claude-api
model: claude-sonnet-4-6
languages: [en, zh-TW, vi, id]
variables:
  - facility_name
  - resident_first_name
  - family_member_name
  - family_member_relationship
  - family_communication_language
  - cultural_register
  - structured_notes
  - date_range
owner: ai-team
last_reviewed_by: pouya
last_reviewed_at: 2026-06-06
---

# Purpose

A warm, family-facing update summarizing the resident's recent days. Generated **once per family contact** in that contact's `preferred_communication_language`. A single resident with three family contacts (one in Taipei, one in Hanoi, one in Jakarta) yields three updates in three languages.

Output uses no clinical jargon. Cultural register adapts: Taiwanese / Vietnamese / Indonesian families get an indirect, family-centric tone with positive observations leading; Western families get more direct framing. Honorifics applied per `residents.honorific_preference`.

# When to use

Triggered manually by an admin via the family-update flow (`src/app/api/family/send/route.ts`) or by the weekly summary cron. Each family contact with `receives_updates=true` and a valid `preferred_communication_language` gets their own generation.

# Variables

TODO(workstream-c): full variables table.

# Prompt body

TODO(workstream-c): full body. Current English-only prompt in `src/lib/prompts/family-update.ts`.

# Output schema

```json
{
  "subject": "string (family_communication_language)",
  "body": "string (family_communication_language, 150-250 words, 3-5 paragraphs)",
  "tone_check": "warm | neutral | concerned"
}
```

# Safety guardrails

- No medical terminology. "Took her medication on time" not "100% medication adherence."
- For indirect register, lead with positive observations before any concerns. Never bury severe events but soften framing.
- Never share clinical details that exceed the family contact's `authorization_scope`.

# Test cases

TODO(workstream-c): 4 test cases — one per language, one with mixed positive/negative observations to verify register handling.

# Version history

- **2026-06-06-faithfulness-v1**: tightened anti-fabrication guardrails to stop the warm/indirect register from inventing unsourced sensory detail. Rule 4 now constrains "show personality" to what the notes actually record; rule 7 adds a sparse-notes carve-out (never pad to a word count); rule 11 strengthened; rule 12 broadened to forbid name-free references to other residents and any mention of another resident's mood/family; new rule 13 explicitly forbids adding weather/environment, sensory colour, gait/balance/strength, or inferred mood/physical states unless the notes state them. Motivated by eval case `fu-zh-tw-01` scoring 0.75 on faithfulness (added 天氣好、空氣清新 / 走得很穩 / 看起來精神不錯, none in the source notes). No change to output schema or language fan-out.
- **2026-05-02-multilingual-v1**: per-family-contact language fan-out; cultural register parameterized; honorifics applied.
- **2026-04-01-english-v3**: prior English-only single-output version in `src/lib/prompts/family-update.ts`.
