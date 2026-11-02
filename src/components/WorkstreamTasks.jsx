import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, CalendarClock, Trash2, ListChecks, Send, StickyNote } from 'lucide-react'
import toast from 'react-hot-toast'
import { daysUntil, fmtCheckpoint, TURNOVER_TEMPLATE, turnoverSourceKey } from '../lib/workstreams'

/** Round check button with a 44px tap target. Used on cards and in the drawer. */
export function TaskCheck({ done, onToggle, label }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onToggle() }}
      aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${label}`}
      aria-pressed={done}
      className="flex-shrink-0 w-11 h-11 -ml-2 flex items-center justify-center"
    >
      <span
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors
          ${done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 bg-white'}`}
      >
        {done && <Check size={15} strokeWidth={3} />}
      </span>
    </button>
  )
}

export function ProgressBar({ done, total, className = '' }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div
      className={`h-2 rounded-full bg-gray-200 overflow-hidden ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label="Task progress"
    >
      <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function DueChip({ due, done }) {
  if (!due) return null
  const n = daysUntil(due)
  const tone = done ? 'bg-gray-100 text-gray-500'
    : n < 0 ? 'bg-red-100 text-red-700 font-semibold'
    : n <= 2 ? 'bg-amber-100 text-amber-800 font-semibold'
    : 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md ${tone}`}>
      <CalendarClock size={12} /> {fmtCheckpoint(due)}
    </span>
  )
}

function TaskEditor({ task, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(task.title)
  const [due, setDue] = useState(task.due)
  const [notes, setNotes] = useState(task.notes)
  const ref = useRef(null)
  // The list scrolls inside the drawer; bring the editor into view when it opens.
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [])
  const inputCls = 'w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-base md:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

  async function save() {
    if (!title.trim()) { toast.error('A task needs a name'); return }
    const ok = await onSave(task.id, { title, due, notes })
    if (ok) onClose()
  }

  return (
    <div ref={ref} className="ml-9 mb-3 mt-1 space-y-2 rounded-xl bg-gray-50 border border-gray-200 p-3">
      <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} aria-label="Task name" />
      <input type="date" className={inputCls} value={due} onChange={e => setDue(e.target.value)} aria-label="Due date" />
      <textarea className={inputCls} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" aria-label="Notes" />
      <div className="flex gap-2">
        <button type="button" onClick={save} className="flex-1 min-h-[44px] rounded-lg bg-blue-600 text-white text-sm font-semibold">Save</button>
        <button type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700">Cancel</button>
        <button
          type="button"
          onClick={() => { if (window.confirm(`Delete "${task.title}"?`)) onDelete(task.id) }}
          aria-label="Delete task"
          className="min-h-[44px] w-11 flex items-center justify-center rounded-lg border border-red-200 bg-white text-red-600"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  )
}

function TaskRow({ task, actions }) {
  const [editing, setEditing] = useState(false)
  return (
    <li className="border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-1">
        <TaskCheck done={task.done} onToggle={() => actions.toggle(task.id)} label={task.title} />
        <button
          type="button"
          onClick={() => setEditing(e => !e)}
          aria-expanded={editing}
          className="flex-1 min-w-0 text-left py-2.5 min-h-[44px]"
        >
          <span className={`block text-[15px] leading-snug ${task.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</span>
          {(task.due || task.notes) && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <DueChip due={task.due} done={task.done} />
              {task.notes && <StickyNote size={13} className="text-gray-400" aria-label="Has notes" />}
            </span>
          )}
        </button>
      </div>
      {editing && <TaskEditor task={task} onSave={actions.update} onDelete={actions.remove} onClose={() => setEditing(false)} />}
    </li>
  )
}

function parseLines(text) {
  return text
    .split('\n')
    .map(l => l.replace(/^\s*(?:[-*•]|\[[ xX]?\]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
}

/**
 * Checklist for one workstream.
 * Props: ws (Airtable record), tasks ({open, done, total}), actions (from useWorkstreamTasks),
 *        loading, error, onRetry
 */
export default function WorkstreamTasks({ ws, tasks, actions, loading, error, onRetry }) {
  const [showDone, setShowDone] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const isVacancy = ws.fields?.Type === 'Vacancy'

  const haveKeys = new Set([...tasks.open, ...tasks.done].map(t => t.sourceKey))
  const missingTurnover = TURNOVER_TEMPLATE.filter((_, i) => !haveKeys.has(turnoverSourceKey(ws.id, i))).length

  async function submit() {
    const titles = parseLines(draft)
    if (!titles.length || busy) return
    setBusy(true)
    const n = await actions.add(ws, titles)
    setBusy(false)
    if (n) setDraft('')
  }

  async function addTurnover() {
    setBusy(true)
    const n = await actions.applyTurnover(ws)
    setBusy(false)
    if (n) toast.success(`Added ${n} turnover task${n === 1 ? '' : 's'}`)
  }

  if (loading) return <p className="py-10 text-center text-sm text-gray-500">Loading tasks…</p>
  if (error) {
    return (
      <div className="py-10 text-center space-y-2">
        <p className="text-sm text-red-600">Couldn’t load tasks: {error}</p>
        <button onClick={onRetry} className="min-h-[44px] px-4 rounded-lg bg-blue-600 text-white text-sm font-medium">Try again</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm font-semibold text-gray-900">
            {tasks.total === 0 ? 'No tasks yet' : tasks.open.length === 0 ? 'All done 🎉' : `${tasks.done.length} of ${tasks.total} done`}
          </span>
          {tasks.total > 0 && <span className="text-xs text-gray-500">{tasks.open.length} open</span>}
        </div>
        <ProgressBar done={tasks.done.length} total={tasks.total} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4">
        {tasks.total === 0 && (
          <div className="py-8 text-center space-y-3">
            <ListChecks size={32} className="mx-auto text-gray-300" />
            <p className="text-sm text-gray-500">Type a task below, or paste a list to add several at once.</p>
            {isVacancy && (
              <button
                type="button"
                onClick={addTurnover}
                disabled={busy}
                className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                <ListChecks size={18} /> Add turnover checklist ({TURNOVER_TEMPLATE.length})
              </button>
            )}
          </div>
        )}

        {tasks.open.length > 0 && <ul>{tasks.open.map(t => <TaskRow key={t.id} task={t} actions={actions} />)}</ul>}

        {isVacancy && tasks.total > 0 && missingTurnover > 0 && (
          <button
            type="button"
            onClick={addTurnover}
            disabled={busy}
            className="my-2 min-h-[44px] text-sm font-medium text-blue-700 underline disabled:opacity-60"
          >
            Add {missingTurnover} missing turnover item{missingTurnover === 1 ? '' : 's'}
          </button>
        )}

        {tasks.done.length > 0 && (
          <div className="mt-2 mb-3">
            <button
              type="button"
              onClick={() => setShowDone(s => !s)}
              aria-expanded={showDone}
              className="flex items-center gap-1.5 min-h-[44px] text-sm font-medium text-gray-500"
            >
              <ChevronDown size={16} className={`transition-transform ${showDone ? '' : '-rotate-90'}`} />
              Done ({tasks.done.length})
            </button>
            {showDone && <ul>{tasks.done.map(t => <TaskRow key={t.id} task={t} actions={actions} />)}</ul>}
          </div>
        )}
      </div>

      <form
        onSubmit={e => { e.preventDefault(); submit() }}
        className="flex-shrink-0 flex items-end gap-2 px-4 py-3 border-t border-gray-200 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          rows={1}
          enterKeyHint="send"
          placeholder="Add a task… (paste a list to add many)"
          aria-label="New task"
          className="flex-1 min-h-[48px] max-h-32 resize-none rounded-xl border border-gray-300 px-3 py-3 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Add task"
          className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}
