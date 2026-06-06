---
name: hipaa-phase-check
description: |
  Cross-check a Kinroster HIPAA-roadmap phase against the code that's
  actually shipped. Reads the phase's "What was built" + "How to verify"
  sections plus the compliance tracker/gaps docs, then greps/reads the
  codebase to confirm each claimed artifact (migration, RLS policy, API
  route, prompt, UI page, audit/disclosure logging) really exists. Produces
  a ✅/⚠️/❌ checklist with file evidence.

  Use this skill when the user says any of: "check HIPAA phase N", "are we
  compliant for phase X", "verify the roadmap phase", "did phase N actually
  ship", "/hipaa-phase-check".

  IMPORTANT: READ-ONLY assessment. It verifies code against the roadmap's
  own claims — it does NOT trust the ✅ in the doc, edit anything, or give
  legal advice. It flags items needing human or legal sign-off.
---

# HIPAA phase check — verify a roadmap phase against shipped code

The roadmap (`docs/compliance/hipaa-roadmap.md`) marks phases ✅, but a
checkmark in a doc is a claim, not proof. This skill verifies the claim:
for one phase, it confirms each artifact the roadmap says was built actually
exists in the code, and surfaces the gaps. It's an assessment aid for the
owner, **not** a compliance certification and **not** legal advice.

Canonical sources:
- `docs/compliance/hipaa-roadmap.md` → per-phase "What was built", "Known
  limitations to carry forward", "How to verify"
- `docs/compliance/compliance-action-tracker.md` → pre/post-launch checklist
- `docs/compliance/compliance-gaps.md` → known open gaps
- The conventions in the roadmap's "Conventions every phase must follow"

Phases exist 1–11 (1–9 + 11 are code phases; **Phase 10 is non-code,
ongoing ops** — handle it differently, see below).

## Step 1 — load the phase

Ask which phase if not given. Read, in full:
1. The `## Phase N — …` section of `hipaa-roadmap.md` (its "What was built",
   "Known limitations", and "How to verify" subsections).
2. Any rows for that phase in `compliance-action-tracker.md` and
   `compliance-gaps.md`.

Extract a concrete checklist of **claimed artifacts** from "What was built"
— e.g. a named migration file, specific RLS policies, named API routes
(`POST /api/...`), prompt files, UI pages, audit/disclosure event types.

## Step 2 — verify each artifact against the code

For every claimed artifact, find the evidence (don't trust the prose):
- **Migrations** → the named file exists in `supabase/migrations/`; the
  table/policy/function it claims is present (read it). Pair with the
  `rls-audit` skill if the claim is about RLS coverage.
- **API routes** → the route file exists under `src/app/api/...`; the
  behavior claimed (auth check, audit insert, disclosure insert) is in it.
- **Prompts** → the spec in `prompts/` and runtime in `src/lib/prompts/`
  exist (pair with `prompt-sync` for version sanity).
- **Audit/disclosure logging** → the event type exists in `src/lib/audit.ts`
  and is actually called from the route that claims it.
- **UI pages** → the page file exists under `src/app/...`.

Use `ls`, `grep`, and `Read` — cite `file:line` as evidence. If an artifact
named in the roadmap is **absent or differs**, that's a finding (the doc
drifted from the code, or the work regressed).

## Step 3 — fold in the "How to verify" steps

The phase's "How to verify" subsection lists checks (often "once Docker is
running"). For each: if it's a static check you can do now (file exists,
policy present, type defined), do it. If it requires a running DB/app
(integration/RLS-at-runtime), mark it **⚠️ needs runtime verification** and
say what to run — don't claim it passes from a static read alone.

## Step 4 — report

```markdown
## HIPAA Phase N check — <phase title> — <YYYY-MM-DD>

Roadmap status: ✅ (claimed)   |   Verified: <PASS / PARTIAL / GAPS FOUND>

| Claimed artifact | Status | Evidence |
|---|---|---|
| Migration 000NN_foo.sql (table + RLS) | ✅ present | supabase/migrations/000NN_foo.sql |
| POST /api/foo logs disclosure_event | ⚠️ route exists, no disclosure insert | src/app/api/foo/route.ts:40 |
| Audit type 'foo_done' | ❌ not in AuditEventType | src/lib/audit.ts |

### Known limitations carried forward (from roadmap)
- <verbatim from the phase's "Known limitations">

### Needs runtime verification
- <checks that require Docker/DB/app running, with the command to run>

### Items needing human / legal sign-off
- <policy/BAA/training items — not code, defer to owner>
```

Close with an honest one-line verdict: does the code back up the roadmap's ✅
for this phase, fully / partially / with gaps.

## Special cases

- **Phase 10 (compliance ops, non-code)** — there's nothing to grep. Report
  it as process/ops items from the tracker and explicitly defer to the
  owner; don't fabricate a code checklist.
- **Phase 11 (Taiwan PDPA)** — partly "in progress" and has external
  dependencies; verify the "What shipped in code" items, list the "External
  dependencies still open" as non-code, and don't mark them pass/fail.

## Hard rules (never break these)

- **Read-only.** Never edit code, migrations, or the docs; never run
  migrations or deploys. Static reads + (optionally) read-only checks only.
- **Verify, don't trust the ✅.** The whole point is catching doc↔code
  drift. A roadmap claim is not evidence; a `file:line` is.
- **Don't overclaim runtime behavior.** If a check needs a running DB/app,
  mark it ⚠️ needs-runtime and give the command — never assert it passes
  from a static read.
- **Not legal advice, not a certification.** State uncertainty plainly.
  Route policy/BAA/training items to human/legal sign-off.
- **No fabrication.** If you can't find evidence for a claim, say "not
  found" — don't assume it exists because the doc says so.
- **Propose, don't apply.** Gaps that need code go to `migration-scaffold` /
  `audit-wire` / the relevant skill, not edits from here.

## When to ask vs. when to act

| Situation | Action |
|---|---|
| `/hipaa-phase-check` with no phase | Ask which phase (1–11), or offer to sweep all of them at a summary level. |
| A specific phase given | Run Steps 1–4 for that phase. |
| Phase 10 | Report ops/process items; defer to owner; no code checklist. |
| A claimed artifact is missing | Mark ❌ with evidence; suggest the skill that would fix it. |
| Check needs a running DB/app | Mark ⚠️ needs-runtime; give the exact command. |
| User asks "are we HIPAA compliant?" | Scope to code-vs-roadmap verification; clarify this isn't legal certification. |
