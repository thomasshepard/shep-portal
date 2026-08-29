-- Personal, Shepard Holdings LLC, and Virginia Holdings LLC each only had a
-- single '3000 Owner's Equity' account -- no way to categorize a real owner
-- draw separately from a contribution, unlike Happy Cuts LLC (which already
-- has both 3000 Owner's Equity and 3100 Owner's Draws). Real gap: a
-- withdrawal for personal use had nowhere proper to be filed.

do $$
declare
  v_entity_id uuid;
  v_name text;
begin
  foreach v_name in array array['Personal', 'Shepard Holdings LLC', 'Virginia Holdings LLC']
  loop
    select id into v_entity_id from bk_entities where name = v_name;
    insert into bk_accounts (entity_id, code, name, account_type)
    values (v_entity_id, '3100', 'Owner''s Draws', 'equity')
    on conflict do nothing;
  end loop;
end $$;
