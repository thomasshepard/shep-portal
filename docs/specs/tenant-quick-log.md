# Tenant Quick-Log: build spec for Gemini

Nov 22, 2026 · Thomas

Build spec for the Tenant Quick-Log in Shep Portal. Gemini CLI builds it on its own branch; Claude reviews before anything merges.

## 1. Goal

Keep one running record of what happens with tenants at each property: calls, repairs, complaints, payment questions. Most entries will come from an AI agent turning Thomas's spoken notes into a record ("the sink at 188 Virginia is leaking"). The portal gets a light interface for the same log: a quick form, a timeline on each property, and one list of open issues across all properties.

Why: a clean record for the weekly digest later, for tenant disputes, and so Janine can see and log the same things.

Original backlog item: Backlog base, record `recso84sn5CqaeDnE`, "Tenant Interaction Quick-Log".

Done means: an AI agent can add an entry with no portal involved, and in the portal Thomas or Janine can add an entry, see a property's timeline, see every open issue in one place, and move an issue from Open to In progress to Resolved.

## 2. Hard limits

- No new API keys, secrets, env vars, webhooks, Stripe setup, edge functions, pg_cron jobs or Supabase migrations. Thomas is away from his desk and can't set those up. Use only what the portal already has: `src/lib/airtable.js` (which goes through the existing airtable-proxy) and `useAuth`.
- No new npm packages.
- Do not create or change any Airtable table or field from code or from an agent. Thomas makes the schema change himself (section 3).
- Never create, edit or delete Property records. Never write to Tenants, Lease Agreements or Maintenance Requests.
- Work only on the branch `feature/tenant-log`. Never push to `main` (pushing to main deploys the live site). Never merge. Claude reviews first.

## 3. Data model (Thomas adds this in Airtable)

Base: Property Management (`appeuX9BHNgVXxdYZ`, the same base as `VITE_AIRTABLE_PM_BASE_ID`).

New table: **Tenant Log**. One row per thing that happened. Flat on purpose: no rollups or formulas.

Table ID: `tblnBwKycNSXhc2Wt`

| Field name (exact) | Field ID | Type | Notes |
|---|---|---|---|
| Summary | `fldtk6p828x42UDCW` | Single line text (primary field) | Short title, like "Kitchen sink leaking" |
| Property | `fldtRyz8V0SgshF43` | Link to Property | One property per entry. Required by the app |
| Tenant | `fldfF2ZJvlt5dtc8t` | Link to Tenants | Optional. Leave empty if unknown |
| Type | `fld99fd0cRbDCP5QX` | Single select | Call, Repair, Complaint, Payment question, Other |
| Details | `fldNRpaRn1EU1B740` | Long text | The full note, close to the words Thomas used |
| Urgency | `fldcuF3OVzYSAf4sZ` | Single select | Low, Normal, Urgent |
| Status | `fldDCj7XRiq9HOn9N` | Single select | Open, In progress, Resolved |
| Date | `fldbqdocQ36JNPULk` | Date | When it happened (not when it was logged) |
| Logged By | `fldQ0GmbHqeD2pCaT` | Single line text | "Thomas", "Janine", or "Claude (voice note)" |
| Source | `fld4tA31mGUxjeNod` | Single select | Portal, AI agent |
| Resolved Date | `fldnrcmwV0QuDN1CF` | Date | Set when Status becomes Resolved |
| Resolution | `fldHCyzUyj7YTjtUl` | Long text | What fixed it. Optional |

There is no Created field (Airtable's connector couldn't create one). Wherever this spec says "Created", use each record's built-in `createdTime` instead (it is on the record object, next to `id` and `fields`, not inside `fields`).

Adding the two link fields also adds a "Tenant Log" link field on the Property and Tenants tables. That is expected.

Table ID and all field IDs above are final (step 0 done). Use them in the constants in step 1.

Field IDs: writes use field IDs (`fldXXX`) with `typecast: true`. Reads come back keyed by field NAME, so the code keeps a second map of names for reading. This is the portal's existing rule.

## 4. The agent logging path (the main way entries get in)

Any AI agent with Airtable access (Claude through its Airtable connector today) writes straight to the Tenant Log table. No portal code is involved, so nothing new has to be deployed for this to work.

From a spoken note, the agent fills:

| Field | How the agent fills it |
|---|---|
| Property | Search the Property table's Address field for the address or street name he said. If two match or none do, ask him. Link the record ID |
| Tenant | If he names a person, find them in Tenants linked to that property. If unsure, leave it empty. Never guess |
| Type | Repair for anything broken. Payment question for rent, deposits, fees. Complaint for neighbor, noise, behavior. Call when he only says someone called. Otherwise Other |
| Summary | 3 to 8 words in plain language |
| Details | His words, cleaned up a little, nothing added |
| Urgency | Urgent: active water leak, no heat or AC in bad weather, no power, no water, gas smell, lockout, anything unsafe. Low: FYI only. Everything else Normal |
| Status | Open, unless he says it's already handled (then Resolved, with Resolved Date and Resolution) |
| Date | The day he says it happened, else today (America/Chicago) |
| Logged By | "Claude (voice note)" |
| Source | AI agent |

The agent then tells him back in one line what it logged ("Logged an urgent repair at 188 Virginia: sink leaking"). It does not create a Maintenance Request, text the tenant or call a vendor unless he asks for that separately.

To update an entry ("the sink is fixed"), the agent finds the open entry for that property and summary, sets Status to Resolved, Resolved Date to today, and Resolution to what he said.

Step 5 below puts these rules in the repo as a skill file so any agent working in the repo can follow them.

## 5. Portal interface

Who sees it: admin and VA only (`isAdmin || isVA` from `useAuth`). That covers Thomas and Janine. Members, including partners with a property owner filter, do not see it in this version.

### a) Log it form (modal)

- Opened by a "Log it" button.
- Fields: Property (fixed when opened from a property page, a dropdown when opened from the Open Issues tab), Tenant (optional dropdown of tenants on that property's active leases, plus "None"), Type, Summary, Details, Urgency (defaults to Normal), Date (defaults to today).
- On save: Status Open, Source Portal, Logged By from `profile.full_name` (fall back to `profile.email`).
- Summary and Property are required. Show the Airtable error text if the save fails.

### b) Timeline on each property

- New card on `PropertyDetail.jsx` titled "Tenant Log", placed right after the "Units & Tenants" card. Hide it where the existing `hideTenantsUI` hides tenant cards (Primary Residence, Fix & Flip).
- Header has the "Log it" button.
- List newest first (Date, then the record's `createdTime`). Each row: date, type, urgency badge (red for Urgent), status chip, summary, tenant name if any, who logged it. Tap a row to expand Details and Resolution.
- Status control on each row: Open, In progress, Resolved. Choosing Resolved asks for an optional one-line Resolution and sets Resolved Date to today.
- Open and In progress rows show first. Resolved rows sit behind "Show resolved (N)".

### c) Open issues view

- New tab on `Properties.jsx` called "issues", added to the existing tab list (overview, maintenance, projects, playbook). Only admin and VA see the tab.
- Lists every entry with Status Open or In progress across all properties. Sort: Urgent first, then oldest Date first.
- Each row shows the property address (links to that property's page), plus the same row content and status control as the timeline.
- Filter by property and by type. A "Log it" button with the property dropdown.

Style: match the existing Tailwind cards and chips in `PropertyDetail.jsx`. Follow the Maintenance Requests card as the closest pattern.

## 6. Build steps (each with a done-test)

Work in order. Commit after each step with a clear message. If a done-test fails, fix it before moving on. If stuck, stop and write down what's blocking in the step's notes; don't work around the limits in section 2.

**Step 0. Thomas: create the table.** DONE. The table exists and its table ID and field IDs are in section 3 (no Created field; use `createdTime`).

**Step 1. Data helper.** Create `src/lib/tenantLog.js` with: the table ID, a `TL_FIELDS` map of field IDs for writes, a `TL_READ` map of field names for reads, the option lists (`TL_TYPES`, `TL_URGENCY`, `TL_STATUS`), and these functions built on `fetchAllRecords`, `createRecord`, `updateRecord` from `src/lib/airtable.js` with `PM_BASE_ID`: `fetchLogForProperty(propertyId)`, `fetchOpenIssues()`, `createLogEntry(values)`, `setLogStatus(recordId, status, resolution)`. Links are sent as arrays like `["recXXX"]`. Property filtering is done in the browser on the returned link arrays (the table stays small). Define local `safeStr`, `safeNum`, `arr` helpers as the portal does. Done when: `npm run build` and `npm run lint` pass.

**Step 2. Form.** Create `src/components/TenantLogForm.jsx` (the modal in 5a). Done when: on `npm run dev`, logged in as admin, saving a test entry creates a row in Airtable with every field filled as expected, then Thomas or the agent deletes that test row by hand.

**Step 3. Timeline.** Create `src/components/TenantLogPanel.jsx` and render it in `PropertyDetail.jsx` as in 5b. Only add the import and one render line plus any state it needs. Done when: a rental property shows its entries newest first, the status control changes Status in Airtable, Resolved sets Resolved Date, a Fix & Flip property shows no card, and a member account sees no card.

**Step 4. Open issues tab.** Add the "issues" tab to `Properties.jsx` and create `src/components/TenantIssuesQueue.jsx` as in 5c. Done when: entries from two properties both show, Urgent sorts on top, resolving one removes it from the list, and the tab doesn't show for a member.

**Step 5. Agent instructions and docs.** Create `.claude/skills/tenant-log/SKILL.md` with the table ID, field IDs and the rules from section 4 (same idea as the existing `.claude/skills/fleet-ops/SKILL.md`). Add a short "Tenant Log" section to `CLAUDE.md`. Add a line to `memory.md` under In progress if that file is in the repo. Done when: the files exist and the field IDs in the skill match `tenantLog.js`.

**Step 6. Hand off for review.** Run `npm run build` and `npm run lint` one last time. Push `feature/tenant-log` (not main). Write a short summary: files changed, what each done-test showed, anything not done. Done when: the branch is pushed and the summary is written. Then Claude reviews.

## 7. What not to touch

- `src/lib/airtable.js`, `useAuth.jsx`, `App.jsx` routes, `Sidebar.jsx` (no new route is needed).
- Anything under `supabase/`, `.github/workflows/`, `.env` files.
- Bitcoin, Bank Dashboard, Finances, Happy Cuts, Stripe code.
- The existing "Interaction Log" table in the same base (it belongs to the Happy Cuts text log and is fed by n8n).
- No reformatting or refactoring of `PropertyDetail.jsx` or `Properties.jsx` beyond the lines this feature needs.

## 8. Review before merge (Claude)

Claude checks the branch against this spec: limits in section 2 held, field IDs used on writes and names on reads, `typecast: true`, admin/VA gating, no edits outside the listed files, build and lint pass, and a quick run through the done-tests on the dev server. Thomas merges to main only after that review.

## 9. Later, not in this version

- Weekly digest section listing open issues (needs an edge function change and deploy).
- "Turn into a maintenance request" button.
- Logging through the Hermes gateway (needs a gateway change and deploy).
- Partner view scoped by property owner.

## 10. Kickoff prompt for Gemini

Paste into Gemini CLI from the shep-portal folder once step 0 is done:

> Read GEMINI.md, then docs/specs/tenant-quick-log.md. Build the Tenant Quick-Log exactly as the spec says, one step at a time, on the branch feature/tenant-log. Commit after each step. Run each step's done-test before moving on. Follow the limits in section 2 with no exceptions: no new packages, keys, env vars, Supabase changes or Airtable schema changes, and never push to main or merge. If something in the spec is unclear or a done-test fails twice, stop and tell me what you need.
