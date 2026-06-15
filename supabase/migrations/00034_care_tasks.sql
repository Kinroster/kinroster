-- Care tasks: manually created or flagged from voice calls.
-- source = 'voice_call' + source_voice_session_id links back to the call
-- that triggered the action item.

CREATE TABLE care_tasks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resident_id             UUID REFERENCES residents(id) ON DELETE CASCADE,
  assigned_to             UUID REFERENCES users(id),
  created_by              UUID NOT NULL REFERENCES users(id),
  title                   TEXT NOT NULL,
  description             TEXT,
  due_date                DATE,
  due_time                TIME,
  priority                TEXT NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  source                  TEXT NOT NULL DEFAULT 'manual'
                            CHECK (source IN ('manual', 'voice_call')),
  source_voice_session_id UUID REFERENCES voice_sessions(id),
  completed_at            TIMESTAMPTZ,
  completed_by            UUID REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE care_tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_care_tasks_org_due      ON care_tasks (organization_id, due_date);
CREATE INDEX idx_care_tasks_assigned     ON care_tasks (assigned_to, due_date);
CREATE INDEX idx_care_tasks_resident     ON care_tasks (resident_id, due_date);
CREATE INDEX idx_care_tasks_status       ON care_tasks (organization_id, status);
CREATE INDEX idx_care_tasks_voice_source ON care_tasks (source_voice_session_id)
  WHERE source_voice_session_id IS NOT NULL;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON care_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- All org staff can read tasks
CREATE POLICY "Org staff read care tasks"
  ON care_tasks FOR SELECT
  USING (organization_id = get_user_org_id() AND is_staff());

-- Staff can create tasks (must own created_by)
CREATE POLICY "Org staff insert care tasks"
  ON care_tasks FOR INSERT
  WITH CHECK (
    organization_id = get_user_org_id()
    AND is_staff()
    AND created_by = auth.uid()
  );

-- Creator, assignee, or admin can update
CREATE POLICY "Task owner or admin update care tasks"
  ON care_tasks FOR UPDATE
  USING (
    organization_id = get_user_org_id()
    AND (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR is_admin()
    )
  );

-- Only admin can delete
CREATE POLICY "Admin delete care tasks"
  ON care_tasks FOR DELETE
  USING (organization_id = get_user_org_id() AND is_admin());
