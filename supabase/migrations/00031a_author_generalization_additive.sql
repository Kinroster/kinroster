-- Phase 2 (additive half): author generalization.
--
-- Today, voice_sessions.caregiver_id and notes.author_id both implicitly
-- mean "the caregiver". Phases 3 and 4 will let clinicians and family
-- members also dictate / submit notes. To make those routes safe to add
-- without rewriting every reader, we generalize:
--   * voice_sessions.author_id (added nullable in 00030) is now
--     backfilled from caregiver_id.
--   * voice_sessions.author_type and notes.author_type are added with
--     a CHECK enumerating the four author classes.
--   * is_staff() — SECURITY DEFINER STABLE — replaces the "NOT
--     has_role('ops_staff') AND NOT has_role('billing_staff')" pattern
--     on clinical-table SELECT policies. The positive-list shape means
--     the new 'clinician' and 'family' roles introduced in 00032 / 00033
--     are cleanly EXCLUDED from staff-only surfaces by default.
--
-- The NOT NULL flips on the two author_type columns are deferred to a
-- separate migration (00031b) deployed AFTER a release window during
-- which all writers populate the new columns. This survives a rolling
-- release where old + new code coexist briefly.
--
-- See docs/engineering/resident-conversation-thread-plan.md §Phase 2.

-- ============================================
-- voice_sessions: backfill author_id, add author_type
-- ============================================
UPDATE voice_sessions
SET author_id = caregiver_id
WHERE author_id IS NULL;

ALTER TABLE voice_sessions
  ADD COLUMN IF NOT EXISTS author_type TEXT
    CHECK (author_type IN ('caregiver', 'admin', 'clinician', 'family'));

-- Backfill author_type from the existing caregiver's role. We map
-- compliance_admin → admin to keep author_type focused on contribution
-- class rather than every internal role variant.
UPDATE voice_sessions vs
SET author_type = CASE u.role
  WHEN 'admin' THEN 'admin'
  WHEN 'compliance_admin' THEN 'admin'
  ELSE 'caregiver'
END
FROM users u
WHERE u.id = vs.caregiver_id
  AND vs.author_type IS NULL;

-- ============================================
-- notes: add author_type
-- ============================================
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS author_type TEXT
    CHECK (author_type IN ('caregiver', 'admin', 'clinician', 'family'));

UPDATE notes n
SET author_type = CASE u.role
  WHEN 'admin' THEN 'admin'
  WHEN 'compliance_admin' THEN 'admin'
  ELSE 'caregiver'
END
FROM users u
WHERE u.id = n.author_id
  AND n.author_type IS NULL;

-- Hot-path lookup for the family-facing portal and the clinician
-- portal: "all notes for this resident by this author class". Partial
-- index excludes the legacy NULL window so the index is cheap during
-- the 00031a → 00031b deploy gap.
CREATE INDEX IF NOT EXISTS idx_notes_resident_author_type
  ON notes (resident_id, author_type, created_at DESC)
  WHERE author_type IS NOT NULL;

-- ============================================
-- is_staff() helper
-- ============================================
-- Positive-list: returns true iff the caller is one of the four staff
-- roles that legitimately read clinical content. Explicitly EXCLUDES
-- clinician and family roles (added in 00032 / 00033) so staff-only
-- RLS surfaces stay tight by default — clinicians and family get
-- access to filtered views (clinician_clinical_summary,
-- family_safe_summary) through portal-specific routes, not the raw
-- notes table.
--
-- nurse_reviewer is included because they already had clinical read
-- access via the inverse pattern; compliance_admin is included because
-- it's the future home of admin's read-everything authority.
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role IN (
    'admin',
    'caregiver',
    'nurse_reviewer',
    'compliance_admin'
  ) FROM users WHERE id = auth.uid()
$$;

-- ============================================
-- Migrate clinical-table SELECT policies to is_staff()
-- ============================================
-- Behavioural delta TODAY: zero — clinician / family roles don't yet
-- exist in users_role_check (00032 / 00033 add them). The point of
-- migrating now is so Phase 3 / 4 don't need to revisit each policy:
-- when those roles do exist, is_staff() returns false for them
-- automatically.

DROP POLICY IF EXISTS "Users can view org notes" ON notes;
CREATE POLICY "Users can view org notes"
  ON notes FOR SELECT
  USING (
    organization_id = get_user_org_id()
    AND is_staff()
    AND (
      sensitive_flag = false
      OR author_id = auth.uid()
      OR is_admin()
      OR EXISTS (
        SELECT 1 FROM notes_sensitive_access
        WHERE notes_sensitive_access.user_id = auth.uid()
          AND notes_sensitive_access.resident_id = notes.resident_id
          AND (
            notes_sensitive_access.expires_at IS NULL
            OR notes_sensitive_access.expires_at > now()
          )
      )
    )
  );

DROP POLICY IF EXISTS "Users can view org incidents" ON incident_reports;
CREATE POLICY "Users can view org incidents"
  ON incident_reports FOR SELECT
  USING (organization_id = get_user_org_id() AND is_staff());

DROP POLICY IF EXISTS "Users can view org summaries" ON weekly_summaries;
CREATE POLICY "Users can view org summaries"
  ON weekly_summaries FOR SELECT
  USING (organization_id = get_user_org_id() AND is_staff());

DROP POLICY IF EXISTS "Users can view org voice sessions" ON voice_sessions;
CREATE POLICY "Users can view org voice sessions"
  ON voice_sessions FOR SELECT
  USING (organization_id = get_user_org_id() AND is_staff());
