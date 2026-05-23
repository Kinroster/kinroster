-- Phase 0b: per-resident voice recording consent.
--
-- Distinct from PDPA consent (00021): PDPA covers all PHI processing;
-- THIS covers the specific act of recording someone's voice and
-- transcribing it. CIPA (California Invasion of Privacy Act) and
-- analogous state laws (IL BIPA, WA, FL, MA, MT, NH, PA, MD) require
-- specific consent before recording, separate from any data-processing
-- consent. GDPR Art. 6(1)(a) + Recital 32 require an unambiguous,
-- specific-purpose consent for voice biometrics; Taiwan PDPA Art. 7
-- requires written consent for sensitive categories.
--
-- Three consent_class values give us the CIPA granularity the plan
-- calls for:
--   - staff_dictation       (caregiver / admin / clinician records OBS)
--   - resident_speaking     (the RESIDENT's voice is captured)
--   - family_about_resident (family records observations on behalf of)
--
-- Append-only: a withdrawal stamps withdrawn_at on the existing row,
-- never deletes. New consent under a newer text version creates a new
-- row. The active consent for a (resident, class) tuple is the most
-- recent row with withdrawn_at IS NULL.
--
-- jurisdiction is the recording-law jurisdiction (NOT the data-protection
-- regime). HIPAA-US orgs in two-party-consent states (CA / IL / WA / FL /
-- MA / MT / NH / PA / MD) capture state-specific consents; everywhere
-- else uses 'default' (one-party-consent baseline). Taiwan and the EU
-- have their own values that align 1:1 with organizations.regulatory_region.
--
-- The voice/start gate compares the active consent's jurisdiction to
-- the org's expected jurisdiction (regulatory_region + a per-org
-- voice_recording_jurisdiction setting for sub-national US state
-- overrides) and BLOCKS on mismatch. Restrictive by design — a resident
-- moving across state lines forces re-capture.

CREATE TABLE resident_recording_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,

  consent_class TEXT NOT NULL
    CHECK (consent_class IN (
      'staff_dictation',
      'resident_speaking',
      'family_about_resident'
    )),

  jurisdiction TEXT NOT NULL
    CHECK (jurisdiction IN (
      'us_ca', 'us_il', 'us_wa', 'us_fl', 'us_tx',
      'us_ma', 'us_mt', 'us_nh', 'us_pa', 'us_md',
      'default',
      'pdpa_tw',
      'gdpr_eu'
    )),

  consenting_party_type TEXT NOT NULL
    CHECK (consenting_party_type IN ('resident', 'personal_representative')),
  consenting_party_name TEXT NOT NULL,
  consenting_party_relationship TEXT,

  consent_text_version TEXT NOT NULL,
  consent_text_locale TEXT NOT NULL,
  consent_text_snapshot TEXT NOT NULL,
  attorney_reviewed BOOLEAN NOT NULL DEFAULT FALSE,

  signed_typed_name TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_by_user_id UUID NOT NULL REFERENCES users(id),
  ip_address INET,
  user_agent TEXT,

  withdrawn_at TIMESTAMPTZ,
  withdrawn_by_user_id UUID REFERENCES users(id),
  withdrawal_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot-path lookup: active consent for a resident in a given class.
CREATE INDEX idx_recording_consent_resident_class_active
  ON resident_recording_consents (resident_id, consent_class, consented_at DESC)
  WHERE withdrawn_at IS NULL;

-- Cross-resident scans (e.g., admin dashboard "consents expiring soon").
CREATE INDEX idx_recording_consent_org_active
  ON resident_recording_consents (organization_id)
  WHERE withdrawn_at IS NULL;

-- Full history scan for a resident (audit).
CREATE INDEX idx_recording_consent_resident_history
  ON resident_recording_consents (resident_id, consented_at DESC);

ALTER TABLE resident_recording_consents ENABLE ROW LEVEL SECURITY;

-- All staff in the org can READ — caregivers need to know whether a
-- voice call against this resident is allowed before initiating one.
CREATE POLICY "Org users read recording consents"
  ON resident_recording_consents FOR SELECT
  USING (organization_id = get_user_org_id());

-- Only admins manage capture and withdrawal. Recording consent is a
-- regulatory determination and must be attributable to a named
-- accountable user via captured_by_user_id / withdrawn_by_user_id.
CREATE POLICY "Admins insert recording consents"
  ON resident_recording_consents FOR INSERT
  WITH CHECK (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins update recording consents"
  ON resident_recording_consents FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_admin())
  WITH CHECK (organization_id = get_user_org_id() AND is_admin());

-- No DELETE policy — append-only ledger; withdraw rather than delete.
