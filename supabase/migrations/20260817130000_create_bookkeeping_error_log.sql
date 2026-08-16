-- Bookkeeping module: persistent error log. The `bookkeeping` edge function
-- had no durable way to surface a failure's real cause — Supabase's own
-- function logs require dashboard access, and this CLI's version has no
-- `functions logs` subcommand, so every failure meant asking Thomas to dig
-- through the Dashboard UI or DevTools Network tab by hand. Writing the
-- error straight into a table means either of us can just run one SELECT.
--
-- Same security model as every other Bookkeeping table — RLS-enabled, zero
-- policies, service-role-only via the edge function. Do not add
-- authenticated/anon policies to this table.

create table if not exists public.bk_error_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  action text,
  error_message text,
  payload jsonb,      -- the request body, with known-sensitive fields (setupToken) redacted before insert
  user_id uuid
);
alter table public.bk_error_log enable row level security;
