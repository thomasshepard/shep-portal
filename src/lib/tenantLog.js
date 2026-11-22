import { fetchAllRecords, createRecord, updateRecord, PM_BASE_ID } from './airtable.js'

/**
 * Tenant Log table ID in Property Management base (PM_BASE_ID)
 */
export const TL_TABLE_ID = 'tblnBwKycNSXhc2Wt'
export const TENANT_LOG_TABLE = 'tblnBwKycNSXhc2Wt'

/**
 * Field IDs for writes (with typecast: true)
 */
export const TL_FIELDS = {
  SUMMARY: 'fldtk6p828x42UDCW',
  PROPERTY: 'fldtRyz8V0SgshF43',
  TENANT: 'fldfF2ZJvlt5dtc8t',
  TYPE: 'fld99fd0cRbDCP5QX',
  DETAILS: 'fldNRpaRn1EU1B740',
  URGENCY: 'fldcuF3OVzYSAf4sZ',
  STATUS: 'fldDCj7XRiq9HOn9N',
  DATE: 'fldbqdocQ36JNPULk',
  LOGGED_BY: 'fldQ0GmbHqeD2pCaT',
  SOURCE: 'fld4tA31mGUxjeNod',
  RESOLVED_DATE: 'fldnrcmwV0QuDN1CF',
  RESOLUTION: 'fldHCyzUyj7YTjtUl',
}

/**
 * Field names for reads (Airtable returns fields keyed by field name)
 */
export const TL_READ = {
  SUMMARY: 'Summary',
  PROPERTY: 'Property',
  TENANT: 'Tenant',
  TYPE: 'Type',
  DETAILS: 'Details',
  URGENCY: 'Urgency',
  STATUS: 'Status',
  DATE: 'Date',
  LOGGED_BY: 'Logged By',
  SOURCE: 'Source',
  RESOLVED_DATE: 'Resolved Date',
  RESOLUTION: 'Resolution',
}

/**
 * Option lists
 */
export const TL_TYPES = ['Call', 'Repair', 'Complaint', 'Payment question', 'Other']
export const TL_URGENCY = ['Low', 'Normal', 'Urgent']
export const TL_STATUS = ['Open', 'In progress', 'Resolved']
export const TL_SOURCES = ['Portal', 'AI agent']

// Local helpers following Shep Portal conventions
export const safeStr = (v, fb = '') => (v == null ? fb : String(v))
export const safeNum = (v) => (v == null || v === '' ? 0 : Number(v) || 0)
export const arr = (v) => (Array.isArray(v) ? v : [])

/**
 * Formats today's date in YYYY-MM-DD (America/Chicago timezone).
 */
export function getTodayDate() {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(new Date())
  } catch {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
}

/**
 * Fetch all log entries for a given property.
 * Property filtering is performed client-side on the returned linked record arrays.
 * Sorted newest first (Date descending, then built-in createdTime descending).
 * Preserves raw records (including id, createdTime, fields).
 *
 * @param {string|string[]} propertyId - Property record ID
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
export async function fetchLogForProperty(propertyId) {
  if (!propertyId) return { data: [], error: null }

  const { data, error } = await fetchAllRecords(TL_TABLE_ID, {}, PM_BASE_ID)
  if (error) return { data: null, error }

  const targetId = Array.isArray(propertyId) ? propertyId[0] : propertyId
  const filtered = arr(data).filter((record) => {
    const propLinks = arr(record.fields?.[TL_READ.PROPERTY])
    return propLinks.includes(targetId)
  })

  filtered.sort((a, b) => {
    const dateA = safeStr(a.fields?.[TL_READ.DATE])
    const dateB = safeStr(b.fields?.[TL_READ.DATE])
    if (dateA !== dateB) {
      return dateB.localeCompare(dateA)
    }

    const createdA = safeStr(a.createdTime)
    const createdB = safeStr(b.createdTime)
    return createdB.localeCompare(createdA)
  })

  return { data: filtered, error: null }
}

/**
 * Fetch all log entries across all properties with Status 'Open' or 'In progress'.
 * Sorted: Urgent first, then oldest Date first (ties broken by oldest createdTime).
 * Preserves raw records (including id, createdTime, fields).
 *
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
export async function fetchOpenIssues() {
  const { data, error } = await fetchAllRecords(TL_TABLE_ID, {}, PM_BASE_ID)
  if (error) return { data: null, error }

  const openIssues = arr(data).filter((record) => {
    const status = safeStr(record.fields?.[TL_READ.STATUS]).trim()
    return status === 'Open' || status === 'In progress'
  })

  openIssues.sort((a, b) => {
    const isUrgentA = safeStr(a.fields?.[TL_READ.URGENCY]).trim().toLowerCase() === 'urgent'
    const isUrgentB = safeStr(b.fields?.[TL_READ.URGENCY]).trim().toLowerCase() === 'urgent'
    if (isUrgentA && !isUrgentB) return -1
    if (!isUrgentA && isUrgentB) return 1

    const dateA = safeStr(a.fields?.[TL_READ.DATE])
    const dateB = safeStr(b.fields?.[TL_READ.DATE])
    if (dateA && dateB && dateA !== dateB) {
      return dateA.localeCompare(dateB)
    }
    if (dateA && !dateB) return -1
    if (!dateA && dateB) return 1

    const createdA = safeStr(a.createdTime)
    const createdB = safeStr(b.createdTime)
    return createdA.localeCompare(createdB)
  })

  return { data: openIssues, error: null }
}

/**
 * Create a new Tenant Log entry in Airtable PM base.
 * Writes use field IDs with typecast: true.
 * Links are sent as arrays: ["recXXX"].
 *
 * @param {Object} values
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
export async function createLogEntry(values = {}) {
  const fields = {}

  // Summary (required by app)
  const summary = values.summary ?? values.Summary ?? values[TL_FIELDS.SUMMARY]
  if (summary != null) {
    fields[TL_FIELDS.SUMMARY] = String(summary).trim()
  }

  // Property (required link: ["recXXX"])
  const propVal = values.property ?? values.propertyId ?? values.Property ?? values[TL_FIELDS.PROPERTY]
  if (propVal) {
    fields[TL_FIELDS.PROPERTY] = Array.isArray(propVal) ? propVal : [propVal]
  }

  // Tenant (optional link: ["recXXX"])
  const tenantVal = values.tenant ?? values.tenantId ?? values.Tenant ?? values[TL_FIELDS.TENANT]
  if (tenantVal && tenantVal !== 'None') {
    fields[TL_FIELDS.TENANT] = Array.isArray(tenantVal) ? tenantVal : [tenantVal]
  }

  // Type (single select)
  const typeVal = values.type ?? values.Type ?? values[TL_FIELDS.TYPE]
  if (typeVal) {
    fields[TL_FIELDS.TYPE] = typeVal
  }

  // Details (long text)
  const detailsVal = values.details ?? values.Details ?? values[TL_FIELDS.DETAILS]
  if (detailsVal != null) {
    fields[TL_FIELDS.DETAILS] = String(detailsVal)
  }

  // Urgency (defaults to Normal)
  const urgencyVal = values.urgency ?? values.Urgency ?? values[TL_FIELDS.URGENCY] ?? 'Normal'
  fields[TL_FIELDS.URGENCY] = urgencyVal

  // Status (defaults to Open)
  const statusVal = values.status ?? values.Status ?? values[TL_FIELDS.STATUS] ?? 'Open'
  fields[TL_FIELDS.STATUS] = statusVal

  // Date (defaults to today YYYY-MM-DD)
  const dateVal = values.date ?? values.Date ?? values[TL_FIELDS.DATE] ?? getTodayDate()
  if (dateVal instanceof Date) {
    const y = dateVal.getFullYear()
    const m = String(dateVal.getMonth() + 1).padStart(2, '0')
    const d = String(dateVal.getDate()).padStart(2, '0')
    fields[TL_FIELDS.DATE] = `${y}-${m}-${d}`
  } else if (dateVal) {
    fields[TL_FIELDS.DATE] = String(dateVal)
  }

  // Logged By (single line text)
  const loggedByVal =
    values.loggedBy ??
    values.logged_by ??
    values['Logged By'] ??
    values.LoggedBy ??
    values[TL_FIELDS.LOGGED_BY]
  if (loggedByVal != null) {
    fields[TL_FIELDS.LOGGED_BY] = String(loggedByVal)
  }

  // Source (single select, defaults to Portal)
  const sourceVal = values.source ?? values.Source ?? values[TL_FIELDS.SOURCE] ?? 'Portal'
  fields[TL_FIELDS.SOURCE] = sourceVal

  // Resolved Date
  const resolvedDateVal =
    values.resolvedDate ??
    values.resolved_date ??
    values['Resolved Date'] ??
    values.ResolvedDate ??
    values[TL_FIELDS.RESOLVED_DATE]
  if (resolvedDateVal) {
    if (resolvedDateVal instanceof Date) {
      const y = resolvedDateVal.getFullYear()
      const m = String(resolvedDateVal.getMonth() + 1).padStart(2, '0')
      const d = String(resolvedDateVal.getDate()).padStart(2, '0')
      fields[TL_FIELDS.RESOLVED_DATE] = `${y}-${m}-${d}`
    } else {
      fields[TL_FIELDS.RESOLVED_DATE] = String(resolvedDateVal)
    }
  }

  // Resolution (long text)
  const resolutionVal = values.resolution ?? values.Resolution ?? values[TL_FIELDS.RESOLUTION]
  if (resolutionVal != null) {
    fields[TL_FIELDS.RESOLUTION] = String(resolutionVal)
  }

  // Support any raw field IDs directly passed in values
  for (const [key, val] of Object.entries(values)) {
    if (key.startsWith('fld') && !(key in fields) && val !== undefined) {
      fields[key] = val
    }
  }

  return createRecord(TL_TABLE_ID, fields, PM_BASE_ID, { typecast: true })
}

/**
 * Update the status of a Tenant Log entry.
 * When status is 'Resolved', sets Resolved Date to today (YYYY-MM-DD).
 * If resolution is provided, updates Resolution.
 * Writes use field IDs with typecast: true.
 *
 * @param {string} recordId - Record ID to update
 * @param {string} status - New status ('Open' | 'In progress' | 'Resolved')
 * @param {string} [resolution] - Optional resolution description
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
export async function setLogStatus(recordId, status, resolution) {
  const fields = {
    [TL_FIELDS.STATUS]: status,
  }

  if (status === 'Resolved') {
    fields[TL_FIELDS.RESOLVED_DATE] = getTodayDate()
  }

  if (resolution != null && String(resolution).trim() !== '') {
    fields[TL_FIELDS.RESOLUTION] = String(resolution).trim()
  }

  return updateRecord(TL_TABLE_ID, recordId, fields, PM_BASE_ID, { typecast: true })
}
