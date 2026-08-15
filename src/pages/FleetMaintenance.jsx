import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { fetchAllRecords, updateRecord } from '../lib/airtable'
import {
  FLEET_BASE_ID, EQUIPMENT_TABLE, MAINT_TABLE, MAINT_CATEGORIES, MAINT_PRIORITIES,
  MAINT_CATEGORY_BADGE, MAINT_PRIORITY_BADGE, maintenanceUrgency, computeMarkDoneFields, todayISO,
} from '../lib/fleet'
import LoadingSpinner from '../components/LoadingSpinner'

const safeStr = (v, fallback = '') => {
  if (v == null || v === '') return fallback
  if (typeof v === 'object') return v.name ? String(v.name) : fallback
  return String(v)
}
const arr = v => (Array.isArray(v) ? v : [])

const URGENCY_RANK = { overdue: 0, dueSoon: 1, scheduled: 2, watch: 3, done: 4 }
const URGENCY_TEXT = { crit: 'text-red-600', warn: 'text-amber-600', ok: 'text-gray-500', none: 'text-gray-400' }

export default function FleetMaintenance() {
  const [loading, setLoading] = useState(true)
  const [equipment, setEquipment] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [showDone, setShowDone] = useState(false)

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
      toast.error('Failed to load maintenance: ' + (e.message || 'unknown'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const equipmentById = useMemo(() => {
    const idx = {}
    equipment.forEach(e => { idx[e.id] = e.fields || {} })
    return idx
  }, [equipment])

  const soldIds = useMemo(
    () => new Set(equipment.filter(e => safeStr(e.fields?.Status) === 'Sold').map(e => e.id)),
    [equipment]
  )

  /** Grouped by task Name — the same task on 5 mowers is one row to act on, not 5.
   *  Sorted by urgency, so this doubles as an upcoming-work planner even when
   *  (as is typical) nothing is actually overdue. */
  const groups = useMemo(() => {
    const idx = {}
    maintenance.forEach(m => {
      const assetIds = arr(m.fields?.Equipment)
      if (assetIds.length === 0 || assetIds.some(id => soldIds.has(id))) return // sold assets' items excluded
      if (categoryFilter !== 'all' && safeStr(m.fields?.Category) !== categoryFilter) return
      if (priorityFilter !== 'all' && safeStr(m.fields?.Priority) !== priorityFilter) return
      const key = safeStr(m.fields?.Name, 'Untitled')
      ;(idx[key] = idx[key] || []).push(m)
    })
    return Object.entries(idx)
      .map(([name, items]) => {
        const withUrgency = items
          .map(item => ({ item, assetId: arr(item.fields?.Equipment)[0], t: maintenanceUrgency(item.fields || {}) }))
          .sort((a, b) => URGENCY_RANK[a.t.state] - URGENCY_RANK[b.t.state] || (a.t.days ?? 9999) - (b.t.days ?? 9999))
        return {
          name,
          category: safeStr(items[0].fields?.Category, 'Preventative'),
          priority: safeStr(items[0].fields?.Priority, 'Low'),
          items: withUrgency,
          soonest: withUrgency[0].t,
        }
      })
      .sort((a, b) => URGENCY_RANK[a.soonest.state] - URGENCY_RANK[b.soonest.state] || (a.soonest.days ?? 9999) - (b.soonest.days ?? 9999))
  }, [maintenance, soldIds, categoryFilter, priorityFilter])

  const activeGroups = useMemo(() => groups.filter(g => g.soonest.state !== 'done'), [groups])
  const doneGroups = useMemo(() => groups.filter(g => g.soonest.state === 'done'), [groups])

  async function markDone(item) {
    const fields = computeMarkDoneFields(item.fields || {})
    const { error } = await updateRecord(MAINT_TABLE, item.id, fields, FLEET_BASE_ID)
    if (error) return toast.error('Failed to update: ' + error)
    load()
  }

  async function markAllDone(group) {
    const actionable = group.items.filter(x => x.t.state !== 'done' && x.t.state !== 'watch')
    if (actionable.length === 0) return
    const results = await Promise.all(
      actionable.map(({ item }) => updateRecord(MAINT_TABLE, item.id, computeMarkDoneFields(item.fields || {}), FLEET_BASE_ID))
    )
    const failed = results.filter(r => r.error).length
    if (failed) toast.error(`${failed} of ${actionable.length} failed to update`)
    else toast.success(`Marked ${actionable.length} done`)
    load()
  }

  async function flagNeeded(item) {
    const { error } = await updateRecord(MAINT_TABLE, item.id, { Status: 'Active', 'Next Due Date': todayISO() }, FLEET_BASE_ID)
    if (error) return toast.error('Failed to flag: ' + error)
    load()
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      <Link to="/fleet" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> Back to fleet
      </Link>

      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Maintenance</h1>
        <p className="text-sm text-gray-500 mt-0.5">Every task, fleet-wide — the same task on multiple machines groups into one row.</p>
      </div>

      <div className="space-y-2">
        <FilterPills label="Category" value={categoryFilter} onChange={setCategoryFilter} options={MAINT_CATEGORIES} />
        <FilterPills label="Priority" value={priorityFilter} onChange={setPriorityFilter} options={MAINT_PRIORITIES} />
      </div>

      {activeGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
          Nothing tracked yet.
        </div>
      ) : (
        <div className="space-y-2">
          {activeGroups.map(g => (
            <MaintGroup
              key={g.name}
              group={g}
              equipmentById={equipmentById}
              onMarkDone={markDone}
              onMarkAllDone={() => markAllDone(g)}
              onFlagNeeded={flagNeeded}
            />
          ))}
        </div>
      )}

      {doneGroups.length > 0 && (
        <>
          <button
            onClick={() => setShowDone(o => !o)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 rounded-lg border border-gray-200 bg-white"
          >
            {showDone ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showDone ? 'Hide' : `Show ${doneGroups.length} done`}
          </button>
          {showDone && (
            <div className="space-y-2">
              {doneGroups.map(g => (
                <MaintGroup key={g.name} group={g} equipmentById={equipmentById} onMarkDone={markDone} onMarkAllDone={() => {}} onFlagNeeded={flagNeeded} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function FilterPills({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs font-medium text-gray-400 mr-0.5">{label}:</span>
      {['all', ...options].map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            value === opt ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {opt === 'all' ? 'All' : opt}
        </button>
      ))}
    </div>
  )
}

function MaintGroup({ group, equipmentById, onMarkDone, onMarkAllDone, onFlagNeeded }) {
  const { name, category, priority, items, soonest } = group
  const actionableCount = items.filter(x => x.t.state !== 'done' && x.t.state !== 'watch').length

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-sm font-semibold text-gray-900">{name}</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${MAINT_CATEGORY_BADGE[category] || MAINT_CATEGORY_BADGE.Preventative}`}>
            {category}
          </span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${MAINT_PRIORITY_BADGE[priority] || MAINT_PRIORITY_BADGE.Low}`}>
            {priority}
          </span>
          <span className={`text-xs ${URGENCY_TEXT[soonest.urgency]}`}>
            {items.length} machine{items.length === 1 ? '' : 's'} · {soonest.label}
          </span>
        </div>
        {actionableCount > 1 && (
          <button
            onClick={onMarkAllDone}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 flex-shrink-0"
          >
            <CheckCircle2 size={12} /> Mark all done
          </button>
        )}
      </div>
      <div className="divide-y divide-gray-100">
        {items.map(({ item, assetId, t }) => {
          const asset = equipmentById[assetId] || {}
          return (
            <div key={item.id} className="px-4 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Link to={`/fleet/${assetId}`} className="text-sm text-gray-800 hover:text-blue-700 font-medium">
                  {safeStr(asset.Name, 'Unknown asset')}
                </Link>
                <p className={`text-xs ${URGENCY_TEXT[t.urgency]}`}>
                  {t.label}{asset.Location ? ` · ${safeStr(asset.Location)}` : ''}
                </p>
              </div>
              {t.state === 'watch' ? (
                <button
                  onClick={() => onFlagNeeded(item)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 flex-shrink-0"
                >
                  <AlertTriangle size={11} /> Flag
                </button>
              ) : t.state !== 'done' ? (
                <button
                  onClick={() => onMarkDone(item)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-green-50 text-green-700 hover:bg-green-100 flex-shrink-0"
                >
                  <CheckCircle2 size={11} /> Done
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
