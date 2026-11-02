-- Run by hand in the Supabase SQL editor (db push doesn't work in this repo).
-- The notification triggers and the FBM scoring cron call edge functions that
-- now check an x-cron-key header (see supabase/functions/_shared/cronAuth.ts).
-- The key is read from Vault at call time (same secret the bookkeeping cron
-- already uses) so no key value appears in this file. coalesce keeps a missing
-- secret from turning into a null header and breaking the INSERT that fired
-- the trigger. search_path is pinned while the functions are being replaced.

create or replace function public.trigger_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.created_by_cron = true then return new; end if;
  if new.severity not in ('action_needed', 'critical') then return new; end if;
  perform net.http_post(
    url     := 'https://zhboqhhjijktsanxhwjv.supabase.co/functions/v1/send-notification-email',
    body    := jsonb_build_object('type', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA, 'record', row_to_json(new)),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYm9xaGhqaWprdHNhbnhod2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgxNTAsImV4cCI6MjA4ODczNDE1MH0.LC_sE9nWjgguGB5_8cbYz88btqBfjJU4AyoK7FafrvU',
      'x-cron-key',    coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'bookkeeping_cron_key'), '')
    )
  );
  return new;
end;
$$;

create or replace function public.trigger_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform net.http_post(
    url     := 'https://zhboqhhjijktsanxhwjv.supabase.co/functions/v1/send-push-notification',
    body    := jsonb_build_object('type', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA, 'record', row_to_json(new)),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYm9xaGhqaWprdHNhbnhod2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgxNTAsImV4cCI6MjA4ODczNDE1MH0.LC_sE9nWjgguGB5_8cbYz88btqBfjJU4AyoK7FafrvU',
      'x-cron-key',    coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'bookkeeping_cron_key'), '')
    )
  );
  return new;
end;
$$;

select cron.alter_job(
  (select jobid from cron.job where jobname = 'score-fbm-distances'),
  command := $cmd$
    select net.http_post(
      url     := 'https://zhboqhhjijktsanxhwjv.supabase.co/functions/v1/score-fbm-distances',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYm9xaGhqaWprdHNhbnhod2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgxNTAsImV4cCI6MjA4ODczNDE1MH0.LC_sE9nWjgguGB5_8cbYz88btqBfjJU4AyoK7FafrvU',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYm9xaGhqaWprdHNhbnhod2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgxNTAsImV4cCI6MjA4ODczNDE1MH0.LC_sE9nWjgguGB5_8cbYz88btqBfjJU4AyoK7FafrvU',
        'x-cron-key',    coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'bookkeeping_cron_key'), '')
      ),
      body    := '{}'::jsonb
    )
  $cmd$
);
