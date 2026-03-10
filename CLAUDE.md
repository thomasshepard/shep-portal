# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start local dev server (http://localhost:5173/shep-portal/)
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

## Architecture

**React + Vite SPA** deployed to GitHub Pages. Uses `HashRouter` (not BrowserRouter) — all routes are hash-based (`/#/dashboard`). The Vite `base` is set to `/shep-portal/`.

**Auth flow**: `AuthProvider` (in `src/hooks/useAuth.jsx`) wraps the entire app and manages Supabase session state via `onAuthStateChange`. It also fetches the user's `profiles` row to determine role. `ProtectedRoute` and `AdminRoute` components gate access.

**Access logging**: `useAccessLog` hook inserts to `access_logs` table. It fires on every route change from `Layout.jsx`'s `useEffect` watching `location.pathname`, and also on explicit events (login, logout, file download).

**Key data flows**:
- Properties → `properties` table + Supabase Storage (`property-photos/<id>/`, `property-docs/<id>/`)
- Tools/Custom HTML → `pages` table; rendered via sandboxed `<iframe srcdoc>` in `ToolView.jsx`
- Files → Supabase Storage bucket `shared-files` with folder-style path navigation
- Admin sections read from `profiles` and `access_logs` tables (RLS-restricted to admin role)

**Environment**: `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never commit `.env`.

**Database setup**: Run `supabase-setup.sql` in the Supabase SQL editor to create all tables, RLS policies, and triggers.

## Key Files

- `src/lib/supabase.js` — Supabase client initialization
- `src/hooks/useAuth.jsx` — Auth context + session + profile + isAdmin
- `src/hooks/useAccessLog.js` — Logging hook
- `src/components/Layout.jsx` — Shell with sidebar + header + route-change logging
- `src/App.jsx` — Router and route definitions
- `supabase-setup.sql` — Full database schema, RLS policies, and triggers
- `.github/workflows/deploy.yml` — GitHub Actions: build + deploy to `gh-pages` branch

## Deployment

The GitHub Actions workflow requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set as repository secrets. The PAT used to push must have the `workflow` scope to push `.github/workflows/` files.
