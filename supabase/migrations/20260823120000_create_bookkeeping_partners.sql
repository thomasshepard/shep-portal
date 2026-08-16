-- Bookkeeping, Phase 3: bk_partners. bk_journal_lines.partner_id has existed
-- since Phase 0 as a soft nullable column with a comment saying "hard FK
-- added once bk_partners exists (Phase 3)" — this is that phase.
--
-- Same security posture as every other Bookkeeping table: RLS enabled, zero
-- anon/authenticated policies. All access goes through the bookkeeping edge
-- function's service-role client.

create table if not exists public.bk_partners (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.bk_entities(id) not null,
  name text not null,
  ownership_pct numeric(5,2) not null,
  created_at timestamptz not null default now()
);
alter table public.bk_partners enable row level security;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'bk_journal_lines_partner_id_fkey'
      and table_name = 'bk_journal_lines'
  ) then
    alter table public.bk_journal_lines
      add constraint bk_journal_lines_partner_id_fkey foreign key (partner_id) references public.bk_partners(id);
  end if;
end $$;
