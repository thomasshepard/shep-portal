import { useState, useEffect, useRef } from 'react'
import { Plus, ChevronLeft, ChevronDown, Star, Trash2, ExternalLink, Copy, Check, Search, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { fetchTasks, createTask, updateTask, deleteTask, dismissLinkedNotification, FIELDS } from '../lib/tasks'

// ── Helpers ───────────────────────────────────────────────────────────────────
const safeStr = (v) => (v == null ? '' : String(v))
const arr     = (v) => (Array.isArray(v) ? v : [])

// ── Constants ─────────────────────────────────────────────────────────────────
const MODULES = ['All', 'Happy Cuts', 'Properties', 'LLC', 'Manual']

const TABS = [
  { key: 'todo',        label: 'To Do',      status: 'To Do'       },
  { key: 'in_progress', label: 'In Progress', status: 'In Progress' },
  { key: 'done',        label: 'Done',        status: 'Done'        },
]

const STATUS_CONFIG = {
  'To Do':       { pillCls: 'bg-slate-100 text-slate-600', flashCls: 'bg-slate-500/80',  icon: '↩', label: 'To Do'       },
  'In Progress': { pillCls: 'bg-blue-100 text-blue-700',   flashCls: 'bg-blue-500/80',   icon: '→', label: 'In Progress' },
  'Done':        { pillCls: 'bg-green-100 text-green-700', flashCls: 'bg-green-500/80',  icon: '✓', label: 'Done'        },
}
const ALL_STATUSES = ['To Do', 'In Progress', 'Done']

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

const DONE_BUCKET_KEYS = ['Today', 'This week', 'This month', 'Older']
const DEFAULT_BUCKETS  = { Today: true, 'This week': true, 'This month': false, Older: false }

// ── Due-date chip ──────────────────────────────────────────────────────────────
function dueDateChip(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0,0,0,0)
  const due   = new Date(dateStr + 'T00:00:00')
  const diff  = Math.round((due - today) / 86400000)
  if (diff < 0)   return { label: `Overdue ${Math.abs(diff)}d`, cls: 'text-red-600 bg-red-50' }
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

function fmtCompletedDate(dateStr) {
  if (!dateStr) return null
  return `Completed ${new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

// ── Copy helpers ──────────────────────────────────────────────────────────────
function taskCopyText(task) {
  const title  = safeStr(task.fields[FIELDS.TITLE])
  const module = safeStr(task.fields[FIELDS.MODULE]) || 'Manual'
  const status = safeStr(task.fields[FIELDS.STATUS])
  const due    = safeStr(task.fields[FIELDS.DUE_DATE])
  const body   = safeStr(task.fields[FIELDS.BODY])
  const notes  = safeStr(task.fields[FIELDS.NOTES])
  return [
    title,
    `Module: ${module}  Status: ${status}  Due: ${due || 'none'}`,
    body  ? body          : null,
    notes ? `Notes: ${notes}` : null,
  ].filter(Boolean).join('\n')
}

async function copyToClipboard(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
  } else {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.focus(); ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

// ── Done bucketing ────────────────────────────────────────────────────────────
function bucketDoneTasks(tasks) {
  const today    = new Date(); today.setHours(0,0,0,0)
  const weekAgo  = new Date(today); weekAgo.setDate(today.getDate() - 7)
  const monthAgo = new Date(today); monthAgo.setDate(today.getDate() - 30)

  const out = { Today: [], 'This week': [], 'This month': [], Older: [] }
  for (const task of tasks) {
    const raw = safeStr(task.fields[FIELDS.COMPLETED_AT])
    if (!raw) { out.Older.push(task); continue }
    const d = new Date(raw + 'T00:00:00')
    if (d >= today)      out.Today.push(task)
    else if (d >= weekAgo)  out['This week'].push(task)
    else if (d >= monthAgo) out['This month'].push(task)
    else                    out.Older.push(task)
  }
  const desc = (a, b) => safeStr(b.fields[FIELDS.COMPLETED_AT]).localeCompare(safeStr(a.fields[FIELDS.COMPLETED_AT]))
  for (const arr of Object.values(out)) arr.sort(desc)
  return out
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2 rounded-full shadow-lg whitespace-nowrap">
      {message}
    </div>
  )
}

// ── AddTaskDialog ─────────────────────────────────────────────────────────────
function AddTaskDialog({ onClose, onAdd }) {
  const [title,   setTitle]   = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving,  setSaving]  = useState(false)
  const titleRef = useRef(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  function setPreset(days) {
    const d = new Date(); d.setDate(d.getDate() + days)
    setDueDate(d.toISOString().slice(0, 10))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    await onAdd({ title: title.trim(), dueDate: dueDate || undefined })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:justify-center md:items-center md:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative bg-white w-full rounded-t-3xl px-5 pt-4 pb-10 md:rounded-2xl md:max-w-md md:pb-6 md:shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
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
            <label className="text-xs text-slate-500 block mb-1.5">Due date (optional)</label>
            {/* Presets */}
            <div className="flex gap-2 mb-2">
              {[['Today', 0], ['Tomorrow', 1], ['Next week', 7]].map(([label, days]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setPreset(days)}
                  className={`flex-1 text-xs font-medium px-2 py-1.5 rounded-lg border transition-colors ${
                    dueDate === new Date(new Date().setDate(new Date().getDate() + days)).toISOString().slice(0,10)
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
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
function TaskCard({ task, flashStatus, isJustAdded, onStatusChange, onStarToggle, onDelete, onNotesChange, onDueDateChange, onTitleChange, onBodyChange, onToast }) {
  const [expanded,    setExpanded]    = useState(false)
  const [localNotes,  setLocalNotes]  = useState(safeStr(task.fields[FIELDS.NOTES]))
  const [localDue,    setLocalDue]    = useState(safeStr(task.fields[FIELDS.DUE_DATE]))
  const [localTitle,  setLocalTitle]  = useState(safeStr(task.fields[FIELDS.TITLE]))
  const [localBody,   setLocalBody]   = useState(safeStr(task.fields[FIELDS.BODY]))
  const [savingNotes, setSavingNotes] = useState(false)
  const [savingTitle, setSavingTitle] = useState(false)
  const [savingBody,  setSavingBody]  = useState(false)
  const [copied,      setCopied]      = useState(false)
  const [swipeDel,    setSwipeDel]    = useState(false)
  const touchStart = useRef(null)

  const status    = safeStr(task.fields[FIELDS.STATUS])
  const title     = safeStr(task.fields[FIELDS.TITLE])
  const module    = safeStr(task.fields[FIELDS.MODULE]) || 'Manual'
  const dueStr    = safeStr(task.fields[FIELDS.DUE_DATE])
  const body      = safeStr(task.fields[FIELDS.BODY])
  const actionUrl = safeStr(task.fields[FIELDS.ACTION_URL])
  const isStarred = task.fields[FIELDS.TODAY] === true
  const isDone    = status === 'Done'
  const completedLabel = isDone ? fmtCompletedDate(safeStr(task.fields[FIELDS.COMPLETED_AT])) : null

  const chip        = dueDateChip(dueStr)
  const accent      = MODULE_ACCENT[module] || MODULE_ACCENT['Manual']
  const modulePillCls = MODULE_PILL_BG[module] || MODULE_PILL_BG['Manual']
  const flashCfg    = flashStatus ? STATUS_CONFIG[flashStatus] : null

  async function handleCopy(e) {
    e.stopPropagation()
    try {
      await copyToClipboard(taskCopyText(task))
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
      onToast('Copied to clipboard')
    } catch { onToast('Copy failed') }
  }

  async function saveNotes() {
    if (localNotes === safeStr(task.fields[FIELDS.NOTES])) return
    setSavingNotes(true)
    await onNotesChange(task.id, localNotes)
    setSavingNotes(false)
  }

  async function saveTitle() {
    const trimmed = localTitle.trim()
    if (!trimmed || trimmed === safeStr(task.fields[FIELDS.TITLE])) return
    setSavingTitle(true)
    await onTitleChange(task.id, trimmed)
    setSavingTitle(false)
  }

  async function saveBody() {
    if (localBody === safeStr(task.fields[FIELDS.BODY])) return
    setSavingBody(true)
    await onBodyChange(task.id, localBody)
    setSavingBody(false)
  }

  function setDuePreset(days) {
    const d = new Date(); d.setDate(d.getDate() + days)
    const val = d.toISOString().slice(0, 10)
    setLocalDue(val)
    onDueDateChange(task.id, val)
  }

  function handleDueChange(val) {
    setLocalDue(val)
    onDueDateChange(task.id, val || null)
  }

  // Swipe-to-act (mobile only)
  function onTouchStart(e) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchEnd(e) {
    if (!touchStart.current || window.innerWidth >= 768) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y)
    touchStart.current = null
    if (dy > 30) return
    if (dx > 80 && status !== 'Done') { onStatusChange(task, 'Done'); return }
    if (dx < -80) setSwipeDel(true)
  }

  const entranceStyle = isJustAdded
    ? { animation: 'taskEnter 0.7s ease-out forwards' }
    : undefined

  return (
    <div
      id={`task-${task.id}`}
      className="relative bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden mb-2"
      style={entranceStyle}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Flash overlay */}
      {flashCfg && (
        <div
          className={`absolute inset-0 z-10 ${flashCfg.flashCls} flex items-center justify-center rounded-xl`}
          style={{ animation: 'taskFlash 0.68s ease-out forwards' }}
        >
          <span className="text-white font-bold" style={{ fontSize: '2rem', animation: 'taskFlashIcon 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
            {flashCfg.icon}
          </span>
        </div>
      )}

      {/* Left accent */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />

      {/* Top-right buttons: copy + star */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5">
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors"
          aria-label="Copy task"
          style={{ minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {copied
            ? <Check size={13} className="text-green-500" />
            : <Copy size={13} />
          }
        </button>
        <button
          onClick={e => { e.stopPropagation(); onStarToggle(task) }}
          className="p-1.5"
          aria-label={isStarred ? 'Unstar task' : 'Star task'}
          style={{ minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Star size={14} className={isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-300'} />
        </button>
      </div>

      <div className="pl-3 pr-20 pt-3 pb-2">
        {/* Title */}
        <button className="w-full text-left" onClick={() => setExpanded(e => !e)}>
          <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
            {title}
          </p>
        </button>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${modulePillCls}`}>{module}</span>
          {chip && !isDone && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${chip.cls}`}>{chip.label}</span>
          )}
          {isDone && completedLabel && (
            <span className="text-[11px] text-slate-400">{completedLabel}</span>
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

        {/* Inline status pills */}
        <div className="flex gap-1 mt-2 flex-wrap">
          {ALL_STATUSES.map(s => {
            const active = s === status
            return (
              <button
                key={s}
                onClick={e => { e.stopPropagation(); if (s !== status) onStatusChange(task, s) }}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                  active
                    ? s === 'To Do'       ? 'bg-slate-800  text-white border-slate-800'
                    : s === 'In Progress' ? 'bg-blue-600   text-white border-blue-600'
                    :                       'bg-green-600  text-white border-green-600'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400 hover:text-slate-600'
                }`}
              >
                {STATUS_CONFIG[s].label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-slate-100 px-3 py-3 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Title</label>
            <input
              value={localTitle}
              onChange={e => setLocalTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            {savingTitle && <p className="text-[10px] text-slate-400 mt-0.5">Saving…</p>}
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Description</label>
            <textarea
              value={localBody}
              onChange={e => setLocalBody(e.target.value)}
              onBlur={saveBody}
              rows={2}
              placeholder="Add description…"
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
            />
            {savingBody && <p className="text-[10px] text-slate-400 mt-0.5">Saving…</p>}
          </div>

          {/* Due date editor */}
          {!isDone && (
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Due Date</label>
              <div className="flex gap-1.5 mb-1.5">
                {[['Today', 0], ['Tomorrow', 1], ['Next week', 7]].map(([label, days]) => {
                  const val = (() => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0,10) })()
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setDuePreset(days)}
                      className={`flex-1 text-[11px] font-medium px-1.5 py-1 rounded-md border transition-colors ${
                        localDue === val
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-1.5 items-center">
                <input
                  type="date"
                  value={localDue}
                  onChange={e => handleDueChange(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
                {localDue && (
                  <button
                    type="button"
                    onClick={() => handleDueChange('')}
                    className="text-[11px] text-slate-400 hover:text-red-500 px-1.5 py-1 rounded border border-slate-200 hover:border-red-300 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
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
            <button onClick={() => setExpanded(false)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              <ChevronLeft size={13} /> Back
            </button>
            <button onClick={() => onDelete(task)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 ml-auto">
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>
      )}

      {/* Swipe-left delete confirm */}
      {swipeDel && (
        <div className="border-t border-red-100 bg-red-50 px-3 py-2 flex items-center justify-between gap-2">
          <p className="text-xs text-red-700 font-medium">Delete this task?</p>
          <div className="flex gap-2">
            <button onClick={() => setSwipeDel(false)} className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-slate-100">Cancel</button>
            <button onClick={() => onDelete(task)} className="text-xs bg-red-600 text-white font-semibold px-3 py-1 rounded-lg">Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── DoneBuckets ───────────────────────────────────────────────────────────────
function DoneBuckets({ tasks, doneSearch, doneBuckets, toggleBucket, cardPropsOf }) {
  if (doneSearch.trim()) {
    const q = doneSearch.toLowerCase()
    const matches = tasks.filter(t =>
      safeStr(t.fields[FIELDS.TITLE]).toLowerCase().includes(q) ||
      safeStr(t.fields[FIELDS.BODY]).toLowerCase().includes(q) ||
      safeStr(t.fields[FIELDS.NOTES]).toLowerCase().includes(q)
    )
    if (matches.length === 0) return <p className="text-xs text-slate-400 text-center py-8">No matches</p>
    return <>{matches.map(task => <TaskCard key={task.id} task={task} {...cardPropsOf(task)} />)}</>
  }

  const buckets = bucketDoneTasks(tasks)
  return (
    <>
      {DONE_BUCKET_KEYS.map(key => {
        const items = buckets[key]
        if (items.length === 0) return null
        const isOpen = doneBuckets[key] ?? DEFAULT_BUCKETS[key]
        return (
          <div key={key} className="mb-1">
            <button
              onClick={() => toggleBucket(key)}
              className="flex items-center gap-1.5 w-full text-left py-1.5 mb-0.5 hover:bg-slate-50 rounded-lg px-1 transition-colors"
            >
              <ChevronDown size={13} className={`text-slate-400 transition-transform flex-shrink-0 ${isOpen ? '' : '-rotate-90'}`} />
              <span className="text-xs font-semibold text-slate-500">{key}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 ml-0.5">{items.length}</span>
            </button>
            {isOpen && items.map(task => <TaskCard key={task.id} task={task} {...cardPropsOf(task)} />)}
          </div>
        )
      })}
    </>
  )
}

// ── Empty column state ────────────────────────────────────────────────────────
function ColEmpty({ colKey, onAdd }) {
  if (colKey === 'todo') return (
    <div className="text-center py-10 text-slate-400">
      <p className="text-2xl mb-2">✨</p>
      <p className="text-sm font-medium text-slate-500">You're all caught up</p>
      <button onClick={onAdd} className="mt-3 text-xs text-slate-500 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-100">
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

  const [allTasks,    setAllTasks]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [activeCol,   setActiveCol]   = useState('todo')
  const [filter,      setFilter]      = useState('All')
  const [showAdd,     setShowAdd]     = useState(false)
  const [toast,       setToast]       = useState(null)
  const [flashMap,    setFlashMap]    = useState({})
  const [justAddedId, setJustAddedId] = useState(null)
  const [doneSearch,  setDoneSearch]  = useState('')
  const [quickTitle,  setQuickTitle]  = useState('')
  const [doneBuckets, setDoneBuckets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tasks:doneBuckets')) || DEFAULT_BUCKETS }
    catch { return DEFAULT_BUCKETS }
  })

  const userId = session?.user?.id

  async function loadTasks() {
    if (!userId) return
    setLoading(true); setError(null)
    try { setAllTasks(await fetchTasks(userId)) }
    catch (err) { console.error('[Tasks]', err); setError(err.message || 'Failed to load tasks') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadTasks() }, [userId]) // eslint-disable-line

  // 'N' keyboard shortcut to open add dialog
  useEffect(() => {
    function onKey(e) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'n' || e.key === 'N') setShowAdd(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function toggleBucket(key) {
    setDoneBuckets(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem('tasks:doneBuckets', JSON.stringify(next)) } catch {}
      return next
    })
  }

  function byStatus(status) {
    let tasks = allTasks.filter(t => safeStr(t.fields[FIELDS.STATUS]) === status)
    if (filter === 'today') tasks = tasks.filter(t => t.fields[FIELDS.TODAY] === true)
    else if (filter !== 'All') tasks = tasks.filter(t => safeStr(t.fields[FIELDS.MODULE]) === filter)
    return tasks.sort((a, b) =>
      (b.fields[FIELDS.TODAY] === true ? 1 : 0) - (a.fields[FIELDS.TODAY] === true ? 1 : 0)
    )
  }

  const todoCnt       = byStatus('To Do').length
  const inProgressCnt = byStatus('In Progress').length
  const doneCnt       = byStatus('Done').length
  const openCount     = todoCnt + inProgressCnt
  const overdueCount  = allTasks.filter(t =>
    safeStr(t.fields[FIELDS.STATUS]) !== 'Done' && isOverdue(safeStr(t.fields[FIELDS.DUE_DATE]))
  ).length

  function showToast(msg) { setToast(msg) }

  async function handleStatusChange(task, newStatus) {
    const today  = new Date().toISOString().slice(0, 10)
    const fields = { [FIELDS.STATUS]: newStatus }
    if (newStatus === 'Done') fields[FIELDS.COMPLETED_AT] = today
    else                      fields[FIELDS.COMPLETED_AT] = null

    const updated = { ...task, fields: { ...task.fields, ...fields } }
    setFlashMap(prev => ({ ...prev, [task.id]: newStatus }))
    const TOASTS = { 'Done': '✓ Marked complete', 'In Progress': '→ In progress', 'To Do': '↩ Moved to To Do' }
    showToast(TOASTS[newStatus] || 'Status updated')

    setTimeout(() => {
      setFlashMap(prev => { const n = { ...prev }; delete n[task.id]; return n })
      setAllTasks(prev => prev.map(t => t.id === task.id ? updated : t))
    }, 680)

    updateTask(task.id, fields).catch(() => {
      showToast('Failed to update — reverting')
      setTimeout(() => setAllTasks(prev => prev.map(t => t.id === task.id ? task : t)), 720)
    })

    if (newStatus === 'Done') {
      const sourceKey = task.fields[FIELDS.SOURCE_KEY]
      if (sourceKey) dismissLinkedNotification(sourceKey).catch(() => {})
    }
  }

  async function handleStarToggle(task) {
    const newVal  = !(task.fields[FIELDS.TODAY] === true)
    const updated = { ...task, fields: { ...task.fields, [FIELDS.TODAY]: newVal } }
    setAllTasks(prev => prev.map(t => t.id === task.id ? updated : t))
    try { await updateTask(task.id, { [FIELDS.TODAY]: newVal }) }
    catch { setAllTasks(prev => prev.map(t => t.id === task.id ? task : t)); showToast('Failed to update') }
  }

  async function handleDelete(task) {
    setAllTasks(prev => prev.filter(t => t.id !== task.id))
    showToast('Task deleted')
    try { await deleteTask(task.id) }
    catch { setAllTasks(prev => [...prev, task]); showToast('Failed to delete task') }
  }

  async function handleNotesChange(recordId, notes) {
    setAllTasks(prev => prev.map(t =>
      t.id === recordId ? { ...t, fields: { ...t.fields, [FIELDS.NOTES]: notes } } : t
    ))
    await updateTask(recordId, { [FIELDS.NOTES]: notes })
  }

  async function handleDueDateChange(recordId, dueDate) {
    setAllTasks(prev => prev.map(t =>
      t.id === recordId ? { ...t, fields: { ...t.fields, [FIELDS.DUE_DATE]: dueDate || null } } : t
    ))
    await updateTask(recordId, { [FIELDS.DUE_DATE]: dueDate || null })
  }

  async function handleTitleChange(recordId, title) {
    setAllTasks(prev => prev.map(t =>
      t.id === recordId ? { ...t, fields: { ...t.fields, [FIELDS.TITLE]: title } } : t
    ))
    try { await updateTask(recordId, { [FIELDS.TITLE]: title }) }
    catch { loadTasks(); showToast('Failed to save title') }
  }

  async function handleBodyChange(recordId, body) {
    setAllTasks(prev => prev.map(t =>
      t.id === recordId ? { ...t, fields: { ...t.fields, [FIELDS.BODY]: body } } : t
    ))
    try { await updateTask(recordId, { [FIELDS.BODY]: body }) }
    catch { loadTasks(); showToast('Failed to save description') }
  }

  async function handleAdd({ title, dueDate }) {
    const record = await createTask({ title, dueDate, module: 'Manual', userId })
    setAllTasks(prev => [...prev, record])
    setActiveCol('todo')
    setJustAddedId(record.id)
    setTimeout(() => setJustAddedId(null), 1200)
    // Scroll new card into view on mobile after render
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(`task-${record.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }))
    showToast('Task added')
  }

  async function handleQuickAdd(e) {
    e.preventDefault()
    const title = quickTitle.trim()
    if (!title) return
    setQuickTitle('')
    await handleAdd({ title })
  }

  async function handleCopyAll() {
    let tasks
    if (window.innerWidth < 768) {
      const tabMap = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }
      tasks = byStatus(tabMap[activeCol])
    } else {
      tasks = [...byStatus('To Do'), ...byStatus('In Progress'), ...byStatus('Done')]
    }
    if (tasks.length === 0) { showToast('No tasks to copy'); return }
    const text = tasks.map((t, i) => `${i + 1}. ${taskCopyText(t)}`).join('\n\n')
    try { await copyToClipboard(text); showToast(`Copied ${tasks.length} task${tasks.length !== 1 ? 's' : ''}`) }
    catch { showToast('Copy failed') }
  }

  function cardPropsOf(task) {
    return {
      flashStatus:    flashMap[task.id] || null,
      isJustAdded:    justAddedId === task.id,
      onStatusChange: handleStatusChange,
      onStarToggle:   handleStarToggle,
      onDelete:       handleDelete,
      onNotesChange:   handleNotesChange,
      onDueDateChange: handleDueDateChange,
      onTitleChange:   handleTitleChange,
      onBodyChange:    handleBodyChange,
      onToast:         showToast,
    }
  }

  const COLS_DATA = [
    { key: 'todo',        label: 'To Do',      status: 'To Do',       count: todoCnt,       headerCls: 'text-slate-700' },
    { key: 'in_progress', label: 'In Progress', status: 'In Progress', count: inProgressCnt, headerCls: 'text-blue-700'  },
    { key: 'done',        label: 'Done',        status: 'Done',        count: doneCnt,       headerCls: 'text-green-700' },
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
      {/* ── Keyframes ─────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes taskFlash {
          0%   { opacity: 1; transform: scale(1);    }
          40%  { opacity: 1; transform: scale(1.03); }
          100% { opacity: 0; transform: scale(1);    }
        }
        @keyframes taskFlashIcon {
          0%   { transform: scale(0.3) rotate(-15deg); opacity: 0; }
          60%  { transform: scale(1.25) rotate(5deg);  opacity: 1; }
          100% { transform: scale(1)   rotate(0deg);   opacity: 1; }
        }
        @keyframes taskEnter {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.97); box-shadow: 0 0 0 3px rgba(245,158,11,0.0); }
          30%  { opacity: 1; transform: translateY(0)    scale(1.01); box-shadow: 0 0 0 3px rgba(245,158,11,0.45); }
          100% { opacity: 1; transform: translateY(0)    scale(1);    box-shadow: 0 0 0 0   rgba(245,158,11,0); }
        }
      `}</style>

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 bg-slate-50 z-10">
        <div className="px-4 sm:px-6 pt-4 pb-2">
          {/* Title row */}
          <div className="flex items-center gap-3 mb-0.5">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-slate-900 leading-none">Tasks</h1>
              <p className="text-[11px] text-slate-400 hidden md:block mt-0.5">N to add</p>
            </div>

            {/* Desktop quick-add input */}
            <form onSubmit={handleQuickAdd} className="hidden md:flex flex-1 max-w-xs items-center">
              <input
                value={quickTitle}
                onChange={e => setQuickTitle(e.target.value)}
                placeholder="Quick add…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
              />
            </form>

            <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
              {/* Copy all visible */}
              <button
                onClick={handleCopyAll}
                title="Copy all visible tasks"
                className="w-8 h-8 bg-white border border-slate-200 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors"
              >
                <Copy size={15} />
              </button>
              {/* Add */}
              <button
                onClick={() => setShowAdd(true)}
                className="w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center shadow md:hidden"
              >
                <Plus size={18} />
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="hidden md:flex items-center gap-1.5 bg-slate-900 text-white text-sm font-medium px-3 py-1.5 rounded-full shadow"
              >
                <Plus size={15} /> Add
              </button>
            </div>
          </div>

          {/* Stats row */}
          <p className="text-sm text-slate-500 mb-3 mt-1">
            {openCount} open
            {overdueCount > 0 && <span className="text-red-500"> · {overdueCount} overdue</span>}
          </p>

          {/* Filter chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-hide">
            <button
              onClick={() => setFilter(f => f === 'today' ? 'All' : 'today')}
              className={`flex-none text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                filter === 'today'
                  ? 'bg-amber-400 text-white border-amber-400'
                  : 'bg-white text-amber-600 border-amber-300 hover:border-amber-400'
              }`}
            >
              ⭐ Today
            </button>
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

          {/* Mobile tab bar */}
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

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
          <span className="text-3xl">⚠️</span>
          <p className="text-sm font-semibold text-red-500">Could not load tasks</p>
          <p className="text-xs text-slate-400 max-w-xs">{error}</p>
          <button onClick={loadTasks} className="mt-2 text-xs font-bold px-4 py-2 rounded-full bg-slate-900 text-white">Retry</button>
        </div>
      )}

      {!error && (
        <>
          {/* ── Mobile: single-column tabbed ──────────────────────────────── */}
          <div className="md:hidden px-3 pt-3 pb-24">
            {activeCol === 'done' && (
              <div className="relative mb-3">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={doneSearch}
                  onChange={e => setDoneSearch(e.target.value)}
                  placeholder="Search done tasks…"
                  className="w-full pl-8 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
                />
                {doneSearch && (
                  <button onClick={() => setDoneSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                    <X size={12} />
                  </button>
                )}
              </div>
            )}
            {(() => {
              const tabMap = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }
              const status = tabMap[activeCol]
              const tasks  = byStatus(status)
              if (activeCol === 'done') {
                return tasks.length === 0
                  ? <ColEmpty colKey="done" onAdd={() => setShowAdd(true)} />
                  : <DoneBuckets tasks={tasks} doneSearch={doneSearch} doneBuckets={doneBuckets} toggleBucket={toggleBucket} cardPropsOf={cardPropsOf} />
              }
              return tasks.length === 0
                ? <ColEmpty colKey={activeCol} onAdd={() => setShowAdd(true)} />
                : tasks.map(task => <TaskCard key={task.id} task={task} {...cardPropsOf(task)} />)
            })()}
          </div>

          {/* ── Desktop: three-column kanban ──────────────────────────────── */}
          <div className="hidden md:grid md:grid-cols-3 md:gap-5 px-6 py-5 max-w-6xl mx-auto">
            {COLS_DATA.map(col => (
              <div key={col.key} className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className={`text-sm font-bold ${col.headerCls}`}>{col.label}</h2>
                  {col.count > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                      {col.count}
                    </span>
                  )}
                </div>
                {col.key === 'done' && (
                  <div className="relative mb-2">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={doneSearch}
                      onChange={e => setDoneSearch(e.target.value)}
                      placeholder="Search…"
                      className="w-full pl-7 pr-6 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
                    />
                    {doneSearch && (
                      <button onClick={() => setDoneSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                )}
                {col.key === 'done'
                  ? byStatus('Done').length === 0
                    ? <ColEmpty colKey="done" onAdd={() => setShowAdd(true)} />
                    : <DoneBuckets tasks={byStatus('Done')} doneSearch={doneSearch} doneBuckets={doneBuckets} toggleBucket={toggleBucket} cardPropsOf={cardPropsOf} />
                  : byStatus(col.status).length === 0
                    ? <ColEmpty colKey={col.key} onAdd={() => setShowAdd(true)} />
                    : byStatus(col.status).map(task => <TaskCard key={task.id} task={task} {...cardPropsOf(task)} />)
                }
              </div>
            ))}
          </div>
        </>
      )}

      {showAdd && <AddTaskDialog onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
      {toast    && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
