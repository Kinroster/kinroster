-- Voice Sessions: live Vapi-powered voice calls used to capture caregiver
-- observations (and, later, family updates). A completed session's transcript
-- feeds the existing note-structuring pipeline by creating a row in `notes`
-- with raw_input = assembled transcript, then linking back via note_id.

-- ============================================
-- Voice Sessions (one row per Vapi call)
-- ============================================
CREATE TABLE voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  caregiver_id UUID NOT NULL REFERENCES users(id),
  note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
  vapi_call_id TEXT UNIQUE,
  call_type TEXT NOT NULL DEFAULT 'caregiver_intake'
    CHECK (call_type IN ('caregiver_intake', 'family_update')),
  status TEXT NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated', 'in_progress', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  full_transcript TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_voice_sessions_org_created ON voice_sessions (organization_id, created_at DESC);
CREATE INDEX idx_voice_sessions_resident ON voice_sessions (resident_id, created_at DESC);
CREATE INDEX idx_voice_sessions_caregiver ON voice_sessions (caregiver_id, created_at DESC);
CREATE INDEX idx_voice_sessions_vapi_call ON voice_sessions (vapi_call_id);
CREATE INDEX idx_voice_sessions_active ON voice_sessions (organization_id, status)
  WHERE status IN ('initiated', 'in_progress');

-- ============================================
-- Voice Transcripts (per-turn messages inside a session)
-- ============================================
CREATE TABLE voice_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('assistant', 'user', 'system')),
  text TEXT NOT NULL,
  offset_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE voice_transcripts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_voice_transcripts_session ON voice_transcripts (session_id, created_at);

-- ============================================
-- RLS Policies
-- ============================================

-- Voice Sessions: org-scoped read, caregiver-owned write.
-- Webhook updates (transcript assembly, status transitions) run through the
-- service-role client, which bypasses RLS — no webhook-specific policy needed.
CREATE POLICY "Users can view org voice sessions"
  ON voice_sessions FOR SELECT
  USING (organization_id = get_user_org_id());

CREATE POLICY "Caregivers can insert own voice sessions"
  ON voice_sessions FOR INSERT
  WITH CHECK (
    organization_id = get_user_org_id()
    AND caregiver_id = auth.uid()
  );

CREATE POLICY "Caregivers can update own active sessions"
  ON voice_sessions FOR UPDATE
  USING (
    caregiver_id = auth.uid()
    AND status IN ('initiated', 'in_progress')
  );

CREATE POLICY "Admins can update any session in org"
  ON voice_sessions FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_admin());

-- Voice Transcripts: inherit org access via the parent session.
CREATE POLICY "Users can view org voice transcripts"
  ON voice_transcripts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM voice_sessions
      WHERE voice_sessions.id = voice_transcripts.session_id
      AND voice_sessions.organization_id = get_user_org_id()
    )
  );

-- ============================================
-- Triggers
-- ============================================
CREATE TRIGGER set_updated_at BEFORE UPDATE ON voice_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
