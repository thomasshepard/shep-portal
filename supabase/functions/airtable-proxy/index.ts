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
//
// Record-level rules (_shared/recordFilters.ts): inside an allowed base, Tasks,
// Documents and owner-scoped Property Management data are narrowed to what the
// caller's pages already show. They log "record-filter log-only: would ..." until the
// AIRTABLE_RECORD_FILTER_ENFORCE secret is "true". Call Recordings is admin only,
// always enforced.
import { requireUser, AuthError } from '../_shared/auth.ts'
import {
  PM_BASE_ID, ruleKind, neededFields, recordAllowed, filterRecords, computePmScope, writeAllowed,
  type FilterProfile, type PmScope, type RuleKind, type TableRef, type AtRecord,
} from '../_shared/recordFilters.ts'

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

// ── Record-level filtering helpers ───────────────────────────────────────────

const filterEnforced = () => Deno.env.get('AIRTABLE_RECORD_FILTER_ENFORCE') === 'true'
const atHeaders = () => ({ Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' })
const REC_ID = /^rec[A-Za-z0-9]{14}$/

// Rules are keyed by table name; the client sometimes sends a table ID instead.
const tableNames = new Map<string, { at: number; names: Map<string, string> }>()
async function resolveTable(baseId: string, table: string): Promise<TableRef> {
  if (!/^tbl[A-Za-z0-9]{14}$/.test(table)) return { id: '', name: table }
  let hit = tableNames.get(baseId)
  if (!hit || Date.now() - hit.at > 600_000) {
    try {
      const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, { headers: atHeaders() })
      const data = await res.json()
      if (Array.isArray(data?.tables)) {
        hit = { at: Date.now(), names: new Map(data.tables.map((t: any) => [t.id, t.name])) }
        tableNames.set(baseId, hit)
      }
    } catch (e) {
      console.warn('[airtable-proxy] table name lookup failed:', (e as Error).message)
    }
  }
  return { id: table, name: hit?.names.get(table) ?? '' }
}

async function fetchAllRecords(baseId: string, table: string, fields: string[]): Promise<AtRecord[]> {
  const out: AtRecord[] = []
  let offset: string | undefined
  do {
    const p = new URLSearchParams()
    for (const f of fields) p.append('fields[]', f)
    if (offset) p.set('offset', offset)
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?${p}`, { headers: atHeaders() })
    if (!res.ok) throw new Error(`scope fetch ${table} failed (${res.status})`)
    const d = await res.json()
    out.push(...(d.records ?? []))
    offset = d.offset
  } while (offset)
  return out
}

const pmScopes = new Map<string, { at: number; scope: PmScope }>()
async function getPmScope(profile: FilterProfile): Promise<PmScope> {
  const key = String(profile.property_owner_filter)
  const hit = pmScopes.get(key)
  if (hit && Date.now() - hit.at < 60_000) return hit.scope
  const [props, units, projects] = await Promise.all([
    fetchAllRecords(PM_BASE_ID, 'Property', ['Owner']),
    fetchAllRecords(PM_BASE_ID, 'Rental Units', ['Property']),
    fetchAllRecords(PM_BASE_ID, 'Project', ['Property']),
  ])
  const scope = computePmScope(profile, props, units, projects)
  pmScopes.set(key, { at: Date.now(), scope })
  return scope
}

// Airtable omits empty fields, so a client asking for `fields[]=Name` would leave the
// rule nothing to evaluate. Add the fields the rule needs to such queries.
function withNeededFields(query: unknown, kind: RuleKind, t: TableRef): unknown {
  if (!Array.isArray(query)) return query
  const has = (re: RegExp) => query.some((p) => Array.isArray(p) && re.test(String(p[0])))
  if (!has(/^fields(\[.*\])?$/)) return query
  const byId = query.some((p) => Array.isArray(p) && p[0] === 'returnFieldsByFieldId' && String(p[1]) === 'true')
  return [...query, ...neededFields(kind, t).map(([name, id]) => ['fields[]', byId ? id : name])]
}

// Returns why each write would be refused (empty = fine). Looks up the stored
// record first, so reassigning or editing someone else's record is caught.
async function checkWrite(
  kind: RuleKind, profile: FilterProfile, t: TableRef, baseId: string, table: string, method: string,
  recordId: string | undefined, query: unknown, body: any, pm?: PmScope,
): Promise<string[]> {
  const problems: string[] = []
  const recs: any[] = Array.isArray(body?.records) ? body.records : []
  const targets: Array<{ id: string; fields?: Record<string, unknown> }> = []
  if (recordId) targets.push({ id: recordId, fields: body?.fields })
  for (const r of recs) if (r?.id) targets.push({ id: String(r.id), fields: r.fields })
  if (Array.isArray(query)) {
    for (const p of query) {
      if (Array.isArray(p) && /^records(\[.*\])?$/.test(String(p[0])) && p[1]) targets.push({ id: String(p[1]) })
    }
  }
  for (const tg of targets.slice(0, 25)) {
    if (!REC_ID.test(tg.id)) { problems.push('invalid record id'); continue }
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${tg.id}`, { headers: atHeaders() })
    if (!res.ok) continue // missing record: Airtable will answer the write itself
    const d = writeAllowed(kind, profile, t, await res.json(), tg.fields, pm)
    if (!d.ok) problems.push(d.reason ?? 'not allowed')
  }
  if (method === 'POST') {
    const creates = recs.length ? recs.map((r) => r?.fields) : [body?.fields]
    for (const f of creates.slice(0, 25)) {
      const d = writeAllowed(kind, profile, t, null, f, pm)
      if (!d.ok) problems.push(`create: ${d.reason}`)
    }
  }
  return problems
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

    // ── Record-level rules ──
    const m = String(method).toUpperCase()
    const profile = ((await getProfile(callerClient, user.id)) ?? { id: user.id }) as FilterProfile
    const tref = profile.role === 'admin' ? { id: '', name: table } : await resolveTable(baseId, table)
    const kind = ruleKind(baseId, tref, profile)
    const enforce = filterEnforced()
    const label = `${user.email} ${m} ${baseId}/${tref.name || table} [${kind}]`
    let pm: PmScope | undefined
    let upstreamQuery: unknown = query

    if (kind === 'calls') {
      return json({ error: 'Not authorized' }, 403) // admin only, always enforced
    }
    if (kind) {
      if (kind === 'pm') {
        try {
          pm = await getPmScope(profile)
        } catch (e) {
          console.error('[airtable-proxy] owner scope failed:', (e as Error).message)
          if (enforce) return json({ error: 'Not authorized' }, 403)
        }
      }
      if (m === 'GET') {
        upstreamQuery = withNeededFields(query, kind, tref)
      } else {
        let problems: string[]
        try {
          problems = await checkWrite(kind, profile, tref, baseId, table, m, recordId as string | undefined, query, body, pm)
        } catch (e) {
          console.error('[airtable-proxy] write check failed:', (e as Error).message)
          problems = enforce ? ['write check unavailable'] : []
        }
        if (problems.length) {
          console.warn(`[airtable-proxy] record-filter ${enforce ? 'DENIED' : 'log-only: would deny'} write ${label}: ${[...new Set(problems)].join('; ')}`)
          if (enforce) return json({ error: 'Not authorized' }, 403)
        }
      }
    }

    const url = airtableUrl(baseId, table, recordId as string | undefined, upstreamQuery)
    const atRes = await fetch(url, {
      method: m,
      headers: atHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    let data = await atRes.json().catch(() => null)

    if (kind && m === 'GET' && atRes.ok && data) {
      if (Array.isArray(data.records)) {
        const { kept, dropped, unscoped } = filterRecords(kind, profile, tref, data.records, pm)
        if (dropped.length) {
          console.warn(`[airtable-proxy] record-filter ${enforce ? 'filtered' : 'log-only: would filter'} ${dropped.length}/${data.records.length} records ${label}`)
          if (enforce) data = { ...data, records: kept }
        }
        if (unscoped) console.log(`[airtable-proxy] record-filter: ${label} has no owner rule yet (returned unfiltered)`)
      } else if (data.id && data.fields) {
        const d = recordAllowed(kind, profile, tref, data, pm)
        if (!d.ok) {
          console.warn(`[airtable-proxy] record-filter ${enforce ? 'DENIED' : 'log-only: would deny'} read ${label}: ${d.reason}`)
          if (enforce) return json({ error: { type: 'NOT_FOUND', message: 'Record not found' } }, 404)
        }
      }
    }
    return json(data, atRes.status)
  } catch (err) {
    console.error('[airtable-proxy] Error:', err)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
