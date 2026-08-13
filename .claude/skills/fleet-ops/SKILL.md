---
name: fleet-ops
description: Operate the Shep Portal Fleet & Equipment module (vehicles, trailers, tractors, mowers, trimmers — repair/cost tracking and maintenance tracking) directly against Airtable via MCP, without going through the Shep Portal UI. Use when asked to add/edit assets, log repairs or costs, track preventative/reactive maintenance, update market values or mileage/hours readings, check what needs attention, or pull fleet totals/equity.
---

# Fleet Ops — Fleet & Equipment Tracking (via MCP)

Operates on the same Airtable tables the `/fleet` and `/fleet/:id` pages in Shep Portal
read from (`src/pages/Fleet.jsx`, `src/pages/FleetDetail.jsx`, `src/lib/fleet.js`).
Writes made here show up in the app immediately and vice versa — same data.

Covers every vehicle/machine Thomas owns — not just Happy Cuts equipment. Started as a
mower/trimmer tracker, expanded Aug 2026 to include the Chevy Suburban, a box trailer, a
Kubota tractor, and a rototiller. Gated in the app by its own `can_view_fleet` permission
flag, separate from `can_view_happy_cuts` — a personal vehicle's VIN/insurance shouldn't be
visible to anyone with schedule-only access.

## Tools

Use `mcp__Airtable_MCP_Server__*`. If unavailable, the equivalent `describe_table` /
`create_record` / `update_records` calls on `mcp__6f69f16b-3265-4295-a486-288429e81c5e__*`
(the fuller Airtable MCP server) work the same way, just requires `search_bases` /
`list_tables_for_base` first instead of the hardcoded IDs below.

Load tools before first use: `ToolSearch("select:mcp__Airtable_MCP_Server__list_records,mcp__Airtable_MCP_Server__create_record,mcp__Airtable_MCP_Server__update_records,mcp__Airtable_MCP_Server__get_record,mcp__Airtable_MCP_Server__search_records,mcp__Airtable_MCP_Server__delete_records")`

## ⚠️ Choice-list gotcha — read this before adding new Category/Interval Type values

The Airtable write API reachable through these tools **cannot add choices to an existing
select field** — even `create_record`/`update_records` with a genuinely new value fails:
`INVALID_MULTIPLE_CHOICE_OPTIONS: Insufficient permissions to create new select option`.
`update_field` (on either MCP server) only edits name/description/formula, not `options.choices`.

This already happened once: `Equipment.Type` (Zero-Turn/Push Mower/Trimmer/Other) couldn't
be extended for Vehicle/Trailer/Tractor/Tiller, so a **parallel `Category` field** was
created with the full list via `create_field` (which *can* set explicit choices on a *new*
field) instead. `Type` is left in place on existing records, unused — use `Category`.

Same wall blocks `Cost Entries.Category` (Fuel/Insurance/Registration-Tags aren't valid
choices yet) and `Maintenance Items.Interval Type` (Mileage/Engine Hours aren't valid
choices yet). Don't try to write those values — they'll fail. If asked to log a fuel
fill-up or a mileage-based maintenance interval, say the Airtable field needs the choice
added by hand first (Airtable UI → the field → add option), then proceed.

## Schema reference

**Base**: still the Happy Cuts base — `appZOi48qf8SzyOml` (`VITE_AIRTABLE_HAPPY_CUTS_BASE_ID`
in the app, exported as `FLEET_BASE_ID` from `lib/fleet.js`). A dedicated base wasn't
available to create when this was built; the naming is for where it's headed, not where
it lives today.

**Table: Equipment** — `tblgG4vY2mZoOdrkO` — one row per asset

| Field | Type | Notes |
|---|---|---|
| `Name` | text | primary field, required |
| `Category` | select | `Zero-Turn` \| `Push Mower` \| `Trimmer` \| `Vehicle` \| `Trailer` \| `Tractor` \| `Tiller` \| `Other`. **Use this, not `Type`** (see gotcha above). |
| `Make`, `Model`, `Serial Number` (VIN for vehicles/trailers), `DOM / Year`, `Engine`, `Deck Size`, `GVWR` | text | free text |
| `License Plate` | text | vehicles/trailers |
| `Axle Count` | select | `Single` \| `Tandem` \| `Other` — trailers only |
| `Current Mileage` | number | vehicles |
| `Current Engine Hours` | number | tractor, other heavy equipment |
| `Reading Last Updated` | date | **stamp to today whenever you change either reading** — same staleness pattern as Market Value below (app flags it stale after 90 days) |
| `Registration Expiry` | date | vehicles/trailers |
| `Insurance Provider` | text | vehicles, optional |
| `Purchase Date` | date | `YYYY-MM-DD` |
| `Purchase Price` | currency | |
| `Status` | select | `Running` \| `In Repair` \| `Down` \| `Sold` |
| `Location` | select | `Home` \| `Buster's` \| `Job Site` — **physical location only**, never "Sold" (that's `Status`) |
| `Photo URLs` | long text | JSON array of `{"url": "...", "kind": "tag"\|"machine"}` — see **Photos & Documents** below |
| `Document URLs` | long text | JSON array of `{"url": "...", "label": "..."}` — title/registration docs, same pattern as photos |
| `Est. Market Value` | currency | manual estimate |
| `Market Value Last Updated` | date | **stamp to today whenever you change `Est. Market Value`** |
| `Notes` | long text | free text |
| `Cost Entries`, `Maintenance Items` | link | **read-only from this side** — populated automatically by the reverse link. Never write to either directly. |
| `Cost Entries Sum` | rollup | **read-only, computed.** Never write. |
| `Total Invested` | formula (`Purchase Price` + `Cost Entries Sum`) | **read-only, computed.** Never write. |
| `Est. Equity` | formula (`Est. Market Value` − `Total Invested`) | **read-only, computed.** Never write. |

**Table: Cost Entries** — `tbl4Etxh9weJ2Qitz` — one row per repair/part/expense

| Field | Type | Notes |
|---|---|---|
| `Description` | text | primary field, required |
| `Equipment` | link → Equipment | **required** — string array of one record ID |
| `Date` | date | `YYYY-MM-DD` |
| `Category` | select | `Parts` \| `Labor - Buster` \| `Labor - Self` \| `Battery` \| `Tires` \| `Blades` \| `Other`. Fuel/Insurance/Registration-Tags **not yet valid** — choice-list gotcha above. |
| `Cost` | currency | **nullable — leave unset for "dropped it off, no bill yet."** Never default to 0. |
| `Vendor` | text | free text |
| `Notes` | text | optional |

**Table: Maintenance Items** — `tblvJRtBquIpkEzrA` — one row per maintenance task, per asset

| Field | Type | Notes |
|---|---|---|
| `Name` | text | primary field, required |
| `Equipment` | link → Equipment | **required**, string array of one record ID |
| `Category` | select | `Preventative` \| `Reactive` |
| `Priority` | select | `High` \| `Medium` \| `Low` |
| `Interval Type` | select | `Calendar Days` \| `Season` \| `One-time`. **`Mileage`/`Engine Hours` not yet valid** — choice-list gotcha above; the logic exists (`computeNextDueReading()`, `maintenanceUrgency()`'s reading branch) but is dormant until those choices are added in Airtable. |
| `Interval Value` | number | days count, Calendar Days only |
| `Season Trigger` | text | e.g. `"March 1"`, Season only |
| `Last Done Date` | date | blank if never done |
| `Last Done Reading` / `Next Due Reading` | number | mileage/hours at last service / computed next-due reading — fields exist, dormant until Mileage/Engine Hours interval types are enabled |
| `Next Due Date` | date | **app-computed, NOT an Airtable formula** — compute and write yourself (see below) |
| `Status` | select | `Active` (real due date, urgency computed from it) \| `Watch List` (dormant Reactive, no symptom yet) \| `Done` (terminal, One-time only) |
| `Notes` | text | optional |

**Computing `Next Due Date`** (replicate `computeNextDueDate()` in `src/lib/fleet.js` exactly):
- `Calendar Days`: anchor (`Last Done Date`, or today if never done) + `Interval Value` days.
- `Season`: next occurrence of the `Season Trigger` month/day on or after the anchor, rolling forward a year if already passed.
- `One-time` / dormant `Reactive`: no formula — set directly, or leave blank for Watch List.

**Computing urgency** (replicate `maintenanceUrgency()` — never store, always derive fresh):
- `Status = Done` → done. `Status = Watch List` → watch, no due date shown.
- Date-based (Calendar Days/Season/One-time): before today = **Overdue**; within 14 days = **Due Soon**; further out = **Scheduled**.
- Reading-based (dormant, see above): compare `Next Due Reading` to the linked asset's `Current Mileage`/`Current Engine Hours` — overdue if exceeded, due soon within 300 mi / 10 hrs.

## Rules

- Always pass `typecast: true` on create/update.
- Link fields must be **string arrays** of record IDs: `["recXXXXXXXXXXXXXX"]`, even for a single link.
- Never write `Cost Entries`/`Maintenance Items` (on Equipment), `Cost Entries Sum`, `Total Invested`, `Est. Equity`, or `Next Due Reading` — all computed.
- Changing `Est. Market Value` without also updating `Market Value Last Updated`, or changing a reading without updating `Reading Last Updated`, makes the record look falsely stale (or falsely fresh) in the app.
- Deleting an Equipment record does **not** delete its Cost Entries/Maintenance Items — they become orphaned (still exist, link cleared).
- See the choice-list gotcha above before writing any select field value you haven't confirmed is an existing choice.

## Common operations

**Add an asset**
`create_record` on Equipment with `Name` + `Category` at minimum. Leave unconfirmed fields (Purchase Price/Date, VIN, mileage, etc.) unset rather than guessing — the app's Needs Attention panel is designed to surface exactly that.

**Log a repair/cost**
`create_record` on Cost Entries with `Description`, `Equipment: [equipmentRecordId]`, `Category`, `Date`. Set `Cost` only if known.

All updates go through `update_records`, which takes `records: [{ id, fields }]` (batch of
up to 10) — a single-record update is just a one-element array.

**Come back and fill in a TBD cost**
`update_records` on Cost Entries: `records: [{ id: "recXXX", fields: { Cost: 90 } }]`.

**Update market value**
`update_records` on Equipment: `Est. Market Value` **and** `Market Value Last Updated: <today>` together, every time.

**Update a mileage/hours reading**
`update_records` on Equipment: `Current Mileage` and/or `Current Engine Hours` **and** `Reading Last Updated: <today>` together, every time.

**Mark an asset sold**
`update_records` on Equipment: `fields: { Status: "Sold" }`. Leave `Location` as-is or clear it.

**List the fleet / find an asset**
`list_records` on Equipment (small table, fetch it all). Filter/search client-side.

**Needs-attention check** (mirrors `Fleet.jsx`'s logic exactly)
Over non-Sold Equipment: flag `Purchase Price` null, `Purchase Date` empty, or `Est. Market Value` set with `Market Value Last Updated` >60 days old — plus, separately, any linked Maintenance Item that's Overdue/Due Soon.

**Fleet totals**
Sum `Total Invested`, `Est. Market Value`, `Est. Equity` across non-Sold Equipment — precomputed, just read and sum.

**Repair history for one asset**
`list_records` on Cost Entries (whole table), filter client-side for `Equipment` containing the asset's record ID. Don't use `filterByFormula` — Airtable formulas read a link field as the linked record's *primary-field value*, not its ID, so `FIND()`-ing a record ID against `{Equipment}` silently matches nothing.

**Add a maintenance item**
`create_record` on Maintenance Items with `Name`, `Equipment: [equipmentRecordId]`, `Category`, `Priority`, `Interval Type`, plus `Interval Value` or `Season Trigger`. Compute and write `Next Due Date` yourself — `Status: "Active"` with a real due date, or `Status: "Watch List"` + no due date for a dormant Reactive item.

**Mark a maintenance item done**
Set `Last Done Date` to today. `One-time`: `Status: "Done"`, clear `Next Due Date`. Recurring: recompute `Next Due Date`, keep `Status: "Active"`.

**Flag a Watch List item as an active issue**
`update_records`: `Status: "Active"`, `Next Due Date: <today>`.

**What maintenance needs attention fleet-wide**
`list_records` on Maintenance Items, compute urgency per row, filter to Overdue/Due Soon. This is the same set folded into the Fleet page's own Needs Attention panel — don't duplicate it onto the global Dashboard; that panel deliberately stays out of the cross-business Dashboard (one summary line on the existing Fleet widget is all it gets there).

## Photos & Documents — not fully MCP-operable

Both live in **Supabase Storage** (`fleet-photos` bucket, public — photos under `equipment/`,
documents under `documents/`), not Airtable attachments. No MCP tool in this environment can
upload to Supabase Storage. To attach either without the app UI:

1. Upload via Supabase CLI: `supabase storage cp <local-file> "ss:///fleet-photos/<equipment|documents>/<name>" --linked` (project already linked — `zhboqhhjijktsanxhwjv`).
2. Get its public URL: `https://zhboqhhjijktsanxhwjv.supabase.co/storage/v1/object/public/fleet-photos/<equipment|documents>/<name>`
3. Read the Equipment record's current `Photo URLs` or `Document URLs`, parse the JSON array, append `{"url": "<url>", "kind": "tag"|"machine"}` (photos) or `{"url": "<url>", "label": "<name>"}` (documents), and `update_records` with the re-stringified array. **Read-modify-write** — don't overwrite the existing array.

If asked to attach a photo/document and no local file is available, say so rather than
fabricating a URL.
