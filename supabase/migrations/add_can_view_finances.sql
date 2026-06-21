-- Adds the can_view_finances permission flag used by the Finances page
-- (src/pages/Finances.jsx, route /finances, PermRoute permission="can_view_finances").
-- Run once in the Supabase SQL editor.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_view_finances boolean NOT NULL DEFAULT false;
