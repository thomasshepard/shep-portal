-- Bookkeeping module, Phase 0: double-entry ledger schema for Happy Cuts LLC.
-- See bookkeeping-module-spec.md (workspace root) for the full design and
-- phase roadmap — this migration is Phase 0 only, nothing past it.
--
-- Security model: same as bank-dashboard (20260721_create_bank_dashboard.sql)
-- — real financial data, RLS-enabled with ZERO policies for anon/authenticated.
-- Nothing is readable or writable directly from the browser. All access goes
-- through the `bookkeeping` edge function, which uses the service-role key
-- server-side and enforces the can_view_bookkeeping permission itself.
-- Do not add authenticated/anon policies to these tables.
--
-- The server computes journal lines, not the browser — dual-write callers
-- (HappyCuts.jsx) send minimal facts (schedule record id, amount), and the
-- edge function builds the balanced entry itself. Manual entries still get
-- their balance re-checked server-side via fn_post_journal_entry, never
-- trusting the client's own balanced/unbalanced indicator.

alter table public.profiles
  add column if not exists can_view_bookkeeping boolean not null default false;

create table if not exists public.bk_entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entity_type text not null check (entity_type in ('partnership','single_member','personal')),
  tax_id text,
  created_at timestamptz not null default now()
);
alter table public.bk_entities enable row level security;

create table if not exists public.bk_accounts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.bk_entities(id) not null,
  code text not null,
  name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','income','expense')),
  subtype text,
  parent_id uuid references public.bk_accounts(id),
  is_active boolean not null default true,
  unique (entity_id, code)
);
alter table public.bk_accounts enable row level security;

create table if not exists public.bk_journal_entries (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.bk_entities(id) not null,
  entry_date date not null,
  memo text,
  source text not null check (source in ('bank_feed','manual','ai','va','recurring','dual_write')),
  source_module text,       -- e.g. 'happy_cuts_schedule_complete' — which Shep Portal action triggered this, null for true manual entries
  source_record_id text,    -- the Airtable record id (or batch key) that triggered a dual-write post — traceability + double-post prevention
  status text not null default 'draft' check (status in ('draft','posted','void')),
  property_id text,         -- soft link to Airtable Properties table — TEXT, Airtable record ids aren't UUIDs
  created_by text,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);
alter table public.bk_journal_entries enable row level security;

-- A retry or double-click on a dual-write hook must not post twice.
create unique index if not exists bk_journal_entries_dual_write_dedup
  on public.bk_journal_entries (source_module, source_record_id)
  where source_module is not null;

create table if not exists public.bk_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid references public.bk_journal_entries(id) not null,
  account_id uuid references public.bk_accounts(id) not null,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  partner_id uuid,           -- soft link; hard FK added once `bk_partners` exists (Phase 3)
  property_id text,          -- soft link to Airtable Properties table — TEXT
  equipment_id text,         -- soft link to Airtable Fleet & Equipment table — TEXT
  vendor_id uuid,            -- soft link; hard FK added once `bk_vendors` exists (Phase 3/4)
  memo text
);
alter table public.bk_journal_lines enable row level security;

create table if not exists public.bk_period_locks (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.bk_entities(id) not null,
  period_end date not null,
  locked_at timestamptz not null default now(),
  locked_by text
);
alter table public.bk_period_locks enable row level security;

-- Phase 0's "does this match the bank" check — no live feed yet, so this is
-- one manually-entered statement balance compared against the ledger's
-- computed Cash balance. Singleton-per-entity row, upserted by set_bank_check.
create table if not exists public.bk_bank_checks (
  entity_id uuid primary key references public.bk_entities(id),
  statement_balance numeric(14,2),
  checked_at timestamptz,
  checked_by text
);
alter table public.bk_bank_checks enable row level security;

-- Balance + period-lock enforcement, gating every post. Don't enforce on raw
-- line inserts (entries get built up incrementally) — gate through this
-- function instead, called once all of an entry's lines exist.
create or replace function public.bk_post_journal_entry(p_entry_id uuid) returns void as $$
declare
  v_entity_id uuid;
  v_entry_date date;
  total_debit numeric;
  total_credit numeric;
begin
  select entity_id, entry_date into v_entity_id, v_entry_date
    from public.bk_journal_entries where id = p_entry_id;

  if v_entity_id is null then
    raise exception 'Journal entry % not found', p_entry_id;
  end if;

  if exists (select 1 from public.bk_period_locks
             where entity_id = v_entity_id and period_end >= v_entry_date) then
    raise exception 'Period is locked for entity % on date %', v_entity_id, v_entry_date;
  end if;

  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into total_debit, total_credit
    from public.bk_journal_lines where journal_entry_id = p_entry_id;

  if total_debit <> total_credit then
    raise exception 'Entry % not balanced: debits % vs credits %', p_entry_id, total_debit, total_credit;
  end if;

  if total_debit = 0 then
    raise exception 'Entry % has no lines', p_entry_id;
  end if;

  update public.bk_journal_entries set status = 'posted', posted_at = now() where id = p_entry_id;
end;
$$ language plpgsql security definer;

-- Seed: Happy Cuts LLC entity + the minimal Phase 0 chart of accounts —
-- enough to post everything Phase 0a actually generates (mow completion,
-- mow payment, crew payout, manual entries). More leaves get added as later
-- phases need them, seeded from the category vocabulary already in use
-- elsewhere in the app rather than invented fresh (see spec §3).
do $$
declare
  v_entity_id uuid;
begin
  select id into v_entity_id from public.bk_entities where name = 'Happy Cuts LLC';
  if v_entity_id is null then
    insert into public.bk_entities (name, entity_type)
      values ('Happy Cuts LLC', 'single_member')
      returning id into v_entity_id;

    insert into public.bk_accounts (entity_id, code, name, account_type) values
      (v_entity_id, '1000', 'Cash',                 'asset'),
      (v_entity_id, '1100', 'Accounts Receivable',  'asset'),
      (v_entity_id, '2000', 'Accrued Payroll',      'liability'),
      (v_entity_id, '3000', 'Owner''s Equity',      'equity'),
      (v_entity_id, '4000', 'Mow Revenue',          'income'),
      (v_entity_id, '5000', 'Contractor Expense',   'expense'),
      (v_entity_id, '5100', 'Office Supplies',      'expense');
  end if;
end $$;
