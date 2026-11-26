-- Bookkeeping: Maple Hill Coffee is a sole proprietorship owned by Thomas
-- personally, reported on his Schedule C, no separate tax ID.
--
-- Widens bk_entities.entity_type to allow 'sole_proprietorship', then marks
-- Maple Hill Coffee with it. Runs after 20261125120000_add_maple_hill_coffee_entity.sql.
--
-- Idempotent: every check constraint on bk_entities that mentions entity_type
-- is dropped (the inline constraint from 20260815120000 is auto-named
-- bk_entities_entity_type_check, but this does not rely on that name), then
-- the named constraint is re-added with the full value list. Safe to run twice.
-- The update is a no-op if the entity row does not exist yet.

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.bk_entities'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%entity_type%'
  loop
    execute format('alter table public.bk_entities drop constraint %I', r.conname);
  end loop;

  alter table public.bk_entities
    add constraint bk_entities_entity_type_check
    check (entity_type in ('partnership', 'single_member', 'personal', 'sole_proprietorship'));
end $$;

update public.bk_entities
  set entity_type = 'sole_proprietorship'
  where name = 'Maple Hill Coffee';
