-- Agent fleet registry: a simple, manually-maintained directory of the
-- Hermes/Claude Code agents the user runs, so there's one place to see
-- what exists, where it lives, and how to reach it. No live health-check
-- automation yet — status is set by hand. Admin-only (personal infra info).

create table if not exists public.agents (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  purpose         text,
  status          text not null default 'active' check (status in ('active', 'stale', 'offline')),
  host            text,
  repo_url        text,
  contact_label   text,
  contact_url     text,
  model_provider  text,
  notes           text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.agents enable row level security;

create policy "admin manage agents"
  on public.agents for all
  using (is_admin())
  with check (is_admin());
