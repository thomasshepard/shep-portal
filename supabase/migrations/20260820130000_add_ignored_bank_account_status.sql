-- Bookkeeping: allow bk_bank_accounts.status = 'ignored'.
--
-- Some SimpleFin-discovered accounts (e.g. an unused savings account) will
-- never have real transactions worth mapping, but sat permanently in the
-- Bank Feed panel's "Needs mapping" list every time the entity was viewed.
-- 'ignored' lets it stop nagging without actually mapping it to anything.
--
-- Postgres names an inline column check constraint <table>_<column>_check
-- by default — matches what Phase 1a's original migration created.

alter table public.bk_bank_accounts drop constraint if exists bk_bank_accounts_status_check;
alter table public.bk_bank_accounts add constraint bk_bank_accounts_status_check
  check (status in ('active', 'needs_reauth', 'removed', 'ignored'));
