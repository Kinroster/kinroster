-- Phase 11 follow-up: thread regulatory_region from signup metadata into the
-- new organization row.
--
-- The Taiwan Vercel deployment sets NEXT_PUBLIC_REGULATORY_REGION='pdpa_tw';
-- the existing US deployment leaves it unset (defaults to 'hipaa_us'). The
-- signup page passes the value via Supabase Auth `options.data`, which lands
-- in auth.users.raw_user_meta_data. This trigger picks it up alongside the
-- existing facility_name / facility_type / timezone fields, with a fallback
-- to 'hipaa_us' so existing US signups behave identically.
--
-- The CHECK on organizations.regulatory_region (added in 00015) restricts to
-- ('hipaa_us', 'pdpa_tw', 'gdpr_eu'); a malformed metadata value would be
-- rejected by the constraint, which is the desired behavior — better to fail
-- the signup than silently assign the wrong region.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
BEGIN
  INSERT INTO public.organizations (
    name,
    type,
    timezone,
    regulatory_region,
    trial_ends_at
  )
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'facility_name', 'My Facility'),
    COALESCE(NEW.raw_user_meta_data->>'facility_type', 'rcfe'),
    COALESCE(NEW.raw_user_meta_data->>'timezone', 'America/Los_Angeles'),
    COALESCE(NEW.raw_user_meta_data->>'regulatory_region', 'hipaa_us'),
    NOW() + INTERVAL '3 days'
  )
  RETURNING id INTO new_org_id;

  INSERT INTO public.users (id, organization_id, email, full_name, role, marketing_opt_in)
  VALUES (
    NEW.id,
    new_org_id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'admin',
    COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, false)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
