---
name: fleet-ops
description: Operate the Happy Cuts Fleet module (equipment + repair/cost tracking) directly against Airtable via MCP, without going through the Shep Portal UI. Use when asked to add/edit machines, log repairs or costs, update market values, check what needs attention, or pull fleet totals/equity.
---

# Fleet Ops — Happy Cuts Equipment Tracking (via MCP)

Operates on the same Airtable tables the `/fleet` and `/fleet/:id` pages in Shep Portal
read from (`src/pages/Fleet.jsx`, `src/pages/FleetDetail.jsx`, `src/lib/fleet.js`).
Writes made here show up in the app immediately and vice versa — same data.

## Tools

Use `mcp__Airtable_MCP_Server__*`. If unavailable, the equivalent `describe_table` /
`create_record` / `update_records` calls on `mcp__6f69f16b-3265-4295-a486-288429e81c5e__*`
(the fuller Airtable MCP server) work the same way, just requires `search_bases` /
`list_tables_for_base` first instead of the hardcoded IDs below.

Load tools before first use: `ToolSearch("select:mcp__Airtable_MCP_Server__list_records,mcp__Airtable_MCP_Server__create_record,mcp__Airtable_MCP_Server__update_records,mcp__Airtable_MCP_Server__get_record,mcp__Airtable_MCP_Server__search_records,mcp__Airtable_MCP_Server__delete_records")`

## Schema reference

**Base**: Happy Cuts — `appZOi48qf8SzyOml`

**Table: Equipment** — `tblgG4vY2mZoOdrkO` — one row per machine

| Field | Type | Notes |
|---|---|---|
| `Name` | text | primary field, required |
| `Type` | select | `Zero-Turn` \| `Push Mower` \| `Trimmer` \| `Other` |
| `Make`, `Model`, `Serial Number`, `DOM / Year`, `Engine`, `Deck Size` | text | free text |
| `Purchase Date` | date | `YYYY-MM-DD` |
| `Purchase Price` | currency | |
| `Status` | select | `Running` \| `In Repair` \| `Down` \| `Sold` |
| `Location` | select | `Home` \| `Buster's` \| `Job Site` — **physical location only.** Don't put "Sold" here; that's `Status`, not `Location`. Keeping them separate is intentional (avoids `Status: Running, Location: Sold` nonsense states). |
| `Photo URLs` | long text | JSON array of `{"url": "...", "kind": "tag"\|"machine"}` — see **Photos** below. Don't hand-write malformed JSON here; if empty, leave it unset rather than `"[]"` or `""`. |
| `Est. Market Value` | currency | manual estimate |
| `Market Value Last Updated` | date | **stamp this to today whenever you change `Est. Market Value`** — the app's staleness warning (>60 days) depends on it being accurate, not on it existing |
| `Notes` | long text | free text |
| `Cost Entries` | link → Cost Entries | **read-only from this side** — populated automatically by the reverse link when a Cost Entries row points at this Equipment record. Never write to it directly. |
| `Cost Entries Sum` | rollup | **read-only, computed.** Never write. |
| `Total Invested` | formula (`Purchase Price` + `Cost Entries Sum`) | **read-only, computed.** Never write. |
| `Est. Equity` | formula (`Est. Market Value` − `Total Invested`) | **read-only, computed.** Never write. |

**Table: Cost Entries** — `tbl4Etxh9weJ2Qitz` — one row per repair/part/expense

| Field | Type | Notes |
|---|---|---|
| `Description` | text | primary field, required — what it was |
| `Equipment` | link → Equipment | **required** — array of one record ID, e.g. `["recXXXXXXXXXXXXXX"]` |
| `Date` | date | `YYYY-MM-DD` |
| `Category` | select | `Parts` \| `Labor - Buster` \| `Labor - Self` \| `Battery` \| `Tires` \| `Blades` \| `Other` |
| `Cost` | currency | **nullable — leave unset for "dropped it off, no bill yet" repairs.** Don't default to 0; the app renders a missing Cost as a "TBD" badge, and 0 would read as "this was free." |
| `Vendor` | text | free text; app UI offers `Buster`/`Amazon`/`Walmart`/`TSC` as quick picks but any string is valid |
| `Notes` | text | optional |

## Rules

- Always pass `typecast: true` on create/update — matches the rest of Shep Portal's Airtable writes and lets you use new select option values without pre-creating them.
- Link fields (`Equipment` on Cost Entries) must be **string arrays** of record IDs: `["recXXXXXXXXXXXXXX"]`, even for a single link.
- Never write `Cost Entries` (on Equipment), `Cost Entries Sum`, `Total Invested`, or `Est. Equity` — all four are computed. Writing to them will either be rejected or get silently overwritten by the next formula recalc.
- Changing `Est. Market Value` without also updating `Market Value Last Updated` to today will make the record look falsely stale (or falsely fresh) in the app's "Needs attention" panel.
- Deleting an Equipment record does **not** delete its Cost Entries — they become orphaned (still exist, `Equipment` link cleared). Delete or reassign them first if that matters.

## Common operations

**Add a machine**
`create_record` on Equipment with at minimum `Name`. Leave `Purchase Price`/`Purchase Date` unset if genuinely unknown rather than guessing — the app surfaces unconfirmed records in its "Needs attention" panel by design.

**Log a repair/cost**
`create_record` on Cost Entries with `Description`, `Equipment: [equipmentRecordId]`, `Category`, `Date`. Set `Cost` only if known.

All updates go through `update_records`, which takes `records: [{ id, fields }]` (batch of
up to 10) — a single-record update is just a one-element array.

**Come back and fill in a TBD cost**
`update_records` on Cost Entries: `records: [{ id: "recXXX", fields: { Cost: 90 } }]`.

**Update market value**
`update_records` on Equipment: set `Est. Market Value` **and** `Market Value Last Updated: <today, YYYY-MM-DD>` together, every time, in the same call.

**Mark a machine sold**
`update_records` on Equipment: `fields: { Status: "Sold" }`. Leave `Location` as wherever it physically last was, or clear it — don't set `Location` to anything sale-related.

**List the fleet / find a machine**
`list_records` on Equipment (small table, just fetch it all — no need to filter server-side). Filter/search client-side over the returned records.

**Needs-attention check** (mirrors `Fleet.jsx`'s logic exactly — replicate it, don't invent a different rule)
Over non-Sold Equipment records, flag: `Purchase Price` is null, `Purchase Date` is empty, or (`Est. Market Value` is set AND `Market Value Last Updated` is more than 60 days ago).

**Fleet totals**
Sum `Total Invested`, `Est. Market Value`, `Est. Equity` across non-Sold Equipment records (they're precomputed fields — just read and sum, don't recompute from Cost Entries yourself).

**Repair history for one machine**
`list_records` on Cost Entries (whole table — it's small), then filter client-side for rows whose `Equipment` array contains the machine's record ID. Don't use `filterByFormula` for this: Airtable formulas read a link field as the linked record's *primary-field value*, not its ID, so `FIND()`-ing a record ID against `{Equipment}` silently matches nothing. `search_records` is a free-text search across field content, not an ID lookup — not the right tool here either.

## Photos — not fully MCP-operable

Equipment photos live in **Supabase Storage** (`fleet-photos` bucket, public), not Airtable
attachments — `Photo URLs` just holds a JSON pointer array. No MCP tool in this environment
can upload to Supabase Storage. To attach a photo without the app UI:

1. Upload via Supabase CLI: `supabase storage cp <local-file> "ss:///fleet-photos/equipment/<name>" --linked` (project must be linked — it already is, `zhboqhhjijktsanxhwjv`).
2. Get its public URL: `https://zhboqhhjijktsanxhwjv.supabase.co/storage/v1/object/public/fleet-photos/equipment/<name>`
3. Read the Equipment record's current `Photo URLs`, parse the JSON array, append `{"url": "<that url>", "kind": "tag"}` or `"machine"`, and `update_records` with the re-stringified array. **Read-modify-write** — don't overwrite the existing array.

If asked to "add a photo" and no local file is available to upload, say so rather than
fabricating a URL — a broken image link is worse than admitting the gap.
