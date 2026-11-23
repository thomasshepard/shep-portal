-- YouTube pipeline page (/youtube) access.
--
-- can_view_youtube: reach /youtube and read/write the YouTube Pipeline
-- Airtable base (appFuesAtBoOkMMB1) through airtable-proxy. Admins get it
-- implicitly in useAuth.jsx; this flag is for a non-admin helper (a member
-- account, not the va role, which would also see tenant data).
--
-- Run once in the Supabase SQL editor (supabase db push is not used here).

alter table public.profiles add column if not exists can_view_youtube boolean not null default false;
