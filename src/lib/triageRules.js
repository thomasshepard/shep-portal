/**
 * Triage Rules Engine — v2
 *
 * Each rule defines what to fetch and how to evaluate a single record into a
 * TriageItem. Rules fail gracefully — one failure doesn't break the page.
 *
 * TriageItem shape:
 * {
 *   id, source, sourceRecordId, sourceBaseId, sourceTable,
 *   identifier, whatShouldBeTrue, expectedDate, lastObservedDate,
 *   daysLate, daysUntil, daysSinceObserved,
 *   bucket: 'late'|'dueSoon'|'stale'|'watching',
 *   handler, consequence, detailRoute,
 *   resolveAction: { label, handler: 'navigateToSource'|'completeTask'|'manualDone', ...extra },
 *   ruleId, isManual,
 *   // manual items only:
 *   lastObserved, rawExpectedDate, rawLastObsDate, triageStatus
 * }
 */

import { fetchAllRecords, updateRecord, PM_BASE_ID, CHICKENS_BASE_ID, DOCS_BASE_ID } from './airtable.js'
import { fetchTasks, updateTask, FIELDS as TASK_FIELDS } from './tasks.js'
import { supabase } from './supabase.js'

const LLC_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID

const safeStr = (v, fb = '') => (v == null ? fb : String(v))
const safeNum = (v) => (v == null ? 0 : Number(v) || 0)
const arr = (v) => (Array.isArray(v) ? v : [])

// Per-call in-memory cache — created fresh for each fetchAllTriageItems() invocation.
// Prevents duplicate Airtable fetches when multiple rules need the same table.
class DataCache {
  constructor() { this._map = new Map() }
  async get(key, fetcher) {
    if (!this._map.has(key)) this._map.set(key, await fetcher())
    return this._map.get(key)
  }
}

// Wraps fetchAllRecords to return just the records array (empty array on error)
async function fetchAll(table, params, baseId) {
  const { data } = await fetchAllRecords(table, params, baseId)
  return data || []
}

function daysBetween(earlier, later) {
  return Math.floor((later - earlier) / 86400000)
}

function parseDate(str) {
  if (!str) return null
  return new Date(str + 'T00:00:00')
}

// ── Dismissals ────────────────────────────────────────────────────────────────

export async function getActiveDismissals(userId) {
  if (!userId) return new Set()
  const { data } = await supabase
    .from('triage_dismissals')
    .select('item_id')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
  return new Set((data || []).map(r => r.item_id))
}

export async function dismissItem(userId, itemId) {
  if (!userId || !itemId) return
  const now = new Date()
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  await supabase.from('triage_dismissals').upsert(
    { user_id: userId, item_id: itemId, dismissed_at: now.toISOString(), expires_at: expires.toISOString() },
    { onConflict: 'user_id,item_id' }
  )
}

// ── Resolve helpers ───────────────────────────────────────────────────────────

export async function resolveTriageItem(item) {
  const { resolveAction } = item
  if (!resolveAction) return { ok: false }

  if (resolveAction.handler === 'completeTask') {
    try {
      await updateTask(item.sourceRecordId, { [TASK_FIELDS.STATUS]: 'Done' })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  if (resolveAction.handler === 'manualDone') {
    const { error } = await updateRecord(item.sourceTable, item.sourceRecordId, { 'Triage Status': 'Done' }, item.sourceBaseId)
    return { ok: !error, error }
  }

  return { ok: false, error: 'Use navigateToSource directly' }
}

// ── Rule helpers ──────────────────────────────────────────────────────────────

function getManualLabel(sourceKey, f) {
  switch (sourceKey) {
    case 'Property':    return safeStr(f['Property Name'] || f['Address'] || f['Name'])
    case 'Lease':       return safeStr(f['Name'] || f['Lease ID'])
    case 'Maintenance': return safeStr(f['Summary'] || f['Description'] || f['Issue'] || f['Name'])
    case 'Flock':       return safeStr(f['Name'])
    case 'LLC':         return safeStr(f['LLC Name'] || f['Name'])
    default:            return ''
  }
}

// ── TRIAGE_RULES ──────────────────────────────────────────────────────────────

export const TRIAGE_RULES = [

  /**
   * Rule 1 — rent-overdue
   * Triggers when an invoice payment is past due (not Paid/Voided).
   */
  {
    id: 'rent-overdue',
    label: 'Rent overdue',
    enabled: true,
    fetch: async (cache) =>
      cache.get('invoicePayments', () => fetchAll('Invoices Payments', {}, PM_BASE_ID)),
    evaluate: (record, today) => {
      const f = record.fields || {}
      const status = safeStr(f.Status)
      if (['Paid', 'Voided', 'Payment on process'].includes(status)) return null
      if (!['Past Due', 'Open', 'Past due'].includes(status)) return null
      const due = parseDate(f['Due Date'])
      if (!due || due >= today) return null
      const daysLate = daysBetween(due, today)
      const propName = safeStr(arr(f['Property Name'])[0] || f['Name'] || 'Unknown property')
      return {
        id: `rule:rent-overdue:${record.id}`,
        source: 'Lease',
        sourceRecordId: record.id,
        sourceBaseId: PM_BASE_ID,
        sourceTable: 'Invoices Payments',
        identifier: propName,
        whatShouldBeTrue: `Rent payment received — ${safeStr(f['Month Due'] || f['Name'])}`,
        expectedDate: due,
        lastObservedDate: null,
        daysLate,
        daysUntil: null,
        daysSinceObserved: null,
        bucket: 'late',
        handler: 'Thomas',
        consequence: 'Eviction risk if unaddressed',
        detailRoute: `/properties/${arr(f['Property'])[0] || ''}`,
        resolveAction: { label: 'Open Property', handler: 'navigateToSource' },
        ruleId: 'rent-overdue',
        isManual: false,
      }
    },
  },

  /**
   * Rule 2 — lease-ending-no-renewal
   * Triggers when a lease ends within 60 days and status is not Closed.
   */
  {
    id: 'lease-ending-no-renewal',
    label: 'Lease ending, no renewal',
    enabled: true,
    fetch: async (cache) =>
      cache.get('leases', () =>
        fetchAll('Lease Agreements', { filterByFormula: "NOT({Status}='Closed')" }, PM_BASE_ID)
      ),
    evaluate: (record, today) => {
      const f = record.fields || {}
      if (safeNum(f['Months on Lease']) === 1) return null // skip month-to-month
      const end = parseDate(f['End Date'])
      if (!end) return null
      const daysUntil = daysBetween(today, end)
      if (daysUntil > 60 || daysUntil < -180) return null
      const bucket = daysUntil < 0 ? 'late' : daysUntil <= 30 ? 'dueSoon' : 'stale'
      const tenantName = safeStr(arr(f['Tenant Name Lookup'] || f['Tenant'])[0] || 'Tenant')
      const propName   = safeStr(arr(f['Property Name Lookup'] || f['Address Lookup'])[0] || 'Property')
      return {
        id: `rule:lease-ending-no-renewal:${record.id}`,
        source: 'Lease',
        sourceRecordId: record.id,
        sourceBaseId: PM_BASE_ID,
        sourceTable: 'Lease Agreements',
        identifier: `${propName} — ${tenantName}`,
        whatShouldBeTrue: 'Renewal signed or turnover plan in place',
        expectedDate: end,
        lastObservedDate: null,
        daysLate: daysUntil < 0 ? Math.abs(daysUntil) : null,
        daysUntil: daysUntil >= 0 ? daysUntil : null,
        daysSinceObserved: null,
        bucket,
        handler: 'Thomas',
        consequence: 'Vacancy risk — renewal conversation needed',
        detailRoute: '/properties',
        resolveAction: { label: 'View Property', handler: 'navigateToSource' },
        ruleId: 'lease-ending-no-renewal',
        isManual: false,
      }
    },
  },

  /**
   * Rule 3 — maintenance-request-stale
   * Triggers when an open maintenance request hasn't been updated in 7+ days.
   */
  {
    id: 'maintenance-request-stale',
    label: 'Maintenance request stale',
    enabled: true,
    fetch: async (cache) =>
      cache.get('maintenance', () =>
        fetchAll('Maintenance Requests', {
          filterByFormula: "OR({Status}='todo',{Status}='in progress',{Status}='To Do',{Status}='In Progress')",
        }, PM_BASE_ID)
      ),
    evaluate: (record, today) => {
      const f = record.fields || {}
      const created = parseDate(f['Date'] || f['Created'])
      if (!created) return null
      const daysSince = daysBetween(created, today)
      if (daysSince < 7) return null
      const issue    = safeStr(f['Summary'] || f['Description'] || f['Issue'] || f['Name'] || 'Maintenance request')
      const propName = safeStr(arr(f['Property Name'] || f['Address'])[0] || '')
      return {
        id: `rule:maintenance-request-stale:${record.id}`,
        source: 'Maintenance',
        sourceRecordId: record.id,
        sourceBaseId: PM_BASE_ID,
        sourceTable: 'Maintenance Requests',
        identifier: propName ? `${propName} — ${issue}` : issue,
        whatShouldBeTrue: 'Maintenance request resolved or status updated',
        expectedDate: null,
        lastObservedDate: created,
        daysLate: null,
        daysUntil: null,
        daysSinceObserved: daysSince,
        bucket: 'stale',
        handler: 'Thomas',
        consequence: 'Tenant escalation risk',
        detailRoute: '/properties',
        resolveAction: { label: 'View Request', handler: 'navigateToSource' },
        ruleId: 'maintenance-request-stale',
        isManual: false,
      }
    },
  },

  /**
   * Rule 4 — llc-annual-report-approaching
   * Triggers when an LLC's Annual Report Due Date is within 60 days.
   */
  {
    id: 'llc-annual-report-approaching',
    label: 'LLC annual report approaching',
    enabled: true,
    fetch: async (cache) =>
      cache.get('llcs', () => fetchAll('LLCs', {}, LLC_BASE_ID)),
    evaluate: (record, today) => {
      const f = record.fields || {}
      const dueStr = f['Annual Report Due Date'] || f['Next Filing Due']
      if (!dueStr) return null
      const due = parseDate(dueStr)
      if (!due) return null
      const daysUntil = daysBetween(today, due)
      if (daysUntil > 60) return null
      const bucket = daysUntil < 0 ? 'late' : daysUntil <= 30 ? 'dueSoon' : 'watching'
      return {
        id: `rule:llc-annual-report-approaching:${record.id}`,
        source: 'LLC',
        sourceRecordId: record.id,
        sourceBaseId: LLC_BASE_ID,
        sourceTable: 'LLCs',
        identifier: safeStr(f['LLC Name'] || f['Name']),
        whatShouldBeTrue: 'Annual report filed with state',
        expectedDate: due,
        lastObservedDate: null,
        daysLate: daysUntil < 0 ? Math.abs(daysUntil) : null,
        daysUntil: daysUntil >= 0 ? daysUntil : null,
        daysSinceObserved: null,
        bucket,
        handler: 'Janine',
        consequence: 'State good standing lapses; late fees',
        detailRoute: `/llcs/${record.id}`,
        resolveAction: { label: 'View LLC', handler: 'navigateToSource' },
        ruleId: 'llc-annual-report-approaching',
        isManual: false,
      }
    },
  },

  /**
   * Rule 5 — flock-candling-day
   * Triggers on Day 7, 14, or 17 since Hatch Date for growing flocks (±1 day buffer).
   */
  {
    id: 'flock-candling-day',
    label: 'Flock candling day',
    enabled: true,
    fetch: async (cache) =>
      cache.get('flocks:growing', () =>
        fetchAll('Flock', { filterByFormula: "{Status}='Growing'" }, CHICKENS_BASE_ID)
      ),
    evaluate: (record, today) => {
      const f = record.fields || {}
      if (!f['Hatch Date']) return null
      const hatch = new Date(f['Hatch Date'] + 'T12:00:00')
      const todayNoon = new Date(today); todayNoon.setHours(12, 0, 0, 0)
      const daysOld = Math.floor((todayNoon - hatch) / 86400000)
      const CANDLE_DAYS = [7, 14, 17]
      const exactDay = CANDLE_DAYS.find(d => Math.abs(daysOld - d) <= 1)
      if (!exactDay) return null
      return {
        id: `rule:flock-candling-day:${record.id}`,
        source: 'Flock',
        sourceRecordId: record.id,
        sourceBaseId: CHICKENS_BASE_ID,
        sourceTable: 'Flock',
        identifier: safeStr(f['Name']),
        whatShouldBeTrue: `Day ${exactDay} candling complete`,
        expectedDate: today,
        lastObservedDate: null,
        daysLate: null,
        daysUntil: 0,
        daysSinceObserved: null,
        bucket: 'dueSoon',
        handler: 'Thomas',
        consequence: 'Eggs/chicks need attention today',
        detailRoute: `/chickens/${record.id}`,
        resolveAction: { label: 'View Flock', handler: 'navigateToSource' },
        ruleId: 'flock-candling-day',
        isManual: false,
      }
    },
  },

  /**
   * Rule 6 — flock-processing-due
   * Triggers when a flock's Processing Date is within 7 days or overdue.
   */
  {
    id: 'flock-processing-due',
    label: 'Flock processing due',
    enabled: true,
    fetch: async (cache) =>
      cache.get('flocks:growing', () =>
        fetchAll('Flock', { filterByFormula: "{Status}='Growing'" }, CHICKENS_BASE_ID)
      ),
    evaluate: (record, today) => {
      const f = record.fields || {}
      if (!f['Processing Date']) return null
      const proc = parseDate(f['Processing Date'])
      if (!proc) return null
      const daysUntil = daysBetween(today, proc)
      if (daysUntil > 7) return null
      const bucket = daysUntil < -7 ? 'late' : 'dueSoon'
      return {
        id: `rule:flock-processing-due:${record.id}`,
        source: 'Flock',
        sourceRecordId: record.id,
        sourceBaseId: CHICKENS_BASE_ID,
        sourceTable: 'Flock',
        identifier: safeStr(f['Name']),
        whatShouldBeTrue: 'Flock scheduled and ready for processing',
        expectedDate: proc,
        lastObservedDate: null,
        daysLate: daysUntil < 0 ? Math.abs(daysUntil) : null,
        daysUntil: daysUntil >= 0 ? daysUntil : null,
        daysSinceObserved: null,
        bucket,
        handler: 'Thomas',
        consequence: 'Past target processing date — feed cost rising',
        detailRoute: `/chickens/${record.id}`,
        resolveAction: { label: 'View Flock', handler: 'navigateToSource' },
        ruleId: 'flock-processing-due',
        isManual: false,
      }
    },
  },

  /**
   * Rule 7 — document-action-required
   * Triggers when a document tagged "Action Required" hasn't been updated in 3+ days.
   */
  {
    id: 'document-action-required',
    label: 'Document action required',
    enabled: !!import.meta.env.VITE_AIRTABLE_DOCS_BASE_ID,
    fetch: async (cache) =>
      cache.get('documents', () => fetchAll('Documents', {}, DOCS_BASE_ID)),
    evaluate: (record, today) => {
      const f = record.fields || {}
      const tags = safeStr(f['Tags']).toLowerCase()
      if (!tags.includes('action required')) return null
      const modDate = f['Last Modified'] ? new Date(f['Last Modified']) : null
      const daysSince = modDate ? daysBetween(modDate, today) : 99
      if (daysSince < 3) return null
      return {
        id: `rule:document-action-required:${record.id}`,
        source: 'Document',
        sourceRecordId: record.id,
        sourceBaseId: DOCS_BASE_ID,
        sourceTable: 'Documents',
        identifier: safeStr(f['Name'] || f['Description'] || f['Title'] || 'Document'),
        whatShouldBeTrue: 'Document reviewed and action taken or tag removed',
        expectedDate: null,
        lastObservedDate: modDate,
        daysLate: null,
        daysUntil: null,
        daysSinceObserved: daysSince,
        bucket: 'stale',
        handler: 'Thomas',
        consequence: 'Document needs review/action',
        detailRoute: '/documents',
        resolveAction: { label: 'View Documents', handler: 'navigateToSource' },
        ruleId: 'document-action-required',
        isManual: false,
      }
    },
  },

  /**
   * Rule 8 — task-overdue
   * Triggers for tasks past their due date and not yet Done.
   * Requires options.userId — skipped if not provided.
   */
  {
    id: 'task-overdue',
    label: 'Task overdue',
    enabled: true,
    fetch: async (cache, options = {}) => {
      if (!options.userId) return []
      return cache.get('tasks', () => fetchTasks(options.userId))
    },
    evaluate: (record, today) => {
      const f = record.fields || {}
      if (safeStr(f[TASK_FIELDS.STATUS]) === 'Done') return null
      const dueDateStr = safeStr(f[TASK_FIELDS.DUE_DATE])
      if (!dueDateStr) return null
      const due = parseDate(dueDateStr)
      if (!due || due >= today) return null
      const daysLate = daysBetween(due, today)
      const title = safeStr(f[TASK_FIELDS.TITLE] || 'Untitled task')
      return {
        id: `rule:task-overdue:${record.id}`,
        source: 'Task',
        sourceRecordId: record.id,
        sourceBaseId: null,
        sourceTable: null,
        identifier: title,
        whatShouldBeTrue: `Task completed: ${title}`,
        expectedDate: due,
        lastObservedDate: null,
        daysLate,
        daysUntil: null,
        daysSinceObserved: null,
        bucket: 'late',
        handler: 'Thomas',
        consequence: null,
        detailRoute: '/tasks',
        resolveAction: { label: 'Complete Task', handler: 'completeTask' },
        ruleId: 'task-overdue',
        isManual: false,
      }
    },
  },

  /**
   * Rule 9 — alert-active-stale
   * Triggers for Alerts table records with Status='Active' older than 24h.
   * Note: most portal alerts are computed, not persisted. This catches any
   * manually-created or persisted active alert records.
   */
  {
    id: 'alert-active-stale',
    label: 'Alert active and stale',
    enabled: true,
    fetch: async (cache) =>
      cache.get('alertRecords', () => fetchAll('Alerts', {}, PM_BASE_ID)),
    evaluate: (record, today) => {
      const f = record.fields || {}
      if (safeStr(f['Status']) !== 'Active') return null
      const created = f['Created At'] ? new Date(f['Created At']) : null
      if (!created) return null
      const hoursOld = (today - created) / 3600000
      if (hoursOld < 24) return null
      return {
        id: `rule:alert-active-stale:${record.id}`,
        source: 'Alert',
        sourceRecordId: record.id,
        sourceBaseId: PM_BASE_ID,
        sourceTable: 'Alerts',
        identifier: safeStr(f['Alert ID'] || f['Title'] || 'Alert'),
        whatShouldBeTrue: 'Alert reviewed and dismissed or resolved',
        expectedDate: null,
        lastObservedDate: created,
        daysLate: null,
        daysUntil: null,
        daysSinceObserved: Math.floor(hoursOld / 24),
        bucket: 'stale',
        handler: 'Thomas',
        consequence: null,
        detailRoute: '/properties',
        resolveAction: { label: 'View Properties', handler: 'navigateToSource' },
        ruleId: 'alert-active-stale',
        isManual: false,
      }
    },
  },

  /**
   * Rule 10 — manual-flag
   * Preserved from v1: records with Triage Status = Initiative/Rhythm/Watch
   * across Property, Lease Agreements, Maintenance Requests, Flock, and LLCs.
   */
  {
    id: 'manual-flag',
    label: 'Manually flagged item',
    enabled: true,
    fetch: async (cache) => {
      const FILTER = "OR({Triage Status}='Initiative',{Triage Status}='Rhythm',{Triage Status}='Watch')"
      const [props, leases, maint, flocks, llcs] = await Promise.all([
        cache.get('manual:property',    () => fetchAll('Property',             { filterByFormula: FILTER }, PM_BASE_ID)),
        cache.get('manual:lease',       () => fetchAll('Lease Agreements',     { filterByFormula: FILTER }, PM_BASE_ID)),
        cache.get('manual:maintenance', () => fetchAll('Maintenance Requests', { filterByFormula: FILTER }, PM_BASE_ID)),
        cache.get('manual:flock',       () => fetchAll('Flock',                { filterByFormula: FILTER }, CHICKENS_BASE_ID)),
        cache.get('manual:llc',         () => fetchAll('LLCs',                 { filterByFormula: FILTER }, LLC_BASE_ID)),
      ])
      return [
        ...props.map(r =>  ({ r, sk: 'Property',    baseId: PM_BASE_ID,       table: 'Property',             route: id => `/properties/${id}` })),
        ...leases.map(r => ({ r, sk: 'Lease',       baseId: PM_BASE_ID,       table: 'Lease Agreements',     route: () => '/properties'       })),
        ...maint.map(r =>  ({ r, sk: 'Maintenance', baseId: PM_BASE_ID,       table: 'Maintenance Requests', route: () => '/properties'       })),
        ...flocks.map(r => ({ r, sk: 'Flock',       baseId: CHICKENS_BASE_ID, table: 'Flock',                route: id => `/chickens/${id}`   })),
        ...llcs.map(r =>   ({ r, sk: 'LLC',         baseId: LLC_BASE_ID,      table: 'LLCs',                 route: id => `/llcs/${id}`       })),
      ]
    },
    evaluate: (entry, today) => {
      const { r: record, sk, baseId, table, route } = entry
      const f = record.fields || {}
      const triageStatus   = safeStr(f['Triage Status'])
      const expected       = f['Expected Next Checkpoint'] ? parseDate(f['Expected Next Checkpoint']) : null
      const lastObs        = f['Last Observed Date']       ? parseDate(f['Last Observed Date'])       : null
      const stalenessDays  = safeNum(f['Staleness Days'])

      let bucket = null
      if (expected) {
        const threshold = new Date(expected)
        threshold.setDate(threshold.getDate() + stalenessDays)
        if (today > threshold) {
          bucket = 'late'
        } else {
          const du = daysBetween(today, expected)
          if (du >= 0 && du <= 3) bucket = 'dueSoon'
        }
      }
      if (!bucket && lastObs && daysBetween(lastObs, today) > 7) bucket = 'stale'
      if (!bucket && triageStatus === 'Watch') bucket = 'watching'
      if (!bucket) return null // green — hidden

      const daysLate   = bucket === 'late'    && expected ? Math.max(0, daysBetween(expected, today)) : null
      const daysUntil  = bucket === 'dueSoon' && expected ? daysBetween(today, expected)              : null
      const daysSinceO = lastObs ? daysBetween(lastObs, today) : null

      return {
        id: `manual:${sk.toLowerCase()}:${record.id}`,
        source: sk,
        sourceRecordId: record.id,
        sourceBaseId: baseId,
        sourceTable: table,
        identifier: getManualLabel(sk, f) || record.id,
        whatShouldBeTrue: safeStr(f['What Should Be True']),
        expectedDate: expected,
        lastObservedDate: lastObs,
        daysLate,
        daysUntil,
        daysSinceObserved: daysSinceO,
        bucket,
        handler: safeStr(f['Default Handler']),
        consequence: safeStr(f['Consequence']),
        detailRoute: route(record.id),
        resolveAction: { label: 'Mark Done', handler: 'manualDone' },
        ruleId: 'manual-flag',
        isManual: true,
        // Extra fields used by UpdateModal
        lastObserved: safeStr(f['Last Observed']),
        rawExpectedDate: safeStr(f['Expected Next Checkpoint']),
        rawLastObsDate: safeStr(f['Last Observed Date']),
        triageStatus,
        stalenessDays,
      }
    },
  },
]

// ── Main aggregator ───────────────────────────────────────────────────────────

/**
 * Fetches and evaluates all triage items from all enabled rules.
 * @param {Date} today - reference date (defaults to now, zeroed to midnight)
 * @param {{ userId?: string }} options
 * @returns {Promise<TriageItem[]>}
 */
export async function fetchAllTriageItems(today = new Date(), options = {}) {
  today = new Date(today)
  today.setHours(0, 0, 0, 0)

  const cache   = new DataCache()
  const allItems = []

  for (const rule of TRIAGE_RULES.filter(r => r.enabled)) {
    try {
      const records = await rule.fetch(cache, options)
      for (const record of records) {
        const item = rule.evaluate(record, today)
        if (item) allItems.push(item)
      }
    } catch (err) {
      console.error(`[TriageRules] Rule "${rule.id}" failed:`, err)
    }
  }

  return allItems
}
