-- In-app messaging: DM + group channels, threaded replies, image/file attachments.
-- Phase 1 UI only uses kind in ('dm','group') — 'context' (channel pinned to a
-- Property/Deal/Task record) and thread_root_id are included now so Phase 2
-- (context channels, real thread UI) needs no further migration.
--
-- Mirrors the notifications table's realtime pattern (useNotifications.jsx) —
-- see src/hooks/useMessages.jsx for the client-side subscribe.

-- Sidebar-visibility flag for 'member' role, same convention as
-- can_view_tasks/can_view_recipes/etc (add_member_nav_permissions.sql).
-- Admin/VA get Messages regardless (see useAuth.jsx) — this only gates it for members.
alter table public.profiles add column if not exists can_view_messages boolean not null default false;

create table if not exists public.msg_channels (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('dm','group','context')),
  name         text,                 -- group/context channels only; DMs are named client-side from members
  context_type text,                 -- 'property'|'deal'|'task'|... (Phase 2)
  context_id   text,                 -- Airtable recId (Phase 2)
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);

create table if not exists public.msg_members (
  channel_id   uuid not null references public.msg_channels(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','member')),
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted        boolean not null default false,
  primary key (channel_id, profile_id)
);

create table if not exists public.msg_messages (
  id             uuid primary key default gen_random_uuid(),
  channel_id     uuid not null references public.msg_channels(id) on delete cascade,
  sender_id      uuid not null references public.profiles(id),
  body           text,
  attachments    jsonb not null default '[]'::jsonb,  -- [{url,path,kind:'image'|'file',name,size,mime}]
  mentions       uuid[] not null default '{}',        -- @mentioned profile ids — same convention as task_comments.mentions
  thread_root_id uuid references public.msg_messages(id) on delete cascade,
  reply_count    int not null default 0,   -- denormalized, bumped by trigger below
  last_reply_at  timestamptz,
  is_edited      boolean not null default false,
  edited_at      timestamptz,
  deleted_at     timestamptz,              -- soft delete; never hard-delete (preserves thread/mention integrity)
  created_at     timestamptz not null default now()
);

create index if not exists msg_messages_channel_created_idx on public.msg_messages(channel_id, created_at);
create index if not exists msg_messages_thread_idx on public.msg_messages(thread_root_id) where thread_root_id is not null;
create index if not exists msg_members_profile_idx on public.msg_members(profile_id);
create index if not exists msg_messages_mentions_idx on public.msg_messages using gin(mentions);

-- Bump reply_count/last_reply_at on the root message whenever a threaded reply is inserted.
create or replace function public.bump_thread_reply_meta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.thread_root_id is not null then
    update public.msg_messages
    set reply_count = reply_count + 1, last_reply_at = new.created_at
    where id = new.thread_root_id;
  end if;
  return new;
end;
$$;

drop trigger if exists msg_messages_bump_thread on public.msg_messages;
create trigger msg_messages_bump_thread
after insert on public.msg_messages
for each row execute function public.bump_thread_reply_meta();

alter table public.msg_channels enable row level security;
alter table public.msg_members  enable row level security;
alter table public.msg_messages enable row level security;

-- Membership check, security definer so it can be used inside RLS on other
-- tables without those tables' policies needing to see msg_members directly.
create or replace function public.is_msg_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.msg_members where channel_id = cid and profile_id = auth.uid()
  );
$$;

-- msg_channels
drop policy if exists msg_channels_select on public.msg_channels;
create policy msg_channels_select on public.msg_channels
  for select using (is_msg_member(id) or is_admin());

drop policy if exists msg_channels_insert on public.msg_channels;
create policy msg_channels_insert on public.msg_channels
  for insert with check (created_by = auth.uid());

drop policy if exists msg_channels_update on public.msg_channels;
create policy msg_channels_update on public.msg_channels
  for update using (
    is_admin() or exists (
      select 1 from public.msg_members m
      where m.channel_id = id and m.profile_id = auth.uid() and m.role = 'owner'
    )
  );

-- msg_members
drop policy if exists msg_members_select on public.msg_members;
create policy msg_members_select on public.msg_members
  for select using (is_msg_member(channel_id) or is_admin());

drop policy if exists msg_members_insert on public.msg_members;
create policy msg_members_insert on public.msg_members
  for insert with check (
    profile_id = auth.uid()  -- joining/creating for yourself
    or is_admin()
    or exists (  -- an existing owner can add members
      select 1 from public.msg_members m
      where m.channel_id = msg_members.channel_id and m.profile_id = auth.uid() and m.role = 'owner'
    )
  );

drop policy if exists msg_members_update_self on public.msg_members;
create policy msg_members_update_self on public.msg_members
  for update using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

drop policy if exists msg_members_delete on public.msg_members;
create policy msg_members_delete on public.msg_members
  for delete using (profile_id = auth.uid() or is_admin());

-- msg_messages
drop policy if exists msg_messages_select on public.msg_messages;
create policy msg_messages_select on public.msg_messages
  for select using (is_msg_member(channel_id) or is_admin());

drop policy if exists msg_messages_insert on public.msg_messages;
create policy msg_messages_insert on public.msg_messages
  for insert with check (sender_id = auth.uid() and is_msg_member(channel_id));

drop policy if exists msg_messages_update on public.msg_messages;
create policy msg_messages_update on public.msg_messages
  for update using (sender_id = auth.uid() or is_admin());

-- Realtime — required for useMessages.jsx's postgres_changes subscription (same
-- requirement notifications/access_logs already have via the supabase_realtime publication).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'msg_messages'
  ) then
    alter publication supabase_realtime add table public.msg_messages;
  end if;
end $$;

-- Private bucket for image/file attachments (signed URLs only, mirrors the
-- shared-files/property-docs pattern — see src/lib/messaging.js).
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

drop policy if exists message_attachments_rw on storage.objects;
create policy message_attachments_rw on storage.objects
  for all using (bucket_id = 'message-attachments' and auth.role() = 'authenticated')
  with check (bucket_id = 'message-attachments' and auth.role() = 'authenticated');
