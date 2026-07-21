# Hermes ↔ Shep Portal integration

Lets the Hermes agent (running on the Hostinger VPS) read and write Shep
Portal data over plain HTTP — no browser automation, no login session. It
talks to one Supabase edge function, `hermes-gateway`, which is the only
thing holding real Airtable/Supabase credentials.

```
Hermes (VPS) ──HTTPS──▶ hermes-gateway (Supabase edge function) ──▶ Airtable / Supabase
                 ▲
         Authorization: Bearer <HERMES_API_KEY>
```

## Why not browser automation for this

Everything Shep Portal does is Airtable or Supabase underneath — the React
app is just a UI on top. Driving headed Chrome against the portal to create
a task would mean re-solving login/session handling and being one CSS change
away from breaking. Reserve Hermes' browser for sites that actually require
it (county records, external listings) and have it write results back into
Shep Portal through this API instead.

## Identity & audit trail

Hermes has its own Supabase profile (`hermes-agent@shep-portal.internal`,
created by `supabase/migrations/20260720_create_hermes_agent_profile.sql`).
It has `can_view_tasks = true` and nothing else — this is **only** so it
shows up as an assignable user in the Tasks UI; it has no portal login use
(random password, never used). Every gateway call is logged to
`access_logs` with `user_email = 'hermes-agent@shep-portal.internal'`, so
its activity is visible in **Admin > Access Logs** next to human activity.

Because Hermes has a real profile, a human can assign it a task from the
existing Tasks UI (admin-only "assign to" picker) exactly like assigning to
a teammate — no frontend changes needed.

## Auth

Every request needs:

```
Authorization: Bearer <HERMES_API_KEY>
Content-Type: application/json
```

`HERMES_API_KEY` is a shared secret (not a Supabase JWT, not the Airtable
PAT) checked inside the function. Generate one and store it as a Supabase
secret **and** in Hermes' own env — see Deployment below.

## Actions (v1 — Tasks + Documents, read-mostly)

POST to `https://<project-ref>.supabase.co/functions/v1/hermes-gateway`
with body `{ "action": "...", ...payload }`.

| Action | Payload | Does |
|---|---|---|
| `ping` | — | Health check |
| `list_tasks` | `{ mineOnly?: bool (default true), status?: string, limit?: int }` | Lists tasks. `mineOnly: true` = only tasks assigned to Hermes (its work queue) |
| `create_task` | `{ title, module?, dueDate?, body?, notes?, sourceKey?, actionUrl?, assignTo?: 'hermes'\|<profile uuid> }` | Creates a task. Defaults to self-assigning; if assigned to a human, sends them an in-app notification (same as a human assigning to a human) |
| `update_task` | `{ taskId, status?, notes? }` | Updates a task — **only if it's currently assigned to Hermes**, otherwise rejected. Setting `status: "Done"` stamps `Completed At` |
| `search_documents` | `{ query?, tag?, limit? }` | Case-insensitive search across Name/OCR/Description/Action Required fields, optional tag filter |
| `get_document` | `{ id }` | Full record — Name, Document Type, Date, Description, OCR text, Action Required/Done, Sender/Recipient, Tags, Shared/Duplicate flags, and attachment URLs (Airtable attachment URLs expire — fetch promptly) |

> Note: the live Documents table has no `Summary`/`AI Summary`/`Category`/`Title` field (verified against the base schema) even though some frontend fallback chains guess at those names — `OCR` and `Description` are the real free-text fields to search/read.

All responses are `{ ok: true, ... }` or `{ ok: false, error: "..." }`.

### Example

```bash
curl -s https://<project-ref>.supabase.co/functions/v1/hermes-gateway \
  -H "Authorization: Bearer $HERMES_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"list_tasks","status":"To Do"}'
```

## Hermes-side client (drop into the agent's codebase)

```js
// shep-portal-client.js
const BASE_URL = process.env.SHEP_PORTAL_GATEWAY_URL // https://<ref>.supabase.co/functions/v1/hermes-gateway
const API_KEY  = process.env.SHEP_PORTAL_API_KEY

export async function shepPortal(action, payload = {}) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  const data = await res.json()
  if (!res.ok || data.ok === false) throw new Error(data.error || `shepPortal(${action}) failed: ${res.status}`)
  return data
}

// e.g. await shepPortal('list_tasks', { mineOnly: true, status: 'To Do' })
// e.g. await shepPortal('create_task', { title: 'Follow up on Benwick listing', module: 'properties' })
```

Point Hermes at its work queue with a simple loop: `list_tasks({ mineOnly:
true, status: 'To Do' })` on a schedule, work each one, then `update_task`
with `status: 'Done'` and a `notes` summary of what it did.

## Deployment (not yet done — needs to be run by someone with access to the
`zhboqhhjijktsanxhwjv` Supabase project; the CLI in this dev environment is
linked to a different account)

```bash
# 1. Run the migration in the Supabase SQL editor:
#    supabase/migrations/20260720_create_hermes_agent_profile.sql

# 2. Set the shared secret (generate your own, don't reuse this example):
supabase secrets set HERMES_API_KEY=<generate-a-long-random-value>
# AIRTABLE_PAT is already set as a secret (used by other functions).

# 3. Deploy the function:
supabase functions deploy hermes-gateway --no-verify-jwt

# 4. On the Hermes VPS, add to /home/hermes/.hermes/.env:
SHEP_PORTAL_GATEWAY_URL=https://zhboqhhjijktsanxhwjv.supabase.co/functions/v1/hermes-gateway
SHEP_PORTAL_API_KEY=<same value as HERMES_API_KEY above>
```

## Guardrails in v1 (intentional limits, not oversights)

- **Allowlisted actions only** — no generic Airtable/Supabase passthrough.
  New capabilities mean adding a new action function, not opening the API up.
- **No writes outside Tasks** — Documents, Properties, LLCs, Chickens, Deals,
  Happy Cuts, Bitcoin, Finances are all read-only or untouched in v1.
  Bitcoin and Finances should probably stay out of Hermes' reach entirely.
- **`update_task` checks assignment** — Hermes can't edit a task it doesn't
  own, even though the function runs with service-role Airtable access.
- **Full audit trail** — every call, success or failure, is logged.

## Suggested next slices (not built yet)

1. **Module read/update** for Properties/LLCs/Chickens/Deals/Backlog, with a
   per-module field allowlist (mirroring the `safeStr`/`typecast: true`
   rules in the main [CLAUDE.md](../CLAUDE.md)) — this is the highest-value
   next step but needs the allowlist designed per module before it's safe.
2. **Triage queue integration** — `list_triage_items` / `resolve_triage_item`
   against the rules in `src/lib/triageRules.js`, so Hermes can work the
   overdue/stale queue directly instead of you routing it through Tasks.
3. **Notification-driven loop** — give Hermes a Supabase Realtime
   subscription (or polling) on `notifications` for `action_needed`/
   `critical` items instead of waiting for a human to create a task.
4. **Document intake** — on new Storage uploads, have Hermes OCR/summarize
   and auto-file a Task, extending what `DocumentActionCenter` does today.
