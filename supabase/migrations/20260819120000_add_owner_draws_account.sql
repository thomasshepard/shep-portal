-- Bookkeeping: Owner's Draws account, both single-member entities.
--
-- Missing piece flagged directly by Thomas: a single "Owner's Equity"
-- account can't distinguish capital/retained earnings from cash actually
-- taken out during the year. More pressing — some Happy Cuts clients pay in
-- physical cash, which never touches the business bank account at all; it
-- effectively becomes an owner distribution the moment it's collected, not
-- a bank deposit. The edge function's post_mow_payment action now defaults
-- cash-marked mows to Owner's Draws instead of Cash for exactly this
-- reason (see its updated comment) — this account has to exist first.
--
-- `unique (entity_id, code)` from Phase 0 makes this safely re-runnable.

insert into public.bk_accounts (entity_id, code, name, account_type)
select id, '3100', 'Owner''s Draws', 'equity' from public.bk_entities where name = 'Happy Cuts LLC'
union all
select id, '3100', 'Owner''s Draws', 'equity' from public.bk_entities where name = 'East Meadow Consulting LLC'
on conflict (entity_id, code) do nothing;
