-- Bookkeeping access control fix. Two gaps found by direct audit against
-- live profiles:
--
-- 1. can_view_bookkeeping has never had an Admin > Users UI toggle — the
--    only way it's ever been set is by hand in SQL, which is why the VA
--    review queue built in Phase 2 (Triage rules bookkeeping-needs-reauth /
--    bookkeeping-unreviewed-backlog) is currently unreachable by the one
--    person (Janine, can_view_triage=true) it was built for.
-- 2. Bookkeeping has zero entity-level scoping — can_view_bookkeeping is
--    all-or-nothing across every entity. With a real partnership entity
--    (Ridge & Anchor LLC) now live, and a real not-yet-configured account
--    (ridgeanchorllc@gmail.com) that almost certainly needs Ridge & Anchor
--    -only access, this needs the same treatment Properties already has via
--    profiles.property_owner_filter — except Bookkeeping can have more than
--    one accessible entity per user, so this mirrors profiles.allowed_tags
--    (Documents' tag-based visibility) instead: a plain text array,
--    intersection-checked, not a new join table.
--
-- Empty array = no entities (safest default) even if can_view_bookkeeping
-- is later toggled on — an admin must explicitly pick entities via the
-- "Edit Access Settings" modal for a scoped user to see anything.

alter table public.profiles
  add column if not exists bookkeeping_entities text[] not null default '{}';
