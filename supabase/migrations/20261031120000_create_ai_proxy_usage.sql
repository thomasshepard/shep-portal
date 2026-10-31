-- Per-user daily request counter for the ai-proxy edge function (SEC-2/SEC-3).
-- Only the edge function (service_role) touches this table.

create table if not exists public.ai_proxy_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, usage_date)
);

alter table public.ai_proxy_usage enable row level security;

revoke all on public.ai_proxy_usage from public, anon, authenticated;
grant all on public.ai_proxy_usage to service_role;
