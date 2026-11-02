import { PM_BASE_ID } from './airtable'
import { FIELDS as TF } from './tasks'

// Workstreams live in the Property Management base (they link to Rental Units).
export const WS_BASE_ID = PM_BASE_ID
export const WS_TABLE = 'tbltuSfVX14riFCXH'

// Writes use field IDs (rename-safe); reads come back keyed by field NAME.
// Lookup / count / Last Updated fields are intentionally absent — never written.
export const WF = {
  name: 'fldpJ9SrmF0jHWf73',
  type: 'fldLYTXq1HNeehoUo',
  status: 'fldRpaRweOMg28OvR',
  nextAction: 'flda9Gq21fdN9rEF4',
  owner: 'fldwlO0aF48mpQNFr',
  waitingOn: 'fldgVi4YWJW4Ax412',
  checkpoint: 'fldyqHyaqVfdjWBlR',
  notes: 'fldtKDK5yH4VmvuKT',
  sessionUrl: 'fldN7wCWxu7v1jxAF',
  sessionName: 'fldL02ohmqLR6bSHw',
}

export const STATUSES = ['Active', 'Waiting', 'Blocked', 'Done']
export const TYPES = ['Vacancy', 'Flip', 'Acquisition', 'Compliance', 'Business', 'Admin']
export const OWNERS = ['Thomas', 'Janine', 'Claude', 'Muse']

export const TYPE_COLORS = {
  Vacancy: 'bg-blue-100 text-blue-700',
  Flip: 'bg-orange-100 text-orange-700',
  Acquisition: 'bg-purple-100 text-purple-700',
  Compliance: 'bg-teal-100 text-teal-700',
  Business: 'bg-emerald-100 text-emerald-700',
  Admin: 'bg-slate-100 text-slate-600',
}

export const OWNER_COLORS = {
  Thomas: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Janine: 'bg-pink-50 text-pink-700 border-pink-200',
  Claude: 'bg-amber-50 text-amber-700 border-amber-200',
  Muse: 'bg-cyan-50 text-cyan-700 border-cyan-200',
}

// Lookup fields come back as arrays ([5]) or undefined; rollups may be non-arrays.
export function firstNum(v) {
  const x = Array.isArray(v) ? v[0] : v
  return Number(x) || 0
}

export function funnelCounts(fields) {
  return [
    { key: 'new', label: 'New', value: firstNum(fields?.['New Leads (30d)']), bar: 'bg-sky-400' },
    { key: 'pending', label: 'Pending', full: 'Pending Qualification', value: firstNum(fields?.['Pending Qualification (30d)']), bar: 'bg-amber-400' },
    { key: 'qualified', label: 'Qualified', value: firstNum(fields?.['Qualified Leads (30d)']), bar: 'bg-emerald-500' },
    { key: 'showings', label: 'Showings', full: 'Showings Scheduled', value: firstNum(fields?.['Showings Scheduled (30d)']), bar: 'bg-violet-500' },
  ]
}

function parseLocalDate(s) {
  if (!s) return null
  const [y, m, d] = String(s).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Whole days from today to the checkpoint (negative = past due). null if unset. */
export function daysUntil(dateStr) {
  const d = parseLocalDate(dateStr)
  if (!d) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 86400000)
}

/** 'overdue' | 'soon' (within 2 days) | 'ok' | null. Done items are never flagged. */
export function checkpointState(fields) {
  if (fields?.Status === 'Done') return fields?.['Next Checkpoint'] ? 'ok' : null
  const n = daysUntil(fields?.['Next Checkpoint'])
  if (n == null) return null
  if (n < 0) return 'overdue'
  if (n <= 2) return 'soon'
  return 'ok'
}

export function fmtCheckpoint(dateStr) {
  const d = parseLocalDate(dateStr)
  if (!d) return ''
  const n = daysUntil(dateStr)
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (n === 0) return `${label} · today`
  if (n === 1) return `${label} · tomorrow`
  if (n < 0) return `${label} · ${-n}d overdue`
  return label
}

export function workstreamToFormValues(fields) {
  return {
    name: fields?.Name || '',
    type: fields?.Type || '',
    status: fields?.Status || 'Active',
    owner: fields?.Owner || '',
    nextAction: fields?.['Next Action'] || '',
    waitingOn: fields?.['Waiting On'] || '',
    checkpoint: fields?.['Next Checkpoint'] || '',
    notes: fields?.Notes || '',
    sessionName: fields?.['Claude Session Name'] || '',
    sessionUrl: fields?.['Claude Session URL'] || '',
  }
}

/** Form values -> Airtable write payload keyed by field ID. Empty strings clear the field. */
export function formValuesToPayload(v) {
  const clearable = x => (x === '' || x == null ? null : x)
  return {
    [WF.name]: v.name.trim(),
    [WF.type]: clearable(v.type),
    [WF.status]: v.status || 'Active',
    [WF.owner]: clearable(v.owner),
    [WF.nextAction]: clearable(v.nextAction),
    [WF.waitingOn]: clearable(v.waitingOn),
    [WF.checkpoint]: clearable(v.checkpoint),
    [WF.notes]: clearable(v.notes),
    [WF.sessionName]: clearable(v.sessionName),
    [WF.sessionUrl]: clearable(v.sessionUrl?.trim()),
  }
}

// ── Checklist tasks ──────────────────────────────────────────────────────────
// Tasks live in the portal Tasks base (see lib/tasks.js); a task belongs to a
// workstream when its Workstream text field holds that workstream's record ID.

export const TURNOVER_TEMPLATE = [
  'Walkthrough + punch list (photos of any damage)',
  'Repairs from the punch list',
  'Touch-up paint (walls, trim, doors)',
  'Deep clean (appliances, floors, bathrooms)',
  'Re-key locks',
  'Smoke/CO detectors + HVAC filter',
  'Utilities switched to our name for the vacancy',
  'Final walkthrough',
  'Take listing photos',
]

export function turnoverSourceKey(wsId, index) {
  return `ws-turnover:${wsId}:${index}`
}

export function taskView(t) {
  const f = t.fields || {}
  return {
    id: t.id,
    title: f[TF.TITLE] || 'Untitled task',
    done: f[TF.STATUS] === 'Done',
    due: f[TF.DUE_DATE] || '',
    notes: f[TF.NOTES] || '',
    order: typeof f[TF.WS_ORDER] === 'number' ? f[TF.WS_ORDER] : Number.MAX_SAFE_INTEGER,
    sourceKey: f[TF.SOURCE_KEY] || '',
    workstream: f[TF.WORKSTREAM] || '',
    created: t.createdTime || '',
  }
}

export function byOrder(a, b) {
  return a.order - b.order || (a.created < b.created ? -1 : a.created > b.created ? 1 : 0)
}

/** { [workstreamId]: { open: TaskView[], done: TaskView[], total } } */
export function groupTasks(records) {
  const map = {}
  for (const r of records) {
    const v = taskView(r)
    if (!v.workstream) continue
    const g = (map[v.workstream] ||= { open: [], done: [], total: 0 })
    ;(v.done ? g.done : g.open).push(v)
    g.total++
  }
  for (const g of Object.values(map)) { g.open.sort(byOrder); g.done.sort(byOrder) }
  return map
}

export const EMPTY_TASKS = { open: [], done: [], total: 0 }

/** Only allow http(s) links out to a new tab. */
export function safeUrl(u) {
  try {
    const url = new URL(u)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}
