-- Extend voice_sessions.call_type to support new call modes:
--   global_triage       — caregiver calls without a pre-selected resident;
--                         the AI asks "which patient is this for?"
--   resident_onboarding — AI-guided intake to create a new resident record
ALTER TABLE voice_sessions
  DROP CONSTRAINT IF EXISTS voice_sessions_call_type_check;

ALTER TABLE voice_sessions
  ADD CONSTRAINT voice_sessions_call_type_check
  CHECK (call_type IN (
    'caregiver_intake',
    'family_update',
    'global_triage',
    'resident_onboarding'
  ));
