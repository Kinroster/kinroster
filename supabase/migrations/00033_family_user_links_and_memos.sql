-- Phase 4: family accounts + async voice memos.
--
-- Two new things:
--   1. family_user_links — many-to-many link between auth.users (a real
--      Supabase Auth account a family member uses to log in) and
--      family_contacts (the existing per-resident contact record). One
--      family member often relates to multiple residents (parents in
--      adjacent rooms; siblings); a single family_contacts row only
--      represents the (contact ↔ resident) relationship, so this link
--      table lets one logged-in user reach all their associated
--      residents through the portal.
--   2. family_voice_memos — async voice memo pipeline. Recording is
--      stored in a private bucket; transcription is GATED on admin
--      moderation so Whisper minutes aren't burnt on rejected content,
--      and the admin can keep family-authored content out of the
--      conversation thread when it's not appropriate.
--
-- The 'family' role is added to users_role_check; staff-only RLS
-- surfaces are already locked down via the is_staff() helper from
-- 00031a (which excludes 'family' by design).
--
-- See docs/engineering/resident-conversation-thread-plan.md §Phase 4.

-- ============================================
-- Extend users.role for 'family'
-- ============================================
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'admin',
    'caregiver',
    'nurse_reviewer',
    'ops_staff',
    'billing_staff',
    'compliance_admin',
    'family'
  ));

-- ============================================
-- family_user_links
-- ============================================
CREATE TABLE family_user_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_contact_id UUID NOT NULL REFERENCES family_contacts(id) ON DELETE CASCADE,

  -- Verification of phone ownership at the time of linking. We snapshot
  -- the phone (vs. just FK-ing to family_contacts.phone) because a
  -- family member's phone may change later — the link still represents
  -- "this user was the one who verified that number on this date."
  phone_at_verification TEXT NOT NULL,
  phone_verified_at TIMESTAMPTZ,
  verification_method TEXT NOT NULL
    CHECK (verification_method IN ('sms_otp', 'admin_manual')),

  link_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (link_status IN ('pending', 'active', 'revoked')),

  invited_by_user_id UUID NOT NULL REFERENCES users(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES users(id),
  revocation_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, family_contact_id)
);

CREATE INDEX idx_family_user_links_user
  ON family_user_links (user_id, link_status);
CREATE INDEX idx_family_user_links_contact
  ON family_user_links (family_contact_id);
CREATE INDEX idx_family_user_links_org_active
  ON family_user_links (organization_id)
  WHERE link_status = 'active';

ALTER TABLE family_user_links ENABLE ROW LEVEL SECURITY;

-- A family user can see their OWN links. Org admins manage everything.
-- Staff in the org can see all links (e.g., to validate "is this caller
-- linked to this resident?").
CREATE POLICY "Family user reads own links"
  ON family_user_links FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Org staff read family links"
  ON family_user_links FOR SELECT
  USING (organization_id = get_user_org_id() AND is_staff());

CREATE POLICY "Admins insert family links"
  ON family_user_links FOR INSERT
  WITH CHECK (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins update family links"
  ON family_user_links FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_admin())
  WITH CHECK (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins delete family links"
  ON family_user_links FOR DELETE
  USING (organization_id = get_user_org_id() AND is_admin());

CREATE TRIGGER set_updated_at_family_user_links
  BEFORE UPDATE ON family_user_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- family_voice_memos
-- ============================================
CREATE TABLE family_voice_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  family_user_link_id UUID NOT NULL REFERENCES family_user_links(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Path in the private 'family-memos' storage bucket. NULL after
  -- audio_deleted_at — the transcript becomes the system of record.
  storage_path TEXT,
  audio_deleted_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- moderation_status drives the pipeline:
  --   'pending'  → admin needs to review the (server-side previewable)
  --                memo metadata + optional listen before approving.
  --                Whisper is NOT called in this state — saves cost
  --                AND keeps unwanted family content out of the thread.
  --   'approved' → admin clicked approve. Background job transcribes,
  --                creates a notes row with author_type='family', emits
  --                the thread/note-structured event, then deletes the
  --                audio file.
  --   'rejected' → admin clicked reject. Audio is deleted; no transcript
  --                is ever produced; no note row is created.
  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  moderated_by_user_id UUID REFERENCES users(id),
  moderated_at TIMESTAMPTZ,
  moderation_reason TEXT,

  -- Transcription result. Populated on approve only.
  transcript TEXT,
  transcription_error TEXT,
  note_id UUID REFERENCES notes(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_family_voice_memos_resident
  ON family_voice_memos (resident_id, created_at DESC);
CREATE INDEX idx_family_voice_memos_org_pending
  ON family_voice_memos (organization_id, created_at DESC)
  WHERE moderation_status = 'pending';
CREATE INDEX idx_family_voice_memos_uploader
  ON family_voice_memos (uploaded_by_user_id, created_at DESC);

ALTER TABLE family_voice_memos ENABLE ROW LEVEL SECURITY;

-- Family member reads their own memos (so the portal can show
-- pending/approved/rejected status).
CREATE POLICY "Family user reads own memos"
  ON family_voice_memos FOR SELECT
  USING (uploaded_by_user_id = auth.uid());

-- Family member inserts their own memos. Gated by: (a) link exists +
-- active, (b) the link is for this resident, (c) recording consent
-- for class 'family_about_resident' is active for this resident.
CREATE POLICY "Family user inserts memos via active link"
  ON family_voice_memos FOR INSERT
  WITH CHECK (
    uploaded_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM family_user_links ful
      JOIN family_contacts fc ON fc.id = ful.family_contact_id
      WHERE ful.id = family_voice_memos.family_user_link_id
        AND ful.user_id = auth.uid()
        AND ful.link_status = 'active'
        AND fc.resident_id = family_voice_memos.resident_id
    )
    AND EXISTS (
      SELECT 1 FROM resident_recording_consents rrc
      WHERE rrc.resident_id = family_voice_memos.resident_id
        AND rrc.consent_class = 'family_about_resident'
        AND rrc.withdrawn_at IS NULL
    )
  );

-- Org staff (admins specifically use the moderation queue, but any
-- staff member can SEE the queue exists for situational awareness).
CREATE POLICY "Org staff read all family memos"
  ON family_voice_memos FOR SELECT
  USING (organization_id = get_user_org_id() AND is_staff());

-- Only admins moderate / delete.
CREATE POLICY "Admins update family memos"
  ON family_voice_memos FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_admin())
  WITH CHECK (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins delete family memos"
  ON family_voice_memos FOR DELETE
  USING (organization_id = get_user_org_id() AND is_admin());

CREATE TRIGGER set_updated_at_family_voice_memos
  BEFORE UPDATE ON family_voice_memos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Storage bucket: family-memos (private)
-- ============================================
-- Created here for completeness; the application uploads via a signed
-- URL minted server-side (see /api/family/memos), so only the
-- service-role can issue the URL. The bucket policy below blocks
-- direct anon access — only signed-URL operations succeed.
INSERT INTO storage.buckets (id, name, public)
VALUES ('family-memos', 'family-memos', false)
ON CONFLICT (id) DO NOTHING;

-- Service-role full access; everyone else gated by signed URLs.
CREATE POLICY "service_role full access on family-memos"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'family-memos')
  WITH CHECK (bucket_id = 'family-memos');
