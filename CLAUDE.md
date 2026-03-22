# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start local dev server (http://localhost:5173/shep-portal/)
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
npm run lint     # ESLint check
```

> Restart the dev server after editing `.env` — Vite does not hot-reload env vars.

No test runner is configured; testing is manual via the dev server.

## Architecture

**React + Vite SPA** deployed to GitHub Pages. Uses `HashRouter` (not BrowserRouter) — all routes are hash-based (`/#/dashboard`). Vite `base` is `/shep-portal/`.

### Auth & Access Control

`AuthProvider` (`src/hooks/useAuth.jsx`) wraps the entire app and manages Supabase session state via `onAuthStateChange`. It fetches the user's `profiles` row to determine role and permissions object.

Three route guard components:
- `ProtectedRoute` — must be authenticated
- `AdminRoute` — must be `role === 'admin'`
- `PermRoute` — must have a specific `permissions` flag set

Roles and what they can access:
- **admin** — everything
- **va** (Virtual Assistant) — properties, tenants, leases, payments, maintenance, utilities, bills. No financials, LLCs, chickens, or admin panel.
- **member** — read-only views gated by individual flags: `can_view_properties`, `can_view_llcs`, `can_view_chickens`, `can_view_documents`

Documents have an additional visibility layer: non-admin users only see docs whose tags intersect with their `allowed_tags` array in `profiles`.

### Data Sources

**Supabase** — auth, database, file storage, access logging.
- Tables: `profiles`, `access_logs`, `properties` (read-only from portal), `pages` (custom HTML tools)
- Storage buckets: `property-photos` (public), `property-docs` (private), `shared-files` (private)
- RLS is strict; admin access uses the `is_admin()` helper function defined in `supabase-setup.sql`
- Run `supabase-setup.sql` once in the Supabase SQL editor to create all tables, RLS policies, and triggers

**Airtable** — all business data. Client wrapper is `src/lib/airtable.js` (fetchAllRecords, createRecord, updateRecord, deleteRecord + formatters).

| Base | Env Var | Purpose |
|------|---------|---------|
| Property Management | `VITE_AIRTABLE_PM_BASE_ID` | Properties, units, leases, tenants, payments, maintenance, loans, utilities, bills, P&L |
| Shepard Owned Companies | `VITE_AIRTABLE_BASE_ID` | LLC tracking, compliance logs |
| Chicken Farm | `VITE_AIRTABLE_CHICKENS_BASE_ID` | Flocks, feeding schedules, mortality, expenses, breed profiles |
| Desk Paper Cleanup | `VITE_AIRTABLE_DOCS_BASE_ID` | Scanned document metadata (date, AI summary, tags, shared status) |

> The Chicken Farm base ID (`apppIiT84EaowkQVR`) uses a capital **I** in position 4 — easy to misread as lowercase l.

**n8n** — generates and recalculates chicken feeding schedules via webhook (`VITE_N8N_CHICKENS_WEBHOOK_URL`). Webhook actions: `generate_schedule` (new flock), `recalculate_schedule` (after mortality update). Payload must include the full schedule array.

### Key Data Flow Patterns

- **Properties** → Airtable PM base + Supabase Storage (`property-photos/<id>/`, `property-docs/<id>/`). Property records are read-only from the portal — never create or delete them.
- **Chickens** → Airtable Chicken Farm base + n8n webhook for schedule generation/recalculation
- **Lease is the central linking record** in the PM hierarchy: Property → Unit → Lease ← Tenant / Payments
- **Custom tools** → `pages` table in Supabase; rendered in a sandboxed `<iframe srcdoc>` in `ToolView.jsx`
- **Files** → Supabase Storage `shared-files` bucket with folder-style path navigation
- **Admin** → `profiles` + `access_logs` tables (RLS-restricted to admin)

### Access Logging

`useAccessLog` hook inserts to `access_logs`. It fires automatically on every route change (via `useEffect` in `Layout.jsx` watching `location.pathname`) and also on explicit events (login, logout, file download).

## Coding Rules

- Use `safeRender()` for **all** Airtable field values rendered in JSX
- Use `safeNum()` for numeric Airtable fields
- Wrap all array operations with `Array.isArray()` or the `arr()` helper from `airtable.js`
- Always pass `typecast: true` in Airtable create/update calls
- Linked record fields must be a string array: `["recXXXXXXXXXXXXXX"]`
- For user creation, always UPDATE (not upsert/insert) the `profiles` row

### Chicken Feed Math

- Quarts Per Day = `(oz_per_bird × bird_count) ÷ 12` (dry feed volume, not liquid)
- Cornish Cross defaults: 8-week growing period, oz/bird/day per week: `[0.66, 0.97, 1.48, 2.07, 2.79, 3.11, 2.73, 2.30]`

## Key Files

- `src/lib/supabase.js` — Supabase client initialization
- `src/lib/airtable.js` — Airtable wrapper + `safeRender`, `safeNum`, `arr`, `fmtCurrency`, `fmtDate`
- `src/hooks/useAuth.jsx` — Auth context, session, role, permissions
- `src/hooks/useAccessLog.js` — Audit log hook
- `src/hooks/useAlerts.js` — Alert system hook (Airtable "Alerts" table)
- `src/components/Layout.jsx` — Shell with sidebar + header + route-change logging
- `src/App.jsx` — Router and all route definitions
- `supabase-setup.sql` — Full database schema, RLS policies, triggers
- `.github/workflows/deploy.yml` — GitHub Actions: build + deploy to `gh-pages` branch

## Deployment

Push to `main` triggers GitHub Actions to build and deploy `dist/` to the `gh-pages` branch. Required repository secrets: all `VITE_*` env vars from `.env.example`. The PAT used to push `.github/workflows/` files must have the `workflow` scope.
