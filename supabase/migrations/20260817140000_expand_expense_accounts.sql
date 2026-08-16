-- Bookkeeping: expand both entities' expense chart of accounts.
--
-- Phase 0's seed COA only had the leaves the initial dual-write actions
-- needed (Contractor Expense, Office Supplies for Happy Cuts) — fine when
-- manual entry was the only door in, but Phase 1a's bank feed now surfaces
-- real transactions (gas, insurance, software...) with nowhere sensible to
-- post them. Should have anticipated this before shipping the
-- quick-categorize dropdown, not reacted to it after — a bank feed makes
-- the entity's own real spending vocabulary visible immediately, and the
-- COA needs to already cover it.
--
-- `unique (entity_id, code)` from the Phase 0 migration makes this safely
-- re-runnable via ON CONFLICT DO NOTHING — no do $$ ... end $$ needed.

insert into public.bk_accounts (entity_id, code, name, account_type)
select id, '5200', 'Fuel & Vehicle', 'expense' from public.bk_entities where name = 'Happy Cuts LLC'
union all
select id, '5300', 'Equipment & Repairs', 'expense' from public.bk_entities where name = 'Happy Cuts LLC'
union all
select id, '5400', 'Insurance', 'expense' from public.bk_entities where name = 'Happy Cuts LLC'
union all
select id, '5500', 'Software & Subscriptions', 'expense' from public.bk_entities where name = 'Happy Cuts LLC'
union all
select id, '5600', 'Advertising & Marketing', 'expense' from public.bk_entities where name = 'Happy Cuts LLC'
union all
select id, '5700', 'Bank & Card Fees', 'expense' from public.bk_entities where name = 'Happy Cuts LLC'
union all
select id, '5200', 'Insurance', 'expense' from public.bk_entities where name = 'East Meadow Consulting LLC'
union all
select id, '5300', 'Advertising & Marketing', 'expense' from public.bk_entities where name = 'East Meadow Consulting LLC'
union all
select id, '5400', 'Bank & Card Fees', 'expense' from public.bk_entities where name = 'East Meadow Consulting LLC'
on conflict (entity_id, code) do nothing;
