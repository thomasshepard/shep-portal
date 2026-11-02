import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, ChevronDown, AlertTriangle, CalendarClock, ExternalLink, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import useWorkstreamTasks from '../hooks/useWorkstreamTasks'
import { fetchAllRecords, createRecord, updateRecord } from '../lib/airtable'
import {
  WS_BASE_ID, WS_TABLE, WF, STATUSES, TYPES, OWNERS, TYPE_COLORS, OWNER_COLORS,
  funnelCounts, checkpointState, fmtCheckpoint, formValuesToPayload, safeUrl, EMPTY_TASKS,
} from '../lib/workstreams'
import LoadingSpinner from '../components/LoadingSpinner'
import WorkstreamDrawer from '../components/WorkstreamDrawer'
import { TaskCheck, ProgressBar } from '../components/WorkstreamTasks'

const COLUMN_STYLE = {
  Active:  { dot: 'bg-green-500',  head: 'text-gray-800',  wrap: 'bg-gray-50 border-gray-200' },
  Waiting: { dot: 'bg-yellow-400', head: 'text-gray-800',  wrap: 'bg-gray-50 border-gray-200' },
  Blocked: { dot: 'bg-red-600',    head: 'text-red-700',   wrap: 'bg-red-50 border-red-300 ring-1 ring-red-200' },
  Done:    { dot: 'bg-gray-400',   head: 'text-gray-500',  wrap: 'bg-gray-50 border-gray-200' },
}

const CHECKPOINT_CLS = {
  overdue: 'bg-red-100 text-red-700 font-semibold',
  soon: 'bg-amber-100 text-amber-800 font-semibold',
  ok: 'bg-gray-100 text-gray-600',
}

function sortByCheckpoint(a, b) {
  const da = a.fields?.['Next Checkpoint'] || '9999-12-31'
  const db = b.fields?.['Next Checkpoint'] || '9999-12-31'
  return da < db ? -1 : da > db ? 1 : 0
}

function CheckpointPill({ fields, className = '' }) {
  const date = fields?.['Next Checkpoint']
  if (!date) return null
  const state = checkpointState(fields) || 'ok'
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ${CHECKPOINT_CLS[state]} ${className}`}>
      <CalendarClock size={12} />
      {fmtCheckpoint(date)}
    </span>
  )
}

function LeadFunnel({ fields }) {
  const parts = funnelCounts(fields)
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div className="mt-3" aria-label="Lead funnel, last 30 days">
      {total > 0 ? (
        <div className="flex h-2 rounded-full overflow-hidden bg-gray-200">
          {parts.filter(p => p.value > 0).map(p => (
            <div key={p.key} className={p.bar} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.full || p.label}: ${p.value}`} />
          ))}
        </div>
      ) : (
        <div className="h-2 rounded-full bg-gray-200" />
      )}
      <div className="mt-1.5 grid grid-cols-4 gap-1 text-center">
        {parts.map(p => (
          <div key={p.key} title={p.full || p.label}>
            <div className={`text-sm font-semibold ${p.value ? 'text-gray-900' : 'text-gray-400'}`}>{p.value}</div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 flex items-center justify-center gap-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${p.bar}`} />
              {p.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TaskPreview({ tasks, onToggleTask }) {
  if (!tasks.total) return null
  const shown = tasks.open.slice(0, 3)
  const more = tasks.open.length - shown.length
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <ProgressBar done={tasks.done.length} total={tasks.total} className="flex-1" />
        <span className="text-xs font-medium text-gray-500 tabular-nums">{tasks.done.length}/{tasks.total}</span>
      </div>
      {tasks.open.length === 0 ? (
        <p className="mt-1.5 text-sm font-medium text-green-700">All tasks done</p>
      ) : (
        <ul className="mt-1">
          {shown.map(t => (
            <li key={t.id} className="flex items-center gap-1">
              <TaskCheck done={false} onToggle={() => onToggleTask(t)} label={t.title} />
              <span className="text-sm text-gray-800 leading-snug py-1.5 line-clamp-2">{t.title}</span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="text-xs text-gray-500 pl-9">+{more} more</p>}
    </div>
  )
}

function WorkstreamCard({ ws, tasks, onToggleTask, onOpen, onMove, onDragStart, onDragEnd, dragging }) {
  const f = ws.fields || {}
  const status = f.Status || 'Active'
  const sessionHref = safeUrl(f['Claude Session URL'])
  const blocked = status === 'Blocked'

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ws.id); onDragStart(ws.id) }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(ws)}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(ws) }}
      role="button"
      tabIndex={0}
      className={`bg-white rounded-xl border p-3.5 shadow-sm cursor-pointer active:bg-gray-50 hover:shadow-md transition-shadow
        ${blocked ? 'border-red-300 border-l-4 border-l-red-600' : 'border-gray-200'} ${dragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900 leading-snug">{f.Name || 'Untitled'}</h3>
        {f.Owner && (
          <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full border ${OWNER_COLORS[f.Owner] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
            {f.Owner}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {f.Type && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[f.Type] || 'bg-gray-100 text-gray-600'}`}>{f.Type}</span>
        )}
        <CheckpointPill fields={f} />
      </div>

      {f['Next Action'] && (
        <p className="mt-2.5 text-[15px] text-gray-800 leading-snug whitespace-pre-line line-clamp-4">{f['Next Action']}</p>
      )}

      <TaskPreview tasks={tasks} onToggleTask={onToggleTask} />

      {f['Waiting On'] && (
        <p className="mt-2 text-xs text-gray-500">
          <span className="font-medium text-gray-600">Waiting on:</span> {f['Waiting On']}
        </p>
      )}

      {f.Type === 'Vacancy' && <LeadFunnel fields={f} />}

      {sessionHref && (
        <a
          href={sessionHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="mt-3 inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-blue-200 bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100 max-w-full"
        >
          <ExternalLink size={14} className="flex-shrink-0" />
          <span className="truncate">{f['Claude Session Name'] ? `Open: ${f['Claude Session Name']}` : 'Open Claude session'}</span>
        </a>
      )}

      <div className="mt-3 pt-2.5 border-t border-gray-100" onClick={e => e.stopPropagation()}>
        <label className="flex items-center justify-between gap-2 text-xs text-gray-500">
          Move to
          <select
            value={status}
            onChange={e => onMove(ws.id, e.target.value)}
            className="min-h-[44px] md:min-h-[32px] rounded-lg border border-gray-300 bg-white px-2 text-base md:text-xs text-gray-700"
          >
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}

function Column({ status, items, tasksFor, onToggleTask, collapsed, onToggle, dragId, onDropCard, onOpen, onMove, setDragId }) {
  const [over, setOver] = useState(false)
  const st = COLUMN_STYLE[status]
  const isDone = status === 'Done'

  return (
    <section
      onDragOver={e => { if (dragId) { e.preventDefault(); setOver(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false) }}
      onDrop={e => { e.preventDefault(); setOver(false); onDropCard(status) }}
      className={`rounded-xl border ${st.wrap} ${over ? 'outline outline-2 outline-blue-400' : ''}
        ${isDone && collapsed ? 'md:flex-none md:w-44' : 'md:flex-1'} md:min-w-0 self-start w-full`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-2 px-3.5 min-h-[52px] text-left"
      >
        <span className={`w-2.5 h-2.5 rounded-full ${st.dot}`} />
        <span className={`font-semibold ${st.head}`}>{status}</span>
        <span className={`text-sm ${status === 'Blocked' && items.length ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>{items.length}</span>
        <ChevronDown size={18} className={`ml-auto text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
      </button>
      {!collapsed && (
        <div className="px-2.5 pb-2.5 space-y-2.5">
          {items.length === 0 && <p className="text-sm text-gray-400 px-1 py-3 text-center">Nothing here</p>}
          {items.map(ws => (
            <WorkstreamCard
              key={ws.id}
              ws={ws}
              tasks={tasksFor(ws.id)}
              onToggleTask={onToggleTask}
              onOpen={onOpen}
              onMove={onMove}
              dragging={dragId === ws.id}
              onDragStart={setDragId}
              onDragEnd={() => setDragId(null)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function SummaryChip({ label, value, tone }) {
  const tones = {
    green: 'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    red: value ? 'bg-red-600 text-white border-red-600' : 'bg-gray-50 text-gray-500 border-gray-200',
    redSoft: value ? 'bg-red-50 text-red-700 border-red-300' : 'bg-gray-50 text-gray-500 border-gray-200',
  }
  return (
    <div className={`flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg border text-sm ${tones[tone]}`}>
      <span className="text-lg font-bold leading-none">{value}</span>
      <span>{label}</span>
    </div>
  )
}

export default function Workstreams() {
  const { session } = useAuth()
  const wt = useWorkstreamTasks(session?.user?.id)
  const [searchParams, setSearchParams] = useSearchParams()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [collapsed, setCollapsed] = useState({ Done: true })
  const [dragId, setDragId] = useState(null)
  const [drawer, setDrawer] = useState(null) // null | { record: rec | null }
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const { data, error } = await fetchAllRecords(WS_TABLE, {}, WS_BASE_ID)
    if (error) setLoadError(error)
    else setRecords(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Deep link: #/workstreams?ws=<recordId> opens that workstream's drawer.
  const deepLinkId = searchParams.get('ws')
  useEffect(() => {
    if (!deepLinkId || loading) return
    const rec = records.find(r => r.id === deepLinkId)
    if (rec) setDrawer({ record: rec })
    setSearchParams({}, { replace: true })
  }, [deepLinkId, loading, records, setSearchParams])

  const tasksFor = id => wt.grouped[id] || EMPTY_TASKS

  function toggleFromCard(task) {
    wt.toggle(task.id, true)
    toast(t => (
      <span className="flex items-center gap-3 text-sm">
        <span className="truncate max-w-[14rem]">Done: {task.title}</span>
        <button
          className="font-semibold text-blue-600 min-h-[32px] px-1"
          onClick={() => { wt.toggle(task.id, false); toast.dismiss(t.id) }}
        >
          Undo
        </button>
      </span>
    ), { duration: 4000 })
  }

  const filtered = useMemo(
    () => records.filter(r =>
      (!typeFilter || r.fields?.Type === typeFilter) && (!ownerFilter || r.fields?.Owner === ownerFilter)),
    [records, typeFilter, ownerFilter]
  )

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map(s => [s, []]))
    filtered.forEach(r => { (map[r.fields?.Status] || map.Active).push(r) })
    STATUSES.forEach(s => map[s].sort(sortByCheckpoint))
    return map
  }, [filtered])

  const overdue = filtered.filter(r => checkpointState(r.fields) === 'overdue')
  const attention = filtered
    .filter(r => r.fields?.Status !== 'Done' && (r.fields?.Status === 'Blocked' || checkpointState(r.fields) === 'overdue'))
    .sort(sortByCheckpoint)

  const patchLocal = (id, fields) =>
    setRecords(prev => prev.map(r => (r.id === id ? { ...r, fields: { ...r.fields, ...fields } } : r)))

  async function moveTo(id, status) {
    const rec = records.find(r => r.id === id)
    if (!rec || rec.fields?.Status === status) return
    const prevStatus = rec.fields?.Status
    patchLocal(id, { Status: status }) // optimistic
    const { data, error } = await updateRecord(WS_TABLE, id, { [WF.status]: status }, WS_BASE_ID)
    if (error) {
      patchLocal(id, { Status: prevStatus })
      toast.error('Could not update status: ' + error)
      return
    }
    patchLocal(id, data.fields)
    toast.success(`Moved to ${status}`)
  }

  function handleDrop(status) {
    const id = dragId
    setDragId(null)
    if (id) moveTo(id, status)
  }

  async function handleSave(form) {
    const payload = formValuesToPayload(form)
    setSaving(true)
    try {
      if (drawer.record) {
        const { data, error } = await updateRecord(WS_TABLE, drawer.record.id, payload, WS_BASE_ID)
        if (error) { toast.error('Save failed: ' + error); return false }
        setRecords(prev => prev.map(r => (r.id === data.id ? data : r)))
        toast.success('Saved')
      } else {
        const { data, error } = await createRecord(WS_TABLE, payload, WS_BASE_ID)
        if (error) { toast.error('Create failed: ' + error); return false }
        setRecords(prev => [...prev, data])
        toast.success('Workstream added')
      }
      return true
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  if (loadError) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <AlertTriangle className="mx-auto text-red-500" size={32} />
        <h1 className="text-lg font-semibold text-gray-900">Couldn’t load workstreams</h1>
        <p className="text-sm text-gray-500 break-words">{loadError}</p>
        <button onClick={load} className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg bg-blue-600 text-white text-sm font-medium">
          <RefreshCw size={16} /> Try again
        </button>
      </div>
    )
  }

  const selectCls = 'min-h-[44px] md:min-h-[38px] rounded-lg border border-gray-300 bg-white px-3 text-base md:text-sm text-gray-700 flex-1 md:flex-none'
  const noRecords = records.length === 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Workstreams</h1>
        <button
          onClick={() => setDrawer({ record: null })}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
        >
          <Plus size={18} /> Add workstream
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <SummaryChip label="Active" value={byStatus.Active.length} tone="green" />
        <SummaryChip label="Waiting" value={byStatus.Waiting.length} tone="yellow" />
        <SummaryChip label="Blocked" value={byStatus.Blocked.length} tone="red" />
        <SummaryChip label="Overdue" value={overdue.length} tone="redSoft" />
      </div>

      <div className="flex gap-2">
        <select aria-label="Filter by type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={selectCls}>
          <option value="">All types</option>
          {TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select aria-label="Filter by owner" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className={selectCls}>
          <option value="">All owners</option>
          {OWNERS.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>

      {attention.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-700 mb-2">
            <AlertTriangle size={16} /> Needs attention · {attention.length}
          </div>
          <div className="flex md:flex-wrap gap-2 overflow-x-auto md:overflow-visible -mx-1 px-1 pb-1 md:pb-0 flex-col md:flex-row">
            {attention.map(r => {
              const f = r.fields || {}
              return (
                <button
                  key={r.id}
                  onClick={() => setDrawer({ record: r })}
                  className="flex items-center gap-2 min-h-[44px] px-3 rounded-lg bg-white border border-red-200 text-left text-sm hover:bg-red-100/50"
                >
                  <span className="font-medium text-gray-900 truncate max-w-[16rem]">{f.Name}</span>
                  {f.Status === 'Blocked' && <span className="text-[10px] font-bold uppercase text-white bg-red-600 rounded px-1.5 py-0.5">Blocked</span>}
                  <CheckpointPill fields={f} className="!py-0.5" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {noRecords ? (
        <div className="text-center py-16 text-gray-500">
          <p className="font-medium text-gray-700">No workstreams yet</p>
          <p className="text-sm mt-1">Add one to start tracking what’s in motion.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="font-medium text-gray-700">Nothing matches those filters</p>
          <button onClick={() => { setTypeFilter(''); setOwnerFilter('') }} className="mt-2 text-sm text-blue-600 underline min-h-[44px]">Clear filters</button>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 md:items-start">
          {STATUSES.map(s => (
            <Column
              key={s}
              status={s}
              items={byStatus[s]}
              collapsed={!!collapsed[s]}
              onToggle={() => setCollapsed(c => ({ ...c, [s]: !c[s] }))}
              tasksFor={tasksFor}
              onToggleTask={toggleFromCard}
              dragId={dragId}
              setDragId={setDragId}
              onDropCard={handleDrop}
              onOpen={rec => setDrawer({ record: rec })}
              onMove={moveTo}
            />
          ))}
        </div>
      )}

      {drawer && (
        <WorkstreamDrawer
          key={drawer.record?.id || 'new'}
          record={drawer.record}
          saving={saving}
          onSave={handleSave}
          onClose={() => setDrawer(null)}
          tasks={drawer.record ? tasksFor(drawer.record.id) : EMPTY_TASKS}
          taskActions={wt}
          tasksLoading={wt.loading}
          tasksError={wt.error}
          onRetryTasks={wt.reload}
        />
      )}
    </div>
  )
}
