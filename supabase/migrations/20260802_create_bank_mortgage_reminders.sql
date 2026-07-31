-- Per-account mortgage payment reminders for the Bank Dashboard: lets Thomas
-- see the upcoming due date and amount next to the account a mortgage draws
-- from, so he can confirm the balance covers it before the payment hits.

create table if not exists public.bank_mortgage_reminders (
  id uuid primary key default gen_random_uuid(),
  account_id text not null unique,
  label text not null,
  amount numeric(12,2) not null,
  due_day smallint not null check (due_day between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bank_mortgage_reminders enable row level security;

-- No anon/authenticated policies, matching bank_items / bank_account_owners /
-- bank_balances_cache — reads and writes go only through the bank-dashboard
-- edge function's service-role client.
