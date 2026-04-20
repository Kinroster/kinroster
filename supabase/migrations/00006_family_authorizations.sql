-- Phase 2: Family authorization & consent model.
-- Extends family_contacts with explicit legal-basis tracking, scope, and
-- expiration/revocation so family sharing can be gated deterministically.
-- Enforcement is gated per-org by settings.family_auth_required (JSONB
-- field on organizations, no column change needed). Legacy orgs continue
-- to work until they opt in.
--
-- Backfill policy: existing rows with receives_updates=true are marked
-- involved_in_care=true (permissive). When an org flips the feature flag,
-- these contacts still receive updates under the "patient_agreement"
-- legal basis until the admin reviews each one. authorization_on_file is
-- NOT set by backfill — it requires an explicit admin action tied to a
-- signed authorization document.

ALTER TABLE family_contacts
  ADD COLUMN involved_in_care BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN personal_representative BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN authorization_on_file BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN authorization_scope TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN communication_channels TEXT[] NOT NULL DEFAULT '{email}',
  ADD COLUMN authorization_start_date DATE,
  ADD COLUMN authorization_end_date DATE,
  ADD COLUMN revoked_at TIMESTAMPTZ,
  ADD COLUMN revocation_reason TEXT,
  ADD COLUMN confidential_communication_notes TEXT;

-- Permissive backfill: anyone already receiving updates is treated as
-- "involved in care" per HIPAA's patient-agreement basis. authorization_scope
-- stays empty until admin reviews; the /api/family/send endpoint allows
-- empty scope to mean "full content" during the legacy window, then Phase 3
-- will require non-empty scope once disclosure tags exist.
UPDATE family_contacts
SET involved_in_care = true
WHERE receives_updates = true;

CREATE INDEX idx_family_contacts_active_auth ON family_contacts (resident_id)
  WHERE revoked_at IS NULL;
