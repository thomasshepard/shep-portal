import { useState, useEffect, useMemo } from 'react'
import { Rocket, Circle, Clock, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAccessLog } from '../hooks/useAccessLog'

const BASE_ID = 'appp0rx0SV1WuIUrh'
const TABLE_ID = 'tblvPPFE3IxJA9f8W'
const AIRTABLE_PAT = import.meta.env.VITE_AIRTABLE_PAT

const F = {
  TASK: 'Task',
  DAY: 'Day',
  WORKSTREAM: 'Workstream',
  DETAIL: 'Detail',
  STATUS: 'Status',
  SORT: 'Sort Order',
}

const STATUSES = ['Not Started', 'In Progress', 'Done']

const WORKSTREAMS = [
  {
    key: 'Microsite Building',
    label: 'Microsite Building',
    tagline: 'Slower money — build one site, get it ranking, let it earn on autopilot',
    ring: 'ring-indigo-200',
    bar: 'bg-indigo-500',
    chip: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    header: 'text-indigo-900',
  },
  {
    key: 'Lead Lists to Sell',
    label: 'Lead Lists to Sell',
    tagline: 'Faster cash — pull a list, pitch it to an agency, get paid this week',
    ring: 'ring-emerald-200',
    bar: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    header: 'text-emerald-900',
  },
]

// ── Airtable field helpers (local, not shared from lib/airtable.js) ────────
const safeStr = (v, fallback = '') => (v == null ? fallback : String(v))
const safeNum = (v) => (isNaN(Number(v)) ? 0 : Number(v))
const arr = (v) => (Array.isArray(v) ? v : [])

async function fetchRecords() {
  const all = []
  let offset = null
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`)
    if (offset) url.searchParams.set('offset', offset)
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } })
    if (!res.ok) throw new Error(`Airtable error: ${res.status}`)
    const data = await res.json()
    all.push(...(data.records || []))
    offset = data.offset
  } while (offset)
  return all
}

async function patchStatus(recordId, status) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [F.STATUS]: status }, typecast: true }),
  })
  if (!res.ok) throw new Error('Failed to update status')
  return res.json()
}

function nextStatus(current) {
  const i = STATUSES.indexOf(current)
  return STATUSES[(i + 1) % STATUSES.length]
}

function StatusIcon({ status, size = 16 }) {
  if (status === 'Done') return <CheckCircle2 size={size} className="text-emerald-600" />
  if (status === 'In Progress') return <Clock size={size} className="text-amber-500" />
  return <Circle size={size} className="text-gray-300" />
}

function TaskRow({ record, onCycle, busy }) {
  const f = record.fields
  const status = safeStr(f[F.STATUS], 'Not Started')
  const detail = safeStr(f[F.DETAIL])
  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${status === 'Done' ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}`}>
      <button
        onClick={() => onCycle(record)}
        disabled={busy}
        className="mt-0.5 flex-shrink-0 disabled:opacity-40"
        title={`Click to mark: ${nextStatus(status)}`}
      >
        <StatusIcon status={status} size={19} />
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium ${status === 'Done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {safeStr(f[F.TASK], 'Untitled task')}
        </div>
        {detail && (
          <div className={`text-xs mt-0.5 ${status === 'Done' ? 'text-gray-350' : 'text-gray-500'}`}>{detail}</div>
        )}
      </div>
    </div>
  )
}

function WorkstreamColumn({ ws, tasks, onCycle, busyId }) {
  const done = tasks.filter(t => t.fields[F.STATUS] === 'Done').length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0
  return (
    <div className={`flex-1 min-w-0 rounded-xl border p-3 ${ws.chip.split(' ').filter(c => c.startsWith('border')).join(' ')} bg-white`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wide ${ws.header}`}>{ws.label}</span>
        <span className="text-xs text-gray-400">{done}/{tasks.length}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 mb-3 overflow-hidden">
        <div className={`h-full ${ws.bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-2">
        {tasks.length === 0 && <div className="text-xs text-gray-400 italic">No tasks this day</div>}
        {tasks.map(t => (
          <TaskRow key={t.id} record={t} onCycle={onCycle} busy={busyId === t.id} />
        ))}
      </div>
    </div>
  )
}

export default function RankExpand() {
  const { log } = useAccessLog()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    log('rank-expand', 'view')
    load()
  }, [])

  async function load() {
    try {
      const data = await fetchRecords()
      setRecords(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCycle(record) {
    const status = safeStr(record.fields[F.STATUS], 'Not Started')
    const next = nextStatus(status)
    setBusyId(record.id)
    setRecords(prev => prev.map(r => r.id === record.id ? { ...r, fields: { ...r.fields, [F.STATUS]: next } } : r))
    try {
      await patchStatus(record.id, next)
    } catch (err) {
      toast.error(err.message)
      // revert on failure
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, fields: { ...r.fields, [F.STATUS]: status } } : r))
    } finally {
      setBusyId(null)
    }
  }

  const days = useMemo(() => {
    const byDay = {}
    for (const r of records) {
      const d = safeNum(r.fields[F.DAY]) || 0
      if (!byDay[d]) byDay[d] = []
      byDay[d].push(r)
    }
    const sorter = (a, b) => safeNum(a.fields[F.SORT]) - safeNum(b.fields[F.SORT])
    return Object.keys(byDay)
      .map(Number)
      .sort((a, b) => a - b)
      .map(day => ({
        day,
        tasksByWs: Object.fromEntries(
          WORKSTREAMS.map(ws => [ws.key, byDay[day].filter(r => r.fields[F.WORKSTREAM] === ws.key).sort(sorter)])
        ),
      }))
  }, [records])

  const totals = useMemo(() => {
    const done = records.filter(r => r.fields[F.STATUS] === 'Done').length
    return { done, total: records.length }
  }, [records])

  if (loading) return <div className="max-w-6xl mx-auto px-6 py-8 text-gray-500">Loading playbook...</div>
  if (error) return <div className="max-w-6xl mx-auto px-6 py-8 text-red-500">{error}</div>

  const overallPct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Rocket size={22} className="text-slate-700" />
            <h1 className="text-3xl font-bold text-gray-900">Rank Expand — First $1,000 Sprint</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Day-by-day tasks across two workstreams: build a microsite (slower, compounding), and pull lead lists to sell to marketing agencies (faster cash).
            Click the circle next to a task to cycle Not Started → In Progress → Done.
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-2xl font-bold text-gray-900">{overallPct}%</div>
          <div className="text-xs text-gray-500">{totals.done}/{totals.total} tasks done</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-6">
        {WORKSTREAMS.map(ws => (
          <div key={ws.key} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${ws.chip}`}>
            <span className={`w-2 h-2 rounded-full ${ws.bar}`} />
            {ws.label}
            <span className="text-gray-400 font-normal">— {ws.tagline}</span>
          </div>
        ))}
      </div>

      {/* Day cards */}
      <div className="space-y-5">
        {days.map(({ day, tasksByWs }) => (
          <div key={day} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold">
                {day}
              </span>
              <span className="text-sm font-semibold text-gray-700">Day {day}</span>
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              {WORKSTREAMS.map(ws => (
                <WorkstreamColumn
                  key={ws.key}
                  ws={ws}
                  tasks={tasksByWs[ws.key] || []}
                  onCycle={handleCycle}
                  busyId={busyId}
                />
              ))}
            </div>
          </div>
        ))}
        {days.length === 0 && (
          <div className="text-center text-gray-400 py-12">No playbook tasks found yet.</div>
        )}
      </div>
    </div>
  )
}
