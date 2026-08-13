import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Wrench, Plus, X, Loader2, AlertTriangle, Search, Camera,
  ChevronDown, ChevronUp, SlidersHorizontal, LayoutGrid, List as ListIcon, Table as TableIcon,
} from 'lucide-react'
import { fetchAllRecords, createRecord, updateRecord, fmtCurrency } from '../lib/airtable'
import {
  FLEET_BASE_ID, EQUIPMENT_TABLE, ASSET_CATEGORIES, STATUSES, LOCATIONS, AXLE_COUNTS,
  CATEGORY_FIELDS, STATUS_BADGE, STATUS_DOT, STALE_DAYS, parsePhotos, daysSince,
  MAINT_TABLE, maintenanceUrgency,
} from '../lib/fleet'
import LoadingSpinner from '../components/LoadingSpinner'

// Each page defines its own safe accessors — copy-pasted per page, not shared,
// matching how the rest of Shep Portal is written.
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
const arr = v => (Array.isArray(v) ? v : [])

const CATEGORY_BADGE = 'bg-slate-100 text-slate-600'

/** Remembers a preference in localStorage, per device — this module is used
 *  almost entirely from one iPhone, so "remember how I last had it" matters
 *  more than syncing across devices. Fails quiet in private-browsing etc. */
function usePersisted(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw != null ? JSON.parse(raw) : initial
    } catch { return initial }
  })
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
  }, [key, value])
  return [value, setValue]
}

const VIEW_MODES = [
  { key: 'list', icon: ListIcon, label: 'List' },
  { key: 'grid', icon: LayoutGrid, label: 'Grid' },
  { key: 'table', icon: TableIcon, label: 'Table' },
]

export default function Fleet() {
  const [loading, setLoading] = useState(true)
  const [equipment, setEquipment] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [viewMode, setViewMode] = usePersisted('fleet-view-mode', 'list')
  const [statsOpen, setStatsOpen] = usePersisted('fleet-stats-open', false)
  const [filtersOpen, setFiltersOpen] = useState(false) // not persisted — starts closed every visit so it can't linger open eating space

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [eqRes, maintRes] = await Promise.all([
        fetchAllRecords(EQUIPMENT_TABLE, {}, FLEET_BASE_ID),
        fetchAllRecords(MAINT_TABLE, {}, FLEET_BASE_ID),
      ])
      if (eqRes.error) throw new Error(eqRes.error)
      if (maintRes.error) throw new Error(maintRes.error)
      setEquipment(eqRes.data || [])
      setMaintenance(maintRes.data || [])
    } catch (e) {
      toast.error('Failed to load fleet: ' + (e.message || 'unknown'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return equipment.filter(e => {
      const f = e.fields || {}
      if (categoryFilter !== 'all' && safeStr(f.Category) !== categoryFilter) return false
      if (statusFilter !== 'all' && safeStr(f.Status) !== statusFilter) return false
      if (locationFilter !== 'all' && safeStr(f.Location) !== locationFilter) return false
      if (q) {
        const hay = [f.Name, f.Make, f.Model, f['Serial Number'], f['License Plate']].map(x => safeStr(x).toLowerCase()).join(' ')
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [equipment, categoryFilter, statusFilter, locationFilter, search])

  const totals = useMemo(() => {
    const live = equipment.filter(e => safeStr(e.fields?.Status) !== 'Sold')
    const invested = live.reduce((s, e) => s + safeNum(e.fields?.['Total Invested']), 0)
    const value = live.reduce((s, e) => s + safeNum(e.fields?.['Est. Market Value']), 0)
    const equity = live.reduce((s, e) => s + safeNum(e.fields?.['Est. Equity']), 0)
    const counts = {}
    live.forEach(e => {
      const s = safeStr(e.fields?.Status, 'Running')
      counts[s] = (counts[s] || 0) + 1
    })
    return { invested, value, equity, counts, activeCount: live.length }
  }, [equipment])

  /** Per-machine maintenance urgency, indexed by Equipment record ID — feeds both
   *  the card/row badges and the Needs Attention merge below. */
  const maintByMachine = useMemo(() => {
    const idx = {}
    maintenance.forEach(m => {
      const t = maintenanceUrgency(m.fields || {})
      if (t.state !== 'overdue' && t.state !== 'dueSoon') return
      arr(m.fields?.Equipment).forEach(eqId => {
        const bucket = (idx[eqId] = idx[eqId] || { overdue: [], dueSoon: [] })
        bucket[t.state === 'overdue' ? 'overdue' : 'dueSoon'].push({ item: m, t })
      })
    })
    return idx
  }, [maintenance])

  /** Everything worth flagging, derived rather than stored — mirrors the Insurance page.
   *  Maintenance Overdue/Due Soon items lead (they're time-sensitive); equipment
   *  data-quality gaps (missing price/date, stale value) are their own, separate checks. */
  const issues = useMemo(() => {
    const out = []
    equipment
      .filter(e => safeStr(e.fields?.Status) !== 'Sold')
      .forEach(e => {
        const name = safeStr(e.fields?.Name, 'Unnamed asset')
        const bucket = maintByMachine[e.id]
        if (bucket) {
          bucket.overdue.forEach(({ item, t }) => out.push({
            key: `maint-${item.id}`, machine: e, kind: 'maint',
            title: `${name} — ${safeStr(item.fields?.Name, 'maintenance item')} (${t.label.toLowerCase()})`,
          }))
          bucket.dueSoon.forEach(({ item, t }) => out.push({
            key: `maint-${item.id}`, machine: e, kind: 'maint',
            title: `${name} — ${safeStr(item.fields?.Name, 'maintenance item')} (${t.label.toLowerCase()})`,
          }))
        }
      })
    equipment
      .filter(e => safeStr(e.fields?.Status) !== 'Sold')
      .forEach(e => {
        const f = e.fields || {}
        const name = safeStr(f.Name, 'Unnamed asset')
        if (f['Purchase Price'] == null) {
          out.push({ key: `price-${e.id}`, machine: e, title: `${name} — purchase price not confirmed` })
        }
        if (!f['Purchase Date']) {
          out.push({ key: `date-${e.id}`, machine: e, title: `${name} — purchase date not confirmed` })
        }
        const staleDays = daysSince(f['Market Value Last Updated'])
        if (f['Est. Market Value'] != null && staleDays != null && staleDays > STALE_DAYS) {
          out.push({ key: `stale-${e.id}`, machine: e, title: `${name} — market value hasn't been updated in ${staleDays} days` })
        }
      })
    return out
  }, [equipment, maintByMachine])

  const activeFilterCount = [categoryFilter, statusFilter, locationFilter].filter(v => v !== 'all').length

  if (loading) return <LoadingSpinner />

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-3 sm:space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Wrench size={22} className="text-blue-600" />
          Fleet
        </h1>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex-shrink-0"
        >
          <Plus size={15} /> Add
        </button>
      </div>

      {/* Stats — collapsed by default; header row doubles as a one-line summary */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setStatsOpen(o => !o)}
          className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left"
        >
          {statsOpen ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fleet totals</span>
          ) : (
            <p className="text-sm text-gray-700 truncate min-w-0">
              <span className="font-bold tabular-nums">{fmtCurrency(totals.invested)}</span> invested
              {totals.value > 0 && (
                <> · <span className={`font-bold tabular-nums ${totals.equity >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtCurrency(totals.equity)}</span> equity</>
              )}
              {' · '}
              {STATUSES.filter(s => totals.counts[s]).map(s => `${totals.counts[s]} ${s}`).join(' · ') || 'no equipment yet'}
            </p>
          )}
          {statsOpen ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
        </button>
        {statsOpen && (
          <div className="px-4 pb-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Total invested" value={fmtCurrency(totals.invested)} sub={`${totals.activeCount} active assets`} />
            <StatTile label="Est. fleet value" value={fmtCurrency(totals.value)} sub="Sum of Est. Market Value" />
            <StatTile
              label="Est. equity"
              value={fmtCurrency(totals.equity)}
              sub={totals.equity >= 0 ? 'Fleet is worth more than it cost' : 'Fleet has cost more than it’s worth'}
              tone={totals.equity >= 0 ? 'good' : 'crit'}
            />
            <StatTile
              label="By status"
              value={STATUSES.filter(s => totals.counts[s]).map(s => `${totals.counts[s]} ${s}`).join(' · ') || 'No equipment yet'}
              sub="Active fleet"
              small
            />
          </div>
        )}
      </div>

      {/* Needs attention */}
      {issues.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-amber-500 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-600" />
            <h2 className="font-semibold text-gray-800 text-sm">Needs attention</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {issues.map(i => (
              <div key={i.key} className="px-4 py-2 flex items-center gap-3">
                {i.kind === 'maint' && <Wrench size={12} className="text-amber-500 flex-shrink-0" />}
                <p className="text-sm text-gray-800 flex-1 min-w-0">{i.title}</p>
                <Link to={`/fleet/${i.machine.id}`} className="text-xs font-medium text-blue-600 hover:text-blue-800 flex-shrink-0">
                  Open
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + filter toggle + view switcher, one compact row */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => setFiltersOpen(o => !o)}
            className={`relative flex items-center px-3 rounded-lg text-sm font-medium border flex-shrink-0 transition-colors ${
              filtersOpen || activeFilterCount > 0 ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
            }`}
            title="Filters"
          >
            <SlidersHorizontal size={15} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold grid place-items-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden flex-shrink-0">
            {VIEW_MODES.map(mode => (
              <button
                key={mode.key}
                onClick={() => setViewMode(mode.key)}
                title={mode.label}
                className={`p-2 transition-colors ${viewMode === mode.key ? 'bg-gray-900 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
              >
                <mode.icon size={15} />
              </button>
            ))}
          </div>
        </div>

        {filtersOpen && (
          <div className="bg-white border border-gray-200 rounded-lg p-3 grid gap-3 sm:grid-cols-3">
            <CompactSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} options={ASSET_CATEGORIES} />
            <CompactSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUSES} />
            <CompactSelect label="Location" value={locationFilter} onChange={setLocationFilter} options={LOCATIONS} />
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setCategoryFilter('all'); setStatusFilter('all'); setLocationFilter('all') }}
                className="sm:col-span-3 text-xs text-blue-600 hover:text-blue-800 font-medium text-left"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
          {equipment.length === 0 ? (
            <>
              No equipment yet.{' '}
              <button onClick={() => setAdding(true)} className="text-blue-600 hover:text-blue-800 font-medium">
                Add your first asset
              </button>
            </>
          ) : 'Nothing matches those filters.'}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(e => <MachineCard key={e.id} machine={e} maint={maintByMachine[e.id]} />)}
        </div>
      ) : viewMode === 'table' ? (
        <FleetTable machines={filtered} maintByMachine={maintByMachine} />
      ) : (
        <div className="space-y-2">
          {filtered.map(e => <MachineRow key={e.id} machine={e} maint={maintByMachine[e.id]} />)}
        </div>
      )}

      {adding && (
        <EquipmentModal
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function StatTile({ label, value, sub, tone, small }) {
  const toneCls = tone === 'crit' ? 'text-red-600' : tone === 'good' ? 'text-green-600' : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className={`${small ? 'text-sm' : 'text-2xl'} font-bold tabular-nums leading-tight ${toneCls}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

function CompactSelect({ label, value, onChange, options }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

/** Small red/amber badge when a machine has any Overdue or Due Soon maintenance item. */
function MaintBadge({ maint }) {
  if (!maint || (maint.overdue.length === 0 && maint.dueSoon.length === 0)) return null
  const isOverdue = maint.overdue.length > 0
  const count = maint.overdue.length || maint.dueSoon.length
  return (
    <span
      title={`${maint.overdue.length} overdue, ${maint.dueSoon.length} due soon`}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 ${
        isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      <Wrench size={9} /> {count}
    </span>
  )
}

function CategoryBadge({ category }) {
  if (!category) return null
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 ${CATEGORY_BADGE}`}>
      {category}
    </span>
  )
}

function MachineRow({ machine, maint }) {
  const f = machine.fields || {}
  const photos = parsePhotos(f)
  const thumb = photos.find(p => p.kind === 'machine') || photos[0]
  const status = safeStr(f.Status, 'Running')
  const invested = safeNum(f['Total Invested'])
  const value = f['Est. Market Value']
  const equity = safeNum(f['Est. Equity'])
  const hasValue = value != null && value !== ''

  return (
    <Link
      to={`/fleet/${machine.id}`}
      className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-2.5 hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden grid place-items-center">
        {thumb ? <img src={thumb.url} alt="" className="w-full h-full object-cover" /> : <Wrench size={16} className="text-gray-300" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-semibold text-gray-900 text-sm truncate">{safeStr(f.Name, 'Unnamed asset')}</p>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status] || STATUS_DOT.Running}`} title={status} />
          <CategoryBadge category={safeStr(f.Category)} />
          <MaintBadge maint={maint} />
        </div>
        <p className="text-xs text-gray-400 truncate">
          {[safeStr(f.Make), safeStr(f.Model)].filter(Boolean).join(' ') || status}
          {f.Location ? ` · ${safeStr(f.Location)}` : ''}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold tabular-nums ${!hasValue ? 'text-gray-500' : equity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {hasValue ? fmtCurrency(equity) : fmtCurrency(invested)}
        </p>
        <p className="text-[10px] text-gray-400">{hasValue ? 'equity' : 'invested'}</p>
      </div>
    </Link>
  )
}

function FleetTable({ machines, maintByMachine }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Name</th>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Category</th>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</th>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Location</th>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Invested</th>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Value</th>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Equity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {machines.map(m => {
            const f = m.fields || {}
            const status = safeStr(f.Status, 'Running')
            const value = f['Est. Market Value']
            const hasValue = value != null && value !== ''
            const equity = safeNum(f['Est. Equity'])
            return (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Link to={`/fleet/${m.id}`} className="font-medium text-gray-900 hover:text-blue-700">{safeStr(f.Name, 'Unnamed asset')}</Link>
                    <MaintBadge maint={maintByMachine[m.id]} />
                  </div>
                  <p className="text-xs text-gray-400">{[safeStr(f.Make), safeStr(f.Model)].filter(Boolean).join(' ') || '—'}</p>
                </td>
                <td className="px-3 py-2 text-gray-600">{safeStr(f.Category) || '—'}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[status] || STATUS_BADGE.Running}`}>{status}</span>
                </td>
                <td className="px-3 py-2 text-gray-600">{safeStr(f.Location) || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">{fmtCurrency(safeNum(f['Total Invested']))}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">{hasValue ? fmtCurrency(value) : '—'}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-bold ${!hasValue ? 'text-gray-300' : equity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {hasValue ? fmtCurrency(equity) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MachineCard({ machine, maint }) {
  const f = machine.fields || {}
  const photos = parsePhotos(f)
  const thumb = photos.find(p => p.kind === 'machine') || photos[0]
  const status = safeStr(f.Status, 'Running')
  const invested = safeNum(f['Total Invested'])
  const value = f['Est. Market Value']
  const equity = safeNum(f['Est. Equity'])
  const hasValue = value != null && value !== ''

  return (
    <Link
      to={`/fleet/${machine.id}`}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 transition-all group"
    >
      <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
        {thumb ? (
          <img src={thumb.url} alt={safeStr(f.Name)} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <Wrench size={32} />
          </div>
        )}
        <span className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[status] || STATUS_BADGE.Running}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] || STATUS_DOT.Running}`} />
          {status}
        </span>
        {f.Category && (
          <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${CATEGORY_BADGE}`}>
            {safeStr(f.Category)}
          </span>
        )}
      </div>
      <div className="p-3.5">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold text-gray-900 text-sm truncate">{safeStr(f.Name, 'Unnamed asset')}</p>
          <MaintBadge maint={maint} />
        </div>
        <p className="text-xs text-gray-400 mt-0.5 truncate">
          {[safeStr(f.Make), safeStr(f.Model)].filter(Boolean).join(' ') || '—'}
          {f.Location ? ` · ${safeStr(f.Location)}` : ''}
        </p>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Invested</p>
            <p className="text-sm font-bold text-gray-800 tabular-nums">{fmtCurrency(invested)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Est. value</p>
            <p className="text-sm font-bold text-gray-800 tabular-nums">{hasValue ? fmtCurrency(value) : '—'}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Equity</p>
            <p className={`text-sm font-bold tabular-nums ${!hasValue ? 'text-gray-300' : equity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {hasValue ? fmtCurrency(equity) : '—'}
            </p>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{hint && <span className="font-normal text-gray-400"> — {hint}</span>}
      </label>
      {children}
    </div>
  )
}

const emptyEquipmentForm = {
  name: '', category: 'Zero-Turn', make: '', model: '', serial: '', plate: '', dom: '', engine: '', deckSize: '',
  axles: '', gvwr: '', mileage: '', hours: '', readingDate: '', registrationExpiry: '', insuranceProvider: '',
  purchaseDate: '', purchasePrice: '', status: 'Running', location: 'Home',
  marketValue: '', notes: '',
}

export function EquipmentModal({ equipment, onClose, onSaved }) {
  const f = equipment?.fields || {}
  const [form, setForm] = useState(() => equipment ? {
    name: safeStr(f.Name), category: safeStr(f.Category, 'Zero-Turn'), make: safeStr(f.Make), model: safeStr(f.Model),
    serial: safeStr(f['Serial Number']), plate: safeStr(f['License Plate']),
    dom: safeStr(f['DOM / Year']), engine: safeStr(f.Engine), deckSize: safeStr(f['Deck Size']),
    axles: safeStr(f['Axle Count']), gvwr: safeStr(f.GVWR),
    mileage: f['Current Mileage'] != null ? String(f['Current Mileage']) : '',
    hours: f['Current Engine Hours'] != null ? String(f['Current Engine Hours']) : '',
    readingDate: safeStr(f['Reading Last Updated']),
    registrationExpiry: safeStr(f['Registration Expiry']), insuranceProvider: safeStr(f['Insurance Provider']),
    purchaseDate: safeStr(f['Purchase Date']), purchasePrice: f['Purchase Price'] != null ? String(f['Purchase Price']) : '',
    status: safeStr(f.Status, 'Running'), location: safeStr(f.Location, 'Home'),
    marketValue: f['Est. Market Value'] != null ? String(f['Est. Market Value']) : '',
    notes: safeStr(f.Notes),
  } : emptyEquipmentForm)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const show = key => (CATEGORY_FIELDS[form.category] || []).includes(key)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Give it a name')
    setSaving(true)
    const num = v => (v === '' ? null : Number(v))
    const newMarketValue = num(form.marketValue)
    const marketValueChanged = newMarketValue !== (f['Est. Market Value'] ?? null)
    const newMileage = num(form.mileage)
    const newHours = num(form.hours)
    const readingChanged = newMileage !== (f['Current Mileage'] ?? null) || newHours !== (f['Current Engine Hours'] ?? null)
    const fields = {
      Name: form.name,
      Category: form.category,
      Make: form.make,
      Model: form.model,
      'Serial Number': form.serial,
      'License Plate': form.plate,
      'DOM / Year': form.dom,
      Engine: form.engine,
      'Deck Size': form.deckSize,
      'Axle Count': form.axles || null,
      GVWR: form.gvwr,
      'Current Mileage': newMileage,
      'Current Engine Hours': newHours,
      'Registration Expiry': form.registrationExpiry || null,
      'Insurance Provider': form.insuranceProvider,
      'Purchase Date': form.purchaseDate || null,
      'Purchase Price': num(form.purchasePrice),
      Status: form.status,
      Location: form.location,
      'Est. Market Value': newMarketValue,
      Notes: form.notes,
    }
    // Stamp "last updated" automatically whenever a tracked value actually
    // changes, so staleness tracking doesn't rely on remembering a second field.
    if (marketValueChanged) fields['Market Value Last Updated'] = new Date().toISOString().slice(0, 10)
    if (readingChanged) fields['Reading Last Updated'] = new Date().toISOString().slice(0, 10)

    const res = equipment
      ? await updateRecord(EQUIPMENT_TABLE, equipment.id, fields, FLEET_BASE_ID)
      : await createRecord(EQUIPMENT_TABLE, fields, FLEET_BASE_ID)
    setSaving(false)
    if (res.error) return toast.error('Failed to save: ' + res.error)
    toast.success(equipment ? 'Saved' : 'Asset added')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <h2 className="font-semibold text-gray-900">{equipment ? 'Edit asset' : 'Add asset'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field label="Name">
            <input value={form.name} onChange={e => set('name', e.target.value)} className={inp} required
              placeholder="Chevy Suburban" />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Category">
              <select value={form.category} onChange={e => set('category', e.target.value)} className={inp}>
                {ASSET_CATEGORIES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Make">
              <input value={form.make} onChange={e => set('make', e.target.value)} className={inp} placeholder="Chevrolet" />
            </Field>
            <Field label="Model">
              <input value={form.model} onChange={e => set('model', e.target.value)} className={inp} />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={show('vin') ? 'VIN' : 'Serial number'}>
              <input value={form.serial} onChange={e => set('serial', e.target.value)} className={inp} />
            </Field>
            <Field label="DOM / year" hint="date of manufacture / model year, if known">
              <input value={form.dom} onChange={e => set('dom', e.target.value)} className={inp} />
            </Field>
          </div>

          {show('plate') && (
            <Field label="License plate">
              <input value={form.plate} onChange={e => set('plate', e.target.value)} className={inp} />
            </Field>
          )}

          {show('engine') && (
            <Field label="Engine / powertrain">
              <input value={form.engine} onChange={e => set('engine', e.target.value)} className={inp} placeholder="Kohler Courage SV730 25HP" />
            </Field>
          )}
          {show('deckSize') && (
            <Field label="Deck size">
              <input value={form.deckSize} onChange={e => set('deckSize', e.target.value)} className={inp} placeholder="50&quot;" />
            </Field>
          )}

          {show('axles') && (
            <Field label="Axle count">
              <select value={form.axles} onChange={e => set('axles', e.target.value)} className={inp}>
                <option value="">Not set</option>
                {AXLE_COUNTS.map(a => <option key={a}>{a}</option>)}
              </select>
            </Field>
          )}
          {show('gvwr') && (
            <Field label="GVWR">
              <input value={form.gvwr} onChange={e => set('gvwr', e.target.value)} className={inp} />
            </Field>
          )}

          {(show('mileage') || show('hours')) && (
            <div className="grid sm:grid-cols-2 gap-4">
              {show('mileage') && (
                <Field label="Current mileage">
                  <input type="number" inputMode="numeric" min="0" value={form.mileage}
                    onChange={e => set('mileage', e.target.value)} className={inp} />
                </Field>
              )}
              {show('hours') && (
                <Field label="Current engine hours">
                  <input type="number" inputMode="decimal" min="0" value={form.hours}
                    onChange={e => set('hours', e.target.value)} className={inp} />
                </Field>
              )}
            </div>
          )}

          {show('registration') && (
            <Field label="Registration expiry">
              <input type="date" value={form.registrationExpiry} onChange={e => set('registrationExpiry', e.target.value)} className={inp} />
            </Field>
          )}
          {show('insurance') && (
            <Field label="Insurance provider" hint="optional">
              <input value={form.insuranceProvider} onChange={e => set('insuranceProvider', e.target.value)} className={inp} />
            </Field>
          )}

          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Purchase date">
              <input type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} className={inp} />
            </Field>
            <Field label="Purchase price">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" inputMode="decimal" step="0.01" min="0" value={form.purchasePrice}
                  onChange={e => set('purchasePrice', e.target.value)} className={inp + ' pl-6'} />
              </div>
            </Field>
            <Field label="Location">
              <select value={form.location} onChange={e => set('location', e.target.value)} className={inp}>
                {LOCATIONS.map(l => <option key={l}>{l}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Est. market value" hint="what it'd sell for on FB Marketplace today">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" inputMode="decimal" step="0.01" min="0" value={form.marketValue}
                onChange={e => set('marketValue', e.target.value)} className={inp + ' pl-6'} />
            </div>
          </Field>

          <Field label="Notes">
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} className={inp}
              placeholder="e.g. best machine currently, shares parts with #4" />
          </Field>

          {!equipment && (
            <p className="text-xs text-gray-400 flex items-start gap-1.5">
              <Camera size={13} className="flex-shrink-0 mt-0.5" />
              Add photos (tag/serial + machine shots) from the asset's detail page after saving.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {equipment ? 'Save' : 'Add asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
