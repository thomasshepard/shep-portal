-- Local AI chat history — threads + messages for the Ollama-backed chat page
-- (src/pages/LocalAI.jsx). Cross-device sync (desktop + phone via Tailscale)
-- is the whole point, so history lives here rather than localStorage.

CREATE TABLE IF NOT EXISTS public.local_ai_threads (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL DEFAULT 'New conversation',
  -- auto-set from the first ~40 chars of the first user message; editable later if wanted
  model       TEXT        NOT NULL DEFAULT 'qwen2.5:3b',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.local_ai_messages (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id   UUID        NOT NULL REFERENCES public.local_ai_threads(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_local_ai_threads_user_id    ON public.local_ai_threads(user_id, updated_at DESC);
CREATE INDEX idx_local_ai_messages_thread_id ON public.local_ai_messages(thread_id, created_at);

ALTER TABLE public.local_ai_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_ai_messages ENABLE ROW LEVEL SECURITY;

-- Threads: strictly own-user only (this page is AdminRoute-gated anyway, but
-- scoping by user_id rather than is_admin() keeps it correct if that ever changes)
CREATE POLICY "Users manage own local_ai_threads"
  ON public.local_ai_threads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Messages: scoped through the parent thread's ownership
CREATE POLICY "Users manage own local_ai_messages"
  ON public.local_ai_messages FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.local_ai_threads t
    WHERE t.id = thread_id AND t.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.local_ai_threads t
    WHERE t.id = thread_id AND t.user_id = auth.uid()
  ));
