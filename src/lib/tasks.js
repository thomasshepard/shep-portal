// Tasks Airtable helper — all CRUD for the Tasks module.
// Field IDs discovered by running scripts/setup-tasks-table.js against appYVLCn1NVLevdry.

const FIELDS = {
  TITLE:        'fldx2xmuxOVDls72i',
  STATUS:       'fldWNIkplM2WKr0kq',
  MODULE:       'fldR1DLAM4fEVDSws',
  DUE_DATE:     'fldLxGJRu1XeK4z7t',
  BODY:         'fldyFXF6qidj6sIaF',
  NOTES:        'fldJxZkDj1EI1WaKl',
  SOURCE_KEY:   'fldecwMW903tpCsfH',
  ACTION_URL:   'fldNzqMx8txSraQCY',
  USER_ID:      'fldTjTxZgy6RZHyaf',
  COMPLETED_AT: 'fldK1GKFJSdceoVtT',
}

export { FIELDS }

const BASE_ID  = import.meta.env.VITE_TASKS_BASE_ID
const TABLE_ID = 'tbl3Di18kSLwEj1vN'
const PAT      = import.meta.env.VITE_AIRTABLE_PAT

const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`

// Set to true temporarily to fetch all records and filter client-side (useful for diagnosing
// filterByFormula issues — check browser console for raw response).
const DEBUG_FETCH_ALL = false

function headers() {
  return { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' }
}

async function apiRequest(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: headers(),
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`)
  return json
}

/** Fetch all tasks for a user, sorted by due date asc. */
export async function fetchTasks(userId) {
  const formula = encodeURIComponent(`{User ID}='${userId}'`)
  const base = DEBUG_FETCH_ALL
    ? `${BASE_URL}?sort[0][field]=${FIELDS.DUE_DATE}&sort[0][direction]=asc`
    : `${BASE_URL}?filterByFormula=${formula}&sort[0][field]=${FIELDS.DUE_DATE}&sort[0][direction]=asc`

  const records = []
  let offset

  do {
    const url = offset ? `${base}&offset=${offset}` : base
    const res = await fetch(url, { headers: headers() })
    if (!res.ok) {
      const err = await res.text()
      console.error('[fetchTasks] error:', res.status, err)
      throw new Error(`Airtable fetch failed: ${res.status}`)
    }
    const json = await res.json()
    records.push(...(json.records || []))
    offset = json.offset
  } while (offset)

  // Always filter client-side as a safety net (handles encoding edge cases)
  const safeStr = v => (v == null ? '' : String(v))
  return records.filter(r => safeStr(r.fields[FIELDS.USER_ID]).trim() === userId.trim())
}

/** Create a new task record. */
export async function createTask({ title, module, dueDate, body, notes, sourceKey, actionUrl, userId }) {
  const fields = {
    [FIELDS.TITLE]:   title,
    [FIELDS.STATUS]:  'To Do',
    [FIELDS.USER_ID]: userId,
  }
  if (module)    fields[FIELDS.MODULE]     = module
  if (dueDate)   fields[FIELDS.DUE_DATE]   = dueDate
  if (body)      fields[FIELDS.BODY]       = body
  if (notes)     fields[FIELDS.NOTES]      = notes
  if (sourceKey) fields[FIELDS.SOURCE_KEY] = sourceKey
  if (actionUrl) fields[FIELDS.ACTION_URL] = actionUrl

  return apiRequest('POST', BASE_URL, { fields, typecast: true })
}

/** Update a task — only pass fields to change. */
export async function updateTask(recordId, fields) {
  return apiRequest('PATCH', `${BASE_URL}/${recordId}`, { fields, typecast: true })
}

/** Delete a task. */
export async function deleteTask(recordId) {
  return apiRequest('DELETE', `${BASE_URL}/${recordId}`)
}

/** Check whether a task with a given sourceKey already exists (for dedup). */
export async function taskExistsForSourceKey(sourceKey) {
  const formula = encodeURIComponent(`{${FIELDS.SOURCE_KEY}}='${sourceKey}'`)
  const json = await apiRequest('GET', `${BASE_URL}?filterByFormula=${formula}&maxRecords=1`)
  return (json.records || []).length > 0
}
