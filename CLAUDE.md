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
- **admin** — everything (including Bitcoin, admin panel)
- **va** (Virtual Assistant) — properties, tenants, leases, payments, maintenance, utilities, bills, deals, triage. No financials, LLCs, chickens, Happy Cuts, Bitcoin, or admin panel.
- **member** — read-only views gated by individual flags (see below); Happy Cuts and Bitcoin are no longer admin-exclusive routes — Happy Cuts is flag-gated and Bitcoin stays admin-only via `AdminRoute`

Permission flags in `useAuth.jsx` (`permissions` object):
- `properties` — admin, VA, or `can_view_properties`
- `llcs` — admin or `can_view_llcs`
- `chickens` — admin or `can_view_chickens`
- `documents` — admin or `can_view_documents`
- `deals` — admin, VA, or `can_view_deals`
- `editTenants` / `manageMaintenance` / `logPayments` — admin or VA
- `can_view_tasks` / `can_view_recipes` / `can_view_tools` / `can_view_files` / `can_view_listings` — member-only flags; these gate **sidebar visibility**, not the route itself (Tools/Files/Tasks/Recipes/Listings routes only require `ProtectedRoute`, so any authenticated user can reach them directly by URL even without the flag)
- `can_view_triage` — admin, VA, or `can_view_triage`
- `can_view_backlog` — admin or `can_view_backlog`
- `can_view_happy_cuts` — admin or `can_view_happy_cuts`
- `can_view_finances` — admin or `can_view_finances`

Bitcoin (`/bitcoin`) is gated directly by `AdminRoute`, not a permission flag.

Documents have an additional visibility layer: non-admin users only see docs whose tags intersect with their `allowed_tags` array in `profiles`.

Properties has a parallel visibility layer for the same reason: non-admin users with `profiles.property_owner_filter` set only see properties whose Airtable `Owner` field matches that string exactly (and everything derived from them — maintenance, leases, projects, since those all hang off Rental Units, not Property directly). `Properties.jsx` computes an allowed-unit-id set once and filters every collection through it; `PropertyDetail.jsx` independently blocks direct navigation to a property outside that scope. Admin > Users' "Edit access settings" modal (pencil icon) sets this per-user, alongside `allowed_tags`. **This is a soft/client-side filter, not a security boundary** — like every other `can_view_*` flag, it relies on the same shared Airtable PAT; it's meant to keep a partner's view scoped to their own deal, not withstand a technical user inspecting network requests.

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
| Credit Card Management | Hardcoded `CC_BASE_ID` in `statements.js` (`appEzmb0zR7DIPiG4`) | Card registry (`Credit Cards` `tbl4XWrVyCBqphUNQ`) + consolidated `Transactions` (`tblw9bSntvMZnycrL`) |
| Recipes | Hardcoded `BASE_ID` in `src/lib/recipes.js` (`appPKrIVr569rWySg`) | Recipes, ingredients, steps (`VITE_RECIPES_BASE_ID` exists as a GH secret/deploy.yml build arg but is **not read anywhere in src** — dead env var) |
| Backlog | Hardcoded in `Backlog.jsx` (`appp0qWrN24f8wqho`, table `tblHUG1CGxrirONPB`) | Kanban-style dev backlog, fetched directly with `fetch()` (not via `airtable.js`) |

> The Chicken Farm base ID (`apppIiT84EaowkQVR`) uses a capital **I** in position 4 — easy to misread as lowercase l.

**FBM distance scoring** — `score-fbm-distances` edge function runs on a `pg_cron` schedule (every 5 min, see `supabase/migrations/20260427_fbm_distance_cron.sql`) against the FBM base (`app25IsSJz9bATUV7`), calling the Google Maps API (`GOOGLE_MAPS_API_KEY` Supabase secret) to score listing distances.

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
| `/happy-cuts` | HappyCuts | PermRoute(can_view_happy_cuts) | Lawn care CRM dashboard |
| `/happy-cuts/client/:id` | HappyCutsClientDetail | PermRoute(can_view_happy_cuts) | Client detail with mow history |
| `/happy-cuts/guide` | HappyCutsGuide | PermRoute(can_view_happy_cuts) | Pricing/service guide |
| `/fleet` | Fleet | PermRoute(can_view_fleet) | All vehicles/equipment — investment/value/equity grid, list, or table |
| `/fleet/:id` | FleetDetail | PermRoute(can_view_fleet) | Asset detail — photos, documents, maintenance, repair timeline, cost log |
| `/tools` | Tools | ProtectedRoute | Custom HTML tools |
| `/tools/:slug` | ToolView | ProtectedRoute | Sandboxed iframe tool |
| `/files` | Files | ProtectedRoute | Supabase Storage file browser |
| `/notifications` | Notifications | ProtectedRoute | In-app notification inbox |
| `/notifications/settings` | NotificationSettings | ProtectedRoute | Per-module delivery prefs (instant/digest/off/discord), digest hour, Discord linking, push subscribe toggle |
| `/notifications/digest-guide` | DigestGuide | ProtectedRoute | Explains the daily Discord digest / weekly email lookahead |
| `/tasks` | Tasks | ProtectedRoute | Personal task manager (all authenticated users) |
| `/tasks/:taskId` | Tasks | ProtectedRoute | Task list with a task opened inline |
| `/tasks/:taskId/full` | TaskDetail | ProtectedRoute | Full-page single task view |
| `/recipes` | Recipes | ProtectedRoute | Household recipe box (Airtable-backed) |
| `/triage` | Triage | PermRoute(can_view_triage) | Cross-module "what's overdue/stale" queue (properties, LLCs, chickens, tasks) |
| `/triage/setup` | TriageSetup | AdminRoute | Configure triage rules |
| `/triage/guide` | TriageGuide | PermRoute(can_view_triage) | Explains triage buckets/resolve actions |
| `/backlog` | Backlog | PermRoute(can_view_backlog) | Kanban dev backlog (own Airtable base, bypasses `airtable.js`) |
| `/listings` | PropertyListings | ProtectedRoute | Index of properties currently listed for sale |
| `/listings/benwick` | CrossvilleDashboard | ProtectedRoute | Manually-updated market dashboard for the 73 Benwick Dr listing (hardcoded `dashboardData` object — update weekly) |
| `/bitcoin` | Bitcoin | AdminRoute | BTC purchase + wallet transfer workflow with edit/delete history |
| `/finances` | Finances | PermRoute(can_view_finances) | Credit-card statement importer + spending dashboard |
| `/bank-dashboard` | BankDashboard | PermRoute(can_view_bank_dashboard) | Consolidated Plaid bank balance view across personal + LLC accounts, grouped by owner |
| `/admin/*` | AdminUsers/Logs/Content | AdminRoute | User mgmt, access logs, content |
| `/maintenance-request` | MaintenanceSubmit | **None (public)** | Tenant-facing maintenance request form |

> All routes above `/maintenance-request` live under a single `/` layout route already wrapped in `ProtectedRoute` — so `tools`, `files`, `notifications`, `tasks`, `recipes`, and `listings` inherit auth-only protection from the parent even though they have no `PermRoute`/`AdminRoute` of their own. Sidebar visibility for those is separately gated by the `can_view_*` flags above, but the URL itself isn't.

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
- **Recipes** → Airtable Recipes base, three tables (Recipes/Ingredients/Steps); logic in `src/lib/recipes.js`
- **Triage** → `src/lib/triageRules.js` pulls from PM, Chickens, Docs, and Tasks Airtable bases plus Supabase, evaluating each into buckets (`late`/`dueSoon`/`stale`/`watching`); dismissals are per-user, 24h TTL, stored in Supabase `triage_dismissals`
- **Backlog** → its own Airtable base, fetched with raw `fetch()` calls in `Backlog.jsx` (does not go through `src/lib/airtable.js`)
- **Property Listings** → `PropertyListings.jsx` has a hardcoded `properties` array (currently just 73 Benwick Dr); `CrossvilleDashboard.jsx` is a manually-maintained market snapshot for that listing — no live data source, must be edited by hand each week
- **Push notifications / Discord** → `usePushSubscription.jsx` registers the service worker (`public/sw.js`) with the Web Push API using `VITE_VAPID_PUBLIC_KEY`; subscriptions stored in Supabase `push_subscriptions`. Delivery channel per module (`instant`/`digest`/`off`/`discord`) is set in `notification_preferences`. `send-push-notification`, `send-daily-digest` (posts to a Discord channel via bot token), `send-weekly-lookahead` (email via Resend), and `send-task-reminder` (email via Resend) are the delivery edge functions; `discord-interactions` handles inbound Discord slash-command interactions (verified via `tweetnacl`) and links `discord_user_id` to a profile.

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
- Happy Cuts uses its own field ID constants (`CF`, `SF`, `CRF`) defined at the top of `HappyCuts.jsx` and `HappyCutsClientDetail.jsx`
- Happy Cuts **Crew** (Airtable `Crew` table, `HappyCuts.jsx`'s Crew tab) tracks independent contractors/helpers who work mows under a revenue-share agreement — each has editable Solo/Joint payout rates. Marking a mow's "Worked By" + "Job Mode" (Solo/Joint) at completion snapshots a `Contractor Payout` amount (Amount Charged × that person's rate) onto the Schedule record, independent of the client's own Invoice Status — payout timing and client-payment timing are unrelated. The Crew tab has a per-person unpaid-jobs report with a print-friendly pay statement and a "mark all paid" action. First crew member: Cameron (65% Solo / 50% Joint). Tony (the existing 40%-flat helper) is intentionally not in this table — his arrangement doesn't map onto the Solo/Joint model.

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

A `pg_net` trigger fires the `send-notification-email` Supabase edge function on every `notifications` insert, but per-user/per-module delivery is filtered by the `notification_preferences` table (one row per user): `delivery_<module>` columns (`instant`/`digest`/`off`/`discord`) plus `digest_enabled`/`digest_hour_local`, `discord_enabled`/`discord_user_id`. Configured from the `/notifications/settings` page.

Delivery paths beyond in-app/email:
- **Web push** — `usePushSubscription.jsx` + `send-push-notification` edge function (VAPID keys)
- **Discord digest** — `send-daily-digest` posts a rollup to a Discord channel (bot token + channel ID secrets); `discord-interactions` handles inbound slash commands and account linking
- **Weekly email lookahead** — `send-weekly-lookahead` (Resend)
- **Task reminders** — `send-task-reminder` (Resend)

Cron scheduling for the digest/lookahead/reminder functions lives in Supabase `pg_cron` (see migrations under `supabase/migrations/2026*`), not in this repo's GitHub Actions.

## Key Files

- `src/lib/supabase.js` — Supabase client initialization
- `src/lib/airtable.js` — Airtable wrapper (fetchAllRecords, createRecord, updateRecord, deleteRecord) + formatters (`fmtCurrency`, `fmtPercent`, `fmtDate`, `fmtField`) + base ID exports (`PM_BASE_ID`, `CHICKENS_BASE_ID`, `DOCS_BASE_ID`, `FBM_BASE_ID`, `BTC_BASE_ID`)
- `src/pages/Bitcoin.jsx` — Bitcoin tracker (admin-only). All field ID constants (`RHF`, `BPF`, `LCJF`, `LCRHF`, `RHPF`) are for writes only. Separate `*_READ` objects use field name strings for reading `record.fields`. Contains `RecentActivityPanel` (collapsible on mobile, sticky on desktop) and `EditModal` (edit/delete past transactions).
- `src/pages/Finances.jsx` — Credit-card statement importer + spending dashboard (`can_view_finances`). Three tabs: export checklist (deep links per card from the `Download URL` field), CSV import (drag/drop → preview → dedup → write), and dashboard (category trends, recurring/subscription detection, AI "where to cut" nudges fed **aggregates only**). Writes to the `Transactions` table by field **name** with `createRecords` (batched). Has local `safeStr/safeNum/arr` helpers.
- `src/lib/statements.js` — CSV parsing engine for Finances. Exports `CC_BASE_ID`/`TX_TABLE`/`CARDS_TABLE`, `ISSUERS` (per-bank checklist steps), `parseCSV` (self-contained RFC-4180; no external lib), per-issuer adapters (`processStatement(text, issuerHint)` → normalized rows or `{needsMapping}`), `applyManualMapping`, `detectIssuerFromCardName`, `cardTail`, `makeDedupKey`, `categorize`. **Amount sign: negative = spending, positive = payment/credit** — each adapter flips its bank's convention to match. Dedup key = `last4|date|amount|merchantKey`. No transaction data leaves the browser (parsing is local; only aggregates go to the Claude API).
- `src/lib/incubation.js` — Species config for the incubator (`SPECIES` map: chicken/duck cycle length, lockdown day, phase targets) + `getSpecies(fields)`, `phaseForDay`, `targetsForDay`, `phaseName`. Shared by `ChickenIncubator.jsx`, `ChickenBatchDetail.jsx`, and `ChickenIncubatorGuide.jsx`.
- `src/lib/tasks.js` — Tasks CRUD (fetchTasks, createTask, updateTask, deleteTask, taskExistsForSourceKey) + `FIELDS` constants for the Tasks Airtable base (`appYVLCn1NVLevdry`, table `tbl3Di18kSLwEj1vN`)
- `src/lib/notifications.js` — `notify()` helper (inserts to Supabase `notifications` table with dedup via `sourceKey`), `getAdminUserIds()`, `getUserIdsWithPermission(flag)`. Call these from feature code to push in-app alerts.
- `src/lib/recipes.js` — Recipes Airtable helpers; hardcoded `BASE_ID` + `TABLES`/`RECIPE_FIELDS`/`ING_FIELDS` constants
- `src/lib/triageRules.js` — Triage rules engine (v2): each rule fetches from one source (PM/Chickens/Docs/Tasks/Supabase) and evaluates records into `TriageItem`s bucketed `late`/`dueSoon`/`stale`/`watching`, with a `resolveAction` per item
- `src/hooks/useAuth.jsx` — Auth context: session, profile, role, isAdmin, isVA, permissions
- `src/hooks/useAccessLog.js` — Audit log hook
- `src/hooks/useAlerts.js` — Alert system hook (computed from PM base data + Airtable "Alerts" table)
- `src/hooks/useNotifications.jsx` — Fetches `notifications` table for the current user; subscribes via Supabase Realtime for live inserts; exposes `markRead`, `markAllRead`, `dismiss`, `dismissAll`
- `src/hooks/usePushSubscription.jsx` — Web Push registration/subscribe-unsubscribe against `public/sw.js`, using `VITE_VAPID_PUBLIC_KEY`; writes to Supabase `push_subscriptions`
- `src/components/Layout.jsx` — Shell with sidebar + header + route-change logging
- `src/components/Sidebar.jsx` — Navigation sidebar (permission-gated items)
- `src/components/DocumentActionCenter.jsx` — AI-classified document action items
- `src/components/RentalAnalyzer.jsx` — Rent estimate panel on `PropertyDetail.jsx`, calls the Rentcast API (`VITE_RENTCAST_API_KEY`)
- `src/components/BacklogKanban.jsx` / `BacklogModal.jsx` — Kanban board + create/edit modal for `Backlog.jsx`
- `src/pages/PropertyListings.jsx` — Hardcoded index of active for-sale listings; edit the `properties` array by hand to add/remove a listing
- `src/pages/CrossvilleDashboard.jsx` — Manually-updated market dashboard for the 73 Benwick Dr listing (`dashboardData` object at the top — "UPDATE WEEKLY" per its own comment); no Airtable/Supabase source
- `src/App.jsx` — Router and all route definitions
- `supabase-setup.sql` — Full database schema, RLS policies, triggers
- `supabase/migrations/` — ~17 migration files as of 2026-07, run individually in the Supabase SQL editor (not via `supabase db push`). Notable ones beyond the base schema: `create_notifications_table.sql`, `20260414*.sql` (four files wiring up `send-notification-email` + `pg_net` trigger), `create_incubator_logs_table.sql`, `20260415120000_create_push_subscriptions.sql`, `20260427_fbm_distance_cron.sql` (pg_cron → `score-fbm-distances`), `20260428_notification_preferences.sql`, `20260502_discord_and_snapshots.sql` (Discord delivery columns), `add_triage_dismissals.sql`, `add_member_nav_permissions.sql` (`can_view_tasks/recipes/tools/files/listings`), `add_can_view_finances.sql`, `create_property_resources_table.sql` + `seed_property_resources.sql` (Property Playbook reference docs, admin/VA read-only)
- `supabase/functions/` — Edge functions beyond `generate-feeding-schedule`/`delete-user`/`send-notification-email`: `create-user` (admin user creation, service-role), `check-notifications`, `score-fbm-distances`, `send-daily-digest`, `send-push-notification`, `send-task-reminder`, `send-weekly-lookahead`, `discord-interactions`, `hermes-gateway` (external agent API — see below), `bank-dashboard` (Plaid proxy — see below), and the Happy Cuts Stripe trio `create-stripe-invoice` / `mark-invoice-paid` / `backfill-stripe-customer-ids` (use `STRIPE_HAPPY_CUTS_KEY` secret; `create-stripe-invoice` reads shared logic from `_shared/stripeAccounts.ts`)
- `.github/workflows/deploy.yml` — GitHub Actions: build + deploy `dist/` straight to the GitHub Pages environment (native Pages deployment via `actions/deploy-pages@v4` — **not** a `gh-pages` branch push)

### Hermes agent integration

`supabase/functions/hermes-gateway/index.ts` is a narrow HTTP API (Tasks CRUD + Documents search, allowlisted actions only, shared-secret auth via `HERMES_API_KEY`) that lets the external Hermes agent (runs on a separate VPS, drives its own headed-browser tool for non-portal sites) read and write Shep Portal data without browser automation or a login session. Hermes has its own Supabase profile (`hermes-agent@shep-portal.internal`, `can_view_tasks` only, created by `supabase/migrations/20260720_create_hermes_agent_profile.sql`) so it can be assigned tasks through the existing Tasks UI and shows up in `access_logs` like any other user. Full contract and guardrails: **[docs/hermes-integration.md](docs/hermes-integration.md)**. Deployed and live against `zhboqhhjijktsanxhwjv`.

The main Hermes instance (Hostinger VPS `srv962330.hstgr.cloud`) is reachable on Telegram at **[@eastmeadow_hermes_bot](https://t.me/eastmeadow_hermes_bot)** — confirmed by asking it to self-report its hostname and Shep Portal tool list (`shep_list_tasks`/`shep_create_task`/`shep_update_task`/`shep_search_documents`/`shep_get_document`/`shep_ping`), which it exposes as native tool functions rather than a discrete `plugins/shep_portal/` plugin (worth reconciling next time you're on the box — that directory existed as of the last SSH check, so either it's been refactored since or "plugin" vs. "native tool" is just how the agent describes its own architecture).

### Agent Fleet (`/admin/agents`)

`src/pages/admin/AdminAgents.jsx` is a simple, manually-maintained directory of the Hermes/Claude Code agents in play — name, purpose, status (active/stale/offline, set by hand — no live heartbeat yet), host, model provider, and Message/Repo links. Backed by the `agents` table (migration `20260721060000_create_agents_table.sql`), RLS-locked to `is_admin()` — no separate `can_view_*` flag, just `AdminRoute`. This is the intentionally-simple v1; see the "Suggested next slices" discussion around Hermes integration for the fuller fleet-control-panel idea (heartbeat-based status, provisioning new agents from the dashboard) if that gets picked back up.

### Projects & Subcontractors (Properties > Projects tab)

Capital-improvement project tracking (renovations, flooring, windows, etc. — distinct from day-to-day Maintenance Requests), built on top of Airtable tables that already existed in the PM base rather than duplicating them: `Project`, `Quote` (used as the **bid** entity), and `Maintenance and Vendor Mgmt` (used as the **subcontractor** directory). Only additive schema changes were made:

- **`Jobs`** (new table) sits between Project and Quote — a Project (e.g. "46 S Harris St renovation") contains multiple Jobs (e.g. "LVP flooring install", "vinyl window replacement"), each bid out independently. `Quote` gained a `Job` link field so each bid attaches to one specific job, not just the whole project.
- **`Project`** gained `Budget` (currency) and `Maintenance Request` (link to Maintenance Requests) — the latter for the "sometimes a project traces back to a maintenance request" case the user described as not the norm.
- **`Maintenance and Vendor Mgmt`** gained `Rating` (Preferred/Good/Fair/Avoid) for tracking sub quality across repeat bids.
- **Quirk to know about**: `Project.Property` links to the `Rental Units` table, not `Property` directly (existing convention, not something this feature introduced) — every property needs a Rental Unit record to have a Project attached, but fix-and-flip properties don't always have one (no leaseable "unit"). `ProjectsPanel.jsx`'s create-project flow creates a minimal Rental Unit record on the fly if the selected property doesn't have one, so the user never has to deal with this modeling detail directly.

Frontend: `src/components/ProjectsPanel.jsx` (list + create, plus the Projects/Subcontractors toggle), `ProjectDetailModal.jsx` (project fields + nested Jobs + nested Bids, inline add-job/add-bid), `SubcontractorsPanel.jsx` (searchable directory with trade/rating filters and per-vendor bid history). Shared status vocab lives in `src/lib/projectStatus.js` (not the usual per-page copy-paste helper pattern, since three components need the identical status options/colors). Jobs show a nudge once bids are below 3, matching the "look for at least 3 bids" workflow.

**Bidding-clarity fields** (loosely modeled on David Greene's contractor-bidding process from *Buy, Rehab, Rent, Refinance, Repeat*, adopted selectively — not the full process): `Jobs.Scope Standard` (Bare-bones rental / Standard rental / HUD-ready / Full modern rehab / Custom) states the target upfront so a mismatched bid is obvious. `Quote` (bids) gained `Labor Cost` / `Materials Cost` (broken down the same way for every bidder), `Materials Handled By Owner` (pay for materials separately until a sub is trusted), and `Timeline (days)` / `Buffer Added (days)` / `Bonus % (early)` / `Penalty % per week late` (`ProjectDetailModal.jsx`'s `BidForm` pre-fills buffer/bonus/penalty with his 7-day/5%/5% defaults, editable per bid). `Maintenance and Vendor Mgmt` gained `References Checked` and `Works With Investors` checkboxes. The bid list auto-flags the highest bid once a job has 3+ (his "toss the outlier" step — computed in the UI, not stored), and each bid has a "copy summary" action (`buildBidSummary()` in `ProjectDetailModal.jsx`) that assembles an itemized, shareable text block including his accountability boilerplate about photos/referrals — that line is generated text, not a tracked field.

**Subcontractor Rating grouping** — `SubcontractorsPanel.jsx` groups vendors into sections by `Rating` (Preferred → Good → Fair → Not yet rated → Avoid, always in that order regardless of search/trade filters) instead of one flat alphabetical list, so the best-fit subs to call first are immediately visible rather than requiring a scan. Ratings sourced from an FB-post contractor search are tiered by marketing overhead as a proxy signal (vouched-for/no self-promotion = Preferred, plain-text reply/no flyer = Good, branded flyer/licensed badge = Fair) rather than anything about how a tradesperson looks — deliberately avoided using a profile photo as a quality signal.

**Region / Favorite / Archived** — `Maintenance and Vendor Mgmt` gained `Region` (singleSelect: Cookeville area / Bay Area, CA / Oak Ridge, TN / Lake Charles, LA / Unspecified — "Cookeville area" covers the whole Middle-TN service radius, not just the city itself), `Favorite` (checkbox), and `Archived` (checkbox, soft-delete). All ~86 existing vendor records were backfilled with a Region. `SubcontractorsPanel.jsx` adds an area filter dropdown alongside the trade filter, pins a "Favorites" section above the Rating tiers (star toggle on each card, one click, no modal), and gives every vendor a full edit modal (pencil icon) that reuses the create form pre-filled — the edit modal also has Archive/Restore and a permanent Delete (with confirm). Archived vendors are hidden by default; a "Show archived" checkbox in the filter bar reveals them with an "Archived" badge on the card.

**Deep-linking** — a project can be opened directly via `/#/properties?tab=projects&project=<id>` (`Properties.jsx` reads the query params on mount to pick the tab; `ProjectsPanel.jsx` auto-opens the matching project once its data loads and forces the status filter to "all" so a Done/Cancelled project isn't hidden). `ProjectDetailModal.jsx` has a "Copy link" button that builds this URL. Query strings survive the login redirect already (`ProtectedRoute`/`Login.jsx`'s `state.from` preserves `location.search`), so a shared link works whether or not the recipient is already logged in.

### Bank Dashboard (Plaid)

`/bank-dashboard` (`src/pages/BankDashboard.jsx`, `PermRoute(can_view_bank_dashboard)`) is a consolidated balance view across personal + LLC bank accounts, ported from a standalone local Express app (`bank-dashboard`, outside this repo) into real Shep Portal infrastructure so it's reachable from anywhere, not just one PC.

- **`supabase/functions/bank-dashboard/index.ts`** is the only thing that ever talks to Plaid. Deployed **with** JWT verification (no `--no-verify-jwt`) — a valid Shep Portal session is required just to reach it, and the function additionally checks the caller's `profiles` row for `role='admin'` OR `can_view_bank_dashboard` before allowing any action. The frontend never sees a Plaid access token. Action-router body shape like `hermes-gateway`: `{ action, ...payload }` → `create_link_token`, `exchange_token`, `get_balances` (live Plaid call, refreshes the cache), `get_balances_cached`, `list_items`, `remove_item`, `list_owners`, `set_owner`. Talks to Plaid via raw `fetch` against `https://${PLAID_ENV}.plaid.com` (no SDK) using the `PLAID-CLIENT-ID`/`PLAID-SECRET` headers; secrets `PLAID_CLIENT_ID`/`PLAID_SECRET`/`PLAID_ENV` are set on the Shep Portal Supabase project (not the same secrets store as the standalone app's `.env`).
- **Tables** (migration `20260721_create_bank_dashboard.sql`): `bank_items` (item_id, access_token, institution_name, added_at), `bank_account_owners` (account_id → owner label), `bank_balances_cache` (singleton row, refreshed only by the live `get_balances` action). All three are RLS-enabled with **zero** anon/authenticated policies — nothing is readable or writable directly from the browser; everything goes through the edge function's service-role client. Do not add authenticated/anon policies to these tables.
- The real Plaid items/owners from the original standalone app (Discover, Chase ×2, Relay Financial ×3 LLC sub-accounts, FirstBank, Huntington — 8 items, 11 owner tags) were migrated in once via an uncommitted seed file, run through the same isolated `db push` technique and deleted immediately after — access tokens must never be committed to git.
- Owner-tagging logic (`suggestOwner()` — auto-tags accounts whose Plaid name embeds a business name, e.g. `"East Meadow Consulting LLC - Business Checking"`) is duplicated server-side in the edge function; it no longer lives in the standalone app's `server.js` for portal purposes.
- Frontend styling is intentionally its own dark "private ledger" aesthetic (Fraunces serif + Space Mono, `src/pages/BankDashboard.css`), scoped entirely under `.bd-root` with `bd-`-prefixed classes so it can't collide with the rest of the Tailwind-based app.
- The standalone local Express app (`bank-dashboard`, separate repo/directory) still exists untouched as of this writing — not yet decommissioned.

> `ChickenIncubator.jsx` is **not a standalone route** — it is a panel rendered inside the Chickens page for managing egg batches. `ChickenBatchDetail.jsx` is a sub-view rendered inside `ChickenIncubator.jsx` for a single batch (candling log, daily readings, hatch results).

### Fleet & Equipment

`/fleet` + `/fleet/:id` (`src/pages/Fleet.jsx` / `FleetDetail.jsx`, `PermRoute(can_view_fleet)`) track every vehicle/machine Thomas owns — mowers and trimmers originally, expanded Aug 2026 to also cover the Suburban, a box trailer, a Kubota tractor, and a rototiller: what's been spent, condition, estimated resale value, and preventative/reactive maintenance.

- **`can_view_fleet` is its own permission flag**, separate from `can_view_happy_cuts`. The module used to be Happy Cuts-only and was gated by that flag; it no longer is — a personal vehicle's VIN/insurance/purchase price shouldn't be visible to anyone with schedule-only access. Admins get it implicitly; grant it per-user in Admin > Users' add-user form (not yet wired into the quick-toggle table or the existing-user edit modal — same scope Insurance stopped at, not a Fleet-specific gap).
- **Airtable — still lives in the Happy Cuts base** (`appZOi48qf8SzyOml`, `VITE_AIRTABLE_HAPPY_CUTS_BASE_ID`), exported from `lib/fleet.js` as `FLEET_BASE_ID` (named for where this is headed, not where it lives — a dedicated base wasn't available to create when this was built; intended to migrate later, at which point this becomes a one-line env var swap). Three tables, all linked to Equipment: `Equipment` (`tblgG4vY2mZoOdrkO`), `Cost Entries` (`tbl4Etxh9weJ2Qitz`), `Maintenance Items` (`tblvJRtBquIpkEzrA`). `Total Invested`/`Est. Equity` are Airtable rollup/formula fields — never write to them directly. `Cost Entries.Cost` is nullable by design (repairs get logged before the bill is known).
- **Choice-list gotcha**: the Airtable write API used here (`Airtable_MCP_Server` MCP) can't add choices to an *existing* select field — `INVALID_MULTIPLE_CHOICE_OPTIONS` even with typecast. The original `Equipment.Type` field (Zero-Turn/Push Mower/Trimmer/Other) hit this when Vehicle/Trailer/Tractor/Tiller needed adding, so a **parallel `Category` field** was created with the full 8-value list instead; `Type` is left on existing records, unused, going forward. Same limitation blocks expanding `Cost Entries.Category` (Fuel/Insurance/Registration-Tags aren't valid choices yet) and `Maintenance Items.Interval Type` (Mileage/Engine Hours aren't valid choices yet) — both need the choices added by hand in the Airtable UI before the corresponding constants in `lib/fleet.js` (`COST_CATEGORIES`, `MAINT_INTERVAL_TYPES`) can be extended to expose them.
- Shared config (base ID, category/status/location options, `CATEGORY_FIELDS` map, staleness thresholds, photo/document upload+parse helpers, maintenance due-date/urgency logic) lives in **`src/lib/fleet.js`** — same pattern as `src/lib/incubation.js`.
- **`CATEGORY_FIELDS`** drives which fields the Add/Edit Asset form shows per Category (VIN/plate/mileage/registration/insurance for Vehicle, axles/GVWR for Trailer, hours for Tractor, deck size for mowers, etc.) — a $20 trimmer doesn't get a GVWR field.
- **Photos** are Supabase Storage (`fleet-photos` bucket, public), not Airtable attachments — `Equipment.Photo URLs` holds a JSON array of `{url, kind}` (`kind: 'tag' | 'machine'`). **Documents** (title/registration) use the same bucket under a `documents/` prefix, `Equipment.Document URLs` holds `{url, label}` — same reasoning as photos, uploaded via `uploadFleetDocument()`.
- **Readings** (`Current Mileage`, `Current Engine Hours`, `Reading Last Updated`) — manual entry, vehicle/trailer/tractor only. `Reading Last Updated` drives a staleness flag on the detail page (90 days) the same way `Market Value Last Updated` does — a due-mileage calculation is only as good as how recently the odometer was actually logged.
- **Maintenance tracking** (`Maintenance Items`) — preventative/reactive upkeep, Category (Preventative/Reactive) × Priority (Low/Medium/High). `Next Due Date`/`Next Due Reading` are **app-computed and written by the client** (`computeNextDueDate()`/`computeNextDueReading()` in `lib/fleet.js`), not Airtable formulas — Calendar Days and Season intervals need "roll forward to next occurrence" logic Airtable formulas can't express, mirroring how `Insurance.jsx` handles recurring renewal dates. Urgency is computed fresh client-side via `maintenanceUrgency(fields, assetFields)` — the second arg (the linked Equipment record's fields) is only consulted for Mileage/Engine Hours items, comparing against `Current Mileage`/`Current Engine Hours`. **Mileage/Engine Hours interval support is code-complete but dormant** — not in `MAINT_INTERVAL_TYPES` yet because of the choice-list gotcha above; add the two choices to the `Interval Type` field in Airtable, then add them to that constant, no other code change needed. `Status` stores 3 real states: `Active`, `Watch List` (dormant Reactive item), `Done` (terminal, One-time only).
- FleetDetail's Maintenance section only auto-expands Overdue/Due Soon items — Scheduled/Watch List/Done sit behind a "Show N more" toggle.
- "Needs attention" panel (missing `Purchase Price`/`Purchase Date`, stale market value, fleet-wide Overdue/Due Soon maintenance) is derived client-side, mirrors the Insurance page's `issues` pattern. Deliberately kept inside the Fleet module's own panel rather than the global Dashboard's Action Items — the Dashboard only gets one summary line on its existing Fleet widget, by design.
- **Operating the module without the UI**: see **[.claude/skills/fleet-ops/SKILL.md](.claude/skills/fleet-ops/SKILL.md)** — full schema + MCP recipes.

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
VITE_VAPID_PUBLIC_KEY               # Web Push public key, used by usePushSubscription.jsx
VITE_RECIPES_BASE_ID                # Wired into deploy.yml as a build secret but NOT read in src — recipes.js hardcodes its base ID instead. Dead var; safe to leave or remove.
```

> Note: `FBM_BASE_ID` (FB Marketplace Monitor, `app25IsSJz9bATUV7`) and the Recipes/Backlog base IDs are hardcoded in source (`src/lib/airtable.js`, `src/lib/recipes.js`, `src/pages/Backlog.jsx`), not read from `.env`.

## Deployment

Push to `main` triggers GitHub Actions (`.github/workflows/deploy.yml`) to build with `VITE_*` secrets injected, then deploy `dist/` directly to the GitHub Pages environment via `actions/deploy-pages@v4` (OIDC token auth) — this is native GitHub Pages deployment, **not** a push to a `gh-pages` branch. The PAT used to push `.github/workflows/` files must have the `workflow` scope.

**Supabase edge functions and `pg_cron` jobs deploy separately** — they are not part of this GitHub Actions workflow. New/changed edge functions need `supabase functions deploy <name>` (some with `--no-verify-jwt`) and their secrets set via `supabase secrets set` (`AIRTABLE_PAT`, `GOOGLE_MAPS_API_KEY`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`, `DISCORD_BOT_TOKEN`/`DISCORD_PUBLIC_KEY`/`DISCORD_DIGEST_CHANNEL_ID`, `RESEND_API_KEY`, `STRIPE_HAPPY_CUTS_KEY`). New SQL migrations must be run by hand in the Supabase SQL editor — this repo doesn't use `supabase db push`.
