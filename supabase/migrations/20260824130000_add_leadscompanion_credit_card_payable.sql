-- East Meadow Consulting LLC's Chase business credit card pays for real
-- LeadsCompanion business expenses (confirmed with Thomas), but the card
-- itself isn't connected as its own bank feed yet — only the checking
-- account that pays it off. Without a liability account, those EPAY/
-- AUTOPAYBUS payments have nowhere correct to land (they aren't an expense
-- themselves — the expense already happened when the card was swiped).
--
-- Standard treatment: Credit Card Payable (liability). Card purchases would
-- post Dr Expense / Cr Credit Card Payable; paying the card from checking
-- posts Dr Credit Card Payable / Cr Cash. Until the card itself is
-- connected via SimpleFin, only the payment side is ever recorded, so this
-- account's balance will drift negative (credits with no offsetting
-- debits) rather than tracking a real payable — expected and called out
-- directly to Thomas, not a bug to silently paper over.

do $$
declare
  v_entity_id uuid;
begin
  select id into v_entity_id from public.bk_entities where name = 'East Meadow Consulting LLC';
  if v_entity_id is not null and not exists (
    select 1 from public.bk_accounts where entity_id = v_entity_id and code = '2000'
  ) then
    insert into public.bk_accounts (entity_id, code, name, account_type) values
      (v_entity_id, '2000', 'Credit Card Payable', 'liability');
  end if;
end $$;
