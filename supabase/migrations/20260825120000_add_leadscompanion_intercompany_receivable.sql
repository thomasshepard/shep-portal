-- East Meadow Consulting LLC's Relay checking account was used to send
-- three $500 payments to "Julie Jordan" referencing "73 Benwick" (Ridge &
-- Anchor LLC's fix-and-flip property) — confirmed with Thomas: these were
-- payments for Ridge & Anchor, just routed through this account since it
-- had better ACH features. Not a LeadsCompanion expense — Ridge & Anchor
-- owes this back. Standard treatment for a real inter-entity pass-through:
-- a receivable on the paying entity's books, Dr Due from [entity] / Cr Cash.

do $$
declare
  v_entity_id uuid;
begin
  select id into v_entity_id from public.bk_entities where name = 'East Meadow Consulting LLC';
  if v_entity_id is not null and not exists (
    select 1 from public.bk_accounts where entity_id = v_entity_id and code = '1200'
  ) then
    insert into public.bk_accounts (entity_id, code, name, account_type) values
      (v_entity_id, '1200', 'Due from Ridge & Anchor LLC', 'asset');
  end if;
end $$;
