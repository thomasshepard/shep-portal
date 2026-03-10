const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID
const PAT = import.meta.env.VITE_AIRTABLE_PAT

function baseUrl(tableName) {
  return `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}`
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

/** Fetch all records from a table, handling Airtable's 100-record pagination. */
export async function fetchAllRecords(tableName, params = {}) {
  if (!airtableConfigured()) return { data: null, error: 'Airtable is not configured.' }
  try {
    const records = []
    let offset = undefined
    do {
      const query = new URLSearchParams()
      if (offset) query.set('offset', offset)
      if (params.filterByFormula) query.set('filterByFormula', params.filterByFormula)
      if (params.sort) query.set('sort[0][field]', params.sort.field), query.set('sort[0][direction]', params.sort.direction || 'asc')
      if (params.fields) params.fields.forEach((f, i) => query.set(`fields[${i}]`, f))

      const res = await fetch(`${baseUrl(tableName)}?${query}`, { headers: headers() })
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

/** Create a new record. */
export async function createRecord(tableName, fields) {
  if (!airtableConfigured()) return { data: null, error: 'Airtable is not configured.' }
  try {
    const res = await fetch(baseUrl(tableName), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ fields }),
    })
    const json = await res.json()
    if (!res.ok) return { data: null, error: json?.error?.message || `HTTP ${res.status}` }
    return { data: json, error: null }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

/** Update an existing record by ID. */
export async function updateRecord(tableName, recordId, fields) {
  if (!airtableConfigured()) return { data: null, error: 'Airtable is not configured.' }
  try {
    const res = await fetch(`${baseUrl(tableName)}/${recordId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ fields }),
    })
    const json = await res.json()
    if (!res.ok) return { data: null, error: json?.error?.message || `HTTP ${res.status}` }
    return { data: json, error: null }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

/** Delete a record by ID. */
export async function deleteRecord(tableName, recordId) {
  if (!airtableConfigured()) return { data: null, error: 'Airtable is not configured.' }
  try {
    const res = await fetch(`${baseUrl(tableName)}/${recordId}`, {
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
  // Airtable returns dates as YYYY-MM-DD; parse without timezone shift
  const [y, m, d] = val.split('-')
  if (!y || !m || !d) return val
  return `${m}/${d}/${y}`
}

export function fmtField(val) {
  if (val == null || val === '' || val === false) return '—'
  if (val === true) return 'Yes'
  return val
}
