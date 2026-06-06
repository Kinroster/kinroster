---
name: prompt-sync
description: |
  Keep Kinroster's prompt specs (prompts/*.md) and their runtime
  implementations (src/lib/prompts/*.ts) in sync. Two modes: AUDIT — scan
  for spec↔runtime version drift, claude-api specs whose runtime is missing
  a PROMPT_VERSION constant, runtimes with no spec, missing CHANGELOG
  entries, and a stale README table; and BUMP — walk a single prompt
  through a correct version bump (spec version, prior_version, version
  history, runtime constant, CHANGELOG).

  Use this skill when the user says any of: "check prompt drift", "are the
  prompts in sync", "audit the prompts", "bump prompt version", "ship a
  prompt change", "/prompt-sync".

  IMPORTANT: AUDIT is read-only — it reports, it does not edit. BUMP edits
  version metadata only; it NEVER rewrites a prompt's body or wording (that
  is the human's authorship). When unsure which mode, default to AUDIT.
---

# Prompt sync — spec ↔ runtime drift audit & version bumps

Kinroster keeps every LLM prompt's **source of truth** in `prompts/<id>.md`
(YAML frontmatter + 8 body sections) and its runtime in
`src/lib/prompts/<name>.ts`. For `claude-api` prompts the runtime MUST
export a `*_PROMPT_VERSION` constant equal to the spec's `version`. Nothing
currently enforces that, so they drift silently — this skill is the
interactive auditor/fixer. (The durable fix is to graduate the AUDIT into a
`pre-pr-checks.sh`/CI gate later; this skill is the fast, explain-as-you-go
companion.)

Canonical references:
- `prompts/README.md` → frontmatter fields, the 8 body sections, "How to
  ship a prompt change", and the "Prompts in this directory" table
- `prompts/CHANGELOG.md` → cross-prompt release-log format
- any runtime, e.g. `src/lib/prompts/diligence-summary.ts` (top comment
  pointing back to its spec) and its `*_PROMPT_VERSION` export

## Step 0 — pick a mode

- "check / audit / are they in sync / drift" → **AUDIT** (Steps A1–A3).
- "bump / ship a change / new version of <prompt>" → **BUMP** (Steps B1–B4).
- Anything ambiguous → run AUDIT first, then offer to BUMP what's broken.

---

## AUDIT mode

### A1 — gather the raw data

Pull every spec's `id` / `version` / `runtime`, and every runtime's
`PROMPT_VERSION`, in one pass:

```bash
echo "=== SPECS ==="
for f in prompts/*.md; do
  b=$(basename "$f"); [ "$b" = "README.md" -o "$b" = "CHANGELOG.md" ] && continue
  echo "--- $f"
  awk '/^---/{c++; next} c==1 && /^(id|version|runtime|status):/{print}' "$f"
done
echo "=== RUNTIME PROMPT_VERSION ==="
grep -rn "PROMPT_VERSION" src/lib/prompts/*.ts
echo "=== RUNTIME → SPEC pointers (top-of-file comments) ==="
grep -rn "prompts/.*\.md" src/lib/prompts/*.ts
echo "=== CHANGELOG release headers ==="
grep -n "^## " prompts/CHANGELOG.md
```

### A2 — map each spec to its runtime

The filenames are **not** 1:1, so do not match on filename alone:
- `shift-note-structuring.md` → `shift-note.ts`
- `resident-conversation-thread-updater.md` → `thread-update.ts`
- most others share a stem (`clinician-summary.md` → `clinician-summary.ts`)

Resolve the runtime for each spec in this order:
1. **Any `prompts/<id>.md` reference anywhere in a runtime file** — the A1
   `grep "prompts/.*\.md"` surfaces these. The phrasing is inconsistent
   across the repo (`// Canonical spec: prompts/...` in
   `diligence-summary.ts`, but `// Spec lives at prompts/...` in
   `thread-update.ts`, and a mid-comment mention in `shift-note.ts`), so
   match on the `prompts/<id>.md` path, **not** on a fixed comment prefix.
   This is the only signal that correctly links the non-stem pairs like
   `resident-conversation-thread-updater.md` → `thread-update.ts`.
2. A runtime filename that is a clear stem of the spec `id`.
3. If still ambiguous, ask the user which `.ts` implements the spec.

When a mapping was resolved by a loose/inconsistent reference (anything but
a clean `// Canonical spec: prompts/<id>.md` line), note it as a fix: adding
that standardized comment to the runtime makes the next audit deterministic.
This is the one case where AUDIT may *suggest* a one-line, body-preserving
edit — still only with the user's go-ahead.

The version constant is named per-prompt (`SHIFT_NOTE_PROMPT_VERSION`,
`CLINICIAN_SUMMARY_PROMPT_VERSION`, …) — find it by grepping
`*_PROMPT_VERSION` in the mapped file, don't assume the name.

### A3 — run the checks and report

Evaluate every prompt against these checks:

| Check | Finding when it fails |
|---|---|
| **Version match** | `claude-api` spec's `version` ≠ runtime `*_PROMPT_VERSION` → **DRIFT** |
| **Runtime version present** | `claude-api` spec whose runtime exports no `*_PROMPT_VERSION` → **MISSING CONSTANT** |
| **Spec present** | runtime prompt with a `PROMPT_VERSION` (or clearly a prompt) but no `prompts/*.md` spec → **NO SPEC** |
| **CHANGELOG entry** | a spec `version`'s release date has no matching `## <date>` block in CHANGELOG → **NO CHANGELOG** |
| **README table** | a current spec missing from README's "Prompts in this directory" table, or a wrong runtime/model → **STALE README** |
| **Vapi specs** | `runtime: vapi-dashboard` (e.g. `vapi-intake-assistant`) has no `.ts` to verify — confirm its Version history records the dashboard paste date → **MANUAL: VERIFY PASTE** |

Output a single scannable table, one row per prompt, then a short list of
concrete fixes. Use this shape:

```markdown
## Prompt sync audit — <YYYY-MM-DD>

| Prompt (id) | Runtime | Spec ver | Runtime ver | Status |
|---|---|---|---|---|
| clinician-summary | clinician-summary.ts | 2026-05-02-multilingual-v1 | 2026-05-02-multilingual-v1 | ✅ in sync |
| resident-conversation-thread-updater | thread-update.ts | 2026-05-22-v1 | — | ❌ missing PROMPT_VERSION constant |
| caregiver-summary | caregiver-summary.ts | — | — | ⚠️ runtime has no canonical spec |
| vapi-intake-assistant | (vapi-dashboard) | 2026-05-23-thread-grounding-v1 | n/a | ⓘ verify dashboard paste date in Version history |

### Fixes
1. ...
```

**Read-only.** Propose the fixes; do not apply them unless the user says
"fix it" — then for a version bump, switch to BUMP mode (don't hand-hack
the constant). For a missing spec, offer the `new-prompt` skill.

---

## BUMP mode

Use when shipping a change to ONE prompt. Follow `prompts/README.md` → "How
to ship a prompt change" exactly. You bump metadata; the human owns the body.

### B1 — confirm what's changing
Ask (if not given): which prompt, and a one-line summary of what changed and
why. Pick the new `version` as `YYYY-MM-DD-<short-name>` (today's date;
ask the user for the date if you cannot determine it — never guess).

### B2 — edit the spec `prompts/<id>.md`
- Set `version:` to the new value.
- Move the old value into `prior_version:`.
- Append a line to the **Version history** section (append-only — never
  rewrite prior lines): `version: <new> — <what changed and why>`.
- If the change altered behavior, ensure the **Test cases** section still
  has ≥3 cases (one per supported language for multilingual prompts). Flag
  if it doesn't; do not invent test cases silently.

### B3 — update the runtime
- `runtime: claude-api` → set the mapped `*_PROMPT_VERSION` constant to the
  new `version`. If the prompt body wording changed, point the user to the
  exact `.ts` location to update the text — **you do not rewrite prompt
  wording**, you keep the version constant honest.
- `runtime: vapi-dashboard` → there is no `.ts`. Remind the user to paste
  the new **Prompt body** into the Vapi dashboard and record the paste date
  in the Version history line (the `pnpm prompts:sync-vapi` script is a
  future TODO, so this is manual).

### B4 — log the release in `prompts/CHANGELOG.md`
Add or extend the dated release block at the top, in the existing format:

```markdown
## <YYYY-MM-DD> — <release-name>

<one-paragraph what/why>

- `<prompt-id>`: `<prior_version>` → `<new_version>`. <what changed>.
```

Then report: files touched, old → new version, and remind to run the prompt
regression tests (`pnpm test` over `src/lib/prompts/__tests__/`) before
opening a PR.

---

## Hard rules (never break these)

- **AUDIT never writes.** It reports drift and proposes fixes only.
- **Never rewrite a prompt's body/wording.** Both modes touch *version
  metadata and constants*, not the prompt text — that's the human's
  authorship. You may point to where the body lives.
- **Version history is append-only.** Add lines; never edit or delete prior
  entries in a spec's Version history or in CHANGELOG.md.
- **Keep the constant honest.** A runtime `*_PROMPT_VERSION` must always
  equal its spec's `version` after a bump — that equality is the whole point.
- **Never guess a date or a version string.** Ask if you can't determine
  today's date.
- **Don't invent test cases or specs.** Missing tests/specs are findings to
  surface, not gaps to paper over.
- **Don't run migrations, deploys, or the vapi sync.** This skill stays
  within `prompts/` and `src/lib/prompts/`.

## When to ask vs. when to act

| Situation | Action |
|---|---|
| `/prompt-sync` with no args | Run AUDIT, present the table, then ask if they want any fixes/bumps. |
| "are the prompts in sync?" | Run AUDIT only. Stop at the report. |
| "bump <prompt> to a new version" | BUMP mode. Ask only for the change summary if missing. |
| Audit finds a missing PROMPT_VERSION constant | Report it; offer to add the constant (a BUMP-style metadata edit), set equal to the spec version. |
| Audit finds a runtime with no spec | Report it; suggest the `new-prompt` skill to author the spec. Don't fabricate one. |
| Spec↔runtime mapping is ambiguous | Ask the user which `.ts` implements the spec. |
| Prompt body wording needs to change | Tell the user where it is; let them edit. Then bump the version metadata. |
