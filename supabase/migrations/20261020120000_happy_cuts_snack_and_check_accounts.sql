-- Two Happy Cuts LLC categories the Categorize dropdown was missing:
--   5800 Snacks & Drinks              — crew water/snacks on hot days
--   4010 Mowing - Checks (non-Stripe) — client checks for mows paid outside Stripe
-- The dropdown lists every income/expense account for the entity, so adding
-- the rows is all it takes for them to appear.

insert into bk_accounts (entity_id, code, name, account_type)
select e.id, '5800', 'Snacks & Drinks', 'expense'
from bk_entities e
where e.name = 'Happy Cuts LLC'
  and not exists (select 1 from bk_accounts a where a.entity_id = e.id and a.code = '5800');

insert into bk_accounts (entity_id, code, name, account_type)
select e.id, '4010', 'Mowing - Checks (non-Stripe)', 'income'
from bk_entities e
where e.name = 'Happy Cuts LLC'
  and not exists (select 1 from bk_accounts a where a.entity_id = e.id and a.code = '4010');
