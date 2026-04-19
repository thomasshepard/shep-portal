import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchAllRecords, PM_BASE_ID, CHICKENS_BASE_ID } from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import {
  Building2, FileText, Egg, Tag, ListTodo, ChefHat, Wrench, FolderOpen, MapPin,
} from 'lucide-react'

// ── Local helpers ─────────────────────────────────────────────────────────────
const safeStr = (v, fb = '') => (v == null || v === '' ? fb : typeof v === 'object' ? fb : String(v))
const safeNum = (v) => (v == null || v === '' || typeof v === 'object' ? 0 : Number(v) || 0)
const arr = (v) => Array.isArray(v) ? v : []

// ── Happy Cuts constants ──────────────────────────────────────────────────────
const HC_BASE = import.meta.env.VITE_AIRTABLE_HAPPY_CUTS_BASE_ID
const HC_PAT  = import.meta.env.VITE_AIRTABLE_PAT
const SCHEDULE_TABLE = 'tbli7OArESf2SHL10'
const SF = {
  clientName: 'fldjSJ0x5rJ3S0FYm',
  date:       'fldcu9rgNI8REbrE0',
  amount:     'fldJoKhtQX4MujAOi',
  invStatus:  'fldhiIRXuRlvp3QXO',
}

// ── Incubator constants ───────────────────────────────────────────────────────
const BATCHES_TABLE = 'tblKomWeHkj9aGFDC'

// ── Phase engine (copied from ChickenIncubator.jsx) ───────────────────────────
function getBatchPhase(batch) {
  const setDate = new Date(safeStr(batch.fields['Set Date']) + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const day = Math.floor((today - setDate) / 86400000) + 1
  const hatched = safeNum(batch.fields['Chicks Hatched'])
  const d7done  = safeNum(batch.fields['Day 7 Developing'])  > 0 || safeNum(batch.fields['Day 7 Removed'])  > 0
  const d14done = safeNum(batch.fields['Day 14 Developing']) > 0 || safeNum(batch.fields['Day 14 Removed']) > 0
  if (day < 7)                      return { day, phase: 'early',      label: 'Early Development',     nextAction: null }
  if (day === 7  && !d7done)        return { day, phase: 'candle7',    label: 'Day 7 — Candle Now',    nextAction: 'candle7' }
  if (day >= 7   && day < 14)       return { day, phase: 'mid',        label: 'Growing',               nextAction: null }
  if (day === 14 && !d14done)       return { day, phase: 'candle14',   label: 'Day 14 — Candle Now',   nextAction: 'candle14' }
  if (day >= 14  && day < 18)       return { day, phase: 'prelockdown',label: 'Pre-Lockdown',          nextAction: null }
  if (day === 18)                   return { day, phase: 'lockdown',   label: 'LOCKDOWN TODAY',        nextAction: 'lockdown' }
  if (day >= 19  && day <= 21)      return { day, phase: 'hatch',      label: 'Watch for Pip',         nextAction: null }
  if (day > 21   && hatched === 0)  return { day, phase: 'recordhatch',label: 'Record Hatch Results',  nextAction: 'recordhatch' }
  return { day, phase: 'done', label: 'Complete', nextAction: null }
}

// Computes the next actionable label for a batch and whether it is due today
function getNextActionInfo(batch) {
  const setDate = new Date(safeStr(batch.fields['Set Date']) + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const day = Math.floor((today - setDate) / 86400000) + 1
  const hatched = safeNum(batch.fields['Chicks Hatched'])
  const d7done  = safeNum(batch.fields['Day 7 Developing'])  > 0 || safeNum(batch.fields['Day 7 Removed'])  > 0
  const d14done = safeNum(batch.fields['Day 14 Developing']) > 0 || safeNum(batch.fields['Day 14 Removed']) > 0
  if (day < 7)                { const d = 7  - day; return { label: d === 1 ? 'Candle in 1 day'   : `Candle in ${d} days`,   urgent: false } }
  if (day === 7  && !d7done)  return { label: 'Candle today',           urgent: true  }
  if (day > 7    && day < 14) { const d = 14 - day; return { label: d === 1 ? 'Candle in 1 day'   : `Candle in ${d} days`,   urgent: false } }
  if (day === 14 && !d14done) return { label: 'Candle today',           urgent: true  }
  if (day > 14   && day < 18) { const d = 18 - day; return { label: d === 1 ? 'Lockdown in 1 day' : `Lockdown in ${d} days`, urgent: false } }
  if (day === 18)             return { label: 'Lockdown today',         urgent: true  }
  if (day >= 19  && day < 21) { const d = 21 - day; return { label: d === 1 ? 'Hatch in 1 day'    : `Hatch in ${d} days`,    urgent: false } }
  if (day >= 21  && hatched === 0) return { label: 'Record hatch results', urgent: true }
  return { label: 'Complete', urgent: false }
}

function formatBatchName(name) {
  if (!name) return 'Untitled'
  return name.replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, m, d) => {
    const date = new Date(`${y}-${m}-${d}T12:00:00`)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  })
}

// ── Happy Cuts schedule fetcher (uses returnFieldsByFieldId) ──────────────────
async function fetchHCSchedule() {
  if (!HC_BASE || !HC_PAT) return []
  const HC_URL = `https://api.airtable.com/v0/${HC_BASE}`
  const records = []; let offset = null
  do {
    let qs = '?returnFieldsByFieldId=true'
    if (offset) qs += `&offset=${offset}`
    const res = await fetch(`${HC_URL}/${SCHEDULE_TABLE}${qs}`, {
      headers: { Authorization: `Bearer ${HC_PAT}` },
    })
    const json = await res.json()
    if (!json.records) break
    records.push(...json.records)
    offset = json.offset || null
  } while (offset)
  return records
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtMoney(val) {
  const n = safeNum(val)
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtDateShort(str) {
  if (!str) return ''
  const d = new Date(str.includes('T') ? str : str + 'T12:00:00')
  return isNaN(d) ? str : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { profile, isAdmin, isVA, permissions } = useAuth()

  const [propData, setPropData]           = useState(null)
  const [propLoading, setPropLoading]     = useState(true)

  const [complianceData, setComplianceData]       = useState([])
  const [complianceLoading, setComplianceLoading] = useState(true)

  const [incubatorData, setIncubatorData]       = useState([])
  const [incubatorLoading, setIncubatorLoading] = useState(true)

  const [hcData, setHcData]       = useState([])
  const [hcLoading, setHcLoading] = useState(true)

  const [activityLogs, setActivityLogs]       = useState([])
  const [activityLoading, setActivityLoading] = useState(true)

  useEffect(() => {
    // Properties + related — run as one parallel group; each sub-result fails independently
    Promise.allSettled([
      fetchAllRecords('Property', {}, PM_BASE_ID),
      fetchAllRecords('Rental Units', {}, PM_BASE_ID),
      fetchAllRecords('Lease Agreements', {}, PM_BASE_ID),
      fetchAllRecords('Invoices Payments', {}, PM_BASE_ID),
      fetchAllRecords('Maintenance Requests', {}, PM_BASE_ID),
    ]).then(([propRes, unitsRes, leasesRes, invRes, maintRes]) => {
      const get = (r) => r.status === 'fulfilled' ? (r.value?.data || []) : []
      setPropData({
        properties:     get(propRes),
        rentalUnits:    get(unitsRes),
        leases:         get(leasesRes),
        invoicePayments:get(invRes),
        maintenance:    get(maintRes),
      })
      setPropLoading(false)
    })

    // LLC compliance (uses default Airtable base — Shepard Owned Companies)
    fetchAllRecords('Compliance Log')
      .then(res => setComplianceData(res.data || []))
      .catch(() => {})
      .finally(() => setComplianceLoading(false))

    // Incubator active batches
    fetchAllRecords(BATCHES_TABLE, {}, CHICKENS_BASE_ID)
      .then(res => setIncubatorData((res.data || []).filter(b => b.fields?.Status === 'Active')))
      .catch(() => {})
      .finally(() => setIncubatorLoading(false))

    // Happy Cuts schedule (field-ID-based fetch)
    fetchHCSchedule()
      .then(records => setHcData(records))
      .catch(() => {})
      .finally(() => setHcLoading(false))

    // Recent activity
    supabase.from('access_logs')
      .select('*').order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setActivityLogs(data || []))
      .finally(() => setActivityLoading(false))
  }, [])

  // ── Date anchors ──────────────────────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const in60  = new Date(today); in60.setDate(today.getDate() + 60)
  const in7   = new Date(today); in7.setDate(today.getDate() + 7)
  const thisMonth = today.getMonth()
  const thisYear  = today.getFullYear()

  // ── Property-derived values ───────────────────────────────────────────────
  const {
    properties = [], rentalUnits = [], leases = [],
    invoicePayments = [], maintenance = [],
  } = propData || {}

  const ownedProperties   = properties.filter(p => (p.fields?.Status || '').toLowerCase() !== 'sold')
  const rentalProperties  = ownedProperties.filter(p => p.fields?.['Investment Type'] === 'Rental Property')
  const rentalUnitIds     = new Set(rentalProperties.flatMap(p => arr(p.fields?.['Rental Units'])))
  const rentalUnitsOnly   = rentalUnits.filter(u => rentalUnitIds.has(u.id))
  const occupiedUnitIds   = new Set(
    leases
      .filter(l => (l.fields?.Status || '').toLowerCase() !== 'closed')
      .flatMap(l => arr(l.fields?.Property))
  )
  const occupiedCount = rentalUnitsOnly.filter(u => occupiedUnitIds.has(u.id)).length

  const openMaintenance = maintenance.filter(m => {
    const s = (m.fields?.Status || '').toLowerCase()
    return !['completed', 'resolved'].includes(s)
  })

  const overduePayments = invoicePayments.filter(p => {
    const s   = p.fields?.Status || ''
    const due = p.fields?.['Due Date'] ? new Date(p.fields['Due Date']) : null
    if (!due) return false
    const d = new Date(due); d.setHours(0, 0, 0, 0)
    return s !== 'Paid' && d < today
  })

  const expiringLeases = leases.filter(l => {
    const end = l.fields?.['End Date'] ? new Date(l.fields['End Date']) : null
    return end && end >= today && end <= in60
  })

  // ── Compliance-derived values ─────────────────────────────────────────────
  const upcomingCompliance = complianceData.filter(r => {
    const s = r.fields?.['Status']
    const d = r.fields?.['Due Date'] ? new Date(r.fields['Due Date']) : null
    return s === 'Pending' && d && d >= today && d <= in60
  })

  // ── Incubator-derived values ──────────────────────────────────────────────
  const urgentBatches = incubatorData.filter(b => getBatchPhase(b).nextAction !== null)

  // ── Action items list (role-gated per item type) ──────────────────────────
  const actionItems = [
    openMaintenance.length > 0 && {
      id: 'maint',
      label: `${openMaintenance.length} open maintenance ticket${openMaintenance.length > 1 ? 's' : ''}`,
      severity: 'amber',
      hash: '#/properties',
    },
    overduePayments.length > 0 && {
      id: 'payments',
      label: `${overduePayments.length} overdue rent payment${overduePayments.length > 1 ? 's' : ''}`,
      severity: 'red',
      hash: '#/properties',
    },
    expiringLeases.length > 0 && {
      id: 'leases',
      label: `${expiringLeases.length} lease${expiringLeases.length > 1 ? 's' : ''} expiring within 60 days`,
      severity: 'amber',
      hash: '#/properties',
    },
    // LLC compliance — admin only (VAs don't have access to LLCs)
    isAdmin && upcomingCompliance.length > 0 && {
      id: 'compliance',
      label: `${upcomingCompliance.length} LLC filing${upcomingCompliance.length > 1 ? 's' : ''} due within 60 days`,
      severity: 'amber',
      hash: '#/llcs',
    },
    // Urgent incubator batches — admin only
    ...(isAdmin ? urgentBatches.map(b => ({
      id: `batch-${b.id}`,
      label: `${formatBatchName(safeStr(b.fields?.['Batch Name'], 'Untitled'))} — ${getBatchPhase(b).label}`,
      severity: 'amber',
      hash: '#/chickens',
    })) : []),
  ].filter(Boolean)

  const actionItemsLoading = propLoading || complianceLoading || (isAdmin && incubatorLoading)

  // ── Happy Cuts derived values ─────────────────────────────────────────────
  const hcThisMonth = hcData.filter(r => {
    const d = safeStr(r.fields?.[SF.date])
    if (!d) return false
    const dt = new Date(d.includes('T') ? d : d + 'T12:00:00')
    return !isNaN(dt) && dt.getMonth() === thisMonth && dt.getFullYear() === thisYear
  })
  const hcMowsThisMonth   = hcThisMonth.length
  const hcRevenueThisMonth = hcThisMonth
    .filter(r => safeStr(r.fields?.[SF.invStatus]) === 'Paid')
    .reduce((s, r) => s + safeNum(r.fields?.[SF.amount]), 0)

  const upcomingMows = hcData
    .filter(r => {
      const d = safeStr(r.fields?.[SF.date])
      if (!d) return false
      const dt = new Date(d.includes('T') ? d : d + 'T12:00:00')
      dt.setHours(0, 0, 0, 0)
      return !isNaN(dt) && dt >= today && dt <= in7
    })
    .sort((a, b) => safeStr(a.fields?.[SF.date]).localeCompare(safeStr(b.fields?.[SF.date])))

  if (!isAdmin && !isVA) {
    return <MemberDashboard profile={profile} permissions={permissions} />
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {profile?.full_name || 'Thomas'}!
        </h1>
        <p className="text-gray-500 mt-1 text-sm">Here's what's going on.</p>
      </div>

      {/* ── Section 1 — Action Items ───────────────────────────────────────── */}
      {(isAdmin || isVA) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Action Items</h2>
          {actionItemsLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : actionItems.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600">
              <span className="font-bold text-lg">✓</span>
              <span className="text-sm font-medium">All clear — nothing needs attention right now.</span>
            </div>
          ) : (
            <div className="space-y-1">
              {actionItems.map(item => (
                <a
                  key={item.id}
                  href={item.hash}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    item.severity === 'red' ? 'bg-red-500' : 'bg-amber-400'
                  }`} />
                  <span className={`text-sm font-medium flex-1 ${
                    item.severity === 'red' ? 'text-red-700' : 'text-amber-700'
                  }`}>
                    {item.label}
                  </span>
                  <span className="text-gray-300 text-xs group-hover:text-gray-500 transition-colors">→</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Section 2 — Key Stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Occupied Units"
          value={propLoading ? '…' : rentalUnitsOnly.length > 0 ? `${occupiedCount}/${rentalUnitsOnly.length}` : '—'}
          sub="rental units"
          color={!propLoading && rentalUnitsOnly.length > 0 && occupiedCount < rentalUnitsOnly.length ? 'amber' : 'normal'}
          onClick={() => { window.location.hash = '#/properties' }}
        />
        <StatCard
          label="Open Maintenance"
          value={propLoading ? '…' : openMaintenance.length}
          sub="tickets"
          color={!propLoading && openMaintenance.length > 0 ? 'amber' : 'normal'}
          onClick={() => { window.location.hash = '#/properties' }}
        />
        {isAdmin && (
          <>
            <StatCard
              label="Mows This Month"
              value={hcLoading ? '…' : hcMowsThisMonth}
              sub="scheduled"
              onClick={() => { window.location.hash = '#/happy-cuts' }}
            />
            <StatCard
              label="Revenue Collected"
              value={hcLoading ? '…' : fmtMoney(hcRevenueThisMonth)}
              sub="this month"
              onClick={() => { window.location.hash = '#/happy-cuts' }}
            />
          </>
        )}
      </div>

      {/* ── Section 3 — Incubator Active Batches ──────────────────────────── */}
      {isAdmin && !incubatorLoading && incubatorData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader title="Incubator" hash="#/chickens" />
            <span className="text-xs text-gray-400">
              {incubatorData.length} active batch{incubatorData.length > 1 ? 'es' : ''}
            </span>
          </div>
          <div className="space-y-3">
            {incubatorData.map(batch => {
              const { day }                     = getBatchPhase(batch)
              const { label: nextLabel, urgent } = getNextActionInfo(batch)
              const batchName = formatBatchName(safeStr(batch.fields?.['Batch Name'], 'Untitled'))
              const pct = Math.min(Math.max((day / 21) * 100, 0), 100)
              return (
                <div
                  key={batch.id}
                  className={`rounded-lg px-4 py-3 border ${
                    urgent ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm">{batchName}</span>
                      <span className="text-xs text-gray-400">Day {day}</span>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      urgent ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {nextLabel}
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${urgent ? 'bg-amber-400' : 'bg-blue-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Section 4 — Upcoming Mows ─────────────────────────────────────── */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader title="Upcoming Mows" hash="#/happy-cuts" />
            <span className="text-xs text-gray-400">Next 7 days</span>
          </div>
          {hcLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : upcomingMows.length === 0 ? (
            <p className="text-sm text-gray-400">No mows scheduled this week.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {upcomingMows.map(r => {
                const clientName = safeStr(r.fields?.[SF.clientName], 'Unknown client')
                const date       = safeStr(r.fields?.[SF.date])
                const invStatus  = safeStr(r.fields?.[SF.invStatus])
                const hasSent    = invStatus !== '' && invStatus !== 'Not Sent' && invStatus !== 'No Invoice'
                return (
                  <div key={r.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-800">{clientName}</span>
                      <span className="text-xs text-gray-400">{fmtDateShort(date)}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                      hasSent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {hasSent ? invStatus : 'No invoice'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Section 5 — Recent Activity ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Recent Activity</h2>
        {activityLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : activityLogs.length === 0 ? (
          <p className="text-gray-500 text-sm">No recent activity.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {activityLogs.map(entry => (
              <div key={entry.id} className="flex items-start justify-between gap-4 py-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-700">{entry.user_email}</span>
                  <span className="text-xs text-gray-400 ml-2">{entry.action}</span>
                  {entry.page_path && (
                    <span className="text-xs text-gray-400 ml-1">— {entry.page_path}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ── Member Dashboard ──────────────────────────────────────────────────────────

const MEMBER_SECTIONS = [
  { key: 'properties',  flag: 'properties',        icon: Building2,  label: 'Properties', desc: 'Rental properties, tenants, and maintenance',  route: '/properties' },
  { key: 'documents',   flag: 'documents',          icon: FileText,   label: 'Documents',  desc: 'Scanned documents and records',                route: '/documents'  },
  { key: 'chickens',    flag: 'chickens',           icon: Egg,        label: 'Chickens',   desc: 'Flock management and feeding schedules',       route: '/chickens'   },
  { key: 'deals',       flag: 'deals',              icon: Tag,        label: 'Deals',      desc: 'Facebook Marketplace deal pipeline',           route: '/deals'      },
  { key: 'tasks',       flag: 'can_view_tasks',     icon: ListTodo,   label: 'Tasks',      desc: 'Your task list',                               route: '/tasks'      },
  { key: 'recipes',     flag: 'can_view_recipes',   icon: ChefHat,    label: 'Recipes',    desc: 'Recipe collection',                            route: '/recipes'    },
  { key: 'tools',       flag: 'can_view_tools',     icon: Wrench,     label: 'Tools',      desc: 'Utility tools',                                route: '/tools'      },
  { key: 'files',       flag: 'can_view_files',     icon: FolderOpen, label: 'Files',      desc: 'File storage',                                 route: '/files'      },
  { key: 'listings',    flag: 'can_view_listings',  icon: MapPin,     label: 'Listings',   desc: 'Property listing dashboards',                  route: '/listings'   },
]

function MemberDashboard({ profile, permissions }) {
  const navigate = useNavigate()
  const visibleSections = MEMBER_SECTIONS.filter(s => !!permissions?.[s.flag])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {profile?.full_name || 'there'}!
        </h1>
        <p className="text-gray-500 mt-1 text-sm">Here's your portal.</p>
      </div>

      {visibleSections.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-sm">Your access is being set up.</p>
          <p className="text-gray-400 text-sm mt-1">Contact Thomas for more information.</p>
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">My Sections</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {visibleSections.map(s => {
              const Icon = s.icon
              return (
                <button
                  key={s.key}
                  onClick={() => navigate(s.route)}
                  className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:shadow-sm hover:border-blue-300 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                      <Icon size={16} className="text-blue-600" />
                    </div>
                    <span className="font-semibold text-gray-800 text-sm">{s.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-snug">{s.desc}</p>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'normal', onClick }) {
  const valueColor = {
    normal: 'text-gray-900',
    amber:  'text-amber-600',
    red:    'text-red-600',
    green:  'text-green-600',
  }
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 p-4 ${onClick ? 'cursor-pointer hover:shadow-sm transition-shadow' : ''}`}
    >
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionHeader({ title, hash }) {
  return (
    <button
      onClick={() => { window.location.hash = hash }}
      className="font-semibold text-gray-800 hover:text-blue-600 flex items-center gap-1 transition-colors"
    >
      {title}
      <span className="text-gray-400 text-sm ml-0.5">→</span>
    </button>
  )
}
