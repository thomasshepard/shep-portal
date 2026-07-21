-- Creates a real Supabase identity for the Hermes agent so it can be:
--   1. assigned tasks through the existing Tasks UI (assignee dropdown reads
--      `profiles` where can_view_tasks = true, matching by full_name),
--   2. attributed correctly in access_logs (user_id FK instead of a fake string),
--   3. subject to the same RLS/audit conventions as any human user.
--
-- Hermes never logs into the frontend with this account — the password is
-- random and discarded. All Hermes traffic goes through the hermes-gateway
-- edge function using the service-role key + a separate shared-secret header
-- (HERMES_API_KEY), not this user's Supabase session.
--
-- Run once in the Supabase SQL editor.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'hermes-agent@shep-portal.internal',
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Hermes Agent"}',
  false
where not exists (
  select 1 from auth.users where email = 'hermes-agent@shep-portal.internal'
);

-- The on_auth_user_created trigger (see supabase-setup.sql) auto-creates the
-- matching public.profiles row with role='member' and every can_view_* flag
-- false. Grant only what's needed for it to show up as an assignable user in
-- Tasks — nothing else. Do NOT grant can_view_properties/llcs/chickens/etc:
-- this account should never be able to see anything through the frontend UI
-- even if its credentials somehow leaked.
update public.profiles
set can_view_tasks = true
where email = 'hermes-agent@shep-portal.internal';
