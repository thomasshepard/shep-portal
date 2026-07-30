-- Per-user property-visibility restriction. When set on a non-admin profile,
-- the frontend limits the Properties/Maintenance/Projects views to only
-- properties whose Airtable "Owner" field matches this string exactly.
-- NULL/blank means no restriction (sees everything their role/flags allow).
--
-- This is a client-side filter, not a hard security boundary — Shep Portal's
-- Airtable access already goes through one shared PAT regardless of which
-- portal user is logged in (same as every other can_view_* flag in this
-- table). It's meant to keep a partner's view scoped to their own deal,
-- not to withstand a technical user inspecting network requests.
alter table public.profiles
  add column if not exists property_owner_filter text;
