---
name: rls-audit
description: |
  Audit Kinroster's Supabase migrations for row-level-security gaps: tables
  created without ENABLE ROW LEVEL SECURITY, RLS tables with no policy (or a
  permissive USING (true) policy), policies missing org-scoping, functions
  whose latest definition doesn't pin SET search_path, and append-only
  ledgers that wrongly allow UPDATE/DELETE. Produces a severity-ranked gap
  report.

  Use this skill when the user says any of: "audit RLS", "check our
  row-level security", "are there any RLS gaps", "security-audit the
  database", "/rls-audit".

  IMPORTANT: This skill is READ-ONLY. It reports gaps and proposes fixes; it
  NEVER edits a migration (they are immutable) and never touches the
  database. Fixes land in a NEW forward migration via the migration-scaffold
  skill.
---

# RLS audit — find row-level-security gaps in the migrations

In Kinroster every table holds org-scoped PHI, so a single missing `ENABLE
ROW LEVEL SECURITY` or a `USING (true)` policy is a cross-tenant leak. This
skill scans `supabase/migrations/*.sql` **cumulatively** and reports gaps.
It's the interactive auditor; the durable enforcer is a CI/`pre-pr-checks.sh`
gate that fails the build on a table without RLS (graduate the cheap checks
there once this skill has proven them out).

Canonical conventions (what "correct" means):
- `docs/compliance/hipaa-roadmap.md` → "Conventions every phase must follow"
- `supabase/migrations/00001_initial_schema.sql` → org-scoped policy pattern
- `supabase/migrations/00002_secure_functions.sql` → `SET search_path` pattern
- `supabase/migrations/00009_audit_events.sql` → append-only pattern
- `CLAUDE.md` → "RLS must be enabled on every table with user data"

## Two hard-won rules for scanning this repo correctly

Get these wrong and you produce a report full of false positives:

1. **Evaluate cumulatively, by latest definition — never per-file.**
   - A table created in one migration may have RLS enabled in the same
     migration (the convention) — but functions are routinely *re-created*
     in later migrations. `00001` defines `get_user_org_id`/`is_admin`/
     `handle_new_user` without `search_path`; `00002` re-creates them WITH
     it. Judging `00001` alone wrongly flags 3 hardened functions.
   - So: for each function name, find its **last** `CREATE OR REPLACE
     FUNCTION` across all migrations (by file number) and check only that
     one.

2. **Policies span multiple lines — do not single-line grep for them.**
   Policies are written as:
   ```sql
   CREATE POLICY "Users can view org residents"
     ON residents FOR SELECT
     USING (organization_id = get_user_org_id());
   ```
   A `grep 'CREATE POLICY .* ON <table>'` matches nothing and makes every
   table look policy-less. To check policy coverage, **read the migration
   file(s)** for the table and reason over the SQL, or use a multiline-aware
   scan (`grep -Pzo`, `awk` across lines). Treat any single-line policy grep
   as unreliable.

## Step 1 — gather the cheap, reliable signals

These greps are accurate (single-line facts):

```bash
echo "=== tables created ==="
grep -rhoE "CREATE TABLE (IF NOT EXISTS )?[a-zA-Z_]+" supabase/migrations/*.sql \
  | sed -E 's/CREATE TABLE (IF NOT EXISTS )?//' | sort -u
echo "=== tables with RLS enabled ==="
grep -rhoE "ALTER TABLE [a-zA-Z_]+ ENABLE ROW LEVEL SECURITY" supabase/migrations/*.sql \
  | sed -E 's/ALTER TABLE ([a-zA-Z_]+).*/\1/' | sort -u
echo "=== permissive policies (should be empty) ==="
grep -rnE "USING \(true\)|WITH CHECK \(true\)" supabase/migrations/*.sql
echo "=== every function definition, with migration number ==="
grep -rnoE "CREATE (OR REPLACE )?FUNCTION [a-zA-Z_.]+" supabase/migrations/*.sql | sort
```

- **RLS-enabled gap** = a table in the first list missing from the second.
- **Permissive-policy gap** = any hit in the third (none is the healthy state).
- The function list feeds Step 3.

## Step 2 — policy coverage & org-scoping (read, don't grep)

For each RLS-enabled table, locate its policies (search the migrations for
`ON <table>`) and **read them**. Check:
- **At least one policy exists** unless the table is intentionally
  service-role/trigger-written (e.g. `audit_events` has only a SELECT
  policy by design — that's correct, not a gap). A table with *zero*
  policies that an authenticated route writes to is a real gap (writes are
  silently blocked) — cross-check against where it's written.
- **Org-scoping present:** every policy constrains to `get_user_org_id()`
  directly, or via an `EXISTS` against a parent (like `family_contacts` →
  `residents`). A policy with no org constraint, or `USING (true)`, is a
  leak.

## Step 3 — function search_path

For each distinct function name from Step 1, find its **latest** definition
and confirm it has `SET search_path` (`''` preferred, `public` acceptable).
Read the function body at that location — do not trust a per-file count.

Verify all of them; don't anchor on a single example. As of this writing
the only unhardened one is `update_updated_at()` (defined `00001:414`, never
re-hardened) — low severity: it only sets `NEW.updated_at`, resolving no
object names, but the convention is "all functions pin search_path". Every
other function checked (`get_user_org_id`, `is_admin`, latest
`handle_new_user`, `has_role`, `check_org_quota`, `increment_usage`,
`count_hidden_sensitive_notes`, the `00009` audit functions,
`snapshot_capacity_history`, `is_staff`) does pin it. Re-verify rather than
trusting this list — new migrations add functions.

## Step 4 — append-only integrity (verify intent first — do NOT assume)

Some ledgers are append-only by design; **many consent tables are not** —
consent is often *revocable*, modeled as an `UPDATE` (set `revoked_at`).
Flagging a deliberate revocation `UPDATE` as a violation is exactly the
"cry wolf" failure this skill must avoid.

Confirmed append-only in this repo (no `FOR UPDATE`/`FOR DELETE` by design —
flag any that appear): `audit_events`, `disclosure_events`,
`deletion_ledger`, `consent_records` (SELECT + INSERT only).

Confirmed **revocable by design** (UPDATE is correct, NOT a finding):
`resident_pdpa_consents` and `family_contact_pdpa_consents` (use `FOR ALL`),
`resident_recording_consents` (has `FOR UPDATE`).

For any *other* table that looks ledger-like, do not assume — read its
policies and decide from intent (does it have a `revoked_at`/mutable status
column? then UPDATE is expected). Only flag UPDATE/DELETE on a table that is
genuinely append-only by design.

## Step 5 — (optional) live cross-check

If the Supabase MCP tools are connected, run the security advisors as a
second opinion against the *deployed* schema (catches drift between
migrations and reality): `get_advisors` with `type: "security"`. Note in the
report that this reflects the live DB, not the migration files. Skip
silently if the tools aren't available.

## Step 6 — report

Output one severity-ranked table, then a fix list:

```markdown
## RLS audit — <YYYY-MM-DD>

Scanned <N> migrations, <M> tables.

| Severity | Finding | Object | Evidence |
|---|---|---|---|
| 🔴 High | Table has RLS but no org-scoped SELECT policy | `foo` | 00027:12 |
| 🟡 Med | Append-only ledger allows UPDATE | `bar_ledger` | 00029:40 |
| 🔵 Low | Function does not pin search_path | `update_updated_at()` | 00001:414 |

### Fixes
1. <table>: add policy ... — land in a NEW migration via `migration-scaffold`.
```

If nothing is found, say so plainly ("32/32 tables RLS-enabled, no permissive
policies, all functions pin search_path except <…>") — a clean audit is a
valid, valuable result.

## Hard rules (never break these)

- **Read-only.** Never edit a migration, never run SQL, never `db reset`.
  Migrations are immutable; fixes go in a NEW forward migration.
- **Cumulative, latest-definition analysis.** Never flag a function/table
  based on one file when a later migration changes it.
- **No single-line policy grep.** Read the SQL for policy coverage; treat
  one-line policy greps as unreliable (they miss the `ON <table>` next line).
- **Don't cry wolf.** `audit_events`-style SELECT-only tables and
  service-role-written ledgers are correct by design — don't report them as
  "missing policies". Confirm who writes a table before calling zero-policy
  a gap.
- **Severity honestly.** A missing RLS or `USING (true)` is High; an
  unhardened `now()`-only trigger function is Low. Don't inflate.
- **Propose, don't apply.** End at the report + a fix list that points to
  `migration-scaffold`.

## When to ask vs. when to act

| Situation | Action |
|---|---|
| `/rls-audit` with no args | Run the full audit (Steps 1–6), present the report. |
| User asks about one table | Scope Steps 2–4 to that table; still read its policies. |
| Audit is clean | Report the clean result explicitly with the counts. |
| User says "fix the gaps" | Hand each fix to `migration-scaffold` (new forward migration); never edit an existing migration. |
| Supabase MCP available | Add the `get_advisors` security cross-check (Step 5), labeled as live-DB. |
| Single-line grep disagrees with a file read | Trust the file read; note the grep is unreliable for policies. |
