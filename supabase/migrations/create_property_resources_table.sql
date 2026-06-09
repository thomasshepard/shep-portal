-- Property Playbook: reference docs (application criteria, policies, lead-messaging templates).
-- Run once in the Supabase SQL editor.

create table if not exists public.property_resources (
  id          uuid primary key default gen_random_uuid(),
  category    text not null default 'Other',   -- 'Application Criteria' | 'Policies' | 'Lead Messaging' | 'Other'
  title       text not null,
  body        text not null default '',         -- Markdown
  is_template boolean not null default false,   -- true → shows a "Copy" button (lead-message scripts)
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

create index if not exists property_resources_category_idx
  on public.property_resources (category, sort_order);

alter table public.property_resources enable row level security;

-- Read: admin or VA (matches the Properties "properties" permission audience).
create policy "property_resources read"
  on public.property_resources for select
  using (
    is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'va'
    )
  );

-- Write (insert/update/delete): admin only.
create policy "property_resources insert" on public.property_resources
  for insert with check (is_admin());
create policy "property_resources update" on public.property_resources
  for update using (is_admin()) with check (is_admin());
create policy "property_resources delete" on public.property_resources
  for delete using (is_admin());
