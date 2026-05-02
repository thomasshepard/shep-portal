-- ── Extend notification_preferences for Discord ──────────────────────────────
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS discord_enabled   BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS discord_user_id   TEXT,
  ADD COLUMN IF NOT EXISTS digest_enabled    BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digest_hour_local SMALLINT NOT NULL DEFAULT 7
       CHECK (digest_hour_local BETWEEN 0 AND 23);

-- delivery_<module> columns gain a 4th valid value: 'discord'.
ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_delivery_tasks_check;
ALTER TABLE public.notification_preferences ADD  CONSTRAINT notification_preferences_delivery_tasks_check
  CHECK (delivery_tasks IN ('instant','digest','off','discord'));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_delivery_happy_cuts_check;
ALTER TABLE public.notification_preferences ADD  CONSTRAINT notification_preferences_delivery_happy_cuts_check
  CHECK (delivery_happy_cuts IN ('instant','digest','off','discord'));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_delivery_properties_check;
ALTER TABLE public.notification_preferences ADD  CONSTRAINT notification_preferences_delivery_properties_check
  CHECK (delivery_properties IN ('instant','digest','off','discord'));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_delivery_incubator_check;
ALTER TABLE public.notification_preferences ADD  CONSTRAINT notification_preferences_delivery_incubator_check
  CHECK (delivery_incubator IN ('instant','digest','off','discord'));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_delivery_chickens_check;
ALTER TABLE public.notification_preferences ADD  CONSTRAINT notification_preferences_delivery_chickens_check
  CHECK (delivery_chickens IN ('instant','digest','off','discord'));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_delivery_documents_check;
ALTER TABLE public.notification_preferences ADD  CONSTRAINT notification_preferences_delivery_documents_check
  CHECK (delivery_documents IN ('instant','digest','off','discord'));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_delivery_llcs_check;
ALTER TABLE public.notification_preferences ADD  CONSTRAINT notification_preferences_delivery_llcs_check
  CHECK (delivery_llcs IN ('instant','digest','off','discord'));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_delivery_alerts_check;
ALTER TABLE public.notification_preferences ADD  CONSTRAINT notification_preferences_delivery_alerts_check
  CHECK (delivery_alerts IN ('instant','digest','off','discord'));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_delivery_system_check;
ALTER TABLE public.notification_preferences ADD  CONSTRAINT notification_preferences_delivery_system_check
  CHECK (delivery_system IN ('instant','digest','off','discord'));

-- ── Daily snapshots, so tomorrow's digest can compute deltas ─────────────────
CREATE TABLE IF NOT EXISTS public.daily_snapshots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE        NOT NULL,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot    JSONB       NOT NULL,
  digest_text TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, user_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_user_date ON public.daily_snapshots(user_id, date DESC);

ALTER TABLE public.daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own snapshots"
  ON public.daily_snapshots FOR SELECT USING (auth.uid() = user_id);

-- ── Discord action log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.discord_action_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_user_id TEXT,
  command         TEXT        NOT NULL,
  target          TEXT,
  payload         JSONB,
  result          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discord_action_log_user ON public.discord_action_log(user_id, created_at DESC);

ALTER TABLE public.discord_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own actions"
  ON public.discord_action_log FOR SELECT USING (auth.uid() = user_id);
