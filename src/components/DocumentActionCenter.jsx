import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronDown, ChevronRight, FileText, ExternalLink, Check, RefreshCw } from 'lucide-react'
import { fetchAllRecords, updateRecord, DOCS_BASE_ID } from '../lib/airtable'
import toast from 'react-hot-toast'

const DOCS_TABLE = 'Documents'

const GROUPS = [
  { id: 'urgent',  label: '🔴 Urgent — Pay Now',    dotClass: 'bg-red-500',    keywords: ['past due', 'collection', 'disconnect', 'overdrawn', 'final notice', 'immediately'] },
  { id: 'bills',   label: '🟠 Bills & Utilities',    dotClass: 'bg-orange-400', keywords: ['pay', 'bill', 'utility', 'invoice', 'premium'] },
  { id: 'deposit', label: '💰 Deposit / Cash',        dotClass: 'bg-yellow-400', keywords: ['deposit', 'cash', 'check'] },
  { id: 'taxes',   label: '📄 File for Taxes',        dotClass: 'bg-blue-400',   keywords: ['tax', '1098', '1099', 'file with'] },
  { id: 'followup',label: '📋 Follow-Up / Confirm',   dotClass: 'bg-purple-400', keywords: ['confirm', 'verify', 'follow up', 'call', 'contact', 'respond', 'dispute', 'submit'] },
  { id: 'other',   label: '🗂 Everything Else',       dotClass: 'bg-gray-400',   keywords: [] },
]

function classifyDoc(actionText) {
  const lower = (actionText || '').toLowerCase()
  for (const g of GROUPS) {
    if (g.keywords.some(kw => lower.includes(kw))) return g.id
  }
  return 'other'
}

function safeStr(val, fallback = '') {
  if (val == null) return fallback
  if (typeof val === 'object') {
    if (Array.isArray(val)) return val.map(v => (typeof v === 'object' ? v.name || '' : String(v))).filter(Boolean).join(', ') || fallback
    if (val.name) return val.name
    return fallback
  }
  return String(val)
}

function fmtDate(str) {
  if (!str) return ''
  const d = new Date(str.includes('T') ? str : str + 'T12:00:00')
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseActionDoc(record) {
  const f = record.fields || {}
  const attachments = Array.isArray(f['Attachments']) ? f['Attachments'] : []
  const actionRequired = safeStr(f['Action Required'])
  return {
    id: record.id,
    name: safeStr(f['Name']) || 'Untitled',
    date: safeStr(f['Date']),
    docType: safeStr(f['Document Type']),
    sender: safeStr(f['Sender']),
    description: safeStr(f['Description']),
    tags: safeStr(f['Tags']).split(',').map(t => t.trim()).filter(Boolean),
    actionRequired,
    actionDone: f['Action Done'] === true,
    attachments,
    groupId: classifyDoc(actionRequired),
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DocumentActionCenter() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const [showCompleted, setShowCompleted] = useState(false)
  const [sessionDone, setSessionDone] = useState(0)

  const selectedRef = useRef(null)
  const markDoneRef = useRef(null)

  useEffect(() => { load() }, [])

  // Keyboard shortcut: D = mark done
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key !== 'd' && e.key !== 'D') return
      const sel = selectedRef.current
      if (sel && !sel.actionDone) markDoneRef.current?.(sel.id)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function load() {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await fetchAllRecords(DOCS_TABLE, {
      filterByFormula: `{Action Required} != ''`,
    }, DOCS_BASE_ID)
    if (error) {
      setFetchError(error)
      setLoading(false)
      return
    }
    const parsed = (data || []).map(parseActionDoc)
    setDocs(parsed)
    const first = parsed.find(d => !d.actionDone)
    if (first) setSelectedId(first.id)
    setLoading(false)
  }

  const pending   = useMemo(() => docs.filter(d => !d.actionDone), [docs])
  const completed = useMemo(() => docs.filter(d =>  d.actionDone), [docs])

  const groupedPending = useMemo(() => {
    const map = {}
    GROUPS.forEach(g => { map[g.id] = [] })
    pending.forEach(d => { if (map[d.groupId]) map[d.groupId].push(d) })
    return map
  }, [pending])

  const selected = useMemo(() => docs.find(d => d.id === selectedId) || null, [docs, selectedId])

  // Keep refs current on every render so the stable keyboard handler sees latest values
  selectedRef.current = selected

  function advanceSelection(doneId) {
    const remaining = pending.filter(d => d.id !== doneId)
    if (!remaining.length) { setSelectedId(null); return }
    const doneDoc = docs.find(d => d.id === doneId)
    const sameGroup = remaining.filter(d => d.groupId === doneDoc?.groupId)
    setSelectedId(sameGroup.length ? sameGroup[0].id : remaining[0].id)
  }

  async function markDone(docId) {
    // Optimistic update
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, actionDone: true } : d))
    advanceSelection(docId)
    setSessionDone(n => n + 1)
    toast.success('Done!')

    const { error } = await updateRecord(DOCS_TABLE, docId, { 'Action Done': true }, DOCS_BASE_ID)
    if (error) {
      // Rollback
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, actionDone: false } : d))
      setSessionDone(n => Math.max(0, n - 1))
      toast.error('Failed: ' + error)
    }
  }

  markDoneRef.current = markDone

  function toggleGroup(groupId) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  // ── Loading / error / empty states ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-500">
        <p className="text-sm">Failed to load: {fetchError}</p>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <p className="text-4xl">🎉</p>
        <p className="text-xl font-semibold text-gray-800">All caught up!</p>
        <p className="text-sm text-gray-500">
          {sessionDone > 0 ? `${sessionDone} completed this session` : 'No pending action items.'}
        </p>
      </div>
    )
  }

  const progressPct = docs.length === 0 ? 0 : Math.round((completed.length / docs.length) * 100)

  // ── Split panel ──────────────────────────────────────────────────────────────

  return (
    <div
      className="flex border border-gray-200 rounded-xl overflow-hidden bg-white"
      style={{ height: 'calc(100vh - 200px)', minHeight: '480px' }}
    >
      {/* Left panel — grouped triage list */}
      <div className="w-[340px] flex-shrink-0 border-r border-gray-200 flex flex-col">
        {/* Panel header */}
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Action Center</h2>
            <span className="text-xs bg-red-100 text-red-700 font-medium px-2 py-0.5 rounded-full">
              {pending.length} remaining
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{completed.length} of {docs.length} done</p>
        </div>

        {/* Scrollable group list */}
        <div className="flex-1 overflow-y-auto">
          {GROUPS.map(group => {
            const items = groupedPending[group.id] || []
            if (!items.length) return null
            const collapsed = collapsedGroups.has(group.id)
            return (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 text-left"
                >
                  <span className="text-xs font-semibold text-gray-600">{group.label} ({items.length})</span>
                  {collapsed
                    ? <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />
                    : <ChevronDown  size={13} className="text-gray-400 flex-shrink-0" />
                  }
                </button>
                {!collapsed && items.map(doc => (
                  <DocListItem
                    key={doc.id}
                    doc={doc}
                    group={group}
                    isSelected={doc.id === selectedId}
                    onClick={() => setSelectedId(doc.id)}
                  />
                ))}
              </div>
            )
          })}

          {/* Completed items */}
          {completed.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 mt-2">
              <button
                onClick={() => setShowCompleted(v => !v)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                {showCompleted ? 'Hide' : 'Show'} completed ({completed.length})
              </button>
              {showCompleted && completed.map(doc => {
                const group = GROUPS.find(g => g.id === doc.groupId) || GROUPS[5]
                return (
                  <DocListItem
                    key={doc.id}
                    doc={doc}
                    group={group}
                    isSelected={doc.id === selectedId}
                    onClick={() => setSelectedId(doc.id)}
                    done
                  />
                )
              })}
            </div>
          )}
        </div>

        {sessionDone > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 flex-shrink-0">
            {sessionDone} completed this session
          </div>
        )}
      </div>

      {/* Right panel — detail view */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <FileText size={40} className="opacity-30" />
            <p className="text-sm">← Select an item to review</p>
          </div>
        ) : (
          <DetailPanel doc={selected} onMarkDone={markDone} />
        )}
      </div>
    </div>
  )
}

// ── DocListItem ───────────────────────────────────────────────────────────────

function DocListItem({ doc, group, isSelected, onClick, done = false }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2.5 flex items-start gap-2.5 transition-colors border-l-2 ${
        isSelected ? 'bg-blue-50 border-blue-500' : 'border-transparent hover:bg-gray-50'
      }`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${group?.dotClass || 'bg-gray-400'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-medium text-gray-800 truncate ${done ? 'line-through opacity-50' : ''}`}>
          {doc.name.length > 35 ? doc.name.slice(0, 35) + '…' : doc.name}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {doc.actionRequired.length > 50 ? doc.actionRequired.slice(0, 50) + '…' : doc.actionRequired}
        </p>
      </div>
      {doc.date && (
        <span className="text-[11px] text-gray-400 flex-shrink-0 mt-0.5">{fmtDate(doc.date)}</span>
      )}
    </button>
  )
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

function DetailPanel({ doc, onMarkDone }) {
  const [descExpanded, setDescExpanded] = useState(false)
  const attachment = doc.attachments[0] || null
  const isPdf  = attachment?.type === 'application/pdf' || attachment?.filename?.toLowerCase().endsWith('.pdf')
  const isImage = attachment?.type?.startsWith('image/')

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{doc.name}</h2>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {doc.docType && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{doc.docType}</span>
          )}
          {doc.date && (
            <span className="text-xs text-gray-400">{fmtDate(doc.date)}</span>
          )}
        </div>
      </div>

      {/* Action box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Action Required</p>
        <p className="text-sm font-medium text-gray-800 leading-relaxed whitespace-pre-wrap">{doc.actionRequired}</p>
        {doc.actionDone ? (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
            <Check size={15} /> Done
          </div>
        ) : (
          <button
            onClick={() => onMarkDone(doc.id)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg text-sm transition-colors"
          >
            <Check size={15} />
            Mark as Done
            <span className="opacity-60 font-normal">(D)</span>
          </button>
        )}
      </div>

      {/* Document details */}
      <div className="space-y-4">
        {doc.sender && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Sender</p>
            <p className="text-sm text-gray-700">{doc.sender}</p>
          </div>
        )}
        {doc.description && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</p>
            <p className={`text-sm text-gray-700 leading-relaxed whitespace-pre-wrap ${!descExpanded ? 'line-clamp-4' : ''}`}>
              {doc.description}
            </p>
            {doc.description.length > 250 && (
              <button onClick={() => setDescExpanded(v => !v)} className="text-xs text-blue-600 hover:underline mt-1">
                {descExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {doc.tags.map(t => (
              <span key={t} className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Attachment preview */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Attachment</p>
        {attachment ? (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            {isImage && (
              <img
                src={attachment.url}
                alt={attachment.filename || 'attachment'}
                className="w-full max-h-96 object-contain bg-gray-50"
              />
            )}
            {isPdf && (
              <div className="bg-gray-50 p-4 space-y-3">
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                >
                  <ExternalLink size={13} /> Open in new tab →
                </a>
                <iframe
                  src={attachment.url}
                  className="w-full rounded border border-gray-200"
                  style={{ height: 400 }}
                  title={attachment.filename || 'PDF'}
                />
              </div>
            )}
            {!isImage && !isPdf && (
              <div className="bg-gray-50 p-4">
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                >
                  <ExternalLink size={13} /> {attachment.filename || 'Open file'}
                </a>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No attachment on file</p>
        )}
      </div>
    </div>
  )
}
