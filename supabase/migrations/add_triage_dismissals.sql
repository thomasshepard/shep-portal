-- Triage dismissals: lets users snooze a triage card for 24 hours.
-- Run once in the Supabase SQL editor.

create table if not exists public.triage_dismissals (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  item_id     text        not null,
  dismissed_at timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  unique (user_id, item_id)
);

alter table public.triage_dismissals enable row level security;

create policy "users manage own dismissals"
  on public.triage_dismissals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists triage_dismissals_user_expires
  on public.triage_dismissals (user_id, expires_at);
