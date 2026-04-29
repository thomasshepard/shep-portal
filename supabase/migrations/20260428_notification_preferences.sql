-- ── Extend notifications table with new columns ──────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category        TEXT,
  ADD COLUMN IF NOT EXISTS created_by_cron BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS snoozed_until   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at      TIMESTAMPTZ;

-- ── Cron idempotency guard (Step 8g) ─────────────────────────────────────────
-- Prevents duplicate runs when GitHub Actions retries or double-triggers.
CREATE TABLE IF NOT EXISTS public.cron_runs (
  job_name    TEXT        PRIMARY KEY,
  last_ran_at TIMESTAMPTZ NOT NULL
);

-- ── Per-user notification preferences ─────────────────────────────────────────
-- Smart defaults: instant for tasks/properties/alerts/system (real interruptions
-- the user needs to act on immediately); digest for incubator/chickens/documents/
-- llcs/happy_cuts (recurring batch work that bundles well into the 7am summary).
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Channel master switches
  email_enabled      BOOLEAN NOT NULL DEFAULT true,
  push_enabled       BOOLEAN NOT NULL DEFAULT true,

  -- Per-module receive toggles (false = mute that module entirely)
  mod_tasks          BOOLEAN NOT NULL DEFAULT true,
  mod_happy_cuts     BOOLEAN NOT NULL DEFAULT true,
  mod_properties     BOOLEAN NOT NULL DEFAULT true,
  mod_incubator      BOOLEAN NOT NULL DEFAULT true,
  mod_chickens       BOOLEAN NOT NULL DEFAULT true,
  mod_documents      BOOLEAN NOT NULL DEFAULT true,
  mod_llcs           BOOLEAN NOT NULL DEFAULT true,
  mod_alerts         BOOLEAN NOT NULL DEFAULT true,
  mod_system         BOOLEAN NOT NULL DEFAULT true,

  -- Per-category email delivery mode: 'instant' | 'digest' | 'off'
  -- 'digest' suppresses per-notification emails; bundled into 7am summary instead.
  -- 'critical' severity always emails immediately regardless of delivery mode.
  delivery_tasks       TEXT NOT NULL DEFAULT 'instant' CHECK (delivery_tasks       IN ('instant','digest','off')),
  delivery_happy_cuts  TEXT NOT NULL DEFAULT 'digest'  CHECK (delivery_happy_cuts  IN ('instant','digest','off')),
  delivery_properties  TEXT NOT NULL DEFAULT 'instant' CHECK (delivery_properties  IN ('instant','digest','off')),
  delivery_incubator   TEXT NOT NULL DEFAULT 'digest'  CHECK (delivery_incubator   IN ('instant','digest','off')),
  delivery_chickens    TEXT NOT NULL DEFAULT 'digest'  CHECK (delivery_chickens    IN ('instant','digest','off')),
  delivery_documents   TEXT NOT NULL DEFAULT 'digest'  CHECK (delivery_documents   IN ('instant','digest','off')),
  delivery_llcs        TEXT NOT NULL DEFAULT 'digest'  CHECK (delivery_llcs        IN ('instant','digest','off')),
  delivery_alerts      TEXT NOT NULL DEFAULT 'instant' CHECK (delivery_alerts      IN ('instant','digest','off')),
  delivery_system      TEXT NOT NULL DEFAULT 'instant' CHECK (delivery_system      IN ('instant','digest','off')),

  -- Vacation mode: while set to a future timestamp, non-critical emails and push
  -- are suppressed. In-app notifications still appear so nothing is lost.
  paused_until         TIMESTAMPTZ,

  -- Quiet hours (24-hour clock, 0-23, in user's local timezone).
  -- critical severity bypasses quiet hours.
  quiet_hours_start    SMALLINT CHECK (quiet_hours_start BETWEEN 0 AND 23),
  quiet_hours_end      SMALLINT CHECK (quiet_hours_end   BETWEEN 0 AND 23),
  timezone             TEXT NOT NULL DEFAULT 'America/Chicago',

  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read prefs. Required so notify() can check
-- other users' module mutes before inserting on their behalf (e.g., admin
-- assigns a task to Janine and needs to know if Janine muted tasks).
CREATE POLICY "Authenticated read prefs"
  ON public.notification_preferences FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users insert own prefs"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own prefs"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- ── Task comments (Step 5c) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    TEXT        NOT NULL,
  author_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       TEXT        NOT NULL,
  mentions   UUID[]      NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON public.task_comments(task_id, created_at);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read comments"
  ON public.task_comments FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Author insert comment"
  ON public.task_comments FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Author delete own comment"
  ON public.task_comments FOR DELETE USING (auth.uid() = author_id);
