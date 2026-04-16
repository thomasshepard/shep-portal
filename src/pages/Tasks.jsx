import { useState, useEffect, useRef } from 'react'
import { Plus, ChevronLeft, Trash2, ExternalLink } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { fetchTasks, createTask, updateTask, deleteTask, FIELDS } from '../lib/tasks'

// ── Local helpers ─────────────────────────────────────────────────────────────
const safeStr = (v) => (v == null ? '' : String(v))
const safeNum = (v) => (isNaN(Number(v)) ? 0 : Number(v))
const arr     = (v) => (Array.isArray(v) ? v : [])

// ── Constants ─────────────────────────────────────────────────────────────────
const MODULES = ['All', 'Happy Cuts', 'Properties', 'LLC', 'Manual']

const TABS = [
  { key: 'todo',        label: 'To Do',       status: 'To Do'       },
  { key: 'in_progress', label: 'In Progress',  status: 'In Progress' },
  { key: 'done',        label: 'Done',         status: 'Done'        },
]

const MODULE_ACCENT = {
  'Happy Cuts': 'bg-emerald-500',
  'Properties': 'bg-blue-500',
  'LLC':        'bg-violet-500',
  'Manual':     'bg-slate-400',
}
const MODULE_TEXT = {
  'Happy Cuts': 'text-emerald-600',
  'Properties': 'text-blue-600',
  'LLC':        'text-violet-600',
  'Manual':     'text-slate-500',
}
const MODULE_PILL_BG = {
  'Happy Cuts': 'bg-emerald-100 text-emerald-700',
  'Properties': 'bg-blue-100 text-blue-700',
  'LLC':        'bg-violet-100 text-violet-700',
  'Manual':     'bg-slate-100 text-slate-600',
}

// ── Due date chip ─────────────────────────────────────────────────────────────
function dueDateChip(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0,0,0,0)
  const due   = new Date(dateStr + 'T00:00:00')
  const diff  = Math.round((due - today) / 86400000)

  if (diff < 0)  return { label: `Overdue ${Math.abs(diff)}d`, cls: 'text-red-600 bg-red-50' }
  if (diff === 0) return { label: 'Due today',  cls: 'text-amber-600 bg-amber-50' }
  if (diff === 1) return { label: 'Tomorrow',   cls: 'text-amber-600 bg-amber-50' }
  if (diff <= 7)  return { label: `${diff}d left`, cls: 'text-amber-600 bg-amber-50' }
  const d = due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return { label: d, cls: 'text-slate-500 bg-slate-100' }
}

function isOverdue(dateStr) {
  if (!dateStr) return false
  const today = new Date(); today.setHours(0,0,0,0)
  return new Date(dateStr + 'T00:00:00') < today
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2 rounded-full shadow-lg">
      {message}
    </div>
  )
}

// ── AddTaskDialog — bottom sheet on mobile, centered modal on desktop ──────────
function AddTaskDialog({ onClose, onAdd }) {
  const [title, setTitle]     = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving]   = useState(false)
  const titleRef = useRef(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    await onAdd({ title: title.trim(), dueDate: dueDate || undefined })
    setSaving(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end md:justify-center md:items-center md:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Sheet on mobile, modal on desktop */}
      <div
        className="relative bg-white w-full rounded-t-3xl px-5 pt-4 pb-10 md:rounded-2xl md:max-w-md md:pb-6 md:shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5 md:hidden" />

        <h2 className="text-base font-bold text-slate-900 mb-4">New Task</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            onKeyDown={e => e.key === 'Enter' && handleSubmit(e)}
          />
          <div>
            <label className="text-xs text-slate-500 block mb-1">Due date (optional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
          >
            {saving ? 'Adding…' : 'Add Task'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── TaskCard ──────────────────────────────────────────────────────────────────
function TaskCard({ task, onStart, onDone, onDelete, onNotesChange }) {
  const [expanded, setExpanded]   = useState(false)
  const [flashing, setFlashing]   = useState(false)
  const [localNotes, setLocalNotes] = useState(safeStr(task.fields[FIELDS.NOTES]))
  const [savingNotes, setSavingNotes] = useState(false)

  const status    = safeStr(task.fields[FIELDS.STATUS])
  const title     = safeStr(task.fields[FIELDS.TITLE])
  const module    = safeStr(task.fields[FIELDS.MODULE]) || 'Manual'
  const dueStr    = safeStr(task.fields[FIELDS.DUE_DATE])
  const body      = safeStr(task.fields[FIELDS.BODY])
  const actionUrl = safeStr(task.fields[FIELDS.ACTION_URL])

  const chip    = dueDateChip(dueStr)
  const accent  = MODULE_ACCENT[module] || MODULE_ACCENT['Manual']
  const pillCls = MODULE_PILL_BG[module] || MODULE_PILL_BG['Manual']
  const isDone  = status === 'Done'

  async function handleDone() {
    setFlashing(true)
    setTimeout(() => setFlashing(false), 600)
    await onDone(task)
  }

  async function saveNotes() {
    if (localNotes === safeStr(task.fields[FIELDS.NOTES])) return
    setSavingNotes(true)
    await onNotesChange(task.id, localNotes)
    setSavingNotes(false)
  }

  return (
    <div className="relative bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden mb-2">
      {/* Flash overlay */}
      {flashing && (
        <div className="absolute inset-0 z-10 bg-green-500/80 flex items-center justify-center rounded-xl">
          <span className="text-white text-2xl font-bold">✓</span>
        </div>
      )}

      {/* Left accent */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />

      <div className="pl-3 pr-3 pt-3 pb-2">
        {/* Title row */}
        <button className="w-full text-left" onClick={() => setExpanded(e => !e)}>
          <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
            {title}
          </p>
        </button>

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {module && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${pillCls}`}>{module}</span>
          )}
          {chip && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${chip.cls}`}>{chip.label}</span>
          )}
          {actionUrl && (
            <a
              href={actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-[11px] font-medium flex items-center gap-0.5 ${MODULE_TEXT[module] || 'text-slate-500'}`}
              onClick={e => e.stopPropagation()}
            >
              Open <ExternalLink size={10} />
            </a>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-2">
          {status === 'To Do' && (
            <button
              onClick={() => onStart(task)}
              className="text-[12px] font-medium bg-slate-800 text-white px-3 py-1 rounded-lg"
            >
              Start
            </button>
          )}
          {status === 'In Progress' && (
            <button
              onClick={handleDone}
              className="text-[12px] font-medium bg-green-600 text-white px-3 py-1 rounded-lg"
            >
              Done ✓
            </button>
          )}
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-slate-100 px-3 py-3 space-y-3">
          {body && (
            <p className="text-xs text-slate-600 leading-relaxed">{body}</p>
          )}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Notes</label>
            <textarea
              value={localNotes}
              onChange={e => setLocalNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              placeholder="Add notes…"
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
            />
            {savingNotes && <p className="text-[10px] text-slate-400 mt-0.5">Saving…</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setExpanded(false)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            >
              <ChevronLeft size={13} /> Back
            </button>
            <button
              onClick={() => onDelete(task)}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 ml-auto"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Empty state for kanban columns ────────────────────────────────────────────
function ColEmpty({ colKey, onAdd }) {
  if (colKey === 'todo') return (
    <div className="text-center py-10 text-slate-400">
      <p className="text-2xl mb-2">✨</p>
      <p className="text-sm font-medium text-slate-500">You're all caught up</p>
      <button
        onClick={onAdd}
        className="mt-3 text-xs text-slate-500 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-100"
      >
        + Add a task
      </button>
    </div>
  )
  if (colKey === 'in_progress') return (
    <div className="text-center py-10">
      <p className="text-2xl mb-2">🚀</p>
      <p className="text-sm font-medium text-slate-500">Nothing in flight</p>
    </div>
  )
  return (
    <div className="text-center py-10">
      <p className="text-2xl mb-2">🎯</p>
      <p className="text-sm font-medium text-slate-500">Nothing completed yet</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Tasks() {
  const { session } = useAuth()

  const [allTasks, setAllTasks]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [activeCol, setActiveCol] = useState('todo')
  const [filter, setFilter]       = useState('All')
  const [showAdd, setShowAdd]     = useState(false)
  const [toast, setToast]         = useState(null)

  const userId = session?.user?.id

  async function loadTasks() {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const records = await fetchTasks(userId)
      setAllTasks(records)
    } catch (err) {
      console.error('[Tasks] loadTasks failed:', err)
      setError(err.message || 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTasks() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  function byStatus(status) {
    return allTasks
      .filter(t => safeStr(t.fields[FIELDS.STATUS]) === status)
      .filter(t => filter === 'All' || safeStr(t.fields[FIELDS.MODULE]) === filter)
  }

  const todoCnt       = byStatus('To Do').length
  const inProgressCnt = byStatus('In Progress').length
  const doneCnt       = byStatus('Done').length
  const openCount     = todoCnt + inProgressCnt
  const overdueCount  = allTasks.filter(t =>
    safeStr(t.fields[FIELDS.STATUS]) !== 'Done' && isOverdue(safeStr(t.fields[FIELDS.DUE_DATE]))
  ).length

  function showToast(msg) { setToast(msg) }

  async function handleStart(task) {
    const updated = { ...task, fields: { ...task.fields, [FIELDS.STATUS]: 'In Progress' } }
    setAllTasks(prev => prev.map(t => t.id === task.id ? updated : t))
    try {
      await updateTask(task.id, { [FIELDS.STATUS]: 'In Progress' })
    } catch {
      setAllTasks(prev => prev.map(t => t.id === task.id ? task : t))
      showToast('Failed to update task')
    }
  }

  async function handleDone(task) {
    const today   = new Date().toISOString().slice(0, 10)
    const updated = { ...task, fields: { ...task.fields, [FIELDS.STATUS]: 'Done', [FIELDS.COMPLETED_AT]: today } }
    setAllTasks(prev => prev.map(t => t.id === task.id ? updated : t))
    setActiveCol('done')
    showToast('✓ Marked complete')
    try {
      await updateTask(task.id, { [FIELDS.STATUS]: 'Done', [FIELDS.COMPLETED_AT]: today })
    } catch {
      setAllTasks(prev => prev.map(t => t.id === task.id ? task : t))
      showToast('Failed to update task')
    }
  }

  async function handleDelete(task) {
    setAllTasks(prev => prev.filter(t => t.id !== task.id))
    showToast('Task deleted')
    try {
      await deleteTask(task.id)
    } catch {
      setAllTasks(prev => [...prev, task])
      showToast('Failed to delete task')
    }
  }

  async function handleNotesChange(recordId, notes) {
    setAllTasks(prev => prev.map(t =>
      t.id === recordId ? { ...t, fields: { ...t.fields, [FIELDS.NOTES]: notes } } : t
    ))
    await updateTask(recordId, { [FIELDS.NOTES]: notes })
  }

  async function handleAdd({ title, dueDate }) {
    const record = await createTask({ title, dueDate, module: 'Manual', userId })
    setAllTasks(prev => [...prev, record])
    setActiveCol('todo')
    showToast('Task added')
  }

  const cardProps = { onStart: handleStart, onDone: handleDone, onDelete: handleDelete, onNotesChange: handleNotesChange }

  // Desktop kanban column definitions
  const COLS_DATA = [
    { key: 'todo',        label: 'To Do',       status: 'To Do',       count: todoCnt,       headerCls: 'text-slate-700' },
    { key: 'in_progress', label: 'In Progress',  status: 'In Progress', count: inProgressCnt, headerCls: 'text-blue-700'  },
    { key: 'done',        label: 'Done',         status: 'Done',        count: doneCnt,       headerCls: 'text-green-700' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 bg-slate-50 z-10">
        <div className="px-4 sm:px-6 pt-4 pb-2">
          {/* Title row */}
          <div className="flex items-center justify-between mb-0.5">
            <h1 className="text-xl font-bold text-slate-900">Tasks</h1>
            <button
              onClick={() => setShowAdd(true)}
              className="w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center shadow"
            >
              <Plus size={18} />
            </button>
          </div>

          {/* Subtitle */}
          <p className="text-sm text-slate-500 mb-3">
            {openCount} open
            {overdueCount > 0 && <span className="text-red-500"> · {overdueCount} overdue</span>}
          </p>

          {/* Module filter chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-hide">
            {MODULES.map(m => (
              <button
                key={m}
                onClick={() => setFilter(m)}
                className={`flex-none text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                  filter === m
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Mobile-only tab bar */}
          <div className="flex border-b border-slate-200 md:hidden">
            {TABS.map(tab => {
              const cnt = tab.key === 'todo' ? todoCnt : tab.key === 'in_progress' ? inProgressCnt : doneCnt
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveCol(tab.key)}
                  className={`flex-1 text-xs font-medium pb-2 text-center transition-colors flex items-center justify-center gap-1 ${
                    activeCol === tab.key
                      ? 'text-slate-900 border-b-2 border-slate-900 -mb-px'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                  {cnt > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      activeCol === tab.key ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {cnt}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {error && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
          <span className="text-3xl">⚠️</span>
          <p className="text-sm font-semibold text-red-500">Could not load tasks</p>
          <p className="text-xs text-slate-400 max-w-xs">{error}</p>
          <button
            onClick={loadTasks}
            className="mt-2 text-xs font-bold px-4 py-2 rounded-full bg-slate-900 text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Mobile: single-column tabbed view ─────────────────────────────── */}
      {!error && (
        <>
          <div className="md:hidden px-3 pt-3 pb-24">
            {(() => {
              const tabMap  = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }
              const colKey  = activeCol
              const tasks   = byStatus(tabMap[colKey])
              return tasks.length === 0
                ? <ColEmpty colKey={colKey} onAdd={() => setShowAdd(true)} />
                : tasks.map(task => <TaskCard key={task.id} task={task} {...cardProps} />)
            })()}
          </div>

          {/* ── Desktop: three-column kanban ─────────────────────────────── */}
          <div className="hidden md:grid md:grid-cols-3 md:gap-5 px-6 py-5 max-w-6xl mx-auto">
            {COLS_DATA.map(col => (
              <div key={col.key} className="flex flex-col min-w-0">
                {/* Column header */}
                <div className="flex items-center gap-2 mb-3">
                  <h2 className={`text-sm font-bold ${col.headerCls}`}>{col.label}</h2>
                  {col.count > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                      {col.count}
                    </span>
                  )}
                </div>
                {/* Column tasks */}
                {byStatus(col.status).length === 0
                  ? <ColEmpty colKey={col.key} onAdd={() => setShowAdd(true)} />
                  : byStatus(col.status).map(task => <TaskCard key={task.id} task={task} {...cardProps} />)
                }
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Add dialog ────────────────────────────────────────────────────── */}
      {showAdd && <AddTaskDialog onClose={() => setShowAdd(false)} onAdd={handleAdd} />}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
