import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, AlertTriangle, ChevronDown, X, BookOpen } from 'lucide-react'
import { fetchAllRecords, updateRecord, PM_BASE_ID, CHICKENS_BASE_ID } from '../lib/airtable'
import { fmtDate } from '../lib/airtable'
import toast from 'react-hot-toast'

const safeStr    = (v, fb = '') => (v == null ? fb : String(v))
const safeNum    = v => (v == null ? 0 : Number(v) || 0)
const safeRender = (v, fb = '—') => {
  if (v == null) return fb
  if (Array.isArray(v)) return v.join(', ') || fb
  if (typeof v === 'object') return fb
  return String(v) || fb
}

const LLC_BASE_ID   = import.meta.env.VITE_AIRTABLE_BASE_ID
const TRIAGE_FILTER = "OR({Triage Status}='Initiative',{Triage Status}='Rhythm',{Triage Status}='Watch')"
const CACHE_TTL_MS  = 60_000

const SOURCES = [
  { key: 'Property',    table: 'Property',            baseId: PM_BASE_ID,       route: id => `/properties/${id}` },
  { key: 'Lease',       table: 'Lease Agreements',     baseId: PM_BASE_ID,       route: () => '/properties'       },
  { key: 'Maintenance', table: 'Maintenance Requests', baseId: PM_BASE_ID,       route: () => '/properties'       },
  { key: 'Flock',       table: 'Flock',                baseId: CHICKENS_BASE_ID, route: id => `/chickens/${id}`   },
  { key: 'LLC',         table: 'LLCs',                 baseId: LLC_BASE_ID,      route: id => `/llcs/${id}`       },
]

const HANDLER_COLORS = {
  Thomas:        'bg-slate-100 text-slate-700',
  Janine:        'bg-purple-100 text-purple-700',
  Gabrielle:     'bg-pink-100 text-pink-700',
  Anthony:       'bg-emerald-100 text-emerald-700',
  Subcontractor: 'bg-orange-100 text-orange-700',
  Decide:        'bg-yellow-100 text-yellow-700',
}

const BUCKET_CONFIG = {
  late:     { label: 'LATE',     emoji: '🔴', strip: 'bg-red-500',   textCls: 'text-red-600',   tintCls: 'bg-red-50',   btnCls: 'bg-red-600 hover:bg-red-700 text-white'    },
  dueSoon:  { label: 'DUE SOON', emoji: '🟡', strip: 'bg-amber-500', textCls: 'text-amber-600', tintCls: 'bg-amber-50', btnCls: 'bg-amber-600 hover:bg-amber-700 text-white'  },
  stale:    { label: 'STALE',    emoji: '⚪', strip: 'bg-gray-400',  textCls: 'text-gray-500',  tintCls: '',            btnCls: 'bg-gray-600 hover:bg-gray-700 text-white'    },
  watching: { label: 'WATCHING', emoji: '🔵', strip: 'bg-blue-500',  textCls: 'text-blue-600',  tintCls: '',            btnCls: 'bg-blue-600 hover:bg-blue-700 text-white'    },
}

const BUCKET_ORDER = ['late', 'dueSoon', 'stale', 'watching']

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSourceLabel(sourceKey, fields) {
  const f = fields || {}
  switch (sourceKey) {
    case 'Property':    return safeStr(f['Property Name'] || f['Address'] || f['Name'])
    case 'Lease':       return safeStr(f['Name'] || f['Lease ID'])
    case 'Maintenance': return safeStr(f['Summary'] || f['Description'] || f['Issue'] || f['Name'])
    case 'Flock':       return safeStr(f['Name'])
    case 'LLC':         return safeStr(f['LLC Name'] || f['Name'])
    default:            return ''
  }
}

function normalizeRecord(sourceKey, record) {
  const src = SOURCES.find(s => s.key === sourceKey)
  const f   = record.fields || {}
  return {
    id:               record.id,
    source:           sourceKey,
    table:            src.table,
    baseId:           src.baseId,
    sourceLabel:      getSourceLabel(sourceKey, f) || record.id,
    triageStatus:     safeStr(f['Triage Status']),
    expectedDate:     f['Expected Next Checkpoint'] ? new Date(f['Expected Next Checkpoint'] + 'T00:00:00') : null,
    whatShouldBeTrue: safeStr(f['What Should Be True']),
    lastObserved:     safeStr(f['Last Observed']),
    lastObservedDate: f['Last Observed Date'] ? new Date(f['Last Observed Date'] + 'T00:00:00') : null,
    stalenessDays:    safeNum(f['Staleness Days']),
    handler:          safeStr(f['Default Handler']),
    consequence:      safeStr(f['Consequence']),
    detailRoute:      src.route(record.id),
    rawExpectedDate:  safeStr(f['Expected Next Checkpoint']),
    rawLastObsDate:   safeStr(f['Last Observed Date']),
  }
}

function computeBucket(rec) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const { expectedDate, lastObservedDate, stalenessDays, triageStatus } = rec

  if (expectedDate) {
    const threshold = new Date(expectedDate)
    threshold.setDate(threshold.getDate() + stalenessDays)
    if (today > threshold) return 'late'
  }

  if (expectedDate) {
    const daysUntil = Math.floor((expectedDate - today) / 86400000)
    if (daysUntil >= 0 && daysUntil <= 3) return 'dueSoon'
  }

  if (lastObservedDate) {
    const daysSince = Math.floor((today - lastObservedDate) / 86400000)
    if (daysSince > 7) return 'stale'
  }

  if (triageStatus === 'Watch') return 'watching'
  return 'green'
}

function formatDateLine(rec, bucket) {
  const today = new Date(); today.setHours(0, 0, 0, 0)

  if (bucket === 'late' && rec.expectedDate) {
    const threshold = new Date(rec.expectedDate)
    threshold.setDate(threshold.getDate() + rec.stalenessDays)
    const daysLate = Math.max(1, Math.floor((today - threshold) / 86400000))
    return `${daysLate} day${daysLate !== 1 ? 's' : ''} late`
  }

  if (bucket === 'dueSoon' && rec.expectedDate) {
    const d = Math.floor((rec.expectedDate - today) / 86400000)
    if (d === 0) return 'Due today'
    if (d === 1) return 'Due tomorrow'
    return `Due in ${d} days`
  }

  if (bucket === 'stale' && rec.lastObservedDate) {
    const d = Math.floor((today - rec.lastObservedDate) / 86400000)
    return `Last update ${d} day${d !== 1 ? 's' : ''} ago`
  }

  if (bucket === 'watching') {
    if (rec.lastObservedDate) return `Watching since ${fmtDate(rec.rawLastObsDate)}`
    return 'Being watched'
  }

  return null
}

// ── UpdateModal ───────────────────────────────────────────────────────────────

function UpdateModal({ record, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [lastObserved,     setLastObserved]     = useState(record.lastObserved)
  const [lastObservedDate, setLastObservedDate] = useState(record.rawLastObsDate || today)
  const [expectedDate,     setExpectedDate]     = useState(record.rawExpectedDate)
  const [triageStatus,     setTriageStatus]     = useState(record.triageStatus)
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

    const { error } = await updateRecord(record.table, record.id, fields, record.baseId)
    setSaving(false)
    if (error) { toast.error('Failed to save: ' + error); return }
    toast.success('Updated')
    onSaved()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full rounded-t-2xl sm:rounded-xl sm:max-w-lg shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{record.source}</p>
            <h2 className="text-base font-semibold text-gray-900 leading-tight">{record.sourceLabel}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Last Observed
            </label>
            <textarea
              value={lastObserved}
              onChange={e => setLastObserved(e.target.value)}
              rows={3}
              placeholder="What's the current status?"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Last Observed Date
            </label>
            <input
              type="date"
              value={lastObservedDate}
              onChange={e => setLastObservedDate(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowCheckpoint(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ChevronDown size={13} className={`transition-transform ${showCheckpoint ? '' : '-rotate-90'}`} />
            Update checkpoint date
          </button>
          {showCheckpoint && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Expected Next Checkpoint
              </label>
              <input
                type="date"
                value={expectedDate}
                onChange={e => setExpectedDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowStatus(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ChevronDown size={13} className={`transition-transform ${showStatus ? '' : '-rotate-90'}`} />
            Change triage status
          </button>
          {showStatus && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Triage Status
              </label>
              <select
                value={triageStatus}
                onChange={e => setTriageStatus(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Initiative">Initiative</option>
                <option value="Rhythm">Rhythm</option>
                <option value="Watch">Watch</option>
                <option value="Done">Done</option>
                <option value="Off-Triage">Off-Triage</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 pb-6 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TriageCard ────────────────────────────────────────────────────────────────

function TriageCard({ record, bucket, onUpdate }) {
  const navigate = useNavigate()
  const cfg      = BUCKET_CONFIG[bucket]
  const dateLine = formatDateLine(record, bucket)
  const handlerCls = HANDLER_COLORS[record.handler] || 'bg-gray-100 text-gray-600'
  const showConsequence = (bucket === 'late' || bucket === 'dueSoon') && record.consequence

  return (
    <div className="relative bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-3">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.strip}`} />

      <div className="pl-4 pr-3 pt-3 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
          {record.source} · {safeRender(record.sourceLabel)}
        </p>

        <p className="text-sm font-medium text-gray-900 leading-snug mb-2">
          {safeRender(record.whatShouldBeTrue) || '(no description)'}
        </p>

        {dateLine && (
          <p className={`text-xs font-medium mb-2 ${cfg.textCls}`}>{dateLine}</p>
        )}

        {showConsequence && (
          <div className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 mb-2 ${cfg.tintCls}`}>
            <AlertTriangle size={12} className={`flex-shrink-0 mt-0.5 ${cfg.textCls}`} />
            <p className={`text-xs ${cfg.textCls}`}>{safeRender(record.consequence)}</p>
          </div>
        )}

        {record.handler && (
          <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mb-2 ${handlerCls}`}>
            {record.handler}
          </span>
        )}

        {record.lastObserved && (
          <p className="text-xs text-gray-400 mb-2 line-clamp-2 leading-relaxed">
            {record.lastObserved}
          </p>
        )}

        <div className="flex gap-2 justify-end mt-1">
          <button
            onClick={() => navigate(record.detailRoute)}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            Open
          </button>
          <button
            onClick={() => onUpdate(record)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${cfg.btnCls}`}
          >
            Update
          </button>
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
        <div
          key={h}
          className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden animate-pulse"
          style={{ height: h }}
        >
          <div className="w-1 h-full bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Triage() {
  const navigate = useNavigate()
  const [items,        setItems]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [updateTarget, setUpdateTarget] = useState(null)
  const cacheRef = useRef({ data: null, ts: 0 })

  async function loadData(force = false) {
    if (!force && cacheRef.current.data && Date.now() - cacheRef.current.ts < CACHE_TTL_MS) {
      setItems(cacheRef.current.data)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const results = await Promise.all(
        SOURCES.map(src =>
          fetchAllRecords(src.table, { filterByFormula: TRIAGE_FILTER }, src.baseId)
        )
      )
      const all = []
      results.forEach((res, i) => {
        if (res.error) {
          console.warn('[Triage] fetch error', SOURCES[i].key, res.error)
          return
        }
        ;(res.data || []).forEach(rec => all.push(normalizeRecord(SOURCES[i].key, rec)))
      })
      const visible = all
        .map(r => ({ ...r, bucket: computeBucket(r) }))
        .filter(r => r.bucket !== 'green')
      cacheRef.current = { data: visible, ts: Date.now() }
      setItems(visible)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const grouped   = Object.fromEntries(BUCKET_ORDER.map(b => [b, items.filter(r => r.bucket === b)]))
  const total     = items.length

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
            <button onClick={() => loadData(true)} className="mt-2 text-xs font-bold text-red-700 underline">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <Skeleton />
        ) : total === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-base font-semibold text-gray-700">All systems nominal.</p>
            <p className="text-sm text-gray-400 mt-1">Nothing needs your attention right now.</p>
          </div>
        ) : (
          BUCKET_ORDER.map(bucket => {
            const recs = grouped[bucket]
            if (!recs.length) return null
            const cfg = BUCKET_CONFIG[bucket]
            return (
              <div key={bucket} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base leading-none">{cfg.emoji}</span>
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{cfg.label}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {recs.length}
                  </span>
                </div>
                {recs.map(rec => (
                  <TriageCard key={rec.id} record={rec} bucket={bucket} onUpdate={setUpdateTarget} />
                ))}
              </div>
            )
          })
        )}
      </div>

      {updateTarget && (
        <UpdateModal
          record={updateTarget}
          onClose={() => setUpdateTarget(null)}
          onSaved={() => loadData(true)}
        />
      )}
    </div>
  )
}
