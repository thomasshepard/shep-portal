import { useEffect, useMemo, useState } from 'react'
import { Search, X, PhoneCall, AlertTriangle, ChevronDown, ChevronUp, Copy, Clock, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchAllRecords, DOCS_BASE_ID } from '../lib/airtable'
import LoadingSpinner from '../components/LoadingSpinner'

// Call Recordings table lives in the Desk Paper Cleanup (Docs) base.
// Rows are written by the local "Call Transcriber" watcher (Whisper + Ollama) —
// this page is read-only.
const TABLE = 'Call Recordings'
const PAGE_SIZE = 25

const arr = v => (Array.isArray(v) ? v : [])
const safeStr = (v, fb = '') => (v == null || typeof v === 'object' ? fb : String(v))
const safeNum = v => (typeof v === 'number' && isFinite(v) ? v : null)

function toCall(rec) {
  const f = rec.fields || {}
  return {
    id: rec.id,
    title: safeStr(f['Title'], 'Untitled call'),
    recordedAt: safeStr(f['Recorded At']),
    minutes: safeNum(f['Duration (min)']),
    summary: safeStr(f['Summary']),
    keyPoints: safeStr(f['Key Points']),
    actionItems: safeStr(f['Action Items']),
    people: safeStr(f['People & Entities']),
    transcript: safeStr(f['Transcript']),
    truncated: !!f['Transcript Truncated'],
    status: safeStr(f['Status']),
    notes: safeStr(f['Notes']),
    sourceFile: safeStr(f['Source File']),
    models: safeStr(f['Models']),
  }
}

function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function fmtDuration(min) {
  if (min == null) return ''
  if (min < 1) return '<1 min'
  if (min >= 60) return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`
  return `${Math.round(min)} min`
}

function copy(text, label) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error('Copy failed'),
  )
}

function Bullets({ text }) {
  const lines = text.split('\n').map(l => l.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean)
  if (!lines.length) return null
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
      {lines.map((l, i) => <li key={i}>{l}</li>)}
    </ul>
  )
}

function CallCard({ call, open, onToggle }) {
  const [showTranscript, setShowTranscript] = useState(false)

  const fullText = [
    `# ${call.title}`,
    [fmtWhen(call.recordedAt), fmtDuration(call.minutes)].filter(Boolean).join(' · '),
    call.summary && `\n## Summary\n${call.summary}`,
    call.keyPoints && `\n## Key points\n${call.keyPoints}`,
    call.actionItems && `\n## Action items\n${call.actionItems}`,
    call.transcript && `\n## Transcript\n${call.transcript}`,
  ].filter(Boolean).join('\n')

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
        <PhoneCall size={16} className="text-blue-600 mt-1 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{call.title}</span>
            {call.status === 'Error' && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">needs attention</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
            {call.recordedAt && <span className="inline-flex items-center gap-1"><Calendar size={11} />{fmtWhen(call.recordedAt)}</span>}
            {call.minutes != null && <span className="inline-flex items-center gap-1"><Clock size={11} />{fmtDuration(call.minutes)}</span>}
          </div>
          {!open && call.summary && <p className="text-sm text-gray-600 mt-1.5 line-clamp-2">{call.summary}</p>}
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400 mt-1" /> : <ChevronDown size={16} className="text-gray-400 mt-1" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100">
          {call.summary && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Summary</h3>
              <p className="text-sm text-gray-800">{call.summary}</p>
            </section>
          )}
          {call.keyPoints && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Key points</h3>
              <Bullets text={call.keyPoints} />
            </section>
          )}
          {call.actionItems && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Action items</h3>
              <Bullets text={call.actionItems} />
            </section>
          )}
          {call.people && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">People &amp; entities</h3>
              <p className="text-sm text-gray-800">{call.people}</p>
            </section>
          )}
          {call.notes && (
            <div className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-3 py-2 whitespace-pre-wrap">{call.notes}</div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => copy(fullText, 'Call')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <Copy size={12} /> Copy summary + transcript
            </button>
            {call.transcript && (
              <>
                <button onClick={() => copy(call.transcript, 'Transcript')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
                  <Copy size={12} /> Copy transcript
                </button>
                <button onClick={() => setShowTranscript(s => !s)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
                  {showTranscript ? 'Hide transcript' : 'Show transcript'}
                </button>
              </>
            )}
          </div>

          {showTranscript && (
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-[28rem] overflow-y-auto font-sans">
              {call.transcript}
            </pre>
          )}
          <p className="text-[11px] text-gray-400">
            {[call.sourceFile, call.models, call.truncated && 'transcript truncated in Airtable'].filter(Boolean).join(' · ')}
          </p>
        </div>
      )}
    </div>
  )
}

export default function Calls() {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!DOCS_BASE_ID) { setError('VITE_AIRTABLE_DOCS_BASE_ID is not configured.'); setLoading(false); return }
      const { data, error: err } = await fetchAllRecords(TABLE, { sort: { field: 'Recorded At', direction: 'desc' } }, DOCS_BASE_ID)
      if (cancelled) return
      if (err) setError(err)
      else setCalls(arr(data).map(toCall))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return calls
    return calls.filter(c =>
      [c.title, c.summary, c.keyPoints, c.actionItems, c.people, c.transcript].some(s => s.toLowerCase().includes(q)),
    )
  }, [calls, search])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (loading) return <LoadingSpinner />

  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
        <AlertTriangle size={32} className="mx-auto text-yellow-500 mb-3" />
        <p className="font-medium text-yellow-800">Couldn&apos;t load call recordings.</p>
        <p className="text-sm text-yellow-700 mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Calls</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {calls.length} recordings · {filtered.length} shown · auto-transcribed locally from Voice Recorder
        </p>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search titles, summaries, transcripts…"
          className="w-full h-9 pl-9 pr-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="text-center text-sm text-gray-500 py-12 bg-white border border-gray-200 rounded-xl">
          {calls.length === 0
            ? 'No calls yet. Save a recording in Voice Recorder and give it a name — it will show up here after the watcher processes it.'
            : 'No calls match your search.'}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(c => (
            <CallCard key={c.id} call={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
          <span className="text-gray-500">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
        </div>
      )}
    </div>
  )
}
