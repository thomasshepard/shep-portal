// Server-side pass-through of the Airtable REST API (SEC-1/KEY-6/API-2).
// Replaces the client-bundled VITE_AIRTABLE_PAT, which every logged-out
// visitor's browser previously held in full. The client never sees
// AIRTABLE_PAT now — it only ever talks to this function with its own
// Supabase session attached (via supabase.functions.invoke).
//
// A valid session is required for everything. On top of that, BASE_RULES says
// which permissions may reach each base. The Airtable token can reach ~60
// bases, so a base that isn't listed (payroll, 401k, lead lists...) is refused
// for non-admins outright. Bitcoin and Credit Card rules are always enforced;
// the rest only log "would deny" until the AIRTABLE_PROXY_ENFORCE secret is
// "true", so cross-module readers (Dashboard, Triage, Documents) can be
// checked against real traffic first.
//
// Schema-modifying "meta" calls (ensureLinkFields/ensureDocsFields creating
// missing fields) are admin-only regardless of base — more sensitive than a
// record read/write, and that code already tolerates a failed/skipped call.
import { requireUser, AuthError } from '../_shared/auth.ts'

const AIRTABLE_PAT = Deno.env.get('AIRTABLE_PAT') ?? ''

// `any` lists capabilities (names as in `permissions` in src/hooks/useAuth.jsx),
// any one of which grants access; admins always pass. A base lists every
// permission whose pages read it, including cross-module readers: Triage reads
// most bases, Documents links to PM and LLC records, Insurance and Bookkeeping
// link to Docs, Workstreams reads Tasks and PM.
interface BaseRule { name: string; any: string[]; enforced?: boolean }
const BASE_RULES: Record<string, BaseRule> = {
  appLvE5luEWaM5dWe: { name: 'Bitcoin Transactions',   any: [], enforced: true },
  appEzmb0zR7DIPiG4: { name: 'Credit Card Management', any: ['can_view_finances'], enforced: true },
  appeuX9BHNgVXxdYZ: { name: 'Property Management',    any: ['properties', 'can_view_insurance', 'documents', 'can_view_triage', 'can_view_workstreams'] },
  appvX3Tu1OGxOZB8k: { name: 'Shepard Owned Companies', any: ['llcs', 'documents', 'can_view_triage'] },
  apppIiT84EaowkQVR: { name: 'Chicken Farm',           any: ['chickens', 'can_view_triage'] },
  app9ZYxynGul6hYZU: { name: 'Desk Paper Cleanup',     any: ['documents', 'llcs', 'properties', 'can_view_insurance', 'can_view_bookkeeping', 'can_view_triage'] },
  app25IsSJz9bATUV7: { name: 'FB Marketplace Monitor', any: ['deals'] },
  appZOi48qf8SzyOml: { name: 'Happy Cuts',             any: ['can_view_happy_cuts', 'can_view_fleet'] },
  appYVLCn1NVLevdry: { name: 'Shep Portal - Tasks',    any: ['can_view_tasks', 'can_view_workstreams', 'can_view_triage'] },
  appPKrIVr569rWySg: { name: 'Recipes',                any: ['can_view_recipes'] },
  appp0qWrN24f8wqho: { name: 'Backlog',                any: ['can_view_backlog', 'can_view_triage'] },
  appp0rx0SV1WuIUrh: { name: 'Rank Expand',            any: [] },
}

function capabilities(p: any): Set<string> {
  const va = p?.role === 'va'
  const caps = new Set<string>()
  if (va || p?.can_view_properties) caps.add('properties')
  if (p?.can_view_llcs) caps.add('llcs')
  if (p?.can_view_chickens) caps.add('chickens')
  if (p?.can_view_documents) caps.add('documents')
  if (va || p?.can_view_deals) caps.add('deals')
  if (va || p?.can_view_triage) caps.add('can_view_triage')
  for (const k of ['can_view_tasks', 'can_view_recipes', 'can_view_backlog', 'can_view_happy_cuts', 'can_view_finances',
    'can_view_insurance', 'can_view_fleet', 'can_view_workstreams', 'can_view_bookkeeping']) {
    if (p?.[k]) caps.add(k)
  }
  return caps
}

function checkBaseAccess(profile: any, baseId: string): { ok: boolean; reason: string } {
  if (profile?.role === 'admin') return { ok: true, reason: '' }
  const rule = BASE_RULES[baseId]
  if (!rule) return { ok: false, reason: 'base is not one the portal uses' }
  const caps = capabilities(profile)
  if (rule.any.some((c) => caps.has(c))) return { ok: true, reason: '' }
  return { ok: false, reason: `${rule.name} needs ${rule.any.length ? rule.any.join(' or ') : 'admin'}` }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// One profile lookup per user per 30s per instance instead of one per request
// (the Dashboard alone sends several in a burst). A role or flag change takes
// up to 30s to apply here.
const profileCache = new Map<string, { at: number; profile: any }>()
const PROFILE_TTL_MS = 30_000

async function getProfile(callerClient: any, userId: string) {
  const hit = profileCache.get(userId)
  if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.profile
  const { data } = await callerClient.from('profiles').select('*').eq('id', userId).single()
  if (data) profileCache.set(userId, { at: Date.now(), profile: data })
  return data
}

async function isAdmin(callerClient: any, userId: string) {
  return (await getProfile(callerClient, userId))?.role === 'admin'
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

    const access = checkBaseAccess(await getProfile(callerClient, user.id), baseId)
    if (!access.ok) {
      // Unlisted bases and the two sensitive ones are refused outright; the
      // other per-base rules log only until AIRTABLE_PROXY_ENFORCE is "true".
      const rule = BASE_RULES[baseId]
      if (!rule || rule.enforced || Deno.env.get('AIRTABLE_PROXY_ENFORCE') === 'true') {
        return json({ error: 'Not authorized' }, 403)
      }
      console.warn(`[airtable-proxy] base-rules log-only: would deny ${user.email} ${method} ${baseId}/${table} (${access.reason})`)
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
