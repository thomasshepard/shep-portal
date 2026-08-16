-- Bookkeeping module, Phase 1a: SimpleFin bank feed (connect + sync +
-- manual quick-categorize). See bookkeeping-module-spec.md (workspace root)
-- for the full design — this migration is Phase 1a only, no AI
-- categorization or automatic sync yet (that's Phase 1b).
--
-- Security model: same as every other Bookkeeping table — RLS-enabled with
-- ZERO policies for anon/authenticated. Nothing is readable or writable
-- directly from the browser. All access goes through the `bookkeeping` edge
-- function, which uses the service-role key server-side.
-- Do not add authenticated/anon policies to these tables.
--
-- Provider notes (SimpleFin protocol v2, confirmed against simplefin.org):
-- there's no client id/secret — a user gets a one-time Setup Token from
-- their own SimpleFin Bridge account (bridge.simplefin.org/simplefin/create,
-- they authenticate to their own bank there, not through us), pastes it
-- into Bookkeeping once, and the edge function exchanges it for a
-- persistent Access URL (HTTP Basic Auth baked into the URL itself — treat
-- it as sensitive as a password). One Access URL's GET /accounts?version=2
-- returns every linked account's balance AND transactions in one call.

create table if not exists public.bk_feed_claims (
  id uuid primary key default gen_random_uuid(),
  access_url text not null,           -- sensitive: HTTP Basic Auth baked into the URL itself
  status text not null default 'active' check (status in ('active','needs_reauth','removed')),
  last_synced_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.bk_feed_claims enable row level security;

create table if not exists public.bk_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references public.bk_feed_claims(id) not null,
  simplefin_account_id text not null,    -- SimpleFin's Account.id
  conn_id text,                          -- SimpleFin's Connection.id (informational)
  conn_name text,                        -- e.g. "Relay Financial - Thomas"
  display_name text not null,            -- SimpleFin's Account.name, e.g. "Checking"
  currency text,
  entity_id uuid references public.bk_entities(id),         -- null until mapped
  ledger_account_id uuid references public.bk_accounts(id), -- null until mapped — which Cash/liability account this feeds
  last_balance numeric(14,2),
  last_balance_date timestamptz,
  status text not null default 'active' check (status in ('active','needs_reauth','removed')),
  unique (claim_id, simplefin_account_id)
);
alter table public.bk_bank_accounts enable row level security;

create table if not exists public.bk_raw_transactions (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid references public.bk_bank_accounts(id) not null,
  simplefin_transaction_id text not null,
  posted_at timestamptz not null,
  -- SimpleFin sign convention: positive = deposit, negative = withdrawal.
  -- This is the OPPOSITE of statements.js's credit-card convention
  -- (negative = spending) — don't reuse that sign logic for bank-feed rows.
  amount numeric(14,2) not null,
  description text not null,
  pending boolean not null default false,
  matched_journal_entry_id uuid references public.bk_journal_entries(id),  -- set once quick-categorized
  created_at timestamptz not null default now(),
  unique (bank_account_id, simplefin_transaction_id)
);
alter table public.bk_raw_transactions enable row level security;
