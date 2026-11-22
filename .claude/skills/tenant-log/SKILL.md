---
name: tenant-log
description: Log tenant interactions, repairs, calls, complaints, or payment questions directly against Airtable via MCP when Thomas dictates a note about a property or tenant, or update/resolve open issues without going through the Shep Portal UI.
---

# Tenant Log — Tenant Interaction Quick-Log (via MCP)

Operates on the **Tenant Log** table in the Property Management base. This is the primary intake for Thomas's dictated notes about properties and tenants (calls, repairs, complaints, payment questions).

Entries logged here appear immediately in Shep Portal on the property timeline (`src/components/TenantLogPanel.jsx` in `PropertyDetail.jsx`) and in the cross-property open issues queue (`src/components/TenantIssuesQueue.jsx` in `Properties.jsx`).

## Schema Reference

- **Base**: Property Management — `appeuX9BHNgVXxdYZ` (`PM_BASE_ID` / `VITE_AIRTABLE_PM_BASE_ID`)
- **Table**: `Tenant Log` — `tblnBwKycNSXhc2Wt`
- **Created timestamp**: There is **no Created field** in Airtable. Use the record's built-in `createdTime` metadata (present on the record object, next to `id` and `fields`, not inside `fields`).

### Fields & IDs

Field IDs and names match `src/lib/tenantLog.js` (`TL_FIELDS` and `TL_READ`) and section 3 of `docs/specs/tenant-quick-log.md`:

| Field Name | Field ID | Type | Notes |
|---|---|---|---|
| `Summary` | `fldtk6p828x42UDCW` | Single line text | Primary field. Short title, 3 to 8 words (e.g. "Kitchen sink leaking") |
| `Property` | `fldtRyz8V0SgshF43` | Link to Property | String array of one Property record ID: `["recXXXXXXXXXXXXXX"]`. Required by the app |
| `Tenant` | `fldfF2ZJvlt5dtc8t` | Link to Tenants | String array of one Tenant record ID: `["recXXXXXXXXXXXXXX"]`. Optional, leave empty if unknown |
| `Type` | `fld99fd0cRbDCP5QX` | Single select | `Call`, `Repair`, `Complaint`, `Payment question`, `Other` |
| `Details` | `fldNRpaRn1EU1B740` | Long text | The full note, close to the words Thomas used |
| `Urgency` | `fldcuF3OVzYSAf4sZ` | Single select | `Low`, `Normal`, `Urgent` |
| `Status` | `fldDCj7XRiq9HOn9N` | Single select | `Open`, `In progress`, `Resolved` |
| `Date` | `fldbqdocQ36JNPULk` | Date | `YYYY-MM-DD` (when it happened, not when logged) |
| `Logged By` | `fldQ0GmbHqeD2pCaT` | Single line text | `"Claude (voice note)"`, `"Thomas"`, or `"Janine"` |
| `Source` | `fld4tA31mGUxjeNod` | Single select | `Portal`, `AI agent` |
| `Resolved Date` | `fldnrcmwV0QuDN1CF` | Date | `YYYY-MM-DD`. Set when Status becomes `Resolved` |
| `Resolution` | `fldHCyzUyj7YTjtUl` | Long text | What fixed it. Optional |

### Single-Select Option Lists

- **Type**: `Call`, `Repair`, `Complaint`, `Payment question`, `Other`
- **Urgency**: `Low`, `Normal`, `Urgent`
- **Status**: `Open`, `In progress`, `Resolved`
- **Source**: `Portal`, `AI agent`

## Hard Rules & Boundaries

- **Writes via MCP**: Always pass `typecast: true` on create or update operations. Writes use field IDs (`fldXXX`), reads return field names.
- **Link fields**: Must be string arrays of record IDs, e.g. `["recXXXXXXXXXXXXXX"]`.
- **Never create, edit, or delete Property records.**
- **Never write to Tenants, Lease Agreements, or Maintenance Requests.**
- **Never create a Maintenance Request, text the tenant, or call a vendor unless Thomas asks for that separately.**

## How to Log a Spoken Note (Section 4 Rules)

When Thomas dictates a note (e.g. "the sink at 188 Virginia is leaking"):

1. **Property**: Search the Property table's `Address` field for the address or street name he said. If two match or none do, ask him. Link the record ID: `["recXXXXXXXXXXXXXX"]`.
2. **Tenant**: If he names a person, find them in `Tenants` linked to that property. If unsure, leave it empty. **Never guess.**
3. **Type**:
   - `Repair` for anything broken.
   - `Payment question` for rent, deposits, fees.
   - `Complaint` for neighbor, noise, behavior.
   - `Call` when he only says someone called.
   - Otherwise `Other`.
4. **Summary**: 3 to 8 words in plain language.
5. **Details**: His words, cleaned up a little, nothing added.
6. **Urgency**:
   - `Urgent`: active water leak, no heat or AC in bad weather, no power, no water, gas smell, lockout, anything unsafe.
   - `Low`: FYI only.
   - `Normal`: everything else.
7. **Status**: `Open`, unless he says it's already handled (then `Resolved`, with `Resolved Date` and `Resolution`).
8. **Date**: The day he says it happened, else today (`YYYY-MM-DD`, America/Chicago).
9. **Logged By**: `"Claude (voice note)"`.
10. **Source**: `"AI agent"`.

### Confirmation

The agent then tells him back in **one line** what it logged:
> "Logged an urgent repair at 188 Virginia: sink leaking"

Do NOT create a Maintenance Request, text the tenant, or call a vendor unless he asks for that separately.

## Updating and Resolving an Entry

To update an entry (e.g. "the sink is fixed"):
1. Find the open entry for that property and summary in `Tenant Log` (`tblnBwKycNSXhc2Wt`).
2. Update the record via MCP (`typecast: true`):
   - Set `Status` to `Resolved`.
   - Set `Resolved Date` to today (`YYYY-MM-DD`, America/Chicago).
   - Set `Resolution` to what he said.
3. Confirm in one line back to Thomas.
