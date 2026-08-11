-- Crew Portal — links Supabase auth users to Happy Cuts Crew (Airtable) records,
-- and logs emergency contact-info reveals. Backs the separate crew-portal site;
-- see /Happy Cuts/crew-portal-design.md in the workspace root for the full design.
--
-- crew_links       — one row per partner. access_tier (1-4) is set by hand in
--                    Shep Portal admin; the crew-portal edge function reads it to
--                    decide what fields to return. airtable_crew_id is the recXXXX
--                    id of their row in the Crew table (tblDqfsBT67Erlwwu) in the
--                    Happy Cuts base.
-- contact_reveal_log — audit trail for "reveal contact — emergency only". Insert-only
--                    from the edge function (service role); never written by clients.

create table if not exists public.crew_links (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null unique references public.profiles(id) on delete cascade,
  airtable_crew_id  text not null unique,
  access_tier       int  not null default 1 check (access_tier between 1 and 4),
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create table if not exists public.contact_reveal_log (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null references public.profiles(id) on delete cascade,
  airtable_job_id      text not null,
  airtable_contact_id  text not null,
  reason               text not null check (char_length(reason) >= 10),
  revealed_at          timestamptz not null default now(),
  expires_at           timestamptz not null
);

create index if not exists contact_reveal_log_profile_idx on public.contact_reveal_log(profile_id, revealed_at);

alter table public.crew_links enable row level security;
alter table public.contact_reveal_log enable row level security;

-- crew_links: a partner can read their own row; admins can read/write all.
drop policy if exists crew_links_self_select on public.crew_links;
create policy crew_links_self_select on public.crew_links
  for select using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists crew_links_admin_write on public.crew_links;
create policy crew_links_admin_write on public.crew_links
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- contact_reveal_log: partners see only their own reveals; admins see all.
-- No insert/update/delete policy for regular users — writes go through the
-- crew-portal edge function using the service role key, which bypasses RLS.
drop policy if exists contact_reveal_log_self_select on public.contact_reveal_log;
create policy contact_reveal_log_self_select on public.contact_reveal_log
  for select using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
