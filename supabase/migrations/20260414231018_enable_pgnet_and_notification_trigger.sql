-- Enable pg_net extension (required for HTTP calls from triggers)
create extension if not exists pg_net schema extensions;

-- Drop and recreate the trigger function using the correct extensions.http_post path
drop trigger if exists on_notification_insert_send_email on public.notifications;
drop function if exists public.trigger_notification_email();

create or replace function public.trigger_notification_email()
returns trigger
language plpgsql
security definer
as $$
begin
  perform extensions.http_post(
    url     := 'https://zhboqhhjijktsanxhwjv.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYm9xaGhqaWprdHNhbnhod2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgxNTAsImV4cCI6MjA4ODczNDE1MH0.LC_sE9nWjgguGB5_8cbYz88btqBfjJU4AyoK7FafrvU'
    ),
    body    := jsonb_build_object(
      'type',   TG_OP,
      'table',  TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', row_to_json(NEW)
    )
  );
  return NEW;
end;
$$;

create trigger on_notification_insert_send_email
  after insert on public.notifications
  for each row
  execute function public.trigger_notification_email();
