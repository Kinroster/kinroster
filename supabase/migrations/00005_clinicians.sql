-- Phase 1: Clinician directory, per-resident assignment, and secure clinician sharing.
-- Adds four tables:
--   clinicians              - org-level directory of treating physicians/providers
--   resident_clinicians     - many-to-many assignment of clinicians to residents
--   clinician_share_links   - signed magic-link tokens granting read-only portal access
--   disclosure_events       - append-only audit of every outbound PHI disclosure
-- RLS mirrors existing admin-write / org-scoped-read patterns from 00001.

-- ============================================
-- Clinicians (org-level directory)
-- ============================================
CREATE TABLE clinicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  specialty TEXT,
  npi TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clinicians ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_clinicians_org ON clinicians (organization_id);
CREATE INDEX idx_clinicians_org_active ON clinicians (organization_id, is_active);

-- ============================================
-- Resident-Clinician assignments
-- ============================================
CREATE TABLE resident_clinicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  clinician_id UUID NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'primary_care'
    CHECK (relationship IN ('primary_care', 'specialist', 'hospice', 'psychiatric', 'other')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resident_id, clinician_id)
);

ALTER TABLE resident_clinicians ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_resident_clinicians_resident ON resident_clinicians (resident_id);
CREATE INDEX idx_resident_clinicians_clinician ON resident_clinicians (clinician_id);

-- ============================================
-- Clinician share links (magic-link tokens)
-- ============================================
-- The unsigned token value is never stored; only a SHA-256 hash. The rendered
-- summary is stored on the row at share creation time so the content is a
-- stable snapshot (no re-generation drift if notes change later).
CREATE TABLE clinician_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  clinician_id UUID NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  share_scope JSONB NOT NULL DEFAULT '{}',
  rendered_summary JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  open_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clinician_share_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_share_links_token_hash ON clinician_share_links (token_hash);
CREATE INDEX idx_share_links_org_created ON clinician_share_links (organization_id, created_at DESC);
CREATE INDEX idx_share_links_resident ON clinician_share_links (resident_id, created_at DESC);
CREATE INDEX idx_share_links_active ON clinician_share_links (organization_id, expires_at)
  WHERE revoked_at IS NULL;

-- ============================================
-- Disclosure events (append-only audit log)
-- ============================================
CREATE TABLE disclosure_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id),
  recipient_type TEXT NOT NULL
    CHECK (recipient_type IN ('clinician', 'family_contact', 'agency_internal', 'legal_rep')),
  recipient_id UUID,
  legal_basis TEXT NOT NULL
    CHECK (legal_basis IN ('treatment', 'operations', 'patient_authorization',
                           'patient_agreement', 'professional_judgment',
                           'personal_representative')),
  categories_shared TEXT[] NOT NULL DEFAULT '{}',
  source_note_ids UUID[] NOT NULL DEFAULT '{}',
  delivery_method TEXT NOT NULL
    CHECK (delivery_method IN ('magic_link_portal', 'email', 'pdf_export', 'in_app')),
  share_link_id UUID REFERENCES clinician_share_links(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE disclosure_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_disclosure_events_org_created ON disclosure_events (organization_id, created_at DESC);
CREATE INDEX idx_disclosure_events_resident ON disclosure_events (resident_id, created_at DESC);
CREATE INDEX idx_disclosure_events_recipient ON disclosure_events (recipient_type, recipient_id);

-- ============================================
-- RLS Policies
-- ============================================

-- Clinicians: org-scoped read, admin-only write.
CREATE POLICY "Users can view org clinicians"
  ON clinicians FOR SELECT
  USING (organization_id = get_user_org_id());

CREATE POLICY "Admins can insert clinicians"
  ON clinicians FOR INSERT
  WITH CHECK (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins can update clinicians"
  ON clinicians FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins can delete clinicians"
  ON clinicians FOR DELETE
  USING (organization_id = get_user_org_id() AND is_admin());

-- Resident-Clinician assignments: access via resident's org (mirror family_contacts).
CREATE POLICY "Users can view org resident clinicians"
  ON resident_clinicians FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM residents
      WHERE residents.id = resident_clinicians.resident_id
      AND residents.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Admins can insert resident clinicians"
  ON resident_clinicians FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM residents
      WHERE residents.id = resident_clinicians.resident_id
      AND residents.organization_id = get_user_org_id()
    )
    AND is_admin()
  );

CREATE POLICY "Admins can update resident clinicians"
  ON resident_clinicians FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM residents
      WHERE residents.id = resident_clinicians.resident_id
      AND residents.organization_id = get_user_org_id()
    )
    AND is_admin()
  );

CREATE POLICY "Admins can delete resident clinicians"
  ON resident_clinicians FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM residents
      WHERE residents.id = resident_clinicians.resident_id
      AND residents.organization_id = get_user_org_id()
    )
    AND is_admin()
  );

-- Clinician share links: admin-only. Portal lookups bypass RLS via service-role.
CREATE POLICY "Admins can view share links"
  ON clinician_share_links FOR SELECT
  USING (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins can insert share links"
  ON clinician_share_links FOR INSERT
  WITH CHECK (
    organization_id = get_user_org_id()
    AND is_admin()
    AND created_by = auth.uid()
  );

CREATE POLICY "Admins can update share links"
  ON clinician_share_links FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_admin());

-- Disclosure events: admin SELECT only. INSERT from authenticated admin.
-- No UPDATE/DELETE policies → effectively append-only (RLS blocks by default).
CREATE POLICY "Admins can view disclosure events"
  ON disclosure_events FOR SELECT
  USING (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins can insert disclosure events"
  ON disclosure_events FOR INSERT
  WITH CHECK (
    organization_id = get_user_org_id()
    AND is_admin()
    AND actor_user_id = auth.uid()
  );

-- ============================================
-- Triggers
-- ============================================
CREATE TRIGGER set_updated_at BEFORE UPDATE ON clinicians
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
