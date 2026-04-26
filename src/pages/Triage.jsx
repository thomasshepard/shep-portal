import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, AlertTriangle, ChevronDown, X, BookOpen } from 'lucide-react'
import { updateRecord, fmtDate } from '../lib/airtable'
import {
  fetchAllTriageItems,
  getActiveDismissals,
  dismissItem,
  resolveTriageItem,
} from '../lib/triageRules'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

const safeStr    = (v, fb = '') => (v == null ? fb : String(v))
const safeRender = (v, fb = '—') => {
  if (v == null) return fb
  if (Array.isArray(v)) return v.join(', ') || fb
  if (typeof v === 'object') return fb
  return String(v) || fb
}

const CACHE_TTL_MS = 60_000

const HANDLER_COLORS = {
  Thomas:        'bg-slate-100 text-slate-700',
  Janine:        'bg-purple-100 text-purple-700',
  Gabrielle:     'bg-pink-100 text-pink-700',
  Anthony:       'bg-emerald-100 text-emerald-700',
  Subcontractor: 'bg-orange-100 text-orange-700',
  Decide:        'bg-yellow-100 text-yellow-700',
}

const BUCKET_CONFIG = {
  late:     { label: 'LATE',     emoji: '🔴', strip: 'bg-red-500',   textCls: 'text-red-600',   tintCls: 'bg-red-50',   btnCls: 'bg-red-600 hover:bg-red-700 text-white'   },
  dueSoon:  { label: 'DUE SOON', emoji: '🟡', strip: 'bg-amber-500', textCls: 'text-amber-600', tintCls: 'bg-amber-50', btnCls: 'bg-amber-600 hover:bg-amber-700 text-white' },
  stale:    { label: 'STALE',    emoji: '⚪', strip: 'bg-gray-400',  textCls: 'text-gray-500',  tintCls: '',            btnCls: 'bg-gray-600 hover:bg-gray-700 text-white'   },
  watching: { label: 'WATCHING', emoji: '🔵', strip: 'bg-blue-500',  textCls: 'text-blue-600',  tintCls: '',            btnCls: 'bg-blue-600 hover:bg-blue-700 text-white'   },
}

const BUCKET_ORDER = ['late', 'dueSoon', 'stale', 'watching']

function formatDateLine(item) {
  const { bucket, expectedDate, lastObservedDate, daysLate, daysUntil, daysSinceObserved } = item

  if (bucket === 'late') {
    if (daysLate != null) return `${daysLate} day${daysLate !== 1 ? 's' : ''} late`
    if (expectedDate) return `Expected ${fmtDate(expectedDate.toISOString().slice(0, 10))}`
    return 'Past due'
  }
  if (bucket === 'dueSoon') {
    if (daysUntil === 0) return 'Due today'
    if (daysUntil === 1) return 'Due tomorrow'
    if (daysUntil != null) return `Due in ${daysUntil} days`
    return 'Due soon'
  }
  if (bucket === 'stale') {
    if (daysSinceObserved != null) return `Last update ${daysSinceObserved} day${daysSinceObserved !== 1 ? 's' : ''} ago`
    return 'No recent updates'
  }
  if (bucket === 'watching') {
    if (lastObservedDate) {
      const raw = item.rawLastObsDate || lastObservedDate.toISOString().slice(0, 10)
      return `Watching since ${fmtDate(raw)}`
    }
    return 'Being watched'
  }
  return null
}

// ── UpdateModal (manual items only) ──────────────────────────────────────────

function UpdateModal({ item, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [lastObserved,     setLastObserved]     = useState(safeStr(item.lastObserved))
  const [lastObservedDate, setLastObservedDate] = useState(item.rawLastObsDate || today)
  const [expectedDate,     setExpectedDate]     = useState(item.rawExpectedDate || '')
  const [triageStatus,     setTriageStatus]     = useState(item.triageStatus || '')
  const [showCheckpoint,   setShowCheckpoint]   = useState(false)
  const [showStatus,       setShowStatus]       = useState(false)
  const [saving,           setSaving]           = useState(false)

  async function handleSave() {
    setSaving(true)
    const fields = {
      'Last Observed':      lastObserved,
      'Last Observed Date': lastObservedDate || null,
    }
    if (showCheckpoint) fields['Expected Next Checkpoint'] = expectedDate || null
    if (showStatus && triageStatus) fields['Triage Status'] = triageStatus

    const { error } = await updateRecord(item.sourceTable, item.sourceRecordId, fields, item.sourceBaseId)
    setSaving(false)
    if (error) { toast.error('Failed to save: ' + error); return }
    toast.success('Updated')
    onSaved()
    onClose()
  }

  async function handleMarkDone() {
    setSaving(true)
    const { error } = await updateRecord(item.sourceTable, item.sourceRecordId, { 'Triage Status': 'Done' }, item.sourceBaseId)
    setSaving(false)
    if (error) { toast.error('Failed to mark done: ' + error); return }
    toast.success('Marked done — removed from triage')
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full rounded-t-2xl sm:rounded-xl sm:max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{item.source}</p>
            <h2 className="text-base font-semibold text-gray-900 leading-tight">{safeRender(item.identifier)}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Last Observed</label>
            <textarea
              value={lastObserved}
              onChange={e => setLastObserved(e.target.value)}
              rows={3}
              placeholder="What's the current status?"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Last Observed Date</label>
            <input
              type="date"
              value={lastObservedDate}
              onChange={e => setLastObservedDate(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button type="button" onClick={() => setShowCheckpoint(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronDown size={13} className={`transition-transform ${showCheckpoint ? '' : '-rotate-90'}`} />
            Update checkpoint date
          </button>
          {showCheckpoint && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Expected Next Checkpoint</label>
              <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}

          <button type="button" onClick={() => setShowStatus(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronDown size={13} className={`transition-transform ${showStatus ? '' : '-rotate-90'}`} />
            Change triage status
          </button>
          {showStatus && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Triage Status</label>
              <select value={triageStatus} onChange={e => setTriageStatus(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {['Initiative', 'Rhythm', 'Watch', 'Done', 'Off-Triage'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button onClick={handleMarkDone} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60">
            Mark Done
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="ml-auto px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TriageCard ────────────────────────────────────────────────────────────────

function TriageCard({ item, onUpdate, onDismiss, onResolved }) {
  const navigate   = useNavigate()
  const cfg        = BUCKET_CONFIG[item.bucket]
  const dateLine   = formatDateLine(item)
  const handlerCls = HANDLER_COLORS[item.handler] || 'bg-gray-100 text-gray-600'
  const showConsequence = (item.bucket === 'late' || item.bucket === 'dueSoon') && item.consequence
  const [resolving, setResolving] = useState(false)

  const hasInlineResolve = item.resolveAction?.handler === 'completeTask' || item.resolveAction?.handler === 'manualDone'

  async function handleResolve() {
    if (item.resolveAction?.handler === 'navigateToSource') {
      navigate(item.detailRoute)
      return
    }
    setResolving(true)
    const { ok, error } = await resolveTriageItem(item)
    setResolving(false)
    if (!ok) { toast.error(error || 'Failed'); return }
    toast.success('Done')
    onResolved()
  }

  return (
    <div className="relative bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-3">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.strip}`} />

      {/* Dismiss X */}
      <button
        onClick={() => onDismiss(item.id)}
        className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 transition-colors p-0.5 z-10"
        title="Dismiss for 24 hours"
      >
        <X size={13} />
      </button>

      <div className="pl-4 pr-8 pt-3 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
          {item.source} · {safeRender(item.identifier)}
        </p>

        <p className="text-sm font-medium text-gray-900 leading-snug mb-2">
          {safeRender(item.whatShouldBeTrue) || '(no description)'}
        </p>

        {dateLine && (
          <p className={`text-xs font-medium mb-2 ${cfg.textCls}`}>{dateLine}</p>
        )}

        {showConsequence && (
          <div className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 mb-2 ${cfg.tintCls}`}>
            <AlertTriangle size={12} className={`flex-shrink-0 mt-0.5 ${cfg.textCls}`} />
            <p className={`text-xs ${cfg.textCls}`}>{safeRender(item.consequence)}</p>
          </div>
        )}

        {item.handler && (
          <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mb-2 ${handlerCls}`}>
            {item.handler}
          </span>
        )}

        {item.lastObserved && (
          <p className="text-xs text-gray-400 mb-2 line-clamp-2 leading-relaxed">{item.lastObserved}</p>
        )}

        <div className="flex gap-2 justify-end mt-1">
          {/* Open button always shown */}
          <button
            onClick={() => navigate(item.detailRoute)}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            Open
          </button>

          {/* Manual items: Update button */}
          {item.isManual && (
            <button
              onClick={() => onUpdate(item)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${cfg.btnCls}`}
            >
              Update
            </button>
          )}

          {/* Rule-based items with inline resolve: action button */}
          {!item.isManual && hasInlineResolve && (
            <button
              onClick={handleResolve}
              disabled={resolving}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-60 ${cfg.btnCls}`}
            >
              {resolving ? '…' : item.resolveAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3 mt-4">
      {[80, 112, 96].map(h => (
        <div key={h} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden animate-pulse" style={{ height: h }}>
          <div className="w-1 h-full bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ bucket, items, onUpdate, onDismiss, onResolved }) {
  const cfg = BUCKET_CONFIG[bucket]
  if (!items.length) return null
  return (
    <div className="mb-6">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
        {cfg.emoji} {cfg.label} ({items.length})
      </p>
      {items.map(item => (
        <TriageCard key={item.id} item={item} onUpdate={onUpdate} onDismiss={onDismiss} onResolved={onResolved} />
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Triage() {
  const navigate  = useNavigate()
  const { profile } = useAuth()
  const userId    = profile?.id

  const [items,        setItems]        = useState([])
  const [dismissed,    setDismissed]    = useState(new Set())
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [updateTarget, setUpdateTarget] = useState(null)
  const cacheRef = useRef({ data: null, ts: 0 })

  const loadData = useCallback(async (force = false) => {
    if (!force && cacheRef.current.data && Date.now() - cacheRef.current.ts < CACHE_TTL_MS) {
      setItems(cacheRef.current.data)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [allItems, activeDismissals] = await Promise.all([
        fetchAllTriageItems(new Date(), { userId }),
        getActiveDismissals(userId),
      ])
      setDismissed(activeDismissals)
      cacheRef.current = { data: allItems, ts: Date.now() }
      setItems(allItems)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { loadData() }, [loadData])

  async function handleDismiss(itemId) {
    setDismissed(prev => new Set([...prev, itemId]))
    await dismissItem(userId, itemId)
    toast('Dismissed for 24 hours', { icon: '⏱' })
  }

  function handleResolved() {
    cacheRef.current = { data: null, ts: 0 }
    loadData(true)
  }

  const visible = items.filter(item => !dismissed.has(item.id))
  const grouped = Object.fromEntries(BUCKET_ORDER.map(b => [b, visible.filter(r => r.bucket === b)]))
  const total   = visible.length
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 bg-slate-50 z-10 px-4 sm:px-6 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-none">Triage</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {dateLabel} · {total} item{total !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/triage/guide')}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
              title="User guide"
            >
              <BookOpen size={16} />
            </button>
            <button
              onClick={() => loadData(true)}
              disabled={loading}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 max-w-2xl mx-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-red-700 font-medium">Failed to load triage data</p>
            <p className="text-xs text-red-500 mt-0.5">{error}</p>
          </div>
        )}

        {loading ? (
          <Skeleton />
        ) : total === 0 ? (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">✅</p>
            <p className="text-base font-semibold text-gray-700">All systems nominal.</p>
            <p className="text-sm text-gray-400 mt-1">Nothing needs your attention right now.</p>
          </div>
        ) : (
          BUCKET_ORDER.map(bucket => (
            <Section
              key={bucket}
              bucket={bucket}
              items={grouped[bucket]}
              onUpdate={setUpdateTarget}
              onDismiss={handleDismiss}
              onResolved={handleResolved}
            />
          ))
        )}
      </div>

      {updateTarget && (
        <UpdateModal
          item={updateTarget}
          onClose={() => setUpdateTarget(null)}
          onSaved={() => {
            setUpdateTarget(null)
            cacheRef.current = { data: null, ts: 0 }
            loadData(true)
          }}
        />
      )}
    </div>
  )
}
