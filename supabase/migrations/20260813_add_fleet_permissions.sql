-- Fleet & Equipment module access.
--
-- can_view_fleet — reach /fleet and /fleet/:id at all. A dedicated flag
-- rather than reusing can_view_happy_cuts: the module now covers personal
-- vehicles/equipment (Suburban, trailer, tractor) alongside Happy Cuts gear,
-- so it needs to be shareable independently of Happy Cuts schedule access.
--
-- Admins get this implicitly in useAuth.jsx; this flag is for non-admin roles.
-- Already applied directly (via a one-shot edge function, not the SQL editor)
-- on 2026-08-13 — this file exists for the repo's own record per the usual
-- migration convention.

alter table public.profiles add column if not exists can_view_fleet boolean not null default false;
