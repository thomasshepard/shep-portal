-- Bookkeeping module, Phase 1b: learned auto-post + AI category suggestions.
-- See bookkeeping-module-spec.md (workspace root) for the full design.
--
-- Auto-post is driven by this table, not a fresh AI confidence score on
-- every transaction — a vendor needs two real human confirmations of the
-- same category before later occurrences post automatically. AI's role is
-- narrower: suggesting a starting category for a transaction from a vendor
-- never seen before (still one click to confirm, see `suggest_category`
-- in the edge function).
--
-- Same security model as every other Bookkeeping table — RLS-enabled with
-- ZERO policies for anon/authenticated. Do not add authenticated/anon
-- policies to this table.

create table if not exists public.bk_categorization_rules (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.bk_entities(id) not null,
  vendor_key text not null,   -- normalized description key, see vendorKey() in the edge function
  account_id uuid references public.bk_accounts(id) not null,
  times_confirmed int not null default 1,
  last_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (entity_id, vendor_key)
);
alter table public.bk_categorization_rules enable row level security;
