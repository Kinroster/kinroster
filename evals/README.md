# LLM Eval Harness

Quality evals for Kinroster's Claude prompts. Unlike the unit tests in
`src/**/__tests__/` (which mock the Anthropic SDK and only assert prompt
**text**), this harness runs the **real** prod path —
`buildUserPrompt → callClaude → parseJsonResponse → graders` — against the live
Claude API and grades the **properties** of the output.

> **Scope (Slices 1–3):** all **7** Claude prompts are registered — `shift-note`,
> `incident-classify`, `incident-report`, `clinician-summary`, `family-update`,
> `weekly-summary`, `voice-sanity` — with deterministic graders plus the
> LLM-as-judge **faithfulness** check on the scribe/summary prompts and a **tone**
> check on family-update. Still to come (see the plan): growing the dataset toward
> the doc's 50-case target, a narrative-only faithfulness judge for incident-report
> (see below), and runtime schema validation (Slice 4).

## Running

```bash
pnpm eval          # run once, print scorecard, write evals/.results/<ts>.json
pnpm eval:watch    # re-run on change
```

Requires `ANTHROPIC_API_KEY`. It is read from `.env.local` automatically (see
`runner/load-env.ts`) or from the environment. **With no key the specs skip
themselves and exit 0** — a keyless run is not a failure.

Runs nightly + on demand in CI via `.github/workflows/evals.yml`. Never per-PR
(cost, nondeterminism, and fork PRs lack the secret).

## How grading works

Two kinds of gate, aggregated across cases (never a per-case hard assert on a
nondeterministic property):

| Gate type | Graders                                                           | Threshold                    |
| --------- | ----------------------------------------------------------------- | ---------------------------- |
| **hard**  | `schema`, `diagnosis`, `leakage`, `sensitive`                     | 100% of applicable cases     |
| **rate**  | `flags`, `classification`, `voice-sanity`, `faithfulness`, `tone` | ≥ 90% (≥ 80% for the judges) |

- **schema** — output parses against the shared Zod schema (`src/lib/schemas/`),
  which also enforces enum validity (disclosure_class / scope_category /
  sensitive_category) since the schema is built from the prod constants.
- **diagnosis** — no diagnostic or treatment-recommendation language ("scribe,
  never a clinician").
- **leakage** — output never mentions a name listed in the case's
  `forbiddenNames` (cross-resident leak).
- **sensitive** — `sensitive_flag` / `sensitive_category` match expectation.
- **flags** — expected flag types present, forbidden ones absent.
- **classification** — incident tier matches `expectedClassification` or is in
  `allowedClassifications`.
- **voice-sanity** — the over-capture classifier called `has_concerns` correctly
  and surfaced any `expectedCategories`.
- **faithfulness** _(LLM-as-judge)_ — a separate Haiku call (temperature 0,
  schema-validated verdict) checks that every claim in the output traces to the
  source the model was given — no fabrication, no invented diagnosis. This is
  the real "scribe" guarantee that the deterministic `diagnosis` tripwire only
  approximates. Applies to scribe/summary cases declaring `"faithfulness": {}`
  (optional `minScore`, default 0.8). Per-case pass = judge score ≥ `minScore`;
  the gate requires ≥ 80% of judged cases to pass.
- **tone** _(LLM-as-judge)_ — same machinery, judges that a `family-update` reads
  warm and plain with concerns stated calmly. Applies to cases declaring
  `"tone": {}`.

> **Why incident-report has no faithfulness judge.** Its regulatory template
> legitimately DERIVES fields the source doesn't state (`notifications_needed`,
> recommended follow-up, corrective actions), which an output⊆source judge wrongly
> flags as fabrication. A narrative-only judge (the `description` / `injuries` /
> `status` fields) is the right tool and is deferred to a later slice. Until then
> incident-report is guarded by `schema` + `diagnosis` + `leakage`.

> **Family-update faithfulness runs at a 0.7 bar** (vs 0.8 elsewhere). It is the
> warm, family-facing, human-reviewed surface (an admin approves every send), and
> its cultural-register prompt encourages warmth — so minor positive framing
> ("enjoyed the fresh air") sits closer to the line than a clinical document
> would. Concrete invented facts are still a real signal and are tracked
> separately for prompt tuning.

> **The `diagnosis` grader is English-keyword based**, so for non-English output
> (zh-TW / vi / id summaries) it only catches English terms. The multilingual
> faithfulness judge is the real cross-language no-fabrication check there.

A grader is **not applicable** (and excluded from aggregation) when the case
doesn't declare the relevant expectation.

> **Dataset size & small-N caveat.** The dataset currently ships **32 cases**
> across all 7 prompts (shift-note 9, incident-classify 6, incident-report 3,
> clinician-summary 3, family-update 4, weekly-summary 3, voice-sanity 4) — short
> of the doc's 50-case target, which it grows toward incrementally (add a JSON
> file; no code change). With only a handful of cases per rate gate the 90%
> threshold still behaves close to zero-miss, so a single nondeterministic model
> slip can turn the nightly red. The planned 3×-rerun-and-average for the
> flag-accuracy metric is **not yet implemented** — still a TODO.

> **What the `diagnosis` grader is and isn't.** It is a keyword tripwire for the
> _act_ of diagnosing or recommending treatment (verbs like "diagnose",
> "prescribe", "should start X"). It does **not** catch a bare diagnostic
> assertion ("Dorothy has a UTI"). Real faithfulness/no-diagnosis detection is
> the Slice-2 LLM-as-judge. Treat a green `diagnosis` gate as "no obvious
> violation", not a safety guarantee. Adversarial cases additionally pin
> specific planted tokens via `forbiddenContent` so the check is concrete.

## Adding a case

Drop a JSON file anywhere under `tests/prompts/` (subfolders are organisational
only; files starting with `_` are ignored). The loader validates every file at
startup, so a malformed case fails fast with its path.

```jsonc
{
  "id": "sn-incident-fall-bathroom-01", // unique
  "prompt": "shift-note", // "shift-note" | "incident-classify"
  "lang": "en", // en | zh-TW | vi | id
  "tags": ["incident", "fall"],
  "input": {
    /* fields the registry adapter passes to the prod builder */
  },
  "expect": {
    "schemaValid": true,
    "mustNotContainDiagnosis": true,
    "forbiddenNames": ["Johnson"], // cross-resident leak deny-list
    "forbiddenContent": ["UTI"], // planted tokens that must be absent
    "expectedFlags": ["fall_risk"], // shift-note rate gate
    "expectedSensitiveFlag": false,
    "expectedClassification": "ROUTINE", // incident-classify (exact), or:
    "allowedClassifications": ["POSSIBLE_INCIDENT", "DEFINITE_INCIDENT"],
  },
}
```

`input` shapes (see `runner/registry.ts`):

- **shift-note** — `residentFirstName`, `residentLastName`, `careNotesContext`
  (or null), `conditions` (or null), `timestamp`, `caregiverName`, `rawInput`.
- **incident-classify** — `rawInput`.

## Layout

```
evals/
  vitest.evals.config.ts   isolated config (node, real API, no SDK mocks)
  prompts.eval.ts          the live spec (per-case hard gates + aggregate rates)
  runner/   registry · loader · run-case · report · types · load-env
  graders/  schema · diagnosis · leakage · sensitive · flags · classification · judge · util
  judge/    faithfulness-prompt · tone-prompt · judge-schema (LLM-as-judge)
tests/prompts/             the JSON dataset
src/lib/schemas/           shared Zod (source of truth for output shape)
```
