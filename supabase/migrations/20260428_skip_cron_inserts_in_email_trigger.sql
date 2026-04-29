-- Replace the per-notification email trigger so that:
--   1. Cron-batch inserts (created_by_cron=true) are skipped — those go in the daily digest.
--   2. Only action_needed and critical fire immediately.
-- The anon key below is reused from 20260414231103_fix_notification_trigger_net_schema.sql.

DROP TRIGGER IF EXISTS on_notification_insert_send_email ON public.notifications;
DROP FUNCTION IF EXISTS public.trigger_notification_email();

CREATE OR REPLACE FUNCTION public.trigger_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Cron-batch inserts are bundled into the daily digest — skip individual email.
  IF NEW.created_by_cron = true THEN RETURN NEW; END IF;
  -- Only email action_needed and critical; info is in-app only.
  IF NEW.severity NOT IN ('action_needed', 'critical') THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url     := 'https://zhboqhhjijktsanxhwjv.supabase.co/functions/v1/send-notification-email',
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
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_notification_insert_send_email
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_notification_email();
