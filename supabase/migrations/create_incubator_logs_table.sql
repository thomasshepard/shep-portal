CREATE TABLE IF NOT EXISTS public.incubator_logs (
  id           UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id     TEXT    NOT NULL,  -- Airtable record ID (e.g. recXXXXXXXXXXXXXX)
  log_date     DATE    NOT NULL,
  day_number   INT,
  temp_f       NUMERIC(5,2),
  humidity_pct INT,
  eggs_turned  BOOLEAN DEFAULT true,
  notes        TEXT,
  created_by   UUID    REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(batch_id, log_date)
);

CREATE INDEX idx_incubator_logs_batch ON public.incubator_logs(batch_id);

ALTER TABLE public.incubator_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view incubator logs"
  ON public.incubator_logs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert incubator logs"
  ON public.incubator_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update incubator logs"
  ON public.incubator_logs FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete incubator logs"
  ON public.incubator_logs FOR DELETE
  USING (auth.role() = 'authenticated');
