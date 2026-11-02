import { supabase } from './supabase'

const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID
const PAT = import.meta.env.VITE_AIRTABLE_PAT

export const CHICKENS_BASE_ID = import.meta.env.VITE_AIRTABLE_CHICKENS_BASE_ID
export const PM_BASE_ID = import.meta.env.VITE_AIRTABLE_PM_BASE_ID
export const DOCS_BASE_ID = import.meta.env.VITE_AIRTABLE_DOCS_BASE_ID
// Shepard Owned Companies (LLCs) — same value as the default BASE_ID, exported so
// modules outside pages/LLCs.jsx / LLCDetail.jsx can pass it explicitly.
export const LLC_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID
export const FBM_BASE_ID = 'app25IsSJz9bATUV7'
export const TASKS_BASE_ID = import.meta.env.VITE_TASKS_BASE_ID
export const RECIPES_BASE_ID = 'appPKrIVr569rWySg'
export const BTC_BASE_ID = import.meta.env.VITE_AIRTABLE_BTC_BASE_ID

function buildUrl(tableName, baseId) {
  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`
}

function headers() {
  return {
    Authorization: `Bearer ${PAT}`,
    'Content-Type': 'application/json',
  }
}

export function airtableConfigured() {
  return !!(BASE_ID && PAT)
}

// ── Phase 7 server-side proxy (SEC-1/KEY-6/API-2) ──────────────────────────
// Rollout: admin-only for now (window.__shepIsAdmin, set by useAuth.jsx once
// the profile loads — a lib file has no React context to read it from).
// Once VA/member testing confirms no regressions, flip this to `true`
// unconditionally; flipping it back to the admin-only check is the rollback.
function shouldUseProxy() {
  return typeof window !== 'undefined' && window.__shepIsAdmin === true
}

function parseAirtableUrl(urlStr) {
  const u = new URL(urlStr)
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts[1] === 'meta') {
    // ['v0','meta','bases', baseId, 'tables', tableId?, 'fields'?]
    const baseIdFromMeta = parts[3]
    if (parts[6] === 'fields') return { meta: 'createField', baseId: baseIdFromMeta, tableId: parts[5] }
    return { meta: 'listTables', baseId: baseIdFromMeta }
  }
  const baseIdFromUrl = parts[1]
  const table = decodeURIComponent(parts[2])
  const recordId = parts[3] ? decodeURIComponent(parts[3]) : undefined
  // Array of [key, value] pairs, not Object.fromEntries — a plain object would
  // silently drop all but the last value for a repeated key (e.g. recipes.js's
  // batch delete, which sends several `records[]=<id>` pairs).
  const query = [...u.searchParams.entries()]
  return { baseId: baseIdFromUrl, table, recordId, query }
}

function fakeResponse(status, data) {
  return { ok: status >= 200 && status < 300, status, json: async () => data, text: async () => JSON.stringify(data) }
}

/** Drop-in replacement for fetch() against an api.airtable.com URL. Routes
 *  through the airtable-proxy edge function when the proxy rollout is
 *  enabled for this user; otherwise behaves exactly like fetch() did before
 *  Phase 7 (direct call, client-bundled PAT). */
export async function airtableFetch(urlStr, options = {}) {
  if (!shouldUseProxy()) return fetch(urlStr, options)

  const parsed = parseAirtableUrl(urlStr)
  const method = options.method || 'GET'
  let body
  if (options.body) {
    try { body = JSON.parse(options.body) } catch { body = options.body }
  }

  const { data, error } = await supabase.functions.invoke('airtable-proxy', { body: { ...parsed, method, body } })
  if (error) {
    let message = error.message || 'Airtable request failed'
    const status = error.context?.status || 500
    try {
      const errBody = await error.context?.json?.()
      if (errBody?.error?.message) message = errBody.error.message
      else if (typeof errBody?.error === 'string') message = errBody.error
    } catch {
      // ignore — fall back to error.message above
    }
    return fakeResponse(status, { error: { message } })
  }
  return fakeResponse(200, data)
}

/** Fetch all records from a table, handling Airtable's 100-record pagination.
 *  Pass baseId to use a different base (e.g. CHICKENS_BASE_ID). */
export async function fetchAllRecords(tableName, params = {}, baseId = BASE_ID) {
  if (!PAT) return { data: null, error: 'Airtable PAT is not configured.' }
  try {
    const records = []
    let offset = undefined
    do {
      const query = new URLSearchParams()
      if (offset) query.set('offset', offset)
      if (params.filterByFormula) query.set('filterByFormula', params.filterByFormula)
      if (params.sort) {
        query.set('sort[0][field]', params.sort.field)
        query.set('sort[0][direction]', params.sort.direction || 'asc')
      }
      if (params.fields) params.fields.forEach((f, i) => query.set(`fields[${i}]`, f))

      const res = await airtableFetch(`${buildUrl(tableName, baseId)}?${query}`, { headers: headers() })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { data: null, error: err?.error?.message || `HTTP ${res.status}` }
      }
      const json = await res.json()
      records.push(...(json.records || []))
      offset = json.offset
    } while (offset)

    return { data: records, error: null }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

/** Create a new record. typecast is always true to auto-create select options. */
export async function createRecord(tableName, fields, baseId = BASE_ID, { typecast = true } = {}) {
  if (!PAT) return { data: null, error: 'Airtable PAT is not configured.' }
  try {
    const res = await airtableFetch(buildUrl(tableName, baseId), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ fields, typecast: true }),
    })
    const json = await res.json()
    if (!res.ok) return { data: null, error: json?.error?.message || `HTTP ${res.status}` }
    return { data: json, error: null }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

/** Create up to many records, chunked into Airtable's 10-per-request limit.
 *  Returns { data: createdRecords[], error } — stops and reports on first failed chunk. */
export async function createRecords(tableName, records, baseId = BASE_ID) {
  if (!PAT) return { data: null, error: 'Airtable PAT is not configured.' }
  const created = []
  try {
    for (let i = 0; i < records.length; i += 10) {
      const chunk = records.slice(i, i + 10).map((fields) => ({ fields }))
      const res = await airtableFetch(buildUrl(tableName, baseId), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ records: chunk, typecast: true }),
      })
      const json = await res.json()
      if (!res.ok) {
        return { data: created, error: json?.error?.message || `HTTP ${res.status}` }
      }
      created.push(...(json.records || []))
    }
    return { data: created, error: null }
  } catch (e) {
    return { data: created, error: e.message }
  }
}

/** Update an existing record by ID. typecast is always true to auto-create select options. */
export async function updateRecord(tableName, recordId, fields, baseId = BASE_ID, { typecast = true } = {}) {
  if (!PAT) return { data: null, error: 'Airtable PAT is not configured.' }
  try {
    const res = await airtableFetch(`${buildUrl(tableName, baseId)}/${recordId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ fields, typecast: true }),
    })
    const json = await res.json()
    if (!res.ok) return { data: null, error: json?.error?.message || `HTTP ${res.status}` }
    return { data: json, error: null }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

/** Delete a record by ID. */
export async function deleteRecord(tableName, recordId, baseId = BASE_ID) {
  if (!PAT) return { data: null, error: 'Airtable PAT is not configured.' }
  try {
    const res = await airtableFetch(`${buildUrl(tableName, baseId)}/${recordId}`, {
      method: 'DELETE',
      headers: headers(),
    })
    const json = await res.json()
    if (!res.ok) return { data: null, error: json?.error?.message || `HTTP ${res.status}` }
    return { data: json, error: null }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

// ── Formatting helpers ────────────────────────────────────

export function fmtCurrency(val) {
  if (val == null || val === '') return '—'
  return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtPercent(val) {
  if (val == null || val === '') return '—'
  return Number(val).toFixed(1) + '%'
}

export function fmtDate(val) {
  if (!val) return '—'
  const [y, m, d] = val.split('-')
  if (!y || !m || !d) return val
  return `${m}/${d}/${y}`
}

export function fmtField(val) {
  if (val == null || val === '' || val === false) return '—'
  if (val === true) return 'Yes'
  return val
}
