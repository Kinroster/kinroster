-- Allow voice_sessions rows without a resident (global_triage and
-- resident_onboarding calls start before a resident is identified).
ALTER TABLE voice_sessions
  ALTER COLUMN resident_id DROP NOT NULL;
