-- Phase 4 follow-up: email magic-link family invites.
--
-- Replaces the SMS-OTP invite path (which required a paid Twilio account
-- + HIPAA BAA) with an email magic-link flow that costs $0 marginal —
-- delivery rides the already-integrated, BAA-eligible Resend pipeline.
--
-- This mirrors the family_contact_confirmation_tokens pattern from 00025
-- (SHA-256 hash of a 256-bit token, expiry, single-use consumption),
-- but the token here grants a LOGIN session rather than just confirming
-- an email address. The unsigned token is emailed in a click link; only
-- the hash is persisted. On click, a landing page POSTs the token to
-- /api/family/accept-invite, which mints a Supabase session and flips
-- the family_user_links row to active.
--
-- The SMS path (src/lib/external/sms-otp.ts) is left dormant for any org
-- that later opts into Twilio. verification_method gains an 'email_link'
-- value to record which channel a given link was verified through.

-- ============================================
-- Extend family_user_links.verification_method
-- ============================================
ALTER TABLE family_user_links
  DROP CONSTRAINT IF EXISTS family_user_links_verification_method_check;
ALTER TABLE family_user_links
  ADD CONSTRAINT family_user_links_verification_method_check
  CHECK (verification_method IN ('sms_otp', 'admin_manual', 'email_link'));

-- phone_at_verification was NOT NULL under the SMS flow. Email invites
-- have no phone, so relax it — the column stays for SMS-flow rows.
ALTER TABLE family_user_links
  ALTER COLUMN phone_at_verification DROP NOT NULL;

-- ============================================
-- family_invite_tokens
-- ============================================
CREATE TABLE family_invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  family_user_link_id UUID NOT NULL REFERENCES family_user_links(id) ON DELETE CASCADE,

  token_hash TEXT NOT NULL UNIQUE,
  -- Snapshot of the email the link was sent to, in case
  -- family_contacts.email changes before the link is used.
  email_at_send TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  -- The auth.users id that redeemed the token. Redundant with the link's
  -- user_id on the happy path; captured here for the audit trail.
  consumed_by_user_id UUID,
  revoked_at TIMESTAMPTZ,

  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_family_invite_tokens_hash
  ON family_invite_tokens (token_hash);
CREATE INDEX idx_family_invite_tokens_link
  ON family_invite_tokens (family_user_link_id, created_at DESC);
CREATE INDEX idx_family_invite_tokens_active
  ON family_invite_tokens (organization_id, expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE family_invite_tokens ENABLE ROW LEVEL SECURITY;

-- The public accept-invite route uses createAdminClient() (service-role)
-- to look up + consume tokens, bypassing RLS — same model as the
-- clinician portal + family-contact confirmation. RLS here only governs
-- admin visibility inside the app.
CREATE POLICY "Admins view family invite tokens"
  ON family_invite_tokens FOR SELECT
  USING (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins insert family invite tokens"
  ON family_invite_tokens FOR INSERT
  WITH CHECK (
    organization_id = get_user_org_id()
    AND is_admin()
    AND created_by = auth.uid()
  );

CREATE POLICY "Admins update family invite tokens"
  ON family_invite_tokens FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_admin());
