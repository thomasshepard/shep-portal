import { supabase } from './supabase'
import toast from 'react-hot-toast'

// Shared Fleet module config — used by Fleet.jsx and FleetDetail.jsx.
// Mirrors the pattern in src/lib/incubation.js: genuinely shared domain
// config gets its own lib file, but per-page render helpers (safeStr,
// StatTile, Field, etc.) stay copy-pasted per page per house style.

// Fleet & Equipment still lives inside the Happy Cuts Airtable base — scope
// expanded (Aug 2026) beyond Happy Cuts gear to cover all vehicles/equipment
// (Suburban, trailer, tractor, tillers), but a dedicated base wasn't
// available to create yet. `can_view_fleet` is its own permission flag
// independent of Happy Cuts specifically because of this. Meant to migrate
// to its own base later — FLEET_BASE_ID is named for where this is headed,
// not where it currently lives, so that migration is a one-line env swap.
export const FLEET_BASE_ID = import.meta.env.VITE_AIRTABLE_HAPPY_CUTS_BASE_ID
export const EQUIPMENT_TABLE = 'Equipment'
export const COST_TABLE = 'Cost Entries'

// Airtable blocks adding choices to an existing select field through the
// write API used here (typecast is disabled for new-option creation on this
// PAT) — the original `Type` field couldn't be extended, so a new `Category`
// field was created alongside it with the full list. `Type` is left in
// place on existing records, unused going forward.
export const ASSET_CATEGORIES = ['Zero-Turn', 'Push Mower', 'Trimmer', 'Vehicle', 'Trailer', 'Tractor', 'Tiller', 'Other']
export const STATUSES = ['Running', 'In Repair', 'Down', 'Sold']
export const LOCATIONS = ['Home', "Buster's", 'Job Site']
export const AXLE_COUNTS = ['Single', 'Tandem', 'Other']
// Same choice-list limitation as above — Fuel / Insurance / Registration-Tags
// aren't yet valid Cost Entries.Category options in Airtable (add them via
// the Airtable UI directly, then extend this list; no code change needed
// beyond that).
export const COST_CATEGORIES = ['Parts', 'Labor - Buster', 'Labor - Self', 'Battery', 'Tires', 'Blades', 'Other']
export const VENDOR_PRESETS = ['Buster', 'Amazon', 'Walmart', 'TSC']

/** Which category-specific fields are relevant per Category — drives the
 *  Add/Edit Asset form so a $20 trimmer doesn't stare down a GVWR field. */
export const CATEGORY_FIELDS = {
  Vehicle: ['vin', 'plate', 'mileage', 'registration', 'insurance'],
  Trailer: ['vin', 'plate', 'axles', 'gvwr', 'registration'],
  Tractor: ['engine', 'hours'],
  'Zero-Turn': ['engine', 'deckSize'],
  'Push Mower': ['engine', 'deckSize'],
  Trimmer: ['engine'],
  Tiller: ['engine'],
  Other: ['engine', 'vin', 'deckSize'],
}

export const STATUS_BADGE = {
  Running: 'bg-green-100 text-green-700',
  'In Repair': 'bg-amber-100 text-amber-700',
  Down: 'bg-red-100 text-red-700',
  Sold: 'bg-gray-200 text-gray-600',
}
export const STATUS_DOT = {
  Running: 'bg-green-500',
  'In Repair': 'bg-amber-500',
  Down: 'bg-red-500',
  Sold: 'bg-gray-400',
}

export const STALE_DAYS = 60

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

/** Upload a photo to the fleet-photos bucket, returns its public URL (or null on failure). */
export async function uploadFleetPhoto(file) {
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `equipment/${Date.now()}_${safeName}`
    const { data, error } = await supabase.storage.from('fleet-photos').upload(path, file, {
      upsert: false,
      contentType: file.type,
    })
    if (error) throw error
    const { data: urlData } = supabase.storage.from('fleet-photos').getPublicUrl(data.path)
    return urlData.publicUrl
  } catch (e) {
    console.error('Photo upload failed:', e)
    toast.error('Photo upload failed: ' + (e?.message || JSON.stringify(e)))
    return null
  }
}

/** Photo URLs field holds a JSON array of {url, kind} — kind is 'tag' or 'machine'. */
export function parsePhotos(fields) {
  const raw = fields?.['Photo URLs']
  if (!raw || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Tolerate old plain-string entries just in case.
    return parsed.map(p => (typeof p === 'string' ? { url: p, kind: 'machine' } : p))
  } catch {
    return []
  }
}

/** Upload a title/registration doc to the fleet-photos bucket (same bucket,
 *  separate folder) — returns its public URL, or null on failure. */
export async function uploadFleetDocument(file) {
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `documents/${Date.now()}_${safeName}`
    const { data, error } = await supabase.storage.from('fleet-photos').upload(path, file, {
      upsert: false,
      contentType: file.type,
    })
    if (error) throw error
    const { data: urlData } = supabase.storage.from('fleet-photos').getPublicUrl(data.path)
    return urlData.publicUrl
  } catch (e) {
    console.error('Document upload failed:', e)
    toast.error('Document upload failed: ' + (e?.message || JSON.stringify(e)))
    return null
  }
}

/** Document URLs field holds a JSON array of {url, label} — title/registration docs. */
export function parseDocuments(fields) {
  const raw = fields?.['Document URLs']
  if (!raw || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function daysSince(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return Math.round((Date.now() - d.getTime()) / 86400000)
}

// ── Maintenance Items ───────────────────────────────────────────────────────
// Preventative/reactive maintenance tracking, one machine at a time.
// Next Due Date is app-computed (see computeNextDueDate below) and written
// back to Airtable — it is NOT an Airtable formula field. Season intervals
// need "roll forward to the next occurrence" logic Airtable formulas can't
// express, so the same computation path is used for every interval type
// rather than splitting the logic between Airtable and the app.

export const MAINT_TABLE = 'Maintenance Items'
export const MAINT_CATEGORIES = ['Preventative', 'Reactive']
export const MAINT_PRIORITIES = ['High', 'Medium', 'Low']
// Mileage/Engine Hours logic below is written and ready (computeNextDueReading,
// maintenanceUrgency's reading branch) but NOT exposed in this list — Airtable's
// Interval Type field doesn't have those choices yet (same choice-list
// limitation noted above). Add "Mileage" and "Engine Hours" to the field in
// the Airtable UI, then add them here — no other code change needed.
export const MAINT_INTERVAL_TYPES = ['Calendar Days', 'Season', 'One-time']
export const MAINT_DUE_SOON_DAYS = 14
export const MAINT_DUE_SOON_MILES = 300
export const MAINT_DUE_SOON_HOURS = 10

export const MAINT_CATEGORY_BADGE = {
  Preventative: 'bg-blue-100 text-blue-700',
  Reactive: 'bg-orange-100 text-orange-700',
}
export const MAINT_PRIORITY_BADGE = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-gray-100 text-gray-600',
}

function todayMidnight() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
function parseISODate(str) {
  if (!str) return null
  const d = new Date(`${String(str).slice(0, 10)}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}
function toISODate(d) {
  return d.toISOString().slice(0, 10)
}

/** Parses a loose "Month Day" string ("March 1", "Mar 1") into {month, day} (month 0-indexed), or null. */
function parseSeasonTrigger(str) {
  const m = String(str || '').trim().match(/^([A-Za-z]+)\s+(\d{1,2})$/)
  if (!m) return null
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const month = months.indexOf(m[1].slice(0, 3).toLowerCase())
  const day = Number(m[2])
  if (month === -1 || !day || day > 31) return null
  return { month, day }
}

/** Next occurrence of a Season Trigger on/after `from` (a Date). Rolls forward by year, bounded. */
function nextSeasonOccurrence(seasonTrigger, from) {
  const parsed = parseSeasonTrigger(seasonTrigger)
  if (!parsed) return null
  const next = new Date(from)
  next.setMonth(parsed.month, parsed.day)
  next.setHours(0, 0, 0, 0)
  let guard = 0
  while (next < from && guard < 5) {
    next.setFullYear(next.getFullYear() + 1)
    guard += 1
  }
  return next
}

/** Computes the Next Due Date (YYYY-MM-DD string, or null) for a maintenance item.
 *  `fields` is the item's Airtable fields object. Anchors from Last Done Date
 *  if set, otherwise from today (covers a brand-new item that's never been done). */
export function computeNextDueDate(fields) {
  const intervalType = fields['Interval Type']
  const lastDone = parseISODate(fields['Last Done Date'])
  const anchor = lastDone || todayMidnight()

  if (intervalType === 'Calendar Days') {
    const days = Number(fields['Interval Value'])
    if (!days) return null
    const next = new Date(anchor)
    next.setDate(next.getDate() + days)
    return toISODate(next)
  }
  if (intervalType === 'Season') {
    const next = nextSeasonOccurrence(fields['Season Trigger'], anchor)
    return next ? toISODate(next) : null
  }
  // One-time and Reactive/Watch List items have no recurring due date —
  // Next Due Date is set directly by the user (or cleared) instead.
  return null
}

/** Computes the Next Due Reading (a number, or null) for a Mileage/Engine
 *  Hours interval item. Not yet reachable from the UI — see MAINT_INTERVAL_TYPES. */
export function computeNextDueReading(fields) {
  const intervalType = fields['Interval Type']
  if (intervalType !== 'Mileage' && intervalType !== 'Engine Hours') return null
  const intervalValue = Number(fields['Interval Value'])
  if (!intervalValue) return null
  const lastReading = Number(fields['Last Done Reading'])
  return (Number.isFinite(lastReading) ? lastReading : 0) + intervalValue
}

/** Urgency for one maintenance item, derived fresh every render — nothing
 *  timing-related is stored in Airtable, mirroring Insurance.jsx's obligationTiming().
 *  `assetFields` (the linked Equipment record's fields) is only consulted for
 *  Mileage/Engine Hours items, to compare against Current Mileage/Current
 *  Engine Hours — optional and unused for the Calendar Days/Season/One-time
 *  path, so existing call sites that only pass `fields` keep working. */
export function maintenanceUrgency(fields, assetFields = {}) {
  const status = fields.Status || 'Active'
  if (status === 'Done') return { state: 'done', urgency: 'none', label: 'Done' }
  if (status === 'Watch List') return { state: 'watch', urgency: 'none', label: 'Watch list — no active issue' }

  const intervalType = fields['Interval Type']
  if (intervalType === 'Mileage' || intervalType === 'Engine Hours') {
    const dueReading = fields['Next Due Reading']
    const unit = intervalType === 'Mileage' ? 'mi' : 'hrs'
    if (dueReading == null) return { state: 'scheduled', urgency: 'none', label: 'No due reading set' }
    const currentField = intervalType === 'Mileage' ? 'Current Mileage' : 'Current Engine Hours'
    const current = assetFields[currentField]
    if (current == null) return { state: 'scheduled', urgency: 'none', label: `Due at ${dueReading} ${unit} — current reading not logged` }
    const remaining = Number(dueReading) - Number(current)
    const soonThreshold = intervalType === 'Mileage' ? MAINT_DUE_SOON_MILES : MAINT_DUE_SOON_HOURS
    if (remaining < 0) return { state: 'overdue', urgency: 'crit', label: `Overdue by ${Math.abs(Math.round(remaining))} ${unit}` }
    if (remaining <= soonThreshold) return { state: 'dueSoon', urgency: 'warn', label: `Due in ${Math.round(remaining)} ${unit}` }
    return { state: 'scheduled', urgency: 'ok', label: `Due in ${Math.round(remaining)} ${unit}` }
  }

  const due = parseISODate(fields['Next Due Date'])
  if (!due) return { state: 'scheduled', urgency: 'none', label: 'No due date set' }

  const today = todayMidnight()
  const days = Math.round((due - today) / 86400000)
  if (days < 0) return { state: 'overdue', urgency: 'crit', days, label: `Overdue ${Math.abs(days)}d` }
  if (days <= MAINT_DUE_SOON_DAYS) return { state: 'dueSoon', urgency: 'warn', days, label: days === 0 ? 'Due today' : `Due in ${days}d` }
  return { state: 'scheduled', urgency: 'ok', days, label: `Due in ${days}d` }
}

/** Fields to write when marking one maintenance item done today — shared by
 *  the per-asset view (FleetDetail.jsx) and the fleet-wide grouped view
 *  (FleetMaintenance.jsx) so "mark done" and "mark all done" behave identically. */
export function computeMarkDoneFields(fields) {
  const today = todayISO()
  if (fields['Interval Type'] === 'One-time') {
    return { 'Last Done Date': today, Status: 'Done', 'Next Due Date': null }
  }
  return {
    'Last Done Date': today,
    Status: 'Active',
    'Next Due Date': computeNextDueDate({ ...fields, 'Last Done Date': today }),
  }
}

// ── Money-pit check ─────────────────────────────────────────────────────────
// Flags an asset once repair/parts spend alone (Total Invested minus the
// original Purchase Price) has caught up to what it cost to buy — the same
// pattern that played out on the 31R707 right before it got sold at a loss.

export function isMoneyPit(fields) {
  const purchase = fields['Purchase Price']
  const invested = fields['Total Invested']
  if (purchase == null || invested == null || purchase <= 0) return false
  return invested >= purchase
}
