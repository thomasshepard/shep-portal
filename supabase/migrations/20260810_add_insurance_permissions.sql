-- Insurance and Taxes module access.
--
-- can_view_insurance      — reach the module at all (property + business policies,
--                           property tax bills)
-- can_view_health_policies — additionally see rows marked Visibility = "Restricted"
--                           in Airtable, which is where the family health plan lives.
--                           Deliberately separate so a bookkeeper or VA can be given
--                           the property side without the health policy coming along.
--
-- Admins get both implicitly in useAuth.jsx; these flags are for non-admin roles.

alter table public.profiles add column if not exists can_view_insurance boolean not null default false;
alter table public.profiles add column if not exists can_view_health_policies boolean not null default false;
