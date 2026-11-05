// Record-level access rules for airtable-proxy (audit item AC-7 part 2).
//
// airtable-proxy already decides which *bases* a caller may reach. These rules
// decide which *records* inside an allowed base a non-admin may read or write,
// mirroring what the pages already enforce in the browser:
//   - Tasks:     a task belongs to its `User ID`; workstream tasks are shared with
//                holders of can_view_workstreams.
//   - Documents: a non-admin only sees docs whose Tags intersect profiles.allowed_tags
//                (empty allowed_tags sees nothing, as in Documents.jsx).
//   - Property Management: accounts with profiles.property_owner_filter only see
//                properties whose Owner matches, and everything hanging off them
//                (Properties.jsx computes the same set client-side).
//   - Call Recordings: admin only.
// Admins are never restricted. Pure functions, no network, so they can be tested offline.

export interface FilterProfile {
  id: string
  role?: string | null
  allowed_tags?: string[] | string | null
  property_owner_filter?: string | null
  can_view_workstreams?: boolean | null
}
export interface AtRecord { id?: string; fields?: Record<string, unknown> }
export interface TableRef { id: string; name: string }
export interface PmScope { props: Set<string>; units: Set<string> }
export interface Decision { ok: boolean; reason?: string; unscoped?: boolean }
export type RuleKind = 'tasks' | 'docs' | 'calls' | 'pm'

export const TASKS_BASE_ID = 'appYVLCn1NVLevdry'
export const DOCS_BASE_ID = 'app9ZYxynGul6hYZU'
export const PM_BASE_ID = 'appeuX9BHNgVXxdYZ'

const TASKS_TABLE_ID = 'tbl3Di18kSLwEj1vN'
const CALLS_TABLE_ID = 'tblrdz9zXHptZvrhE'

// Field keys: [name, id]. Airtable keys fields by name unless returnFieldsByFieldId is set.
const TASK_USER: [string, string] = ['User ID', 'fldTjTxZgy6RZHyaf']
const TASK_WS: [string, string] = ['Workstream', 'fldCon6trmhdKj3nr']
const DOC_TAGS: [string, string] = ['Tags', 'fldNDnNI658sbNde0']
const PM_OWNER: [string, string] = ['Owner', 'fldWwwMnxHo202guy']
const PM_UNIT_PROPERTY: [string, string] = ['Property', 'fldnGYY4EMFwXnXrs']

// PM tables whose `Property` link points at Rental Units (the chain Properties.jsx walks).
const PM_UNIT_LINKED: Record<string, [string, string]> = {
  'Lease Agreements': ['Property', 'fldve9AoTrd4KjNP7'],
  'Maintenance Requests': ['Property', 'fldAGH2sNnPuZ9A2S'],
  'Invoices Payments': ['Property', 'fldmyjh2kdDw9Vfzm'],
  'Project': ['Property', 'fldjjtiH7QQBfmdQG'],
  'Tenants': ['Property', 'fldo0W6Jxrrbgb2Fp'],
}
// PM tables that link straight to Property records.
const PM_PROP_LINKED: Record<string, [string, string]> = {
  'Utilities': ['Property', 'fldawMiHYtLoCjch9'],
  'Current Loans': ['Property 2', 'fldfsAoynjShM7GuI'],
  'Taxes': ['Property', 'fldU7GKqSlotAFamv'],
  'Profit and Loss': ['Property', 'fldn6YSo6PUEBsypM'],
  'Insurance and Taxes': ['Property', 'fldgh2vNF6c2LwIVV'],
  'Alerts': ['Property Name', 'fldi7c9FYOGIJzgb3'],
  'Bills Payment': ['Property / Project', 'fldF9ZNYiFrfu1hZ1'],
}
// Credentials live in these; owner-scoped accounts get nothing.
const PM_DENIED = new Set(['Utility Providers', 'Tenant Info Update'])

// Tries the field ID before the name: when a write overlays new values (keyed by
// ID) onto a stored record (keyed by name), the new value has to win.
function pick(fields: Record<string, unknown> | undefined, keys: readonly string[]): unknown {
  if (!fields) return undefined
  for (const k of [...keys].reverse()) if (fields[k] !== undefined) return fields[k]
  return undefined
}
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const str = (v: unknown) => (v == null ? '' : String(v).trim())

export function userAllowedTags(profile: FilterProfile): string[] {
  const v = profile.allowed_tags
  if (!v) return []
  return (Array.isArray(v) ? v : String(v).split(',')).map((t) => String(t).trim()).filter(Boolean)
}

function docTags(fields: Record<string, unknown> | undefined): string[] {
  return asArr(pick(fields, DOC_TAGS)).flatMap((t) => String(t).split(',')).map((t) => t.trim()).filter(Boolean)
}

/** Which rule applies to this caller + table, or null when unrestricted. */
export function ruleKind(baseId: string, t: TableRef, profile: FilterProfile): RuleKind | null {
  if (profile.role === 'admin') return null
  if (baseId === TASKS_BASE_ID && (t.id === TASKS_TABLE_ID || t.name === 'Tasks')) return 'tasks'
  if (baseId === DOCS_BASE_ID) {
    if (t.id === CALLS_TABLE_ID || t.name === 'Call Recordings') return 'calls'
    if (t.name === 'Documents' || t.name === 'Scanned Documents') return 'docs'
  }
  if (baseId === PM_BASE_ID && profile.property_owner_filter) return 'pm'
  return null
}

/** Field keys the rule needs present on a record (used to keep `fields[]` queries evaluable). */
export function neededFields(kind: RuleKind, t: TableRef): Array<[string, string]> {
  switch (kind) {
    case 'tasks': return [TASK_USER, TASK_WS]
    case 'docs': return [DOC_TAGS]
    case 'calls': return []
    case 'pm':
      if (t.name === 'Property') return [PM_OWNER]
      if (t.name === 'Rental Units') return [PM_UNIT_PROPERTY]
      if (PM_UNIT_LINKED[t.name]) return [PM_UNIT_LINKED[t.name]]
      if (PM_PROP_LINKED[t.name]) return [PM_PROP_LINKED[t.name]]
      return []
  }
}

export function recordAllowed(
  kind: RuleKind, profile: FilterProfile, t: TableRef, rec: AtRecord, pm?: PmScope,
): Decision {
  const f = rec.fields
  switch (kind) {
    case 'calls':
      return { ok: false, reason: 'call recordings are admin only' }

    case 'tasks': {
      if (str(pick(f, TASK_USER)) === profile.id) return { ok: true }
      const ws = asArr(pick(f, TASK_WS)).length > 0
      if (ws && profile.can_view_workstreams) return { ok: true }
      return { ok: false, reason: 'task belongs to another user' }
    }

    case 'docs': {
      const allowed = userAllowedTags(profile)
      if (!allowed.length) return { ok: false, reason: 'no allowed_tags set' }
      return docTags(f).some((t2) => allowed.includes(t2))
        ? { ok: true }
        : { ok: false, reason: 'document tags outside allowed_tags' }
    }

    case 'pm': {
      if (PM_DENIED.has(t.name)) return { ok: false, reason: `${t.name} is not available to owner-scoped accounts` }
      if (t.name === 'Property') {
        return str(pick(f, PM_OWNER)) === profile.property_owner_filter
          ? { ok: true } : { ok: false, reason: 'property owner mismatch' }
      }
      if (!pm) return { ok: false, reason: 'owner scope unavailable' }
      if (t.name === 'Rental Units') {
        return asArr(pick(f, PM_UNIT_PROPERTY)).some((id) => pm.props.has(String(id)))
          ? { ok: true } : { ok: false, reason: 'unit belongs to another owner' }
      }
      const link = PM_UNIT_LINKED[t.name] ?? PM_PROP_LINKED[t.name]
      if (link) {
        const ids = asArr(pick(f, link)).map(String)
        return ids.some((id) => pm.units.has(id) || pm.props.has(id))
          ? { ok: true } : { ok: false, reason: `${t.name} record not linked to an allowed property` }
      }
      return { ok: true, unscoped: true }
    }
  }
}

/** Splits a list response into allowed and dropped records. */
export function filterRecords(
  kind: RuleKind, profile: FilterProfile, t: TableRef, records: AtRecord[], pm?: PmScope,
): { kept: AtRecord[]; dropped: AtRecord[]; unscoped: boolean } {
  const kept: AtRecord[] = [], dropped: AtRecord[] = []
  let unscoped = false
  for (const r of records) {
    const d = recordAllowed(kind, profile, t, r, pm)
    if (d.unscoped) unscoped = true
    ;(d.ok ? kept : dropped).push(r)
  }
  return { kept, dropped, unscoped }
}

/** Allowed property + unit ids for an owner-scoped account, from full Property / Rental Units scans. */
export function computePmScope(profile: FilterProfile, properties: AtRecord[], units: AtRecord[]): PmScope {
  const props = new Set<string>()
  for (const p of properties) {
    if (p.id && str(pick(p.fields, PM_OWNER)) === profile.property_owner_filter) props.add(p.id)
  }
  const unitIds = new Set<string>()
  for (const u of units) {
    if (u.id && asArr(pick(u.fields, PM_UNIT_PROPERTY)).some((id) => props.has(String(id)))) unitIds.add(u.id)
  }
  return { props, units: unitIds }
}

/** Checks a write: the stored record (if any) and the record as it would look afterwards. */
export function writeAllowed(
  kind: RuleKind, profile: FilterProfile, t: TableRef,
  existing: AtRecord | null, newFields: Record<string, unknown> | undefined, pm?: PmScope,
): Decision {
  if (existing) {
    const d = recordAllowed(kind, profile, t, existing, pm)
    if (!d.ok) return d
    if (!newFields) return d
    return recordAllowed(kind, profile, t, { id: existing.id, fields: { ...existing.fields, ...newFields } }, pm)
  }
  return recordAllowed(kind, profile, t, { fields: newFields ?? {} }, pm)
}
