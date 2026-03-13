const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID
const PAT = import.meta.env.VITE_AIRTABLE_PAT

export const CHICKENS_BASE_ID = import.meta.env.VITE_AIRTABLE_CHICKENS_BASE_ID
export const PM_BASE_ID = import.meta.env.VITE_AIRTABLE_PM_BASE_ID

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

      const res = await fetch(`${buildUrl(tableName, baseId)}?${query}`, { headers: headers() })
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

/** Create a new record. Pass typecast: true to auto-create select options. */
export async function createRecord(tableName, fields, baseId = BASE_ID, { typecast = false } = {}) {
  if (!PAT) return { data: null, error: 'Airtable PAT is not configured.' }
  try {
    const res = await fetch(buildUrl(tableName, baseId), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ fields, ...(typecast ? { typecast: true } : {}) }),
    })
    const json = await res.json()
    if (!res.ok) return { data: null, error: json?.error?.message || `HTTP ${res.status}` }
    return { data: json, error: null }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

/** Update an existing record by ID. Pass typecast: true to auto-create select options. */
export async function updateRecord(tableName, recordId, fields, baseId = BASE_ID, { typecast = false } = {}) {
  if (!PAT) return { data: null, error: 'Airtable PAT is not configured.' }
  try {
    const res = await fetch(`${buildUrl(tableName, baseId)}/${recordId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ fields, ...(typecast ? { typecast: true } : {}) }),
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
    const res = await fetch(`${buildUrl(tableName, baseId)}/${recordId}`, {
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
