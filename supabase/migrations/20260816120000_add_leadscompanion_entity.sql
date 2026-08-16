-- Bookkeeping module, Phase 0b: LeadsCompanion (East Meadow Consulting LLC)
-- as the first real manual-entry entity — see bookkeeping-module-spec.md
-- (workspace root) §14. This entity has no existing structured tracking
-- anywhere in the portal, so unlike Happy Cuts (Phase 0a, dual-write),
-- manual entry genuinely is its first system of record.
--
-- Same idempotent check-then-insert shape as 20260815120000's Happy Cuts
-- seed. No RLS/permission changes needed — can_view_bookkeeping already
-- covers every entity behind the bookkeeping edge function.

do $$
declare
  v_entity_id uuid;
begin
  select id into v_entity_id from public.bk_entities where name = 'East Meadow Consulting LLC';
  if v_entity_id is null then
    insert into public.bk_entities (name, entity_type)
      values ('East Meadow Consulting LLC', 'single_member')
      returning id into v_entity_id;

    -- Same numbering convention as Happy Cuts' Phase 0 COA (spec §3 — one
    -- master template, entity-specific leaves) for consolidated reporting
    -- later. No Accrued Payroll leaf yet — nothing here snapshots a payable
    -- the way Happy Cuts' crew payout does; add it if a real need shows up.
    insert into public.bk_accounts (entity_id, code, name, account_type) values
      (v_entity_id, '1000', 'Cash',                     'asset'),
      (v_entity_id, '1100', 'Accounts Receivable',      'asset'),
      (v_entity_id, '3000', 'Owner''s Equity',          'equity'),
      (v_entity_id, '4000', 'Consulting Revenue',       'income'),
      (v_entity_id, '5000', 'Contractor / VA Expense',  'expense'),
      (v_entity_id, '5100', 'Software & Tools Expense', 'expense');
  end if;
end $$;
