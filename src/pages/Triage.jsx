import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, AlertTriangle, ChevronDown, X, BookOpen, ExternalLink, Copy } from 'lucide-react'
import { updateRecord, fmtDate } from '../lib/airtable'
import {
  fetchAllTriageItems,
  invalidateTriageCache,
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

function formatCacheAge(fetchedAt) {
  if (!fetchedAt) return null
  const mins = Math.floor((Date.now() - fetchedAt) / 60000)
  if (mins < 1) return 'Just updated'
  if (mins < 60) return `Updated ${mins} min ago`
  return `Updated ${Math.floor(mins / 60)}h ago`
}

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

// ── TriageGuide modal ─────────────────────────────────────────────────────────

const TRIAGE_OPERATOR_URL = 'https://claude.ai/project/019dcb52-9f60-7214-9d58-01b37ebc8b24'

const GUIDE_EXAMPLE = {
  late: {
    strip: 'border-l-red-500',
    source: 'PROPERTY · 56 S HARRIS',
    what: 'Bi-weekly lender update sent to Brooke at ABC Capital',
    date: 'Expected Apr 12 · 14 days late',
    dateColor: 'text-red-600',
    showConseq: true,
    conseqBg: 'bg-red-50',
    conseqText: 'text-red-800',
    conseq: 'Lender confidence and future draw approvals at risk',
    handler: 'Thomas',
  },
  dueSoon: {
    strip: 'border-l-amber-500',
    source: 'PROPERTY · 73 BENWICK',
    what: 'VA flag repairs completed before inspection',
    date: 'Due in 2 days',
    dateColor: 'text-amber-600',
    showConseq: true,
    conseqBg: 'bg-amber-50',
    conseqText: 'text-amber-800',
    conseq: 'VA loan falls through if items not cleared',
    handler: 'Subcontractor',
  },
  stale: {
    strip: 'border-l-gray-400',
    source: 'MAINTENANCE · 243 W MAIN',
    what: 'Bathroom floor repair scheduled',
    date: 'No update in 11 days',
    dateColor: 'text-gray-500',
    showConseq: false,
    handler: 'Thomas',
  },
  watching: {
    strip: 'border-l-blue-500',
    source: 'FLOCK · SPRING 2026 BATCH',
    what: 'Tractor #2 built before chicks reach week 3',
    date: 'Watching since Apr 22',
    dateColor: 'text-blue-600',
    showConseq: false,
    handler: 'Thomas',
  },
}

const GUIDE_BUCKETS = [
  { key: 'late',     label: 'LATE',     activeRing: 'ring-2 ring-red-400',   activeBorder: 'border-red-300',   strip: 'bg-red-500',   subtitle: 'Past deadline. Act today.' },
  { key: 'dueSoon',  label: 'DUE SOON', activeRing: 'ring-2 ring-amber-400', activeBorder: 'border-amber-300', strip: 'bg-amber-500', subtitle: 'Within 3 days. Plan now.' },
  { key: 'stale',    label: 'STALE',    activeRing: 'ring-2 ring-gray-400',  activeBorder: 'border-gray-300',  strip: 'bg-gray-400',  subtitle: 'Quiet too long. Check in.' },
  { key: 'watching', label: 'WATCHING', activeRing: 'ring-2 ring-blue-400',  activeBorder: 'border-blue-300',  strip: 'bg-blue-500',  subtitle: 'Eyes on. No action yet.' },
]

const GUIDE_RULES = [
  { icon: '$',  bg: 'bg-red-100',    fg: 'text-red-700',    title: 'Rent overdue',           sub: 'Invoice past due, not paid' },
  { icon: '📜', bg: 'bg-amber-100',  fg: 'text-amber-700',  title: 'Lease ending soon',      sub: 'End date within 60 days, no renewal' },
  { icon: '🔧', bg: 'bg-gray-100',   fg: 'text-gray-700',   title: 'Maintenance gone quiet', sub: 'Open request untouched 7+ days' },
  { icon: '📋', bg: 'bg-purple-100', fg: 'text-purple-700', title: 'LLC report approaching', sub: 'Annual filing due within 60 days' },
  { icon: '🐥', bg: 'bg-green-100',  fg: 'text-green-700',  title: 'Flock candling day',     sub: 'Day 7, 14, or 17 from hatch' },
  { icon: '⏱', bg: 'bg-orange-100', fg: 'text-orange-700', title: 'Flock processing due',   sub: 'Past target weeks, still growing' },
  { icon: '📄', bg: 'bg-pink-100',   fg: 'text-pink-700',   title: 'Document needs action',  sub: "Tagged 'Action Required', stale 3+ days" },
  { icon: '✓',  bg: 'bg-blue-100',   fg: 'text-blue-700',   title: 'Task overdue',           sub: 'Past due, not marked done' },
  { icon: '!',  bg: 'bg-red-100',    fg: 'text-red-700',    title: 'Active alert >24h',      sub: 'Alert open more than a day' },
  { icon: '★',  bg: 'bg-amber-100',  fg: 'text-amber-700',  title: 'Manual flag',            sub: 'One-off item you added via Setup' },
]

const GUIDE_PROMPTS = [
  'Triage check-in',
  'Sent the lender email to Brooke',
  'Mark 73 Benwick repairs as done',
  'Walk the watches',
]

function TriageGuide({ onClose }) {
  const [selectedBucket, setSelectedBucket] = useState('late')

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const ex = GUIDE_EXAMPLE[selectedBucket]
  const handlerCls = HANDLER_COLORS[ex.handler] || 'bg-gray-100 text-gray-600'

  function copyPrompt(text) {
    navigator.clipboard.writeText(text)
      .then(() => toast.success('Copied — paste into the Operator'))
      .catch(() => toast.error('Copy failed'))
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full rounded-t-2xl sm:rounded-xl sm:max-w-lg shadow-xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Triage Station</h2>
            <p className="text-xs text-gray-400">How it works</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1"><X size={18} /></button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6 pb-8">

          {/* Big idea */}
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600 leading-relaxed">
            Triage doesn't store its own data. It watches your existing modules — Tasks, Maintenance, Leases, Documents, Flock, LLCs, Alerts — and surfaces only what needs you. Fix the underlying thing, the card disappears. No double entry.
          </div>

          {/* Bucket selector */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Buckets</p>
            <div className="grid grid-cols-2 gap-2">
              {GUIDE_BUCKETS.map(btn => (
                <button
                  key={btn.key}
                  onClick={() => setSelectedBucket(btn.key)}
                  className={`flex items-center gap-2.5 px-3 py-3 rounded-lg border text-left transition-all min-h-[56px] ${
                    selectedBucket === btn.key
                      ? `${btn.activeRing} ${btn.activeBorder} bg-white`
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${btn.strip}`} />
                  <div>
                    <p className="text-xs font-bold text-gray-800">{btn.label}</p>
                    <p className="text-[10px] text-gray-500 leading-snug">{btn.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Example card */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Example card</p>
            <div
              aria-live="polite"
              className={`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden border-l-4 ${ex.strip}`}
            >
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{ex.source}</p>
                <p className="text-sm font-medium text-gray-900 leading-snug mb-2">{ex.what}</p>
                <p className={`text-xs font-medium mb-2 ${ex.dateColor}`}>{ex.date}</p>
                {ex.showConseq && (
                  <div className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 mb-2 ${ex.conseqBg}`}>
                    <AlertTriangle size={12} className={`flex-shrink-0 mt-0.5 ${ex.dateColor}`} />
                    <p className={`text-xs ${ex.conseqText}`}>{ex.conseq}</p>
                  </div>
                )}
                <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mb-2 ${handlerCls}`}>
                  {ex.handler}
                </span>
                <div className="flex gap-2 justify-end">
                  <span className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-400 select-none">Open</span>
                  <span className="text-xs px-3 py-1.5 rounded-lg text-white bg-gray-400 select-none">Resolve</span>
                </div>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">The buttons</p>
            <div className="space-y-2.5">
              {[
                { label: 'Resolve',              desc: 'Closes out the item. For tasks, marks them done inline.' },
                { label: 'Open',                 desc: 'Jumps to the source record in its module.' },
                { label: '× Dismiss',            desc: 'Hides the card for 24 hours. Comes back tomorrow.' },
                { label: 'Update (manual only)', desc: 'Log a status note, adjust the checkpoint, or mark it done.' },
              ].map(({ label, desc }) => (
                <div key={label} className="flex gap-3 items-start">
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-medium whitespace-nowrap flex-shrink-0 leading-5">{label}</span>
                  <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Rules */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">What gets surfaced automatically</p>
            <div className="space-y-2">
              {GUIDE_RULES.map((rule, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-bold ${rule.bg} ${rule.fg}`}>
                    {rule.icon}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{rule.title}</p>
                    <p className="text-[10px] text-gray-400 leading-snug">{rule.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily flow */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Daily flow</p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-3">
              {[
                { n: '1', time: 'Morning · 60 sec',          desc: 'Open Triage. Read the reds. Decide: handle, route, or wait.' },
                { n: '2', time: 'Throughout the day · 15 sec', desc: 'Tap Resolve on the card, or tell the Operator AI.' },
                { n: '3', time: 'Sunday night · 20 min',     desc: 'In the Operator AI, say "walk the watches."' },
              ].map(({ n, time, desc }) => (
                <div key={n} className="flex gap-3">
                  <span className="text-xs font-bold text-gray-400 w-4 flex-shrink-0 mt-0.5">{n}</span>
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{time}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Operator AI */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Triage Operator AI</p>
            <a
              href={TRIAGE_OPERATOR_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors mb-3"
            >
              <ExternalLink size={15} />
              Open Triage Operator
            </a>
            <p className="text-[10px] text-gray-400 mb-2">Tap to copy a prompt, then paste into the Operator:</p>
            <div className="grid grid-cols-2 gap-2">
              {GUIDE_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => copyPrompt(prompt)}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-100 text-left transition-colors"
                >
                  <Copy size={11} className="flex-shrink-0 text-gray-400" />
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Manual flags callout */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 leading-relaxed">
            <span className="font-semibold">Almost never use manual flags.</span>{' '}
            They're for watching a person, a custom project, or a one-off follow-up that doesn't fit a module.
            If it fits Tasks, Maintenance, or Documents — put it there. The rules catch it automatically.
          </div>

          {/* Footer */}
          <p className="text-xs text-gray-400 text-center pb-2">
            Triage Station · Shep Portal · Questions? Ask the Operator AI.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Triage() {
  const { profile } = useAuth()
  const userId    = profile?.id

  const [items,        setItems]        = useState(null)   // null = first load
  const [fetchedAt,    setFetchedAt]    = useState(null)
  const [dismissed,    setDismissed]    = useState(new Set())
  const [refreshing,   setRefreshing]   = useState(false)
  const [error,        setError]        = useState(null)
  const [updateTarget, setUpdateTarget] = useState(null)
  const [showGuide,    setShowGuide]    = useState(false)

  const loadData = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    setError(null)
    try {
      const [{ items: allItems, fetchedAt: ts }, activeDismissals] = await Promise.all([
        fetchAllTriageItems(new Date(), { userId, forceRefresh: force }),
        getActiveDismissals(userId),
      ])
      setDismissed(activeDismissals)
      setItems(allItems)
      setFetchedAt(ts)
    } catch (e) {
      setError(e.message)
    } finally {
      setRefreshing(false)
    }
  }, [userId])

  useEffect(() => { loadData() }, [loadData])

  async function handleDismiss(itemId) {
    setDismissed(prev => new Set([...prev, itemId]))
    await dismissItem(userId, itemId)
    toast('Dismissed for 24 hours', { icon: '⏱' })
    invalidateTriageCache()
  }

  function handleResolved() {
    invalidateTriageCache()
    loadData(true)
  }

  const visible   = (items || []).filter(item => !dismissed.has(item.id))
  const grouped   = Object.fromEntries(BUCKET_ORDER.map(b => [b, visible.filter(r => r.bucket === b)]))
  const total     = visible.length
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const cacheAge  = formatCacheAge(fetchedAt)

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
            {cacheAge && (
              <span className="text-xs text-gray-400 mr-1 hidden sm:inline">{cacheAge}</span>
            )}
            <button
              onClick={() => setShowGuide(true)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
              title="User guide"
            >
              <BookOpen size={16} />
            </button>
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
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

        {items === null ? (
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
            invalidateTriageCache()
            loadData(true)
          }}
        />
      )}
      {showGuide && <TriageGuide onClose={() => setShowGuide(false)} />}
    </div>
  )
}
