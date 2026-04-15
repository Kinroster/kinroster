-- Local dev seed. Creates one admin user + sample residents.
-- Login: admin@local.dev / password123

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'admin@local.dev',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"facility_name":"Sunset Manor","facility_type":"rcfe","full_name":"Test Admin"}',
  now(),
  now(),
  '', '', '', ''
);

-- The handle_new_user trigger created the organizations row and public.users row.
-- Grab the org id to attach residents to.
INSERT INTO residents (organization_id, first_name, last_name, date_of_birth, room_number, conditions, preferences)
SELECT
  organization_id,
  first_name,
  last_name,
  dob,
  room,
  conditions,
  prefs
FROM public.users u
CROSS JOIN (VALUES
  ('Eleanor', 'Hughes', DATE '1938-05-12', '101', 'Mild dementia, hypertension', 'Morning walks, black tea'),
  ('Walter',  'Chen',   DATE '1942-11-03', '102', 'Type 2 diabetes',            'Reads newspaper after breakfast'),
  ('Marjorie','Okonkwo', DATE '1945-02-27', '103', 'Arthritis',                  'Prefers warm blanket at night')
) AS r(first_name, last_name, dob, room, conditions, prefs)
WHERE u.id = '11111111-1111-1111-1111-111111111111';
