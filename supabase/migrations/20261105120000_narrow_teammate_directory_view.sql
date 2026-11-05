-- Run by hand in the Supabase SQL editor (db push does not work in this repo).
-- Narrows the teammate directory to accounts that can use Messages.

create or replace view public.teammates_directory as
select id, full_name, email, role, is_active
from public.profiles
where is_active = true
  and (
    public.is_admin()
    or exists (
      select 1 from public.profiles me
      where me.id = auth.uid() and me.can_view_messages = true
    )
  );

-- Grants must stay: select for signed-in only, nothing else.
revoke insert, update, delete, truncate, references, trigger on public.teammates_directory from anon, authenticated, public;
revoke select on public.teammates_directory from anon, public;
grant select on public.teammates_directory to authenticated;

-- Rollback (restores the previous definition):
-- create or replace view public.teammates_directory as
--   select id, full_name, email, role, is_active from public.profiles where is_active = true;
