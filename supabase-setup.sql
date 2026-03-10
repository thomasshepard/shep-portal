-- ============================================================
-- Shep Portal — Supabase Database Setup
-- Run this in the Supabase SQL editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLES
-- ────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  is_active boolean not null default true,
  can_view_properties boolean not null default false,
  can_view_llcs boolean not null default false,
  can_view_chickens boolean not null default false,
  last_login timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.access_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete set null,
  user_email text,
  page_path text,
  action text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.properties (
  id bigint generated always as identity primary key,
  name text not null,
  address text,
  city text,
  status text not null default 'active' check (status in ('active', 'rehab', 'listed', 'sold', 'pending')),
  purchase_price numeric,
  rehab_budget numeric,
  arv numeric,
  notes text,
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pages (
  id bigint generated always as identity primary key,
  title text not null,
  slug text unique not null,
  content text,
  description text,
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- TRIGGERS — auto-create profile on signup
-- ────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- TRIGGERS — updated_at
-- ────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_properties_updated_at on public.properties;
create trigger set_properties_updated_at
  before update on public.properties
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_pages_updated_at on public.pages;
create trigger set_pages_updated_at
  before update on public.pages
  for each row execute procedure public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.access_logs enable row level security;
alter table public.properties enable row level security;
alter table public.pages enable row level security;

-- Helper function to check admin role
-- security definer lets it bypass RLS when reading profiles
create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ── profiles ──────────────────────────────────────────────
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "Admins can update profiles"
  on public.profiles for update
  using (public.is_admin());

-- ── access_logs ───────────────────────────────────────────
create policy "Authenticated users can insert logs"
  on public.access_logs for insert
  with check (auth.role() = 'authenticated');

create policy "Admins can read logs"
  on public.access_logs for select
  using (public.is_admin());

-- ── properties ────────────────────────────────────────────
-- All authenticated users can read
create policy "Authenticated users can read properties"
  on public.properties for select
  using (auth.role() = 'authenticated');

-- Admins get explicit INSERT / UPDATE / DELETE policies
-- (using 'for all' with only a 'using' clause is ambiguous for
--  INSERT in some Supabase versions; explicit policies are safer)
create policy "Admins can insert properties"
  on public.properties for insert
  with check (public.is_admin());

create policy "Admins can update properties"
  on public.properties for update
  using (public.is_admin());

create policy "Admins can delete properties"
  on public.properties for delete
  using (public.is_admin());

-- ── pages ─────────────────────────────────────────────────
-- All authenticated users can read
create policy "Authenticated users can read active pages"
  on public.pages for select
  using (auth.role() = 'authenticated');

-- Admins get explicit INSERT / UPDATE / DELETE policies
create policy "Admins can insert pages"
  on public.pages for insert
  with check (public.is_admin());

create policy "Admins can update pages"
  on public.pages for update
  using (public.is_admin());

create policy "Admins can delete pages"
  on public.pages for delete
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- STORAGE BUCKETS
-- Run these separately in the Supabase Storage UI or via API
-- ────────────────────────────────────────────────────────────
-- NOTE: Storage bucket creation must be done in the Supabase
-- dashboard (Storage > New Bucket) or via the Management API.
-- Create these three buckets:
--   • property-photos  (public)
--   • property-docs    (private)
--   • shared-files     (private)
--
-- Then add storage policies via Storage > Policies:
--
-- property-photos: allow read for authenticated users
-- property-docs: allow read for authenticated; upload/delete for admin
-- shared-files: allow read for authenticated; upload/delete for admin
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- FIRST ADMIN SETUP (run after creating your user in Auth)
-- Replace the email with your admin email address
-- ────────────────────────────────────────────────────────────
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE email = 'your-email@example.com';

-- ────────────────────────────────────────────────────────────
-- EXISTING DATABASE MIGRATION
-- If the profiles table already exists, run these to add the
-- new permission columns (safe to run multiple times):
-- ────────────────────────────────────────────────────────────
-- ALTER TABLE public.profiles
--   ADD COLUMN IF NOT EXISTS can_view_properties boolean NOT NULL DEFAULT false,
--   ADD COLUMN IF NOT EXISTS can_view_llcs boolean NOT NULL DEFAULT false;

-- Add chickens permission (run this if profiles table already existed):
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_view_chickens boolean DEFAULT false;
