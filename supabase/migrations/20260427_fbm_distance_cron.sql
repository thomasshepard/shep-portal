-- FBM Distance Scoring — pg_cron job
-- Runs every 5 minutes and calls the score-fbm-distances edge function.
--
-- Prerequisites:
--   1. pg_cron extension enabled in Supabase (Dashboard → Database → Extensions)
--   2. pg_net extension enabled (already done — see 20260414231018_enable_pgnet_and_notification_trigger.sql)
--   3. score-fbm-distances edge function deployed:
--        supabase functions deploy score-fbm-distances --no-verify-jwt
--   4. Secrets set in Supabase:
--        supabase secrets set AIRTABLE_PAT=<value>
--        supabase secrets set GOOGLE_MAPS_API_KEY=<value>
--
-- Run this file in the Supabase SQL editor (not via supabase db push).
--
-- To unschedule: SELECT cron.unschedule('score-fbm-distances');

select cron.schedule(
  'score-fbm-distances',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := 'https://zhboqhhjijktsanxhwjv.supabase.co/functions/v1/score-fbm-distances',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYm9xaGhqaWprdHNhbnhod2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgxNTAsImV4cCI6MjA4ODczNDE1MH0.LC_sE9nWjgguGB5_8cbYz88btqBfjJU4AyoK7FafrvU'
      ),
      body    := '{}'::jsonb
    )
  $$
);
