-- Wires new messages to push notifications so a DM/group message shows up as a
-- standard iOS push (via the PWA installed to the Home Screen) without anyone
-- needing to have Shep Portal open. Reuses send-push-notification (extended to
-- branch on payload.table) — same trigger shape as
-- 20260414231103_fix_notification_trigger_net_schema.sql.

alter table public.notification_preferences
  add column if not exists mod_messages      boolean not null default true,
  add column if not exists delivery_messages text     not null default 'instant'
    check (delivery_messages in ('instant','digest','off'));

create or replace function public.trigger_message_push()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url     := 'https://zhboqhhjijktsanxhwjv.supabase.co/functions/v1/send-push-notification',
    body    := jsonb_build_object(
      'type',   TG_OP,
      'table',  TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', row_to_json(NEW)
    ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoYm9xaGhqaWprdHNhbnhod2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTgxNTAsImV4cCI6MjA4ODczNDE1MH0.LC_sE9nWjgguGB5_8cbYz88btqBfjJU4AyoK7FafrvU'
    )
  );
  return NEW;
end;
$$;

drop trigger if exists on_message_insert_send_push on public.msg_messages;
create trigger on_message_insert_send_push
  after insert on public.msg_messages
  for each row
  execute function public.trigger_message_push();
