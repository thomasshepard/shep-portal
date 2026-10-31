-- Workstreams page (/workstreams) access.
--
-- can_view_workstreams — reach the Workstreams board. Admins get this
-- implicitly in useAuth.jsx; this flag is for non-admin roles. Until this
-- column exists the flag simply reads as false for non-admins (admins are
-- unaffected), so the page can ship before the migration is run.

alter table public.profiles add column if not exists can_view_workstreams boolean not null default false;
