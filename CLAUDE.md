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
- **admin** — everything (including Happy Cuts, admin panel)
- **va** (Virtual Assistant) — properties, tenants, leases, payments, maintenance, utilities, bills, deals. No financials, LLCs, chickens, or admin panel.
- **member** — read-only views gated by individual flags: `can_view_properties`, `can_view_llcs`, `can_view_chickens`, `can_view_documents`, `can_view_deals`

Permission flags in `useAuth.jsx`:
- `properties` — admin, VA, or `can_view_properties`
- `llcs` — admin or `can_view_llcs`
- `chickens` — admin or `can_view_chickens`
- `documents` — admin or `can_view_documents`
- `deals` — admin, VA, or `can_view_deals`
- `editTenants` / `manageMaintenance` / `logPayments` — admin or VA

Documents have an additional visibility layer: non-admin users only see docs whose tags intersect with their `allowed_tags` array in `profiles`.

### Data Sources

**Supabase** — auth, database, file storage, access logging.
- Tables: `profiles`, `access_logs`, `properties` (read-only from portal), `pages` (custom HTML tools)
- Storage buckets: `property-photos` (public), `property-docs` (private), `shared-files` (private)
- Edge Functions: `delete-user` (deployed with `--no-verify-jwt`), `generate-feeding-schedule` (chicken feeding schedule generator — deterministic math, no LLM; requires `AIRTABLE_PAT` Supabase secret)
- RLS is strict; admin access uses the `is_admin()` helper function defined in `supabase-setup.sql`
- Run `supabase-setup.sql` once in the Supabase SQL editor to create all tables, RLS policies, and triggers

**Airtable** — all business data. Client wrapper is `src/lib/airtable.js` (fetchAllRecords, createRecord, updateRecord, deleteRecord + formatters).

| Base | Env Var | Purpose |
|------|---------|---------|
| Property Management | `VITE_AIRTABLE_PM_BASE_ID` | Properties, units, leases, tenants, payments, maintenance, loans, utilities, bills, P&L, alerts |
| Shepard Owned Companies | `VITE_AIRTABLE_BASE_ID` | LLC tracking, compliance logs |
| Chicken Farm | `VITE_AIRTABLE_CHICKENS_BASE_ID` | Flocks, feeding schedules, mortality, expenses, breed profiles |
| Desk Paper Cleanup | `VITE_AIRTABLE_DOCS_BASE_ID` | Scanned document metadata (date, AI summary, tags, shared status) |
| FB Marketplace Monitor | Hardcoded as `FBM_BASE_ID` in `airtable.js` | FB Marketplace deal listings |
| Happy Cuts | `VITE_AIRTABLE_HAPPY_CUTS_BASE_ID` | Lawn care CRM — contacts, mow schedule |
| Bitcoin Transactions | `VITE_AIRTABLE_BTC_BASE_ID` (`appLvE5luEWaM5dWe`) | BTC purchase log, wallet transfers, ACH records |

> The Chicken Farm base ID (`apppIiT84EaowkQVR`) uses a capital **I** in position 4 — easy to misread as lowercase l.

**Supabase Edge Function `generate-feeding-schedule`** — generates and recalculates chicken feeding schedules. Called from `Chickens.jsx` (new flock) and `FlockDetail.jsx` (mortality-driven recalculate or manual trigger). Accepts the same JSON payload shape: `{ action, flockId, flockName, hatchDate, birdCount/newBirdCount, targetWeeks, breed, version, schedule[] }`. All math is deterministic (oz × birds ÷ 12) — no LLM involved. Requires `AIRTABLE_PAT` as a Supabase secret.

**Claude API** — used client-side (`VITE_ANTHROPIC_API_KEY`) for AI summaries in Documents and HappyCuts pages.

### Pages & Routes

| Route | Page | Guard | Description |
|-------|------|-------|-------------|
| `/dashboard` | Dashboard | ProtectedRoute | Stats overview |
| `/properties` | Properties | PermRoute(properties) | PM dashboard |
| `/properties/:id` | PropertyDetail | PermRoute(properties) | Property detail with units, leases, tenants |
| `/llcs` | LLCs | PermRoute(llcs) | LLC tracker |
| `/llcs/:id` | LLCDetail | PermRoute(llcs) | LLC detail with compliance log |
| `/chickens` | Chickens | PermRoute(chickens) | Flock dashboard |
| `/chickens/:id` | FlockDetail | PermRoute(chickens) | Flock detail with schedule, mortality, expenses |
| `/chickens/incubator-guide` | ChickenIncubatorGuide | PermRoute(chickens) | Incubator phase targets and candling schedule |
| `/documents` | Documents | PermRoute(documents) | Scanned document browser with AI summaries |
| `/deals` | Deals | PermRoute(deals) | FB Marketplace deal listings |
| `/deals/search-criteria` | DealsSearchCriteria | PermRoute(deals) | Manage search items for FB Marketplace monitor |
| `/happy-cuts` | HappyCuts | AdminRoute | Lawn care CRM dashboard |
| `/happy-cuts/client/:id` | HappyCutsClientDetail | AdminRoute | Client detail with mow history |
| `/happy-cuts/guide` | HappyCutsGuide | AdminRoute | Pricing/service guide |
| `/tools` | Tools | ProtectedRoute | Custom HTML tools |
| `/tools/:slug` | ToolView | ProtectedRoute | Sandboxed iframe tool |
| `/files` | Files | ProtectedRoute | Supabase Storage file browser |
| `/notifications` | Notifications | ProtectedRoute | In-app notification inbox |
| `/tasks` | Tasks | ProtectedRoute | Personal task manager (all authenticated users) |
| `/bitcoin` | Bitcoin | AdminRoute | BTC purchase + wallet transfer workflow with edit/delete history |
| `/admin/*` | AdminUsers/Logs/Content | AdminRoute | User mgmt, access logs, content |
| `/maintenance-request` | MaintenanceSubmit | **None (public)** | Tenant-facing maintenance request form |

### Key Data Flow Patterns

- **Properties** → Airtable PM base + Supabase Storage (`property-photos/<id>/`, `property-docs/<id>/`). Property records are read-only from the portal — never create or delete them.
- **Chickens** → Airtable Chicken Farm base + `generate-feeding-schedule` Supabase edge function for schedule generation/recalculation
- **Lease is the central linking record** in the PM hierarchy: Property → Unit → Lease ← Tenant / Payments
- **Deals** → Airtable FB Marketplace base (`FBM_BASE_ID`, hardcoded in `airtable.js`)
- **Happy Cuts** → Airtable Happy Cuts base, has its own field ID constants in `HappyCuts.jsx` / `HappyCutsClientDetail.jsx`
- **Documents** → Airtable Desk Paper Cleanup base + `DocumentActionCenter` component for AI-classified action items
- **Custom tools** → `pages` table in Supabase; rendered in a sandboxed `<iframe srcdoc>` in `ToolView.jsx`
- **Files** → Supabase Storage `shared-files` bucket with folder-style path navigation
- **Bitcoin** → Airtable Bitcoin Transactions base (`BTC_BASE_ID`). Four tables: RH Purchases (`tblg0eLNtJQPtikRb`), RH to Shep (`tblNY2hBqThOmNRky`), Bitcoin Purchase / Shep→LC (`tblAmFoRWXRLjNPHj`), LC to Janine (`tblz9xROlto0R2xCz`), LC to Robinhood / ACH (`tblK0E5G4wGQO6Yu1`). **Critical:** `record.fields` from the Airtable API is keyed by field NAME not field ID — write payloads use field IDs (fldXXX), reads use name strings. The Bitcoin Purchase BTC amount field name is `'Bitcoin Calc by coinbaise'` (intentional typo in Airtable — do not correct).
- **Admin** → `profiles` + `access_logs` tables (RLS-restricted to admin)

### Access Logging

`useAccessLog` hook inserts to `access_logs`. It fires automatically on every route change (via `useEffect` in `Layout.jsx` watching `location.pathname`) and also on explicit events (login, logout, file download).

## Coding Rules

- **Safe Airtable field access** — Each page defines its own local `safeStr()`, `safeNum()`, `safeRender()`, and `arr()` helpers. These are NOT shared exports — they are copy-pasted per page. When creating new pages that read Airtable data, define these locally:
  - `safeStr(val, fallback)` — safe string rendering for JSX
  - `safeNum(val)` — safe numeric extraction
  - `arr(v)` — `Array.isArray(v) ? v : []`
- Always pass `typecast: true` in Airtable create/update calls
- Linked record fields must be a string array: `["recXXXXXXXXXXXXXX"]`
- For user creation, always UPDATE (not upsert/insert) the `profiles` row
- Property records are **read-only** from the portal — never create or delete them
- Happy Cuts uses its own field ID constants (`CF`, `SF`) defined at the top of `HappyCuts.jsx` and `HappyCutsClientDetail.jsx`

### Chicken Feed Math

- Quarts Per Day = `(oz_per_bird × bird_count) ÷ 12` (dry feed volume, not liquid)
- Cornish Cross defaults: 8-week growing period, oz/bird/day per week: `[0.66, 0.97, 1.48, 2.07, 2.79, 3.11, 2.73, 2.30]`

### Incubator Phase Targets (MeeF 28-Egg Incubator)

Batches are **species-aware** (chicken or duck). All per-species cycle lengths, lockdown days, and phase temp/humidity/turning targets live in **`src/lib/incubation.js`** (`SPECIES` map + `getSpecies(fields)`, `phaseForDay`, `targetsForDay`, `phaseName`). The three incubator pages (`ChickenIncubator.jsx`, `ChickenBatchDetail.jsx`, `ChickenIncubatorGuide.jsx`) all read from this config — don't hardcode day/temp values in those files. Candling days are Day 7 and Day 14 for both species. Species is stored in the Airtable `Species` singleSelect field on the Incubator Batches table (`tblKomWeHkj9aGFDC`); missing/legacy values default to Chicken. A batch's species can be changed retroactively in the batch detail edit form.

**Chicken — 21 days, lockdown Day 18** (do NOT revert to the old 99–99.5°F single-range values):

| Phase | Days | Temp (°F) | Humidity | Turning |
|-------|------|-----------|----------|---------|
| Early Development | 1–7   | 100.0–100.5°F | 50–60% | ON |
| Growth Phase      | 8–14  | 100.0–100.5°F | 45–55% | ON |
| Final Growth      | 15–17 | 100.0°F       | 45–55% | ON |
| Lockdown & Hatch  | 18–21 | 99.5–100°F    | 65–75% | OFF (stop at Day 18) |

**Duck — 28 days, lockdown Day 26:**

| Phase | Days | Temp (°F) | Humidity | Turning |
|-------|------|-----------|----------|---------|
| Incubation        | 1–25  | 99.5°F | 45–55% | ON |
| Lockdown & Hatch  | 26–28 | 99.5°F | 65–75% | OFF (stop at Day 26) |

Candling schedule: Day 4–5 (optional), Day 7 (first real — remove clears/quitters), Day 10–11 (remove non-developing), then a final candle before lockdown (Day 17 chicken / Day 25 duck).

### Notifications

`notify()` in `src/lib/notifications.js` inserts to the Supabase `notifications` table and deduplicates via `sourceKey`. Valid `module` values: `'happy_cuts' | 'properties' | 'incubator' | 'chickens' | 'documents' | 'llcs' | 'alerts' | 'system'`. Valid `severity` values: `'critical' | 'action_needed' | 'info'` (default `'info'`).

A `pg_net` trigger fires the `send-notification-email` Supabase edge function on every `notifications` insert. To disable email for a specific notification, there is no flag — the edge function handles filtering.

## Key Files

- `src/lib/supabase.js` — Supabase client initialization
- `src/lib/airtable.js` — Airtable wrapper (fetchAllRecords, createRecord, updateRecord, deleteRecord) + formatters (`fmtCurrency`, `fmtPercent`, `fmtDate`, `fmtField`) + base ID exports (`PM_BASE_ID`, `CHICKENS_BASE_ID`, `DOCS_BASE_ID`, `FBM_BASE_ID`, `BTC_BASE_ID`)
- `src/pages/Bitcoin.jsx` — Bitcoin tracker (admin-only). All field ID constants (`RHF`, `BPF`, `LCJF`, `LCRHF`, `RHPF`) are for writes only. Separate `*_READ` objects use field name strings for reading `record.fields`. Contains `RecentActivityPanel` (collapsible on mobile, sticky on desktop) and `EditModal` (edit/delete past transactions).
- `src/lib/incubation.js` — Species config for the incubator (`SPECIES` map: chicken/duck cycle length, lockdown day, phase targets) + `getSpecies(fields)`, `phaseForDay`, `targetsForDay`, `phaseName`. Shared by `ChickenIncubator.jsx`, `ChickenBatchDetail.jsx`, and `ChickenIncubatorGuide.jsx`.
- `src/lib/tasks.js` — Tasks CRUD (fetchTasks, createTask, updateTask, deleteTask, taskExistsForSourceKey) + `FIELDS` constants for the Tasks Airtable base (`appYVLCn1NVLevdry`, table `tbl3Di18kSLwEj1vN`)
- `src/lib/notifications.js` — `notify()` helper (inserts to Supabase `notifications` table with dedup via `sourceKey`), `getAdminUserIds()`, `getUserIdsWithPermission(flag)`. Call these from feature code to push in-app alerts.
- `src/hooks/useAuth.jsx` — Auth context: session, profile, role, isAdmin, isVA, permissions
- `src/hooks/useAccessLog.js` — Audit log hook
- `src/hooks/useAlerts.js` — Alert system hook (computed from PM base data + Airtable "Alerts" table)
- `src/hooks/useNotifications.jsx` — Fetches `notifications` table for the current user; subscribes via Supabase Realtime for live inserts; exposes `markRead`, `markAllRead`, `dismiss`, `dismissAll`
- `src/components/Layout.jsx` — Shell with sidebar + header + route-change logging
- `src/components/Sidebar.jsx` — Navigation sidebar (permission-gated items)
- `src/components/DocumentActionCenter.jsx` — AI-classified document action items
- `src/App.jsx` — Router and all route definitions
- `supabase-setup.sql` — Full database schema, RLS policies, triggers
- `supabase/migrations/create_notifications_table.sql` — Run once in Supabase SQL editor to create the `notifications` table
- `supabase/migrations/create_incubator_logs_table.sql` — Run once to create the `incubator_logs` table (stores daily temp/humidity readings per batch, one row per date)
- `supabase/migrations/20260414*.sql` — Four migrations that set up the `send-notification-email` edge function and `pg_net` trigger; run them in order in the Supabase SQL editor. Requires `pg_net` extension enabled in Supabase.
- `.github/workflows/deploy.yml` — GitHub Actions: build + deploy to `gh-pages` branch

> `ChickenIncubator.jsx` is **not a standalone route** — it is a panel rendered inside the Chickens page for managing egg batches. `ChickenBatchDetail.jsx` is a sub-view rendered inside `ChickenIncubator.jsx` for a single batch (candling log, daily readings, hatch results).

## Environment Variables

All `VITE_*` vars must also exist as GitHub repo secrets and be wired into `deploy.yml`.

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_AIRTABLE_PAT                    # Single PAT covering all Airtable bases
VITE_AIRTABLE_BASE_ID                # Shepard Owned Companies (LLCs)
VITE_AIRTABLE_PM_BASE_ID             # Property Management
VITE_AIRTABLE_CHICKENS_BASE_ID       # Chicken Farm
VITE_AIRTABLE_DOCS_BASE_ID           # Desk Paper Cleanup
VITE_AIRTABLE_HAPPY_CUTS_BASE_ID     # Happy Cuts lawn care
VITE_ANTHROPIC_API_KEY               # Claude API for AI summaries
VITE_GOOGLE_CLIENT_ID                # Google OAuth (if applicable)
VITE_TASKS_BASE_ID=appYVLCn1NVLevdry # Shep Portal – Tasks Airtable base
VITE_RENTCAST_API_KEY               # Rentcast API key for rental market estimates (used by RentalAnalyzer)
VITE_AIRTABLE_BTC_BASE_ID           # Bitcoin Transactions Airtable base (appLvE5luEWaM5dWe)
```

> Note: `FBM_BASE_ID` (FB Marketplace Monitor) is hardcoded in `src/lib/airtable.js`, not in `.env`.

## Deployment

Push to `main` triggers GitHub Actions to build and deploy `dist/` to the `gh-pages` branch. The workflow uses `actions/deploy-pages@v4` with OIDC token auth. The PAT used to push `.github/workflows/` files must have the `workflow` scope.
