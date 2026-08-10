import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Shield, Landmark, Plus, X, Pencil, ExternalLink, Phone, AlertTriangle,
  CheckCircle2, Clock, Loader2, ChevronDown, ChevronUp, Building2, FileText,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { fetchAllRecords, createRecord, updateRecord, fmtCurrency, PM_BASE_ID } from '../lib/airtable'
import LoadingSpinner from '../components/LoadingSpinner'

const OBLIGATIONS_TABLE = 'Insurance and Taxes'
const PAYMENTS_TABLE    = 'Obligation Payments'

// Each page defines its own safe accessors — the shared airtable.js helpers are
// formatters only, matching how the other modules in this app are written.
const arr = v => (Array.isArray(v) ? v : [])
const safeStr = (v, fallback = '') => {
  if (v == null || v === '') return fallback
  if (typeof v === 'object') return v.name ? String(v.name) : fallback
  return String(v)
}
const safeNum = (v, fallback = 0) => {
  if (v == null || typeof v === 'object') return fallback
  const n = Number(v)
  return Number.isNaN(n) ? fallback : n
}

const KINDS = ['Insurance', 'Property Tax']
const STATUSES = ['Active', 'Needs Setup', 'Expired', 'Cancelled']
const FREQUENCIES = ['Annually', 'Semi-Annual', 'Quarterly', 'Monthly']
const JURISDICTION_LEVELS = ['City', 'County', 'Special District']
const POLICY_TYPES = [
  'Landlord (DP-3)', 'Homeowners (HO-3)', 'Mobile Home', "Builder's Risk",
  'Vacant Dwelling', 'Flood', 'General Liability', 'Commercial Auto',
  'Personal Auto', 'Umbrella', 'Health', 'Workers Comp', 'Other',
]
const ENTITIES = [
  'Thomas Shepard', 'Thomas Shepard and Gabrielle Shepard', 'Shepard Holdings LLC',
  'Ridge & Anchor LLC', 'Virginia Holdings LLC', 'Happy Cuts LLC', 'East Meadow Consulting LLC',
]

const FREQ_PER_YEAR = { Annually: 1, 'Semi-Annual': 2, Quarterly: 4, Monthly: 12 }

const emptyForm = {
  name: '', kind: 'Insurance', status: 'Active', propertyId: '', entity: '',
  vendor: '', portal: '', parcelId: '', amount: '', frequency: 'Annually',
  payableFrom: '', delinquentAfter: '', renewalDate: '',
  escrow: false, autopay: false,
  jurisdictionLevel: '', jurisdictionName: '',
  policyType: '', policyNumber: '', dwelling: '', liability: '', deductible: '',
  lossOfRent: '', agentName: '', agentPhone: '', claimsPhone: '',
  visibility: 'Standard', notes: '',
}

// ── Date helpers ─────────────────────────────────────────────────────────────
function todayMidnight() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
function parseDate(str) {
  if (!str) return null
  const d = new Date(`${String(str).slice(0, 10)}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}
function daysBetween(from, to) {
  return Math.round((to - from) / 86400000)
}
function fmtDay(d) {
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}

/** Roll a recurring date forward until it lands on or after today, so a record
 *  entered once in 2024 still reports the correct next occurrence. */
function nextOccurrence(dateStr, frequency) {
  const base = parseDate(dateStr)
  if (!base) return null
  const today = todayMidnight()
  if (base >= today) return base
  const perYear = FREQ_PER_YEAR[frequency] || 1
  const stepMonths = Math.round(12 / perYear)
  const next = new Date(base)
  let guard = 0
  while (next < today && guard < 200) {
    next.setMonth(next.getMonth() + stepMonths)
    guard += 1
  }
  return next
}

/**
 * What this obligation is doing right now.
 *
 * Property tax carries two dates: it becomes payable when the bill is issued
 * (~Oct 1 in Tennessee) and goes delinquent months later (~mid-Feb). A single
 * "due date" would either nag you before a bill exists or warn you far too late,
 * so the window between them drives the urgency instead.
 */
function obligationTiming(f) {
  const kind = safeStr(f.Kind)
  const freq = safeStr(f.Frequency, 'Annually')
  const today = todayMidnight()

  if (kind === 'Property Tax') {
    const payable = nextOccurrence(f['Payable From'], freq)
    const rawDelinquent = nextOccurrence(f['Delinquent After'], freq)
    // Delinquency always follows the payable date in the same cycle.
    let delinquent = rawDelinquent
    if (payable && delinquent && delinquent < payable) {
      delinquent = new Date(delinquent)
      delinquent.setFullYear(delinquent.getFullYear() + 1)
    }
    const original = parseDate(f['Delinquent After'])
    if (original && original < today && (!rawDelinquent || rawDelinquent > today)) {
      // The stored delinquency has passed but rolled forward — that's normal.
    }
    if (!payable && !delinquent) return { state: 'none', label: 'No dates set', urgency: 'none' }
    if (payable && today < payable) {
      return {
        state: 'upcoming', urgency: 'none', date: payable,
        days: daysBetween(today, payable),
        label: `Bill issues ${fmtDay(payable)}`,
      }
    }
    if (delinquent) {
      const days = daysBetween(today, delinquent)
      if (days < 0) return { state: 'delinquent', urgency: 'crit', date: delinquent, days, label: `Delinquent since ${fmtDay(delinquent)}` }
      return {
        state: 'payable', date: delinquent, days,
        urgency: days <= 30 ? 'crit' : days <= 60 ? 'warn' : 'ok',
        label: `Payable now · delinquent after ${fmtDay(delinquent)}`,
      }
    }
    return { state: 'payable', urgency: 'warn', label: 'Payable now' }
  }

  // Insurance
  const renewal = nextOccurrence(f['Renewal Date'], freq)
  if (!renewal) return { state: 'none', label: 'No renewal date set', urgency: 'none' }
  const days = daysBetween(today, renewal)
  return {
    state: days < 0 ? 'lapsed' : 'renewing', date: renewal, days,
    urgency: days < 0 ? 'crit' : days <= 30 ? 'crit' : days <= 60 ? 'warn' : 'ok',
    label: days < 0 ? `Lapsed ${fmtDay(renewal)}` : `Renews ${fmtDay(renewal)}`,
  }
}

function annualized(f) {
  const amt = safeNum(f['Current Amount'])
  return amt * (FREQ_PER_YEAR[safeStr(f.Frequency, 'Annually')] || 1)
}

const URGENCY_STRIPE = { crit: 'bg-red-500', warn: 'bg-amber-500', ok: 'bg-green-500', none: 'bg-gray-300' }
const URGENCY_TEXT   = { crit: 'text-red-600', warn: 'text-amber-600', ok: 'text-green-600', none: 'text-gray-400' }

// ─────────────────────────────────────────────────────────────────────────────

export default function Insurance() {
  const { isAdmin, profile } = useAuth()
  const canSeeRestricted = isAdmin || !!profile?.can_view_health_policies

  const [loading, setLoading] = useState(true)
  const [obligations, setObligations] = useState([])
  const [properties, setProperties] = useState([])
  const [payments, setPayments] = useState([])
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)   // record or 'new'
  const [expanded, setExpanded] = useState(new Set())
  const [payingFor, setPayingFor] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [obRes, propRes, payRes] = await Promise.all([
        fetchAllRecords(OBLIGATIONS_TABLE, {}, PM_BASE_ID),
        fetchAllRecords('Property', {}, PM_BASE_ID),
        fetchAllRecords(PAYMENTS_TABLE, {}, PM_BASE_ID),
      ])
      if (obRes.error) throw new Error(obRes.error)
      setObligations(obRes.data || [])
      setProperties((propRes.data || []).filter(p => {
        const addr = safeStr(p.fields?.Address)
        return addr && !addr.startsWith('DELETE')
      }))
      setPayments(payRes.data || [])
    } catch (e) {
      toast.error('Failed to load insurance data: ' + (e.message || 'unknown'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Restricted rows (the health plan) are filtered out entirely for anyone
  // without the flag — they never reach the browser's rendered output.
  const visible = useMemo(
    () => obligations.filter(o => canSeeRestricted || safeStr(o.fields?.Visibility) !== 'Restricted'),
    [obligations, canSeeRestricted]
  )

  const activeProperties = useMemo(
    () => properties.filter(p => safeStr(p.fields?.Status) !== 'Sold'),
    [properties]
  )

  const byProperty = useMemo(() => {
    const idx = {}
    visible.forEach(o => {
      const ids = arr(o.fields?.Property)
      if (ids.length === 0) { (idx.__none__ = idx.__none__ || []).push(o); return }
      ids.forEach(pid => { (idx[pid] = idx[pid] || []).push(o) })
    })
    return idx
  }, [visible])

  const paymentsByObligation = useMemo(() => {
    const idx = {}
    payments.forEach(p => {
      arr(p.fields?.Obligation).forEach(oid => { (idx[oid] = idx[oid] || []).push(p) })
    })
    return idx
  }, [payments])

  /** Everything the module can tell you is missing, derived rather than stored. */
  const issues = useMemo(() => {
    const out = []
    activeProperties.forEach(p => {
      const mine = byProperty[p.id] || []
      const live = mine.filter(o => ['Active', 'Needs Setup'].includes(safeStr(o.fields?.Status)))
      const addr = safeStr(p.fields?.Address)
      const hasInsurance = live.some(o => safeStr(o.fields?.Kind) === 'Insurance' && safeStr(o.fields?.Status) === 'Active')
      const taxes = live.filter(o => safeStr(o.fields?.Kind) === 'Property Tax')
      const hasCityTax = taxes.some(o => safeStr(o.fields?.['Jurisdiction Level']) === 'City')
      const cityJur = safeStr(p.fields?.['City Jurisdiction'])
      const inCity = !!p.fields?.['In City Limits']

      if (!hasInsurance) {
        out.push({ key: `ins-${p.id}`, level: 'gap', property: p, title: `${addr} — no active insurance policy` })
      }
      if (taxes.length === 0) {
        out.push({ key: `tax-${p.id}`, level: 'gap', property: p, title: `${addr} — no property tax records` })
      } else if (inCity && !hasCityTax) {
        out.push({
          key: `city-${p.id}`, level: 'gap', property: p,
          title: `${addr} — in ${cityJur || 'city'} limits but no city tax bill recorded`,
        })
      } else if (/verify/i.test(cityJur)) {
        out.push({
          key: `verify-${p.id}`, level: 'check', property: p,
          title: `${addr} — confirm whether a city tax bill is owed`,
          detail: cityJur,
        })
      }
    })
    visible
      .filter(o => safeStr(o.fields?.Status) === 'Needs Setup')
      .forEach(o => out.push({
        key: `setup-${o.id}`, level: 'check', obligation: o,
        title: `${safeStr(o.fields?.Name)} — record is incomplete`,
      }))
    return out
  }, [activeProperties, byProperty, visible])

  const radar = useMemo(() => {
    return visible
      .filter(o => safeStr(o.fields?.Status) === 'Active')
      .filter(o => !o.fields?.['Paid Through Escrow'])
      .map(o => ({ o, t: obligationTiming(o.fields || {}) }))
      .filter(x => x.t.days != null && x.t.days <= 120)
      .sort((a, b) => (a.t.days ?? 999) - (b.t.days ?? 999))
  }, [visible])

  const totals = useMemo(() => {
    const active = visible.filter(o => safeStr(o.fields?.Status) === 'Active')
    const ins = active.filter(o => safeStr(o.fields?.Kind) === 'Insurance')
    const tax = active.filter(o => safeStr(o.fields?.Kind) === 'Property Tax')
    return {
      annual: active.reduce((s, o) => s + annualized(o.fields || {}), 0),
      insAnnual: ins.reduce((s, o) => s + annualized(o.fields || {}), 0),
      taxAnnual: tax.reduce((s, o) => s + annualized(o.fields || {}), 0),
      insCount: ins.length,
      taxCount: tax.length,
      soon: radar.filter(x => x.t.days <= 60 && x.t.days >= 0).length,
    }
  }, [visible, radar])

  function toggle(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = useMemo(() => {
    if (filter === 'insurance') return visible.filter(o => safeStr(o.fields?.Kind) === 'Insurance')
    if (filter === 'tax') return visible.filter(o => safeStr(o.fields?.Kind) === 'Property Tax')
    if (filter === 'direct') return visible.filter(o => !o.fields?.['Paid Through Escrow'])
    return visible
  }, [visible, filter])

  const filteredByProperty = useMemo(() => {
    const idx = {}
    filtered.forEach(o => {
      const ids = arr(o.fields?.Property)
      if (ids.length === 0) { (idx.__none__ = idx.__none__ || []).push(o); return }
      ids.forEach(pid => { (idx[pid] = idx[pid] || []).push(o) })
    })
    return idx
  }, [filtered])

  if (loading) return <LoadingSpinner />

  const orderedProperties = activeProperties
    .slice()
    .sort((a, b) => safeStr(a.fields?.Address).localeCompare(safeStr(b.fields?.Address)))

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield size={24} className="text-blue-600" />
            Insurance &amp; Taxes
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Policies and property tax bills, grouped by what they cover
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} /> Add
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Annual total"
          value={fmtCurrency(totals.annual)}
          sub={`Insurance ${fmtCurrency(totals.insAnnual)} · taxes ${fmtCurrency(totals.taxAnnual)}`}
        />
        <StatTile
          label="Tracked"
          value={String(totals.insCount + totals.taxCount)}
          sub={`${totals.insCount} policies · ${totals.taxCount} tax bills`}
        />
        <StatTile
          label="Due ≤ 60 days"
          value={String(totals.soon)}
          sub={radar[0] ? radar[0].t.label : 'Nothing imminent'}
          tone={totals.soon > 0 ? 'warn' : undefined}
        />
        <StatTile
          label="Gaps &amp; issues"
          value={String(issues.length)}
          sub={issues.length ? 'Needs attention' : 'All clear'}
          tone={issues.length > 0 ? 'crit' : undefined}
        />
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-red-500 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-600" />
            <h2 className="font-semibold text-gray-800 text-sm">What needs attention</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {issues.map(i => (
              <div key={i.key} className="px-4 py-2.5 flex items-start gap-3">
                <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
                  i.level === 'gap' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {i.level === 'gap' ? 'Gap' : 'Verify'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{i.title}</p>
                  {i.detail && <p className="text-xs text-gray-400 mt-0.5">{i.detail}</p>}
                </div>
                {i.property && (
                  <Link
                    to={`/properties/${i.property.id}`}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 flex-shrink-0"
                  >
                    Open
                  </Link>
                )}
                {i.obligation && (
                  <button
                    onClick={() => setEditing(i.obligation)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 flex-shrink-0"
                  >
                    Complete
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Radar */}
      {radar.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <Clock size={15} className="text-amber-600" /> What&rsquo;s coming due
            </h2>
            <span className="text-xs text-gray-400">Next 120 days · escrowed items excluded</span>
          </div>
          <div className="divide-y divide-gray-100">
            {radar.map(({ o, t }) => {
              const f = o.fields || {}
              return (
                <div key={o.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className={`w-1 self-stretch rounded flex-shrink-0 ${URGENCY_STRIPE[t.urgency]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{safeStr(f.Name)}</p>
                    <p className="text-xs text-gray-400">
                      {t.label}
                      {f.Autopay ? ' · autopay' : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold tabular-nums ${URGENCY_TEXT[t.urgency]}`}>
                      {t.days < 0 ? `${Math.abs(t.days)}d late` : `${t.days}d`}
                    </p>
                    <p className="text-xs text-gray-400 tabular-nums">{fmtCurrency(safeNum(f['Current Amount']))}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          ['all', 'All'],
          ['insurance', `Insurance (${totals.insCount})`],
          ['tax', `Property tax (${totals.taxCount})`],
          ['direct', 'Not escrowed'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grouped list */}
      <div className="space-y-3">
        {orderedProperties.map(p => {
          const mine = (filteredByProperty[p.id] || [])
            .slice()
            .sort((a, b) => safeStr(a.fields?.Kind).localeCompare(safeStr(b.fields?.Kind)))
          const annual = mine
            .filter(o => safeStr(o.fields?.Status) === 'Active')
            .reduce((s, o) => s + annualized(o.fields || {}), 0)
          const cityJur = safeStr(p.fields?.['City Jurisdiction'])
          return (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <Link to={`/properties/${p.id}`} className="font-semibold text-gray-900 text-sm hover:text-blue-700">
                    {safeStr(p.fields?.Address)}
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{safeStr(p.fields?.['Title In Name of']) || safeStr(p.fields?.Owner)}</span>
                    {p.fields?.['In City Limits'] ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 text-[10px] font-semibold">
                        In city limits — {cityJur || 'city'}
                      </span>
                    ) : /verify/i.test(cityJur) ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">
                        {cityJur}
                      </span>
                    ) : cityJur ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold">
                        {cityJur}
                      </span>
                    ) : null}
                  </p>
                </div>
                {annual > 0 && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-800 tabular-nums">{fmtCurrency(annual)}</p>
                    <p className="text-[10px] text-gray-400">per year</p>
                  </div>
                )}
              </div>

              {mine.length === 0 ? (
                <div className="px-4 py-4 text-sm text-gray-400 flex items-center justify-between gap-3">
                  <span>Nothing on file for this property.</span>
                  <button onClick={() => setEditing('new')} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                    Add
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {mine.map(o => (
                    <ObligationRow
                      key={o.id}
                      obligation={o}
                      payments={paymentsByObligation[o.id] || []}
                      expanded={expanded.has(o.id)}
                      onToggle={() => toggle(o.id)}
                      onEdit={() => setEditing(o)}
                      onLogPayment={() => setPayingFor(o)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Not tied to a property — business and personal */}
        {(filteredByProperty.__none__ || []).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <p className="font-semibold text-gray-900 text-sm">Business &amp; personal</p>
              <p className="text-xs text-gray-500 mt-0.5">Not tied to a specific property</p>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredByProperty.__none__.map(o => (
                <ObligationRow
                  key={o.id}
                  obligation={o}
                  payments={paymentsByObligation[o.id] || []}
                  expanded={expanded.has(o.id)}
                  onToggle={() => toggle(o.id)}
                  onEdit={() => setEditing(o)}
                  onLogPayment={() => setPayingFor(o)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <ObligationModal
          obligation={editing === 'new' ? null : editing}
          properties={activeProperties}
          canSeeRestricted={canSeeRestricted}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}

      {payingFor && (
        <PaymentModal
          obligation={payingFor}
          onClose={() => setPayingFor(null)}
          onSaved={() => { setPayingFor(null); load() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, tone }) {
  const toneCls = tone === 'crit' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums leading-tight ${toneCls}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

function ObligationRow({ obligation, payments, expanded, onToggle, onEdit, onLogPayment }) {
  const f = obligation.fields || {}
  const kind = safeStr(f.Kind)
  const isTax = kind === 'Property Tax'
  const t = obligationTiming(f)
  const status = safeStr(f.Status)
  const level = safeStr(f['Jurisdiction Level'])

  const amount = safeNum(f['Current Amount'])
  const freq = safeStr(f.Frequency, 'Annually')

  return (
    <div>
      <div className="px-4 py-3 flex items-start gap-3">
        <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${
          isTax ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'
        }`}>
          {isTax ? <Landmark size={15} /> : <Shield size={15} />}
        </span>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{safeStr(f.Name)}</span>
            {isTax && level && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700">{level}</span>
            )}
            {status === 'Needs Setup' && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Needs setup</span>
            )}
            {f['Paid Through Escrow'] && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">Escrow</span>
            )}
            {f.Autopay && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700">Autopay</span>
            )}
            {t.urgency === 'crit' && status === 'Active' && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700">
                {t.state === 'delinquent' || t.state === 'lapsed' ? 'Overdue' : 'Soon'}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {safeStr(f.Vendor) || '—'}
            {t.label ? ` · ${t.label}` : ''}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-gray-800 tabular-nums">{amount ? fmtCurrency(amount) : '—'}</p>
          <p className="text-[10px] text-gray-400">{freq === 'Monthly' ? 'per month' : freq.toLowerCase()}</p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit} title="Edit" className="text-gray-400 hover:text-blue-600 p-1">
            <Pencil size={13} />
          </button>
          <button onClick={onToggle} className="text-gray-400 hover:text-gray-700 p-1">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pl-15 bg-gray-50 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {isTax ? (
              <>
                <Cell k="Jurisdiction" v={safeStr(f['Jurisdiction Name']) || '—'} />
                <Cell k="Parcel / account" v={safeStr(f['Account / Parcel ID']) || '—'} />
                <Cell k="Bill issues" v={f['Payable From'] ? fmtDay(parseDate(f['Payable From'])) : '—'} />
                <Cell k="Delinquent after" v={f['Delinquent After'] ? fmtDay(parseDate(f['Delinquent After'])) : '—'} />
              </>
            ) : (
              <>
                <Cell k="Policy type" v={safeStr(f['Policy Type']) || '—'} />
                <Cell k="Policy number" v={safeStr(f['Policy Number']) || 'Not recorded'} />
                <Cell k="Deductible" v={f.Deductible ? fmtCurrency(safeNum(f.Deductible)) : 'Not recorded'} />
                <Cell k="Dwelling" v={f['Dwelling Coverage'] ? fmtCurrency(safeNum(f['Dwelling Coverage'])) : 'Not recorded'} />
              </>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Where to pay</p>
              {safeStr(f['Payment Portal Link']) ? (
                <a
                  href={safeStr(f['Payment Portal Link'])}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  <ExternalLink size={14} />
                  <span className="truncate">{hostOf(safeStr(f['Payment Portal Link']))}</span>
                </a>
              ) : (
                <p className="text-xs text-gray-400">No portal link recorded.</p>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                {isTax ? 'Notes' : 'If something happens'}
              </p>
              {!isTax && safeStr(f['Claims Phone']) ? (
                <a
                  href={`tel:${safeStr(f['Claims Phone'])}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-sm font-bold text-red-700 hover:bg-red-100"
                >
                  <Phone size={14} /> {safeStr(f['Claims Phone'])}
                </a>
              ) : !isTax ? (
                <p className="text-xs text-gray-400">No claims number recorded.</p>
              ) : null}
              {safeStr(f.Notes) && (
                <p className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">{safeStr(f.Notes)}</p>
              )}
              {!isTax && safeStr(f['Agent Name']) && (
                <p className="text-xs text-gray-500 mt-2">
                  Agent: {safeStr(f['Agent Name'])}
                  {safeStr(f['Agent Phone']) ? ` · ${safeStr(f['Agent Phone'])}` : ''}
                </p>
              )}
            </div>
          </div>

          {payments.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Payment history</p>
              <div className="space-y-1">
                {payments
                  .slice()
                  .sort((a, b) => safeStr(b.fields?.Period).localeCompare(safeStr(a.fields?.Period)))
                  .map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs">
                      <span className="font-medium text-gray-700">{safeStr(p.fields?.Period)}</span>
                      <span className="text-gray-400">{safeStr(p.fields?.Status)}</span>
                      <span className="font-semibold text-gray-800 tabular-nums">
                        {fmtCurrency(safeNum(p.fields?.['Amount Paid'] ?? p.fields?.['Amount Due']))}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-3 flex-wrap">
            <button
              onClick={onLogPayment}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
            >
              <CheckCircle2 size={13} /> Log a payment
            </button>
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-white"
            >
              <Pencil size={13} /> Edit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Cell({ k, v }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</p>
      <p className="text-sm font-medium text-gray-800 break-words">{v}</p>
    </div>
  )
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// ─────────────────────────────────────────────────────────────────────────────

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{hint && <span className="font-normal text-gray-400"> — {hint}</span>}
      </label>
      {children}
    </div>
  )
}

function ObligationModal({ obligation, properties, canSeeRestricted, onClose, onSaved }) {
  const f = obligation?.fields || {}
  const [form, setForm] = useState(() => obligation ? {
    name: safeStr(f.Name), kind: safeStr(f.Kind, 'Insurance'), status: safeStr(f.Status, 'Active'),
    propertyId: arr(f.Property)[0] || '', entity: safeStr(f.Entity),
    vendor: safeStr(f.Vendor), portal: safeStr(f['Payment Portal Link']),
    parcelId: safeStr(f['Account / Parcel ID']),
    amount: f['Current Amount'] != null ? String(f['Current Amount']) : '',
    frequency: safeStr(f.Frequency, 'Annually'),
    payableFrom: safeStr(f['Payable From']), delinquentAfter: safeStr(f['Delinquent After']),
    renewalDate: safeStr(f['Renewal Date']),
    escrow: !!f['Paid Through Escrow'], autopay: !!f.Autopay,
    jurisdictionLevel: safeStr(f['Jurisdiction Level']), jurisdictionName: safeStr(f['Jurisdiction Name']),
    policyType: safeStr(f['Policy Type']), policyNumber: safeStr(f['Policy Number']),
    dwelling: f['Dwelling Coverage'] != null ? String(f['Dwelling Coverage']) : '',
    liability: f['Liability Coverage'] != null ? String(f['Liability Coverage']) : '',
    deductible: f.Deductible != null ? String(f.Deductible) : '',
    lossOfRent: safeStr(f['Loss of Rent']),
    agentName: safeStr(f['Agent Name']), agentPhone: safeStr(f['Agent Phone']),
    claimsPhone: safeStr(f['Claims Phone']),
    visibility: safeStr(f.Visibility, 'Standard'), notes: safeStr(f.Notes),
  } : emptyForm)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const isTax = form.kind === 'Property Tax'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Give it a name')
    setSaving(true)

    const num = v => (v === '' ? null : Number(v))
    const fields = {
      Name: form.name,
      Kind: form.kind,
      Status: form.status,
      Property: form.propertyId ? [form.propertyId] : [],
      Entity: form.entity || null,
      Vendor: form.vendor,
      'Payment Portal Link': form.portal,
      'Account / Parcel ID': form.parcelId,
      'Current Amount': num(form.amount),
      Frequency: form.frequency || null,
      'Paid Through Escrow': form.escrow,
      Autopay: form.autopay,
      Visibility: form.visibility || 'Standard',
      Notes: form.notes,
      // Only one date set applies per kind; blanking the other keeps the
      // timing logic from reading a stale value if the kind is switched.
      'Payable From': isTax ? (form.payableFrom || null) : null,
      'Delinquent After': isTax ? (form.delinquentAfter || null) : null,
      'Renewal Date': isTax ? null : (form.renewalDate || null),
      'Jurisdiction Level': isTax ? (form.jurisdictionLevel || null) : null,
      'Jurisdiction Name': isTax ? form.jurisdictionName : '',
      'Policy Type': isTax ? null : (form.policyType || null),
      'Policy Number': isTax ? '' : form.policyNumber,
      'Dwelling Coverage': isTax ? null : num(form.dwelling),
      'Liability Coverage': isTax ? null : num(form.liability),
      Deductible: isTax ? null : num(form.deductible),
      'Loss of Rent': isTax ? '' : form.lossOfRent,
      'Agent Name': isTax ? '' : form.agentName,
      'Agent Phone': isTax ? '' : form.agentPhone,
      'Claims Phone': isTax ? '' : form.claimsPhone,
    }

    const res = obligation
      ? await updateRecord(OBLIGATIONS_TABLE, obligation.id, fields, PM_BASE_ID)
      : await createRecord(OBLIGATIONS_TABLE, fields, PM_BASE_ID)
    setSaving(false)
    if (res.error) return toast.error('Failed to save: ' + res.error)
    toast.success(obligation ? 'Saved' : 'Added')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <h2 className="font-semibold text-gray-900">{obligation ? 'Edit' : 'Add policy or tax bill'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="What is it?">
              <div className="flex gap-2">
                {KINDS.map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set('kind', k)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      form.kind === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Name" hint="how it shows in the list">
            <input value={form.name} onChange={e => set('name', e.target.value)} className={inp} required
              placeholder={isTax ? '188 Virginia St — Putnam County tax' : '2000 E 5th St — Foremost'} />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Property" hint="leave blank for business or personal">
              <select value={form.propertyId} onChange={e => set('propertyId', e.target.value)} className={inp}>
                <option value="">Not property-specific</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{safeStr(p.fields?.Address)}</option>
                ))}
              </select>
            </Field>
            <Field label="Entity">
              <select value={form.entity} onChange={e => set('entity', e.target.value)} className={inp}>
                <option value="">Not set</option>
                {ENTITIES.map(x => <option key={x}>{x}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={isTax ? 'Taxing authority' : 'Carrier'}>
              <input value={form.vendor} onChange={e => set('vendor', e.target.value)} className={inp}
                placeholder={isTax ? 'Putnam County Trustee' : 'Travelers'} />
            </Field>
            <Field label="Payment portal link" hint="the deep link if you have one">
              <input value={form.portal} onChange={e => set('portal', e.target.value)} className={inp} placeholder="https://" />
            </Field>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Amount">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" step="0.01" min="0" value={form.amount}
                  onChange={e => set('amount', e.target.value)} className={inp + ' pl-6'} />
              </div>
            </Field>
            <Field label="Frequency">
              <select value={form.frequency} onChange={e => set('frequency', e.target.value)} className={inp}>
                {FREQUENCIES.map(x => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Account / parcel ID">
              <input value={form.parcelId} onChange={e => set('parcelId', e.target.value)} className={inp} />
            </Field>
          </div>

          {isTax ? (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Bill issues / payable from" hint="~Oct 1 in Tennessee">
                  <input type="date" value={form.payableFrom} onChange={e => set('payableFrom', e.target.value)} className={inp} />
                </Field>
                <Field label="Delinquent after" hint="pay by this or penalties start">
                  <input type="date" value={form.delinquentAfter} onChange={e => set('delinquentAfter', e.target.value)} className={inp} />
                </Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Jurisdiction level">
                  <select value={form.jurisdictionLevel} onChange={e => set('jurisdictionLevel', e.target.value)} className={inp}>
                    <option value="">Not set</option>
                    {JURISDICTION_LEVELS.map(x => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Jurisdiction name">
                  <input value={form.jurisdictionName} onChange={e => set('jurisdictionName', e.target.value)} className={inp}
                    placeholder="Putnam County" />
                </Field>
              </div>
            </>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Renewal date">
                  <input type="date" value={form.renewalDate} onChange={e => set('renewalDate', e.target.value)} className={inp} />
                </Field>
                <Field label="Policy type">
                  <select value={form.policyType} onChange={e => set('policyType', e.target.value)} className={inp}>
                    <option value="">Not set</option>
                    {POLICY_TYPES.map(x => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="Policy number">
                  <input value={form.policyNumber} onChange={e => set('policyNumber', e.target.value)} className={inp} />
                </Field>
              </div>
              <div className="grid sm:grid-cols-4 gap-4">
                <Field label="Dwelling">
                  <input type="number" min="0" value={form.dwelling} onChange={e => set('dwelling', e.target.value)} className={inp} />
                </Field>
                <Field label="Liability">
                  <input type="number" min="0" value={form.liability} onChange={e => set('liability', e.target.value)} className={inp} />
                </Field>
                <Field label="Deductible">
                  <input type="number" min="0" value={form.deductible} onChange={e => set('deductible', e.target.value)} className={inp} />
                </Field>
                <Field label="Loss of rent">
                  <input value={form.lossOfRent} onChange={e => set('lossOfRent', e.target.value)} className={inp} placeholder="12 months" />
                </Field>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Agent name">
                  <input value={form.agentName} onChange={e => set('agentName', e.target.value)} className={inp} />
                </Field>
                <Field label="Agent phone">
                  <input value={form.agentPhone} onChange={e => set('agentPhone', e.target.value)} className={inp} />
                </Field>
                <Field label="Claims phone" hint="the 24/7 line">
                  <input value={form.claimsPhone} onChange={e => set('claimsPhone', e.target.value)} className={inp} />
                </Field>
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.escrow} onChange={e => set('escrow', e.target.checked)} className="rounded" />
              Paid through escrow — inside the mortgage payment, so it stays off the due radar
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.autopay} onChange={e => set('autopay', e.target.checked)} className="rounded" />
              On autopay
            </label>
            {canSeeRestricted && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.visibility === 'Restricted'}
                  onChange={e => set('visibility', e.target.checked ? 'Restricted' : 'Standard')}
                  className="rounded"
                />
                Restricted — hide from anyone without the health-policy permission
              </label>
            )}
          </div>

          <Field label="Notes">
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} className={inp} />
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {obligation ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PaymentModal({ obligation, onClose, onSaved }) {
  const f = obligation.fields || {}
  const isTax = safeStr(f.Kind) === 'Property Tax'
  const defaultPeriod = isTax ? String(new Date().getFullYear()) : ''
  const [form, setForm] = useState({
    period: defaultPeriod,
    amountDue: f['Current Amount'] != null ? String(f['Current Amount']) : '',
    amountPaid: f['Current Amount'] != null ? String(f['Current Amount']) : '',
    paidDate: new Date().toISOString().slice(0, 10),
    status: 'Paid',
    paidFrom: '',
    confirmation: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.period.trim()) return toast.error('Which period is this for?')
    setSaving(true)
    const num = v => (v === '' ? null : Number(v))
    const { error } = await createRecord(PAYMENTS_TABLE, {
      Name: `${safeStr(f.Name)} — ${form.period}`,
      Obligation: [obligation.id],
      Period: form.period,
      'Amount Due': num(form.amountDue),
      'Amount Paid': num(form.amountPaid),
      'Paid Date': form.paidDate || null,
      Status: form.status,
      'Paid From': form.paidFrom,
      Confirmation: form.confirmation,
      Notes: form.notes,
    }, PM_BASE_ID)
    setSaving(false)
    if (error) return toast.error('Failed to log payment: ' + error)
    toast.success('Payment logged')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">Log a payment</h2>
            <p className="text-xs text-gray-500 mt-0.5">{safeStr(f.Name)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Period" hint={isTax ? 'tax year' : 'term'}>
              <input value={form.period} onChange={e => set('period', e.target.value)} className={inp} required
                placeholder={isTax ? '2026' : '2026-2027'} />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
                {['Paid', 'Due', 'Late', 'Waived', 'Upcoming'].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount due">
              <input type="number" step="0.01" min="0" value={form.amountDue}
                onChange={e => set('amountDue', e.target.value)} className={inp} />
            </Field>
            <Field label="Amount paid">
              <input type="number" step="0.01" min="0" value={form.amountPaid}
                onChange={e => set('amountPaid', e.target.value)} className={inp} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Paid date">
              <input type="date" value={form.paidDate} onChange={e => set('paidDate', e.target.value)} className={inp} />
            </Field>
            <Field label="Paid from" hint="which account">
              <input value={form.paidFrom} onChange={e => set('paidFrom', e.target.value)} className={inp} />
            </Field>
          </div>
          <Field label="Confirmation number">
            <input value={form.confirmation} onChange={e => set('confirmation', e.target.value)} className={inp} />
          </Field>
          <Field label="Notes">
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} className={inp} />
          </Field>
          <p className="text-xs text-gray-400 flex items-start gap-1.5">
            <FileText size={13} className="flex-shrink-0 mt-0.5" />
            Amounts change year to year — logging each one here keeps the history without
            touching the policy or bill itself.
          </p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />} Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
