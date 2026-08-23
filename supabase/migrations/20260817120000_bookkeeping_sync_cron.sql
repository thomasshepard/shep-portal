-- Bookkeeping — pg_cron job for automatic daily bank feed sync
-- Runs once a day and calls the bookkeeping edge function's
-- sync_feed_transactions action for every active SimpleFin claim, so nobody
-- has to remember to click "Sync now" for new transactions to show up.
-- SimpleFin itself only refreshes daily, so once a day is enough — matches
-- the score-fbm-distances precedent (20260427_fbm_distance_cron.sql) but at
-- a daily cadence instead of every 5 minutes.
--
-- Auth: the bookkeeping edge function is deployed WITH jwt verification, so
-- the anon key below only satisfies the platform-level JWT check (same
-- public value as every other cron job in this repo) — it carries no real
-- user session. The function's own logic authenticates this specific
-- request via the x-cron-key header instead, checked against the
-- BOOKKEEPING_CRON_KEY secret (see supabase/functions/bookkeeping/index.ts),
-- and that path is hard-restricted to only ever call sync_feed_transactions.
--
-- The cron key itself is never committed to git — it's stored encrypted in
-- Supabase Vault and looked up at call time via vault.decrypted_secrets.
--
-- Prerequisites (one-time, run by hand in the SQL editor — NOT part of this
-- migration, since it needs the real secret value):
--   select vault.create_secret('<the same value passed to
--     supabase secrets set BOOKKEEPING_CRON_KEY=...>', 'bookkeeping_cron_key');
--
-- To unschedule: SELECT cron.unschedule('bookkeeping-sync-feed');
--
-- 2026-08-22 fix: the original version of this job (and score-fbm-distances'
-- own job, which predates it) was missing the `apikey` header. Supabase's
-- Functions gateway needs that header to route the request to a function at
-- all — without it every single scheduled call 404'd with "Requested
-- function was not found" before ever reaching this function's code, for
-- every single run since this job was first scheduled. `Authorization`
-- alone isn't enough. Also added an explicit timeout_milliseconds — syncing
-- several bank claims routinely takes longer than pg_net's 5s default,
-- which was silently timing the caller out even on a successful sync (the
-- sync itself completes server-side regardless — verified via
-- bk_feed_claims.last_synced_at — but the cron log looked like a failure).

select cron.schedule(
  'bookkeeping-sync-feed',
  '0 11 * * *',
  $$
    select net.http_post(
      url     := 'https://zhboqhhjijktsanxhwjv.supabase.co/functions/v1/bookkeeping',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYm9xaGhqaWprdHNhbnhod2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgxNTAsImV4cCI6MjA4ODczNDE1MH0.LC_sE9nWjgguGB5_8cbYz88btqBfjJU4AyoK7FafrvU',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYm9xaGhqaWprdHNhbnhod2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgxNTAsImV4cCI6MjA4ODczNDE1MH0.LC_sE9nWjgguGB5_8cbYz88btqBfjJU4AyoK7FafrvU',
        'x-cron-key',    (select decrypted_secret from vault.decrypted_secrets where name = 'bookkeeping_cron_key')
      ),
      body    := '{"action": "sync_feed_transactions"}'::jsonb,
      timeout_milliseconds := 60000
    )
  $$
);
