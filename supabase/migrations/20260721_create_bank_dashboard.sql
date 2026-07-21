-- Bank Dashboard module: consolidated Plaid balance view across personal +
-- LLC bank accounts, ported from the standalone local bank-dashboard app.
--
-- Security model: these three tables hold live Plaid access tokens and real
-- account data. They are RLS-enabled with ZERO policies for anon/authenticated
-- — nothing is readable or writable directly from the browser. All access goes
-- through the bank-dashboard edge function, which uses the service-role key
-- server-side and enforces the can_view_bank_dashboard permission itself.
-- Do not add authenticated/anon policies to these tables.

alter table public.profiles
  add column if not exists can_view_bank_dashboard boolean not null default false;

create table if not exists public.bank_items (
  item_id           text primary key,
  access_token      text not null,
  institution_name  text,
  added_at          timestamptz not null default now()
);
alter table public.bank_items enable row level security;

create table if not exists public.bank_account_owners (
  account_id text primary key,
  owner      text
);
alter table public.bank_account_owners enable row level security;

-- Singleton cache row (id always 1) so page load can show the last snapshot
-- without hitting Plaid every time. Refreshed only by the get_balances (live)
-- action.
create table if not exists public.bank_balances_cache (
  id         int primary key default 1 check (id = 1),
  updated_at timestamptz,
  accounts   jsonb not null default '[]'::jsonb
);
alter table public.bank_balances_cache enable row level security;
insert into public.bank_balances_cache (id, updated_at, accounts)
  values (1, null, '[]'::jsonb)
  on conflict (id) do nothing;
