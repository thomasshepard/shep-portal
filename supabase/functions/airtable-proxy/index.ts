// Server-side pass-through of the Airtable REST API (SEC-1/KEY-6/API-2).
// Replaces the client-bundled VITE_AIRTABLE_PAT, which every logged-out
// visitor's browser previously held in full. The client never sees
// AIRTABLE_PAT now — it only ever talks to this function with its own
// Supabase session attached (via supabase.functions.invoke).
//
// First rule: any valid session is enough (closes anonymous access, the
// main exposure). Two bases get an extra check on top, per fix_plan.md:
//   - Bitcoin Transactions: admin only
//   - Credit Card Management: admin or can_view_finances
// Everything else stays open to any signed-in user for now — per-base
// tightening comes later, after a few days of request logging (see the
// console.log below), so Dashboard/Triage/Bookkeeping's cross-module reads
// don't get broken by rules written before anyone looked at real usage.
//
// Schema-modifying "meta" calls (ensureLinkFields/ensureDocsFields creating
// missing fields) are admin-only regardless of base — more sensitive than a
// record read/write, and that code already tolerates a failed/skipped call.
import { requireUser, AuthError } from '../_shared/auth.ts'

const AIRTABLE_PAT = Deno.env.get('AIRTABLE_PAT') ?? ''

const BTC_BASE_ID = 'appLvE5luEWaM5dWe' // Bitcoin Transactions
const CC_BASE_ID  = 'appEzmb0zR7DIPiG4' // Credit Card Management

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function isAdmin(callerClient: any, userId: string) {
  const { data } = await callerClient.from('profiles').select('role').eq('id', userId).single()
  return data?.role === 'admin'
}

async function hasRoleOrFlag(callerClient: any, userId: string, flag: string) {
  const { data } = await callerClient.from('profiles').select(`role, ${flag}`).eq('id', userId).single()
  return data?.role === 'admin' || !!data?.[flag]
}

function airtableUrl(baseId: string, table: string, recordId?: string, query?: unknown) {
  let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`
  if (recordId) url += `/${encodeURIComponent(recordId)}`
  const params = new URLSearchParams()
  // query is an array of [key, value] pairs (preserves repeated keys, e.g.
  // several `records[]=<id>` for a batch delete) — a plain object would
  // silently collapse those to one. Still accepts a plain object for safety.
  if (Array.isArray(query)) {
    for (const pair of query) {
      if (!Array.isArray(pair)) continue
      const [k, v] = pair
      if (v != null && v !== '') params.append(String(k), String(v))
    }
  } else if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query as Record<string, unknown>)) {
      if (v != null && v !== '') params.append(k, String(v))
    }
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let user, callerClient
  try {
    ;({ user, callerClient } = await requireUser(req))
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401
    return json({ error: (err as Error).message }, status)
  }

  try {
    const reqBody = await req.json()
    const { baseId, table, recordId, method = 'GET', query, body, meta, tableId } = reqBody as Record<string, unknown>

    if (!baseId || typeof baseId !== 'string') return json({ error: 'baseId is required' }, 400)

    // Schema-modifying meta calls: admin-only, any base.
    if (meta) {
      if (!(await isAdmin(callerClient, user.id))) return json({ error: 'Not authorized' }, 403)

      if (meta === 'listTables') {
        const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
          headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
        })
        const data = await res.json().catch(() => null)
        return json(data, res.status)
      }
      if (meta === 'createField') {
        if (!tableId || typeof tableId !== 'string') return json({ error: 'tableId is required' }, 400)
        const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tableId}/fields`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        })
        const data = await res.json().catch(() => null)
        return json(data, res.status)
      }
      return json({ error: `Unknown meta action: ${meta}` }, 400)
    }

    if (!table || typeof table !== 'string') return json({ error: 'table is required' }, 400)

    if (baseId === BTC_BASE_ID) {
      if (!(await isAdmin(callerClient, user.id))) return json({ error: 'Not authorized' }, 403)
    } else if (baseId === CC_BASE_ID) {
      if (!(await hasRoleOrFlag(callerClient, user.id, 'can_view_finances'))) return json({ error: 'Not authorized' }, 403)
    }

    console.log(`[airtable-proxy] ${user.email} ${method} ${baseId}/${table}`)

    const url = airtableUrl(baseId, table, recordId as string | undefined, query)
    const atRes = await fetch(url, {
      method: method as string,
      headers: {
        Authorization: `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const data = await atRes.json().catch(() => null)
    return json(data, atRes.status)
  } catch (err) {
    console.error('[airtable-proxy] Error:', err)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
