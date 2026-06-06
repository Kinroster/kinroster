---
name: new-prompt
description: |
  Scaffold a new Kinroster LLM prompt end-to-end: the canonical spec
  (prompts/<id>.md with full YAML frontmatter + the 8 required body
  sections), the runtime (src/lib/prompts/<name>.ts exporting SYSTEM_PROMPT,
  a buildUserPrompt() function, an Output interface, and a PROMPT_VERSION
  constant that matches the spec), a Vitest test stub, and a CHANGELOG entry
  — all wired to the shared cultural/language builders where relevant.

  Use this skill when the user says any of: "new prompt", "add an LLM
  prompt", "create a Claude prompt", "scaffold a prompt", "/new-prompt".

  IMPORTANT: This skill scaffolds structure and metadata. It writes a
  starter prompt body, but the human owns the final wording. It keeps the
  runtime PROMPT_VERSION equal to the spec version, and never invents test
  cases that assert behavior the prompt doesn't have — stubs are clearly
  marked.
---

# New prompt — scaffold spec + runtime + test + changelog

Kinroster keeps every LLM prompt's **source of truth** in `prompts/<id>.md`
and its runtime in `src/lib/prompts/<name>.ts`. This skill creates a new,
convention-correct prompt across all the places it must exist, so the author
fills in wording instead of remembering the wiring. The companion
`prompt-sync` skill audits/bumps these afterward — so emit the exact shapes
it expects (especially the `// Canonical spec:` comment and a matching
`PROMPT_VERSION`).

Canonical references:
- `prompts/README.md` → frontmatter fields, the 8 body sections, ship workflow
- `prompts/incident-classify.ts` → clean runtime shape (a Haiku prompt)
- `src/lib/prompts/_shared.ts` → `buildCulturalRegisterBlock()`,
  `buildOutputLanguageInstruction()` (multilingual wiring)
- `src/lib/prompts/__tests__/prompts.test.ts` → the standard 3-test pattern
- `CLAUDE.md` → the non-negotiables (scribe not clinician; preserve
  caregiver observations verbatim)

## Step 1 — gather inputs

Ask for whatever the user hasn't given:

1. **`id`** — kebab-case, stable across versions (e.g. `medication-review`).
2. **Purpose** — audience, desired output, cost/quality target (one paragraph).
3. **Runtime** — `claude-api` | `vapi-dashboard` | `whisper-api`. Only
   `claude-api` gets a `.ts` runtime + test; the others are spec-only (Vapi
   is paste-synced to the dashboard).
4. **Model** — which Claude tier. Cheap/classify → Haiku; creative/clinical
   structuring → Sonnet. The spec `model:` uses the short label
   (`claude-haiku-4-5`, `claude-sonnet-4-6`); the runtime `_MODEL` constant
   uses the exact API id — copy it from an existing runtime
   (`incident-classify.ts` uses `claude-haiku-4-5-20251001`) rather than
   guessing the date suffix.
5. **Languages** — `[en]` for English-only, or the multilingual set
   `[en, zh-TW, vi, id]`. Multilingual prompts must wire the `_shared`
   builders (Step 3) and need ≥1 test case per language.
6. **Variables** — the template variables the runtime injects (name, type,
   source). These become the `variables:` frontmatter list, the Variables
   table, and the `buildUserPrompt()` arguments.
7. **Output shape** — JSON is the default for structured `claude-api`
   prompts (the authenticated app consumes structured output). Prose /
   markdown is a legitimate explicit choice for conversational or
   preview-style prompts (e.g. `demo-consult.ts` returns markdown); for
   those the Output schema reads `N/A — conversational` (or describes the
   prose shape). Ask which the prompt needs.
8. **Runtime filename** — defaults to the `id`, but the repo allows a
   shorter stem (`shift-note-structuring.md` → `shift-note.ts`). Confirm if
   it should differ.

## Step 2 — write the spec `prompts/<id>.md`

Frontmatter (all fields; `prior_version: null` for a brand-new prompt). Use
today's date for `version` — ask the user if you can't determine it:

```yaml
---
id: <id>
version: <YYYY-MM-DD>-v1
prior_version: null
status: active            # active | deprecated | draft
runtime: claude-api       # claude-api | vapi-dashboard | whisper-api
model: claude-sonnet-4-6  # short label
languages: [en]
variables:
  - <var_name>
owner: ai-team
last_reviewed_by: <name>
last_reviewed_at: <YYYY-MM-DD>
---
```

Then all **8 body sections** (every one required — see README):
1. **Purpose** — the paragraph from Step 1.
2. **When to use** — what triggers the prompt at runtime, and which
   pipeline/route calls it.
3. **Variables** — table: name | type | source | example.
4. **Prompt body** — the prompt in a fenced code block. Write a real
   starter the author can refine; for a structured `claude-api` prompt it
   must end by demanding JSON-only output (skip that line for a prose/
   conversational prompt). Specs may instead point to the runtime for the
   authoritative body — mirror the style of existing specs.
5. **Output schema** — the JSON shape (matching the runtime's output
   interface), or `N/A — conversational` (with a sentence of explanation)
   for a prose/markdown prompt.
6. **Safety guardrails** — each mapped to a test case. Always include the
   non-negotiables for clinical prompts: never diagnose/recommend treatment;
   preserve the caregiver's factual observations verbatim.
7. **Test cases** — ≥3 `input → expected behavior` pairs; ≥1 per language
   for multilingual. Real cases, not placeholders.
8. **Version history** — one line: `<version> — initial version.`
   (append-only going forward).

## Step 3 — write the runtime (claude-api only)

Create `src/lib/prompts/<name>.ts`, modeled on `incident-classify.ts`. Lead
with the **canonical-spec comment** so `prompt-sync` can map it
deterministically:

```ts
// Canonical spec: prompts/<id>.md (id: <id>).
// Update the spec + bump version + log in prompts/CHANGELOG.md when the
// wording changes. PROMPT_VERSION below must equal the spec's version.

export const <NAME>_SYSTEM_PROMPT = `...`;            // the body from the spec
export const <NAME>_MODEL = "<exact-api-model-id>";
export const <NAME>_PROMPT_VERSION = "<YYYY-MM-DD>-v1"; // == spec version

export function build<Name>UserPrompt(args: {/* typed vars */}): string {
  return `...`;
}

// Semantically named output interface — house style names the *result*
// (`IncidentClassification`, `StructuredNote`), not `<Name>Output`. Omit
// entirely for a prose/markdown prompt.
export interface <SemanticName> {
  // mirrors the spec's Output schema
}
```

For a **multilingual** prompt, append the shared blocks to the system prompt
exactly as existing runtimes do (import from `@/lib/prompts/_shared`):

```ts
import {
  buildCulturalRegisterBlock,
  buildOutputLanguageInstruction,
} from "@/lib/prompts/_shared";
// ...build the system prompt by concatenating the base text +
// buildCulturalRegisterBlock(context) + buildOutputLanguageInstruction(lang)
```

`<NAME>` is SCREAMING_SNAKE of the runtime concept; `<Name>` is PascalCase;
`<SemanticName>` describes the result, not the prompt. Find the exact
pattern in an existing same-tier runtime and match it.

## Step 4 — write the test stub (claude-api only)

Create `src/lib/prompts/__tests__/<name>.test.ts` mirroring the three checks
in `prompts.test.ts`:
1. **System prompt contains key safety rules** — assert the guardrail
   phrases from the spec appear in `<NAME>_SYSTEM_PROMPT`.
2. **Builds user prompt with all fields** — call `build<Name>UserPrompt`
   with every variable; assert each appears in the output.
3. **Handles null/missing context gracefully** — call with nulls; assert the
   fallback strings appear (and that it doesn't throw).

Mark anything you couldn't fully specify with a clear `// TODO(author):`
comment rather than a fake assertion.

## Step 5 — log it in `prompts/CHANGELOG.md`

Add a dated release block at the top in the existing format:

```markdown
## <YYYY-MM-DD> — <id>-v1

<one-paragraph what/why>

- `<id>` (new, `<version>`): <one-line description of what it does>.
```

## Step 6 — confirm and hand off

Report:
- Files created (spec, runtime, test, changelog entry).
- The `id`, `version`, runtime, and model.
- That `PROMPT_VERSION` == spec `version` (run `prompt-sync` to confirm).
- Next steps for the author: finalize the prompt body wording, flesh out
  real test cases, and run `pnpm test` over `src/lib/prompts/__tests__/`.
- If `runtime: vapi-dashboard`: remind them to paste the body into the Vapi
  dashboard and record the paste date in Version history (no `.ts`).

## Hard rules (never break these)

- **`PROMPT_VERSION` must equal the spec `version`.** That equality is what
  `prompt-sync` checks; never emit them mismatched.
- **Emit the `// Canonical spec: prompts/<id>.md` comment** in every runtime
  so the spec↔runtime mapping is deterministic.
- **Structured claude-api prompts output JSON only** (the default): the
  system prompt must say so and the output interface must match the spec's
  Output schema. Prose/conversational prompts (like `demo-consult.ts`) are
  the exception — Output schema reads `N/A — conversational`.
- **Bake in the non-negotiables for clinical prompts:** Claude is a scribe,
  never a clinician — no diagnosis, no treatment advice; preserve the
  caregiver's factual observations verbatim (`CLAUDE.md`).
- **≥3 test cases, ≥1 per language** for multilingual prompts — in the spec.
  Don't ship a multilingual prompt with English-only cases.
- **Never guess a model id, a date, or a version string.** Copy model ids
  from existing runtimes; ask for the date if unknown.
- **Don't fabricate behavior in tests.** Assert what the prompt actually
  does; mark gaps with `// TODO(author:)`.
- **Don't apply, deploy, or run the vapi sync.** Stay within `prompts/` and
  `src/lib/prompts/`.

## When to ask vs. when to act

| Situation | Action |
|---|---|
| `/new-prompt` with no detail | Ask for id, purpose, runtime, model, languages, variables, output shape. |
| User gives a full description | Scaffold all files; let them refine wording. |
| Runtime is `vapi-dashboard` / `whisper-api` | Create the spec only (no `.ts`/test); note the paste-sync step for Vapi. |
| Multilingual prompt | Wire `_shared` builders; require ≥1 test case per language. |
| User unsure which model | Default Haiku for classify/cheap, Sonnet for clinical/creative; say which you picked. |
| Runtime filename should differ from id | Confirm the stem, still emit the `// Canonical spec:` comment pointing at the real spec id. |
| User asks you to write all the test assertions for unwritten behavior | Decline; stub with `// TODO(author:)` and explain. |
