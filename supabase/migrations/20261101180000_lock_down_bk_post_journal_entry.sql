-- RLS-5 (Phase 4 follow-up, applied late — this was supposed to be pasted
-- into the SQL editor back in Phase 4 and never was).
--
-- bk_post_journal_entry() is `security definer` with no search_path pinned
-- (a search_path hijack risk for a definer function) and, by Postgres's
-- default grant, was executable directly by anon/authenticated via
-- PostgREST's RPC endpoint. Its only real caller is the `bookkeeping` edge
-- function, which uses the service_role client (supabase/functions/bookkeeping/index.ts)
-- — no client-side code calls this RPC directly.

alter function public.bk_post_journal_entry(uuid) set search_path = public, pg_temp;

revoke execute on function public.bk_post_journal_entry(uuid) from public, anon, authenticated;
grant execute on function public.bk_post_journal_entry(uuid) to service_role;
