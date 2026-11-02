-- Public share links for a single workstream's checklist (/#/share/<token>).
--
-- Anyone holding the link can view, check off, add, edit and delete the tasks of
-- THAT workstream only, through the workstream-share edge function (which uses the
-- service role). The table itself is admin-only: nothing here is readable or
-- writable by anon or by non-admin users, so a link holder can never list other
-- links or tokens.
--
-- Tokens are random 256-bit values generated in the browser (Share tab in the
-- workstream drawer). They are stored in plain text so the admin can copy a link
-- again later; the table is RLS-locked to admins. Revoking sets revoked_at, which
-- the edge function checks on every call.

create table if not exists public.workstream_share_links (
  id              uuid primary key default gen_random_uuid(),
  workstream_id   text not null check (workstream_id ~ '^rec[A-Za-z0-9]{14}$'),
  workstream_name text not null,
  token           text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  label           text,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  last_used_at    timestamptz
);

create index if not exists workstream_share_links_ws_idx on public.workstream_share_links (workstream_id);

alter table public.workstream_share_links enable row level security;

drop policy if exists "Admins manage workstream share links" on public.workstream_share_links;
create policy "Admins manage workstream share links"
  on public.workstream_share_links
  for all
  using (public.is_admin())
  with check (public.is_admin());
