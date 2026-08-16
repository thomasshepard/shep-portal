-- Bookkeeping: Personal, Shepard Holdings LLC, Virginia Holdings LLC.
--
-- "East Meadow Properties" (the entity the build order called this phase)
-- turned out not to be a real title-holder anywhere — checked real Property
-- Owner values via the Airtable MCP before writing this migration, and the
-- actual set is Thomas Shepard / Thomas Shepard and Gabrielle Shepard /
-- Shepard Holdings LLC / Virginia Holdings LLC / Ridge & Anchor LLC (already
-- onboarded), independently corroborated by Insurance.jsx's own ENTITIES
-- constant (identical strings). Confirmed with Thomas: separate entity per
-- real title-holder, not one umbrella ledger — commingling LLC-held and
-- personally-held property would undercut the liability separation the
-- LLCs exist for.
--
-- Same idempotent shape as every prior entity seed (LeadsCompanion,
-- Ridge & Anchor). Same 9-leaf expense vocabulary as Ridge & Anchor's COA
-- (mirrors Bills Payment's existing Category field) plus Rental Income —
-- no partner equity needed, both LLCs are single-member and Personal isn't
-- a partnership at all.

do $$
declare
  v_entity_id uuid;
begin
  -- Personal — fed by properties titled to Thomas Shepard or Thomas
  -- Shepard and Gabrielle Shepard (both collapse to this one entity via
  -- the edge function's PROPERTY_OWNER_TO_BK_ENTITY alias map).
  select id into v_entity_id from public.bk_entities where name = 'Personal';
  if v_entity_id is null then
    insert into public.bk_entities (name, entity_type)
      values ('Personal', 'personal')
      returning id into v_entity_id;

    insert into public.bk_accounts (entity_id, code, name, account_type) values
      (v_entity_id, '1000', 'Cash',                'asset'),
      (v_entity_id, '3000', 'Owner''s Equity',      'equity'),
      (v_entity_id, '4000', 'Rental Income',        'income'),
      (v_entity_id, '5000', 'Property Tax Expense', 'expense'),
      (v_entity_id, '5010', 'Insurance Expense',    'expense'),
      (v_entity_id, '5020', 'Utilities Expense',    'expense'),
      (v_entity_id, '5030', 'Maintenance Expense',  'expense'),
      (v_entity_id, '5040', 'Internet Expense',     'expense'),
      (v_entity_id, '5050', 'Mortgage Expense',     'expense'),
      (v_entity_id, '5060', 'Cleaning Expense',     'expense'),
      (v_entity_id, '5070', 'Handyman Expense',     'expense'),
      (v_entity_id, '5080', 'Other Expense',        'expense');
  end if;

  select id into v_entity_id from public.bk_entities where name = 'Shepard Holdings LLC';
  if v_entity_id is null then
    insert into public.bk_entities (name, entity_type)
      values ('Shepard Holdings LLC', 'single_member')
      returning id into v_entity_id;

    insert into public.bk_accounts (entity_id, code, name, account_type) values
      (v_entity_id, '1000', 'Cash',                'asset'),
      (v_entity_id, '3000', 'Owner''s Equity',      'equity'),
      (v_entity_id, '4000', 'Rental Income',        'income'),
      (v_entity_id, '5000', 'Property Tax Expense', 'expense'),
      (v_entity_id, '5010', 'Insurance Expense',    'expense'),
      (v_entity_id, '5020', 'Utilities Expense',    'expense'),
      (v_entity_id, '5030', 'Maintenance Expense',  'expense'),
      (v_entity_id, '5040', 'Internet Expense',     'expense'),
      (v_entity_id, '5050', 'Mortgage Expense',     'expense'),
      (v_entity_id, '5060', 'Cleaning Expense',     'expense'),
      (v_entity_id, '5070', 'Handyman Expense',     'expense'),
      (v_entity_id, '5080', 'Other Expense',        'expense');
  end if;

  select id into v_entity_id from public.bk_entities where name = 'Virginia Holdings LLC';
  if v_entity_id is null then
    insert into public.bk_entities (name, entity_type)
      values ('Virginia Holdings LLC', 'single_member')
      returning id into v_entity_id;

    insert into public.bk_accounts (entity_id, code, name, account_type) values
      (v_entity_id, '1000', 'Cash',                'asset'),
      (v_entity_id, '3000', 'Owner''s Equity',      'equity'),
      (v_entity_id, '4000', 'Rental Income',        'income'),
      (v_entity_id, '5000', 'Property Tax Expense', 'expense'),
      (v_entity_id, '5010', 'Insurance Expense',    'expense'),
      (v_entity_id, '5020', 'Utilities Expense',    'expense'),
      (v_entity_id, '5030', 'Maintenance Expense',  'expense'),
      (v_entity_id, '5040', 'Internet Expense',     'expense'),
      (v_entity_id, '5050', 'Mortgage Expense',     'expense'),
      (v_entity_id, '5060', 'Cleaning Expense',     'expense'),
      (v_entity_id, '5070', 'Handyman Expense',     'expense'),
      (v_entity_id, '5080', 'Other Expense',        'expense');
  end if;
end $$;
