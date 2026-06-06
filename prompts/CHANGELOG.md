# Prompts changelog

Cross-prompt release log. Per-prompt history lives in each spec file's **Version history** section.

## 2026-06-06 — family-update-faithfulness-v1

Tightens the `family-update` prompt's anti-fabrication guardrails. The warm, family-facing (and especially the indirect zh-TW) register was padding sparse shift notes with plausible-but-unsourced detail — eval case `fu-zh-tw-01` added 「天氣好、空氣清新」, 「走得很穩」, and 「看起來精神不錯」 to notes that only said the resident walked in the garden with her walker and was in a good mood, scoring 0.75 on the LLM-as-judge faithfulness check (below the 0.8 clinical bar).

- `family-update`: `2026-05-02-multilingual-v1` → `2026-06-06-faithfulness-v1`. Rule 4 constrains personality/colour to what the notes record; rule 7 gains a sparse-notes carve-out (never pad to a word count); rule 11 strengthened; new rule 13 explicitly bans adding weather/environment, sensory detail, gait/balance/strength, or inferred mood/physical states unless the notes state them. Rule 12 (no other residents) was also broadened to forbid name-free references ("a fellow resident") and any mention of another resident's mood/family — the pre-change prompt leaked these. Tone is preserved — warmth now comes from *how* recorded facts are described, not from invented detail. No output-schema or language-fan-out change.
- Eval overrides: the per-case `faithfulness.minScore` override (0.7) is raised back to the 0.8 default on the **3 non-adversarial** cases — `positive-week-01`, `with-concern-01`, `zh-tw-01` — which now clear it with full margin (zh-TW: 0.75 → 1.00 over repeated runs; tone held at ≥0.92). The 4th case, `adversarial-other-resident-01`, is **left at 0.7** and is a **known, pre-existing failure independent of this prompt change**: its faithfulness score (0.60–1.00, pristine prompt included) is driven by LLM-judge *confabulation* on a deliberately omission-required input — the judge penalises the rule-12-mandated dropping of the planted other-resident as "reduced fidelity" and hallucinates references to it, even when the generated body is verifiably clean. The faithfulness judge is the wrong instrument for an adversarial *leakage* case; its real protection is the hard `leakage`/`forbiddenNames` gate (passing). Recalibrating the judge and moving that case's protection to a name-free leakage check is a separate **harness** follow-up, not a prompt fix. As a result `pnpm eval` remains red solely on `family-update/faithfulness` (3/4 = 75% < 80%) via this one case.

## 2026-05-18 — diligence-v1

Adds the diligence audio-upload pipeline. Uploads route through Deepgram nova-3 (`language=multi`, diarized) for EN + Farsi code-switching transcripts, then through Claude Opus 4.7 for a 10-section structured summary.

- `diligence-summary` (new, `2026-05-18-en-fa-v1`): summarises a recorded conversation into executive summary + participants, key topics, decisions, action items, open questions, risks, commitments, follow-ups, and notable quotes. Quotes preserved verbatim in source language; every other field rendered in English.

## 2026-05-02 — multilingual-v1

First multilingual release. Adds support for caregivers in Taiwan working with Vietnamese / Indonesian / Mandarin source languages and elderly Taiwanese / Vietnamese / Indonesian residents. Surgeon-facing clinical output defaults to Traditional Chinese (zh-TW). All prompts now language-parameterized via `{{caregiver_language}}` / `{{output_language}}` variables and inject a cultural-register block (honorific preference, religion-specific phrasing rules, family-vs-clinical register).

- `vapi-intake-assistant`: `2026-04-01-english-v3` → `2026-05-02-multilingual-v1`. Replaces hardcoded English greetings/wrap-ups with language-parameterized phrasing. Adds grounding variables `recent_notes_summary` and `recent_incidents` to anchor follow-up questions and reduce hallucinated baselines.
- `shift-note-structuring`: source-language preserved verbatim; English `clinical_keywords` field added for downstream retrieval. Cultural-register block injected.
- `clinician-summary`: redesigned. Output now leads with `at_a_glance` (zh-TW, trend arrows + red flags + change-since-last-visit), then `clinical_narrative` (zh-TW formal medical register), then `source_excerpts` (caregiver's original-language quotes with zh-TW gloss), then `confidence_notes` (uncertainty surfaced inline).
- `family-update`: fans out one update per family contact in their `preferred_communication_language`. Cultural register adapts (indirect for Taiwanese/Vietnamese/Indonesian; direct for Western).
- `weekly-summary`, `voice-sanity`, `incident-classify`, `incident-report`: language-parameterized; output language defaults to org's `default_output_language`.
