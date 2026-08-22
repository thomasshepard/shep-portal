-- FBM Distance Scoring — pg_cron job
-- Runs every 5 minutes and calls the score-fbm-distances edge function.
--
-- Prerequisites:
--   1. pg_cron extension enabled in Supabase (Dashboard → Database → Extensions)
--   2. pg_net extension enabled (already done — see 20260414231018_enable_pgnet_and_notification_trigger.sql)
--   3. score-fbm-distances edge function deployed: supabase functions deploy score-fbm-distances
--      (deployed WITH jwt verification — fine here since the function does
--      no per-user auth of its own, and the anon key below isn't a secret)
--
-- Run this file in the Supabase SQL editor (not via supabase db push).
--
-- To unschedule: SELECT cron.unschedule('score-fbm-distances');
--
-- 2026-08-22 fix: this job had never actually succeeded even once since it
-- was first scheduled — two separate bugs, both also present in (and fixed
-- alongside) the bookkeeping-sync-feed job:
--   1. Missing `apikey` header — Supabase's Functions gateway needs it to
--      route the request to a function at all. Without it every call
--      404'd with "Requested function was not found" before ever reaching
--      this function's code.
--   2. score-fbm-distances itself had never actually been deployed to this
--      project (the source existed locally, just never shipped) — so even
--      with routing fixed there was nothing there to route to until now.

select cron.schedule(
  'score-fbm-distances',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := 'https://zhboqhhjijktsanxhwjv.supabase.co/functions/v1/score-fbm-distances',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYm9xaGhqaWprdHNhbnhod2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgxNTAsImV4cCI6MjA4ODczNDE1MH0.LC_sE9nWjgguGB5_8cbYz88btqBfjJU4AyoK7FafrvU',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYm9xaGhqaWprdHNhbnhod2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgxNTAsImV4cCI6MjA4ODczNDE1MH0.LC_sE9nWjgguGB5_8cbYz88btqBfjJU4AyoK7FafrvU'
      ),
      body    := '{}'::jsonb
    )
  $$
);
