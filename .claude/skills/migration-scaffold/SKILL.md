---
name: migration-scaffold
description: |
  Scaffold a new Supabase migration for Kinroster with the repo's security
  conventions baked in: RLS enabled in the same migration as the table,
  org-scoped read + admin-only write policies (or append-only / access-via-
  parent variants), functions pinned to SET search_path, an updated_at
  trigger where needed, and the right indexes.

  Use this skill when the user says any of: "new migration", "add a table",
  "scaffold a Supabase migration", "/migration-scaffold", "I need a new
  database table", "create a migration for X".

  IMPORTANT: This skill only WRITES a new, correctly-numbered migration
  file. It never edits an existing migration (they are immutable), never
  runs `supabase db reset` or applies the migration itself, and never
  regenerates types — it tells the user how. The user reviews the SQL,
  applies it, and regenerates types.
---

# Migration scaffold — RLS-safe Supabase migrations

You are scaffolding a migration in **Kinroster**, where every table holds
org-scoped data and a single missing `ENABLE ROW LEVEL SECURITY` is a PHI
leak. Your job is to produce a migration that follows the house
conventions exactly, so the user reviews SQL instead of writing boilerplate.

The canonical references (read them if anything below is ambiguous):
- `docs/compliance/hipaa-roadmap.md` → "Conventions every phase must follow"
- `supabase/migrations/00001_initial_schema.sql` → org-scoped table + policy
  pattern, `update_updated_at()` trigger function
- `supabase/migrations/00002_secure_functions.sql` → canonical `SET search_path`
  function pattern
- `supabase/migrations/00009_audit_events.sql` → append-only table pattern
- `CLAUDE.md` → "Important Rules" (RLS on every table with user data)

## Step 1 — determine the next migration number

Migrations are numbered, zero-padded to 5 digits, and **immutable**. Do NOT
trust any hardcoded "next is 000NN" in the docs — it goes stale. Compute it:

```bash
ls -1 supabase/migrations/ | grep -E '^[0-9]{5}_' | sort | tail -1
```

Take the highest prefix, add 1, zero-pad to 5 digits. The new file is
`supabase/migrations/<NNNNN>_<snake_case_name>.sql`. Pick a short,
descriptive `<snake_case_name>` (e.g. `medication_logs`, `visitor_records`).

## Step 2 — gather inputs

Ask the user for whatever they haven't already given:

1. **Table name** (snake_case, plural — e.g. `medication_logs`).
2. **Columns** — name, type, nullability, defaults, CHECK constraints. Every
   table holding user data needs `organization_id UUID NOT NULL REFERENCES
   organizations(id) ON DELETE CASCADE` unless it reaches org via a parent
   (see access pattern B). Always include `id UUID PRIMARY KEY DEFAULT
   gen_random_uuid()` and `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
3. **Access pattern** — pick one (default to A if unsure):
   - **A. Standard org-scoped** — anyone in the org can read; only admins
     write. The default for most tables.
   - **B. Access-via-parent** — the row has no `organization_id` of its own
     and reaches the org through a parent FK (like `family_contacts` →
     `residents`). Use an `EXISTS` subquery in the policies.
   - **C. Append-only ledger** — audit/disclosure/consent-style; no
     UPDATE/DELETE policies ever. Then ask **who inserts the rows**, because
     it changes whether you write an INSERT policy:
     - **C1 — authenticated route writes them** (e.g. `disclosure_events`,
       written by an admin hitting `POST /api/share/clinician`). Needs
       SELECT **and** an INSERT policy with `WITH CHECK`, or RLS blocks
       every insert. **This is the default** — most ledgers are written from
       authenticated routes.
     - **C2 — service-role client or a DB trigger writes them** (e.g.
       `audit_events`). SELECT policy only; **no** INSERT policy (service-
       role bypasses RLS; normal callers are intentionally blocked).
4. **Mutable?** If the table will ever be UPDATEd and you want change
   timestamps, add `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` and the
   shared trigger (Step 3). Append-only tables (C) do NOT get `updated_at`.
5. **Indexes** — at minimum an org+time index. Add more for known query
   filters.

If the user gives you a complete description up front, don't interrogate —
scaffold and let them correct.

## Step 3 — write the migration

Open with a comment block: what the table is for and which access pattern it
uses. Then follow this exact ordering — **RLS is enabled in the same
migration as the table, before any policy** (enabling it later leaves a
window where rows are world-readable):

`CREATE TABLE` → `ALTER TABLE … ENABLE ROW LEVEL SECURITY` → indexes →
policies → (optional) `updated_at` trigger → (optional) functions/triggers.

### Pattern A — standard org-scoped (read: org; write: admin)

```sql
-- <What this table is for>. Org-scoped: all org members read, admins write.

CREATE TABLE medication_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  -- ... domain columns ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE medication_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_medication_logs_org_created
  ON medication_logs (organization_id, created_at DESC);
CREATE INDEX idx_medication_logs_resident
  ON medication_logs (resident_id, created_at DESC);

CREATE POLICY "Users can view org medication logs"
  ON medication_logs FOR SELECT
  USING (organization_id = get_user_org_id());

CREATE POLICY "Admins can insert medication logs"
  ON medication_logs FOR INSERT
  WITH CHECK (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins can update medication logs"
  ON medication_logs FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins can delete medication logs"
  ON medication_logs FOR DELETE
  USING (organization_id = get_user_org_id() AND is_admin());

-- updated_at trigger (reuses the global function from 00001)
CREATE TRIGGER set_updated_at BEFORE UPDATE ON medication_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

> If caregivers (not just admins) should write, widen the write policies'
> condition to `organization_id = get_user_org_id()` without `is_admin()`,
> and say so in the comment. Default to admin-only writes when unsure.

### Pattern B — access-via-parent (no own organization_id)

Use when the row reaches the org through a parent FK. Mirror the
`family_contacts` policies in `00001_initial_schema.sql` — wrap every policy
condition in an `EXISTS` against the parent:

```sql
CREATE POLICY "Users can view org <table>"
  ON <table> FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM residents
      WHERE residents.id = <table>.resident_id
      AND residents.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Admins can insert <table>"
  ON <table> FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM residents
      WHERE residents.id = <table>.resident_id
      AND residents.organization_id = get_user_org_id()
    )
    AND is_admin()
  );
-- UPDATE / DELETE follow the same EXISTS shape with USING (...)
```

### Pattern C — append-only ledger

Both sub-cases share the same table shape (no `updated_at`) and the same
rule: **no UPDATE/DELETE policies**, which makes the table append-only by
RLS default. They differ only in the INSERT policy.

Table + SELECT (always present):

```sql
-- <What this ledger records>. Append-only: admins read; no UPDATE/DELETE.
CREATE TABLE <table> (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- ... columns ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_<table>_org_created ON <table> (organization_id, created_at DESC);

CREATE POLICY "Admins can view org <table>"
  ON <table> FOR SELECT
  USING (organization_id = get_user_org_id() AND is_admin());
```

**C1 — authenticated route writes them (default).** Mirror
`disclosure_events` in `00005_clinicians.sql`. Add an INSERT policy, or the
route's insert is blocked by RLS. Include `actor_user_id = auth.uid()` in
the `WITH CHECK` if the table records who acted:

```sql
-- INSERT by an authenticated admin route. No UPDATE/DELETE → append-only.
CREATE POLICY "Admins can insert <table>"
  ON <table> FOR INSERT
  WITH CHECK (
    organization_id = get_user_org_id()
    AND is_admin()
    -- AND actor_user_id = auth.uid()   -- if the table has an actor column
  );
```

**C2 — service-role client or a DB trigger writes them.** Mirror
`audit_events` in `00009_audit_events.sql`. Add **no** INSERT policy — the
service-role client bypasses RLS, and normal callers are intentionally
blocked. Note this in a comment so the omission reads as deliberate:

```sql
-- INSERT is service-role / trigger only (no policy → blocked by RLS for
-- normal callers); UPDATE / DELETE blocked by no-policy fallback.
-- (SELECT policy above is the only policy on this table.)
```

### Any new function or trigger function

Pin `search_path` from the start (don't rely on a later hardening migration
like 00002 did). Use the canonical shape:

```sql
CREATE OR REPLACE FUNCTION <name>()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''        -- required; use fully-qualified public.<table>
AS $$
BEGIN
  -- ...
  RETURN NEW;
END;
$$;
```

## Step 4 — confirm and hand off

After writing the file, report to the user:
- The file path and migration number.
- The access pattern used and who can read/write.
- This exact next-step block (convention #7 from the roadmap):

```
Apply it and regenerate types:
  supabase db reset
  supabase gen types typescript --local > src/types/database.ts

If Docker/Supabase isn't running, augment src/types/database.ts manually
in the same shape the generator produces — the next regen overwrites it
without semantic drift.
```

- Remind: review the SQL before applying; if this table feeds an API route
  that discloses PHI, the `audit-wire` skill can add the logging.

## Hard rules (never break these)

- **RLS in the same migration, before policies.** Never emit a `CREATE
  TABLE` for user data without an immediately following `ALTER TABLE …
  ENABLE ROW LEVEL SECURITY`. This is the one rule that prevents a leak.
- **Never modify an existing migration.** They are numbered and immutable.
  Corrections go in a NEW migration. If the user asks to "fix migration
  000NN", refuse and scaffold a forward migration instead.
- **Every function pins `SET search_path`** (`''` preferred, with
  fully-qualified `public.` names; `public` acceptable for simple helpers).
- **Org-scoping is not optional.** Every policy must constrain to
  `get_user_org_id()` (directly or via parent `EXISTS`). Never write a
  policy with `USING (true)`.
- **Append-only means no UPDATE/DELETE policies** — do not "helpfully" add
  them to a ledger table.
- **Don't apply or reset.** Never run `supabase db reset`, `db push`, or
  `gen types` yourself — the user controls when the DB changes.
- **Don't invent columns or business logic.** If the user's column list is
  incomplete, ask; don't guess domain fields.

## When to ask vs. when to act

| Situation | Action |
|---|---|
| User invokes `/migration-scaffold` with no detail | Ask for table name, columns, and access pattern (A/B/C) with a one-line description of each. |
| User describes the table fully | Scaffold immediately; let them correct. |
| User is unsure of access pattern | Default to **A (org-scoped, admin write)** and say so. |
| Table reaches org through a parent only | Use **B** (access-via-parent EXISTS). |
| Table is audit/disclosure/consent-style | Use **C** (append-only). Ask who inserts: authenticated route → **C1** (add INSERT policy); service-role/trigger → **C2** (no INSERT policy). Default C1. |
| User asks you to edit an existing migration | Refuse; scaffold a forward migration. |
| User asks you to apply it / reset the DB | Decline; give them the commands to run themselves. |
