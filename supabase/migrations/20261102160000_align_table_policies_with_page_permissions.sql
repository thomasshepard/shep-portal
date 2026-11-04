-- Applied by hand in the Supabase SQL editor on 2026-11-02 (db push does not work in this repo).
-- Recorded here for history. Aligns row-level policies with the permission that gates each page in the app.

-- properties (not used by the app): admin-only writes (via "Admins can manage properties"); reads for admin, VA, can_view_properties.
drop policy if exists "Admins can delete properties" on public.properties;
drop policy if exists "Admins can insert properties" on public.properties;
drop policy if exists "Admins can update properties" on public.properties;
drop policy if exists "Authenticated users can read properties" on public.properties;
create policy "properties read" on public.properties for select to authenticated
  using (public.is_admin() or exists (select 1 from public.profiles p
    where p.id = auth.uid() and (p.role = 'va' or p.can_view_properties)));

-- incubator_logs: admin or can_view_chickens.
drop policy if exists "Authenticated users can delete incubator logs" on public.incubator_logs;
drop policy if exists "Authenticated users can insert incubator logs" on public.incubator_logs;
drop policy if exists "Authenticated users can update incubator logs" on public.incubator_logs;
drop policy if exists "Authenticated users can view incubator logs" on public.incubator_logs;
create policy "incubator_logs select" on public.incubator_logs for select to authenticated
  using (public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_chickens));
create policy "incubator_logs insert" on public.incubator_logs for insert to authenticated
  with check (public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_chickens));
create policy "incubator_logs update" on public.incubator_logs for update to authenticated
  using (public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_chickens))
  with check (public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_chickens));
create policy "incubator_logs delete" on public.incubator_logs for delete to authenticated
  using (public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_chickens));

-- notification_preferences: own row or admin.
drop policy if exists "Authenticated read prefs" on public.notification_preferences;
create policy "prefs read own or admin" on public.notification_preferences for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- task_comments: admin or can_view_tasks.
drop policy if exists "Authenticated read comments" on public.task_comments;
drop policy if exists "Author insert comment" on public.task_comments;
create policy "task_comments read" on public.task_comments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_tasks));
create policy "task_comments insert" on public.task_comments for insert to authenticated
  with check (auth.uid() = author_id and (public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.can_view_tasks)));

-- pages: admin, or active pages for can_view_tools.
drop policy if exists "Authenticated users can read active pages" on public.pages;
create policy "pages read" on public.pages for select to authenticated
  using (public.is_admin() or (is_active and exists (select 1 from public.profiles p
    where p.id = auth.uid() and p.can_view_tools)));

-- access_logs: a signed-in user logs only as themselves.
drop policy if exists "Authenticated users can insert logs" on public.access_logs;
create policy "access_logs insert own" on public.access_logs for insert to authenticated
  with check (user_id = auth.uid());
