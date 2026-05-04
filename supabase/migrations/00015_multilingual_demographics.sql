-- 00015: Multilingual demographics, regulatory region, and metric-trends feature flag.
-- Phase A of the Taiwan multilingual + metric-trends rollout.
--
-- All additions are backward compatible: existing US rows pick up sensible
-- defaults (regulatory_region='hipaa_us', default_output_language='en',
-- feature_metric_trends_enabled=false) and unset language fields remain null
-- until populated by the admin UI in Phase B. No behavior changes ship in
-- this migration alone — Phase B prompts and Phase C summaries pick the new
-- fields up.
--
-- Naming note: residents.years_in_country (not years_in_taiwan) is region-
-- agnostic by design. Architectural decision #1 in the plan: avoid country
-- forks; new countries should be marginal cost.

-- ============================================
-- Organizations: regulatory + locale defaults + feature flags
-- ============================================
ALTER TABLE organizations
  ADD COLUMN country TEXT,                                  -- ISO 3166-1 alpha-2
  ADD COLUMN regulatory_region TEXT NOT NULL DEFAULT 'hipaa_us'
    CHECK (regulatory_region IN ('hipaa_us', 'pdpa_tw', 'gdpr_eu')),
  ADD COLUMN default_output_language TEXT NOT NULL DEFAULT 'en',  -- BCP-47
  ADD COLUMN default_clinical_language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN feature_metric_trends_enabled BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- Users: language preferences (caregivers + admins)
-- ============================================
ALTER TABLE users
  ADD COLUMN preferred_language TEXT,                       -- BCP-47, null = use org default
  ADD COLUMN secondary_languages TEXT[] NOT NULL DEFAULT '{}';

-- ============================================
-- Residents: language, cultural, religious, dietary, naming
-- ============================================
-- family_name + given_name are net-new and live alongside the existing
-- first_name/last_name for full backward compatibility. Apps rendering
-- multilingual names should prefer family_name/given_name when populated;
-- US deployments continue to use first_name/last_name unchanged.
ALTER TABLE residents
  ADD COLUMN preferred_language TEXT,
  ADD COLUMN secondary_languages TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN country_of_origin TEXT,                        -- ISO 3166-1 alpha-2
  ADD COLUMN years_in_country INTEGER,
  ADD COLUMN religion TEXT,
  ADD COLUMN dietary_restrictions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN family_name TEXT,
  ADD COLUMN given_name TEXT,
  ADD COLUMN name_pronunciation TEXT,
  ADD COLUMN honorific_preference TEXT,
  ADD COLUMN lunar_calendar_dob DATE,
  ADD COLUMN cultural_taboos TEXT[] NOT NULL DEFAULT '{}';

-- ============================================
-- Family Contacts: communication language + residence country
-- ============================================
ALTER TABLE family_contacts
  ADD COLUMN preferred_communication_language TEXT,         -- BCP-47
  ADD COLUMN country_of_residence TEXT;                     -- ISO 3166-1 alpha-2

-- ============================================
-- Clinicians: clinical-language preference
-- ============================================
ALTER TABLE clinicians
  ADD COLUMN clinical_language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN secondary_clinical_language TEXT;
