CREATE TABLE IF NOT EXISTS public.notifications (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  body           TEXT,
  module         TEXT        NOT NULL,
  -- module values: 'happy_cuts' | 'properties' | 'incubator' | 'chickens' | 'documents' | 'llcs' | 'alerts' | 'system'
  severity       TEXT        NOT NULL DEFAULT 'info',
  -- severity values: 'critical' | 'action_needed' | 'info'
  action_url     TEXT,
  -- hash route e.g. '/#/happy-cuts' — used for navigation on tap
  source_key     TEXT,
  -- dedup key e.g. 'incubator:recXXX:candle7' — prevents duplicate notifications
  read           BOOLEAN     DEFAULT false,
  read_at        TIMESTAMPTZ,
  dismissed      BOOLEAN     DEFAULT false,
  dismissed_at   TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  -- set on time-sensitive notifications so they don't accumulate after the moment passes
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user_id     ON public.notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read)       WHERE read = false;
CREATE INDEX idx_notifications_source_key  ON public.notifications(source_key)          WHERE source_key IS NOT NULL;
CREATE INDEX idx_notifications_active      ON public.notifications(user_id, dismissed)  WHERE dismissed = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users see only their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can mark read / dismissed on their own notifications
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Authenticated users can notify other users (e.g. maintenance request notifying admins)
-- Tightened: only allows inserting for own user_id OR service_role bypasses RLS entirely
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
