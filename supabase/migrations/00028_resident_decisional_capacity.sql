-- Phase 0a: per-resident decisional capacity tracking.
--
-- Establishes who has legal authority to consent on behalf of the resident.
-- This is a hard prerequisite for the recording-consent flow (00029) and
-- ultimately the resident conversation thread (00030). See
-- docs/engineering/resident-conversation-thread-plan.md.
--
-- One CURRENT row per resident (UNIQUE on resident_id). The row is
-- UPDATE-able as the assessment changes over time (capacity can return,
-- representatives can change, documentation can be added). Every material
-- change writes a snapshot row into resident_decisional_capacity_history
-- via the snapshot_capacity_history trigger, giving us an append-only
-- audit trail without making the main table append-only — which would
-- force every consumer to query MAX(assessed_at) just to find the
-- current state.

CREATE TABLE resident_decisional_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,

  capacity_status TEXT NOT NULL
    CHECK (capacity_status IN (
      'full',
      'diminished_with_representative',
      'lacks_capacity'
    )),

  -- Representative fields. NULL when capacity_status = 'full'; required
  -- otherwise via the representative_required_when_diminished CHECK.
  representative_name TEXT,
  representative_relationship TEXT,
  authority_basis TEXT
    CHECK (authority_basis IS NULL OR authority_basis IN (
      'poa_healthcare',
      'court_guardian',
      'next_of_kin',
      'spouse',
      'other'
    )),
  -- Optional path (in private 'capacity-docs' bucket) to scanned POA /
  -- guardianship paperwork. The bucket itself is provisioned in a later
  -- migration; nullable here so we can capture assessments before the
  -- doc is filed.
  documentation_uri TEXT,
  -- Free-text clinical / legal context: rationale for the determination,
  -- date of cognitive assessment, treating clinician name, etc.
  notes TEXT,

  assessed_by_user_id UUID NOT NULL REFERENCES users(id),
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_review_due_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (resident_id),

  CONSTRAINT representative_required_when_diminished CHECK (
    capacity_status = 'full'
    OR (
      representative_name IS NOT NULL
      AND representative_relationship IS NOT NULL
      AND authority_basis IS NOT NULL
    )
  )
);

CREATE INDEX idx_resident_capacity_org
  ON resident_decisional_capacity (organization_id);
CREATE INDEX idx_resident_capacity_review_due
  ON resident_decisional_capacity (organization_id, next_review_due_at)
  WHERE next_review_due_at IS NOT NULL;

ALTER TABLE resident_decisional_capacity ENABLE ROW LEVEL SECURITY;

-- All staff in the org can READ capacity — caregivers may need to see
-- the representative on any consent-touching surface, even though they
-- cannot change the assessment.
CREATE POLICY "Org users read capacity"
  ON resident_decisional_capacity FOR SELECT
  USING (organization_id = get_user_org_id());

-- Only admins manage assessments. Capacity is a regulatory determination
-- and must be attributable to a named accountable user (captured via
-- assessed_by_user_id at the app layer + changed_by_user_id in the
-- history trigger).
CREATE POLICY "Admins insert capacity"
  ON resident_decisional_capacity FOR INSERT
  WITH CHECK (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins update capacity"
  ON resident_decisional_capacity FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_admin())
  WITH CHECK (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins delete capacity"
  ON resident_decisional_capacity FOR DELETE
  USING (organization_id = get_user_org_id() AND is_admin());

CREATE TRIGGER set_updated_at_resident_capacity
  BEFORE UPDATE ON resident_decisional_capacity
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- Append-only history table
-- =====================================================
CREATE TABLE resident_decisional_capacity_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capacity_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,

  prior_capacity_status TEXT,
  new_capacity_status TEXT NOT NULL,
  prior_representative_name TEXT,
  new_representative_name TEXT,
  prior_representative_relationship TEXT,
  new_representative_relationship TEXT,
  prior_authority_basis TEXT,
  new_authority_basis TEXT,
  prior_documentation_uri TEXT,
  new_documentation_uri TEXT,
  prior_notes TEXT,
  new_notes TEXT,
  prior_next_review_due_at TIMESTAMPTZ,
  new_next_review_due_at TIMESTAMPTZ,

  change_op TEXT NOT NULL
    CHECK (change_op IN ('insert', 'update', 'delete')),
  changed_by_user_id UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No FK on capacity_id: we want history rows to survive the eventual
-- deletion of the current row (the trigger captures the delete itself).

CREATE INDEX idx_resident_capacity_history_resident
  ON resident_decisional_capacity_history (resident_id, changed_at DESC);
CREATE INDEX idx_resident_capacity_history_org_changed
  ON resident_decisional_capacity_history (organization_id, changed_at DESC);

ALTER TABLE resident_decisional_capacity_history ENABLE ROW LEVEL SECURITY;

-- Admins read history; no INSERT/UPDATE/DELETE policy → no user-facing
-- write path, table is effectively append-only via the trigger below.
CREATE POLICY "Admins read capacity history"
  ON resident_decisional_capacity_history FOR SELECT
  USING (organization_id = get_user_org_id() AND is_admin());

-- =====================================================
-- Snapshot trigger
-- =====================================================
CREATE OR REPLACE FUNCTION snapshot_capacity_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
BEGIN
  v_user := auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO resident_decisional_capacity_history (
      capacity_id, organization_id, resident_id,
      prior_capacity_status, new_capacity_status,
      prior_representative_name, new_representative_name,
      prior_representative_relationship, new_representative_relationship,
      prior_authority_basis, new_authority_basis,
      prior_documentation_uri, new_documentation_uri,
      prior_notes, new_notes,
      prior_next_review_due_at, new_next_review_due_at,
      change_op, changed_by_user_id
    ) VALUES (
      NEW.id, NEW.organization_id, NEW.resident_id,
      NULL, NEW.capacity_status,
      NULL, NEW.representative_name,
      NULL, NEW.representative_relationship,
      NULL, NEW.authority_basis,
      NULL, NEW.documentation_uri,
      NULL, NEW.notes,
      NULL, NEW.next_review_due_at,
      'insert', v_user
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Skip history write if nothing material changed. updated_at-only
    -- touches (e.g., from the BEFORE-UPDATE trigger on another column
    -- being set to the same value) shouldn't pollute the trail.
    IF OLD.capacity_status IS DISTINCT FROM NEW.capacity_status
       OR OLD.representative_name IS DISTINCT FROM NEW.representative_name
       OR OLD.representative_relationship IS DISTINCT FROM NEW.representative_relationship
       OR OLD.authority_basis IS DISTINCT FROM NEW.authority_basis
       OR OLD.documentation_uri IS DISTINCT FROM NEW.documentation_uri
       OR OLD.notes IS DISTINCT FROM NEW.notes
       OR OLD.next_review_due_at IS DISTINCT FROM NEW.next_review_due_at
    THEN
      INSERT INTO resident_decisional_capacity_history (
        capacity_id, organization_id, resident_id,
        prior_capacity_status, new_capacity_status,
        prior_representative_name, new_representative_name,
        prior_representative_relationship, new_representative_relationship,
        prior_authority_basis, new_authority_basis,
        prior_documentation_uri, new_documentation_uri,
        prior_notes, new_notes,
        prior_next_review_due_at, new_next_review_due_at,
        change_op, changed_by_user_id
      ) VALUES (
        NEW.id, NEW.organization_id, NEW.resident_id,
        OLD.capacity_status, NEW.capacity_status,
        OLD.representative_name, NEW.representative_name,
        OLD.representative_relationship, NEW.representative_relationship,
        OLD.authority_basis, NEW.authority_basis,
        OLD.documentation_uri, NEW.documentation_uri,
        OLD.notes, NEW.notes,
        OLD.next_review_due_at, NEW.next_review_due_at,
        'update', v_user
      );
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO resident_decisional_capacity_history (
      capacity_id, organization_id, resident_id,
      prior_capacity_status, new_capacity_status,
      prior_representative_name, new_representative_name,
      prior_representative_relationship, new_representative_relationship,
      prior_authority_basis, new_authority_basis,
      prior_documentation_uri, new_documentation_uri,
      prior_notes, new_notes,
      prior_next_review_due_at, new_next_review_due_at,
      change_op, changed_by_user_id
    ) VALUES (
      OLD.id, OLD.organization_id, OLD.resident_id,
      OLD.capacity_status, OLD.capacity_status,
      OLD.representative_name, OLD.representative_name,
      OLD.representative_relationship, OLD.representative_relationship,
      OLD.authority_basis, OLD.authority_basis,
      OLD.documentation_uri, OLD.documentation_uri,
      OLD.notes, OLD.notes,
      OLD.next_review_due_at, OLD.next_review_due_at,
      'delete', v_user
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_snapshot_capacity_history
  AFTER INSERT OR UPDATE OR DELETE ON resident_decisional_capacity
  FOR EACH ROW EXECUTE FUNCTION snapshot_capacity_history();
