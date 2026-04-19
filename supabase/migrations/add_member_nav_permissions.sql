ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_view_tasks      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_recipes    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_tools      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_files      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_listings   boolean NOT NULL DEFAULT false;
