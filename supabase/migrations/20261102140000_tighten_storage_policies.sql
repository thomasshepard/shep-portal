-- Run by hand in the Supabase SQL editor (db push does not work in this repo).
--
-- Before this, every storage.objects write policy applied to any signed-in
-- account with only a bucket check (the "Admins can ..." names were not true),
-- shared-files and the property buckets were readable by any signed-in account,
-- and message-attachments was readable and writable by any signed-in account.
-- Contractor logins are real accounts, so "signed in" is not "trusted".
--
-- Rules after this file:
--   shared-files          read: admin or can_view_files           write: admin
--   property-docs/photos  read: admin, VA or can_view_properties  write: admin
--   message-attachments   read/upload: members of the channel (folder = channel id), delete: admin
--   fleet-photos          public read stays; write: admin or can_view_fleet
--   fleet-documents       NEW private bucket: all access admin or can_view_fleet (signed links only)
-- Each subselect reads the caller's own profiles row, which profiles RLS
-- already allows. A rollback block that restores the old policies is at the
-- bottom of this file (commented out).

-- ── shared-files ────────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can read shared files" on storage.objects;
drop policy if exists "Admins can upload shared files" on storage.objects;
drop policy if exists "Admins can delete shared files" on storage.objects;

create policy "shared-files read" on storage.objects for select to authenticated
  using (bucket_id = 'shared-files' and (public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_files)));
create policy "shared-files admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'shared-files' and public.is_admin());
create policy "shared-files admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'shared-files' and public.is_admin());

-- ── property-docs ───────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can read property docs" on storage.objects;
drop policy if exists "Admins can upload property docs" on storage.objects;
drop policy if exists "Admins can delete property docs" on storage.objects;

create policy "property-docs read" on storage.objects for select to authenticated
  using (bucket_id = 'property-docs' and (public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'va' or p.can_view_properties))));
create policy "property-docs admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-docs' and public.is_admin());
create policy "property-docs admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'property-docs' and public.is_admin());

-- ── property-photos ─────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can read property photos" on storage.objects;
drop policy if exists "Admins can upload property photos" on storage.objects;
drop policy if exists "Admins can delete property photos" on storage.objects;

create policy "property-photos read" on storage.objects for select to authenticated
  using (bucket_id = 'property-photos' and (public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'va' or p.can_view_properties))));
create policy "property-photos admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-photos' and public.is_admin());
create policy "property-photos admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'property-photos' and public.is_admin());

-- ── message-attachments (path = <channel uuid>/<file>) ──────────────────────
-- CASE keeps the uuid cast from running on a malformed folder name.
drop policy if exists "message_attachments_rw" on storage.objects;

create policy "message-attachments member read" on storage.objects for select to authenticated
  using (bucket_id = 'message-attachments' and (public.is_admin()
    or case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then public.is_msg_member(((storage.foldername(name))[1])::uuid) else false end));
create policy "message-attachments member insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'message-attachments'
    and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then public.is_msg_member(((storage.foldername(name))[1])::uuid) else false end);
create policy "message-attachments admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'message-attachments' and public.is_admin());

-- ── fleet-photos: stays public to read; writes limited ──────────────────────
drop policy if exists "fleet-photos authenticated insert" on storage.objects;
drop policy if exists "fleet-photos authenticated update" on storage.objects;
drop policy if exists "fleet-photos authenticated delete" on storage.objects;

create policy "fleet-photos fleet insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'fleet-photos' and (public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_fleet)));
create policy "fleet-photos fleet update" on storage.objects for update to authenticated
  using (bucket_id = 'fleet-photos' and (public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_fleet)));
create policy "fleet-photos fleet delete" on storage.objects for delete to authenticated
  using (bucket_id = 'fleet-photos' and (public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_fleet)));

-- ── fleet-documents: new private bucket for titles and registrations ────────
insert into storage.buckets (id, name, public) values ('fleet-documents', 'fleet-documents', false)
  on conflict (id) do nothing;

create policy "fleet-documents read" on storage.objects for select to authenticated
  using (bucket_id = 'fleet-documents' and (public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_fleet)));
create policy "fleet-documents insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'fleet-documents' and (public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_fleet)));
create policy "fleet-documents delete" on storage.objects for delete to authenticated
  using (bucket_id = 'fleet-documents' and (public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_fleet)));

-- ── ROLLBACK (restores the previous, permissive policies) ───────────────────
-- drop policy if exists "shared-files read" on storage.objects;
-- drop policy if exists "shared-files admin insert" on storage.objects;
-- drop policy if exists "shared-files admin delete" on storage.objects;
-- create policy "Authenticated users can read shared files" on storage.objects for select to authenticated using (bucket_id = 'shared-files');
-- create policy "Admins can upload shared files" on storage.objects for insert to authenticated with check (bucket_id = 'shared-files');
-- create policy "Admins can delete shared files" on storage.objects for delete to authenticated using (bucket_id = 'shared-files');
-- (same pattern for property-docs and property-photos)
-- drop policy if exists "message-attachments member read" on storage.objects;
-- drop policy if exists "message-attachments member insert" on storage.objects;
-- drop policy if exists "message-attachments admin delete" on storage.objects;
-- create policy "message_attachments_rw" on storage.objects for all
--   using (bucket_id = 'message-attachments' and auth.role() = 'authenticated')
--   with check (bucket_id = 'message-attachments' and auth.role() = 'authenticated');
-- drop policy if exists "fleet-photos fleet insert" on storage.objects;
-- drop policy if exists "fleet-photos fleet update" on storage.objects;
-- drop policy if exists "fleet-photos fleet delete" on storage.objects;
-- create policy "fleet-photos authenticated insert" on storage.objects for insert to authenticated with check (bucket_id = 'fleet-photos');
-- create policy "fleet-photos authenticated update" on storage.objects for update to authenticated using (bucket_id = 'fleet-photos');
-- create policy "fleet-photos authenticated delete" on storage.objects for delete to authenticated using (bucket_id = 'fleet-photos');
