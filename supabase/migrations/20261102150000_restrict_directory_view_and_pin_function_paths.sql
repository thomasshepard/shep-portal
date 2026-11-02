-- Applied by hand in the Supabase SQL editor on 2026-11-02 (db push does not work in this repo).
-- Recorded here for history; running it again is harmless.

-- The teammate directory view is read-only for signed-in users; it carries no write or anonymous access.
revoke insert, update, delete, truncate, references, trigger on public.teammates_directory from anon, authenticated, public;
revoke select on public.teammates_directory from anon, public;
grant select on public.teammates_directory to authenticated;

-- Pin search_path on the remaining elevated-privilege functions.
alter function public.is_admin() set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.is_msg_member(uuid) set search_path = public, pg_temp;
alter function public.bump_thread_reply_meta() set search_path = public, pg_temp;
