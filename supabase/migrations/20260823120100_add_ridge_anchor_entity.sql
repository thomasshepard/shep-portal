-- Bookkeeping, Phase 3: Ridge & Anchor LLC (Thomas / Anthony, 50/50
-- partnership) — see bookkeeping-module-spec.md §3, §14. UCHB intentionally
-- skipped per Thomas's call this session.
--
-- Same idempotent check-then-insert shape as the Happy Cuts (20260815120000)
-- and LeadsCompanion (20260816120000) entity seeds.
--
-- Equity design: 3 SHARED accounts (Partner Capital / Partner Draws /
-- Partner Contributions), not one set per partner — every line into them is
-- tagged with bk_journal_lines.partner_id instead. Adding a third partner
-- later costs zero new accounts, and it's what makes a per-partner capital
-- statement report a plain group-by-partner_id query.
--
-- Expense leaves 5010-5080 map 1:1 onto Bills Payment's existing Category
-- field values (Insurance/Utilities/Maintenance/Internet/Mortgage/
-- Cleaning/Handyman/Others) — spec §3's "seed from the vocabulary already
-- in production use" instruction, no new taxonomy invented. 5000 Property
-- Tax Expense is fed only by Obligation Payments (Kind = 'Property Tax'),
-- which has no Bills Payment equivalent category.

do $$
declare
  v_entity_id uuid;
begin
  select id into v_entity_id from public.bk_entities where name = 'Ridge & Anchor LLC';
  if v_entity_id is null then
    insert into public.bk_entities (name, entity_type)
      values ('Ridge & Anchor LLC', 'partnership')
      returning id into v_entity_id;

    insert into public.bk_accounts (entity_id, code, name, account_type) values
      (v_entity_id, '1000', 'Cash',                     'asset'),
      (v_entity_id, '1100', 'Accounts Receivable',      'asset'),
      (v_entity_id, '3000', 'Partner Capital',           'equity'),
      (v_entity_id, '3010', 'Partner Draws',             'equity'),
      (v_entity_id, '3020', 'Partner Contributions',     'equity'),
      (v_entity_id, '4000', 'Rental Income',             'income'),
      (v_entity_id, '5000', 'Property Tax Expense',      'expense'),
      (v_entity_id, '5010', 'Insurance Expense',         'expense'),
      (v_entity_id, '5020', 'Utilities Expense',         'expense'),
      (v_entity_id, '5030', 'Maintenance Expense',       'expense'),
      (v_entity_id, '5040', 'Internet Expense',          'expense'),
      (v_entity_id, '5050', 'Mortgage Expense',          'expense'),
      (v_entity_id, '5060', 'Cleaning Expense',          'expense'),
      (v_entity_id, '5070', 'Handyman Expense',          'expense'),
      (v_entity_id, '5080', 'Other Expense',             'expense');

    insert into public.bk_partners (entity_id, name, ownership_pct) values
      (v_entity_id, 'Thomas', 50.00),
      (v_entity_id, 'Anthony', 50.00);
  end if;
end $$;
