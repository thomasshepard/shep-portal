import { supabase } from './supabase.js'
import { notify } from './notifications.js'

// ── Bulk-assignment debounce (Step 8h) ───────────────────────────────────────
// Buffers assignment notifications keyed by (actorId:recipientId) for 5 seconds.
// If multiple tasks are assigned to the same user within the window, one collapsed
// notification fires instead of N individual ones.
const _assignBuffer = new Map()

function notifyAssignmentDebounced({ actorId, actorName, recipientId, taskTitle, dueDate, recordId }) {
  const key = `${actorId}:${recipientId}`
  const existing = _assignBuffer.get(key)
  if (existing) {
    clearTimeout(existing.timer)
    existing.count++
    existing.items.push({ taskTitle, dueDate, recordId })
  } else {
    _assignBuffer.set(key, { count: 1, items: [{ taskTitle, dueDate, recordId }], actorName, recipientId })
  }
  const entry = _assignBuffer.get(key)
  entry.timer = setTimeout(() => {
    _assignBuffer.delete(key)
    const { count, items } = entry
    const single = count === 1
    notify({
      userIds:   recipientId,
      title:     single
        ? `${actorName} assigned: "${items[0].taskTitle}"${items[0].dueDate ? ` · Due ${items[0].dueDate}` : ''}`
        : `${actorName} assigned ${count} tasks to you`,
      module:    'system',
      category:  'tasks',
      severity:  'action_needed',
      actionUrl: single ? `/#/tasks/${items[0].recordId}` : '/#/tasks',
      sourceKey: single ? `task_assigned:${items[0].recordId}` : `task_assigned_bulk:${recipientId}:${Date.now()}`,
    }).catch(() => {})
  }, 5000)
}

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
  TODAY:        'fldXBwD9Pf7yDgkAR',
}

export { FIELDS }

const BASE_ID  = import.meta.env.VITE_TASKS_BASE_ID
const TABLE_ID = 'tbl3Di18kSLwEj1vN'
const PAT      = import.meta.env.VITE_AIRTABLE_PAT

const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`
const FIELD_ID_PARAM = 'returnFieldsByFieldId=true'

function withFieldIds(url) {
  return url.includes('?') ? `${url}&${FIELD_ID_PARAM}` : `${url}?${FIELD_ID_PARAM}`
}

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
    ? `${BASE_URL}?${FIELD_ID_PARAM}&sort[0][field]=${FIELDS.DUE_DATE}&sort[0][direction]=asc`
    : `${BASE_URL}?${FIELD_ID_PARAM}&filterByFormula=${formula}&sort[0][field]=${FIELDS.DUE_DATE}&sort[0][direction]=asc`

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

  const safeStr = v => (v == null ? '' : String(v))
  return records.filter(r => safeStr(r.fields[FIELDS.USER_ID]).trim() === userId.trim())
}

/** Fetch a single task record by Airtable record ID. */
export async function fetchTaskById(recordId) {
  const json = await apiRequest('GET', withFieldIds(`${BASE_URL}/${recordId}`))
  return json
}

/**
 * Create a new task record.
 * If assignedBy is provided and differs from userId, the assignee receives
 * an assignment notification.
 */
export async function createTask({
  title, module, dueDate, body, notes, sourceKey, actionUrl, userId,
  assignedBy, assignedByName,
}) {
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

  const json = await apiRequest('POST', withFieldIds(BASE_URL), { records: [{ fields }], typecast: true })
  const record = json.records[0]

  // Notify the assignee when an admin creates the task on their behalf.
  // Uses debounced helper so bulk-assigning 5 tasks fires one notification, not five.
  if (assignedBy && userId && userId !== assignedBy) {
    notifyAssignmentDebounced({
      actorId:    assignedBy,
      actorName:  assignedByName || 'A teammate',
      recipientId: userId,
      taskTitle:  title,
      dueDate,
      recordId:   record.id,
    })
  }

  return record
}

/** Update a task — only pass fields to change. */
export async function updateTask(recordId, fields) {
  return apiRequest('PATCH', withFieldIds(`${BASE_URL}/${recordId}`), { fields, typecast: true })
}

/** Delete a task. */
export async function deleteTask(recordId) {
  return apiRequest('DELETE', `${BASE_URL}/${recordId}`)
}

/**
 * Reassign a task to a new user and notify them.
 * Does not notify if reassigning to self.
 */
export async function reassignTask(recordId, newUserId, byUserId, byName, title) {
  await updateTask(recordId, { [FIELDS.USER_ID]: newUserId })
  if (newUserId && newUserId !== byUserId) {
    notify({
      userIds:   newUserId,
      title:     `${byName || 'Admin'} assigned: "${title}"`,
      module:    'system',
      category:  'tasks',
      severity:  'action_needed',
      actionUrl: `/#/tasks/${recordId}`,
      sourceKey: `task_assigned:${recordId}`,
    }).catch(() => {})
  }
}

/** Dismiss any unread notification linked to this sourceKey (fire-and-forget). */
export async function dismissLinkedNotification(sourceKey) {
  if (!sourceKey) return
  await supabase
    .from('notifications')
    .update({ dismissed: true })
    .eq('source_key', sourceKey)
    .eq('dismissed', false)
}

/** Check whether a task with a given sourceKey already exists (for dedup). */
export async function taskExistsForSourceKey(sourceKey) {
  const formula = encodeURIComponent(`{${FIELDS.SOURCE_KEY}}='${sourceKey}'`)
  const json = await apiRequest('GET', `${BASE_URL}?${FIELD_ID_PARAM}&filterByFormula=${formula}&maxRecords=1`)
  return (json.records || []).length > 0
}
