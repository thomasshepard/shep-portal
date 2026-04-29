import { useState, useEffect } from 'react'
import { Star, Trash2, ExternalLink, Copy, Check, Maximize2 } from 'lucide-react'
import { FIELDS } from '../lib/tasks'
import TaskComments from './TaskComments'

const safeStr = (v) => (v == null ? '' : String(v))

const STATUS_CONFIG = {
  'To Do':       { active: 'bg-slate-800 text-white border-slate-800' },
  'In Progress': { active: 'bg-blue-600 text-white border-blue-600' },
  'Done':        { active: 'bg-green-600 text-white border-green-600' },
}

const MODULE_PILL = {
  'Happy Cuts': 'bg-emerald-100 text-emerald-700',
  'Properties': 'bg-blue-100 text-blue-700',
  'LLC':        'bg-violet-100 text-violet-700',
  'Manual':     'bg-slate-100 text-slate-600',
}

async function copyToClipboard(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text)
  const ta = document.createElement('textarea')
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.focus(); ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

/**
 * Renders a task's full detail — used inside TaskDrawer (variant='drawer')
 * and TaskDetail page (variant='page').
 *
 * Props:
 *   task      — Airtable task record
 *   onUpdate  — async (recordId, fields) => void
 *   onDelete  — async (task) => void
 *   onClose   — () => void
 *   onToast   — (msg) => void
 *   variant   — 'drawer' | 'page'
 *   onOpenFull — () => void  (drawer variant only — navigates to /tasks/:id/full)
 *   currentUserId — string
 */
export default function TaskDetailView({
  task, onUpdate, onDelete, onClose, onToast,
  variant = 'drawer', onOpenFull, currentUserId,
}) {
  const [localTitle,  setLocalTitle]  = useState(safeStr(task.fields[FIELDS.TITLE]))
  const [localBody,   setLocalBody]   = useState(safeStr(task.fields[FIELDS.BODY]))
  const [localNotes,  setLocalNotes]  = useState(safeStr(task.fields[FIELDS.NOTES]))
  const [localDue,    setLocalDue]    = useState(safeStr(task.fields[FIELDS.DUE_DATE]))
  const [savingTitle, setSavingTitle] = useState(false)
  const [savingBody,  setSavingBody]  = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [copied,      setCopied]      = useState(false)
  const [linkCopied,  setLinkCopied]  = useState(false)

  const status    = safeStr(task.fields[FIELDS.STATUS])
  const module    = safeStr(task.fields[FIELDS.MODULE]) || 'Manual'
  const isDone    = status === 'Done'
  const isStarred = task.fields[FIELDS.TODAY] === true
  const actionUrl = safeStr(task.fields[FIELDS.ACTION_URL])
  const modulePillCls = MODULE_PILL[module] || MODULE_PILL['Manual']

  // Sync local state when task prop changes
  useEffect(() => {
    setLocalTitle(safeStr(task.fields[FIELDS.TITLE]))
    setLocalBody(safeStr(task.fields[FIELDS.BODY]))
    setLocalNotes(safeStr(task.fields[FIELDS.NOTES]))
    setLocalDue(safeStr(task.fields[FIELDS.DUE_DATE]))
  }, [task.id]) // eslint-disable-line

  async function saveTitle() {
    const trimmed = localTitle.trim()
    if (!trimmed || trimmed === safeStr(task.fields[FIELDS.TITLE])) return
    setSavingTitle(true)
    await onUpdate(task.id, { [FIELDS.TITLE]: trimmed })
    setSavingTitle(false)
  }

  async function saveBody() {
    if (localBody === safeStr(task.fields[FIELDS.BODY])) return
    setSavingBody(true)
    await onUpdate(task.id, { [FIELDS.BODY]: localBody })
    setSavingBody(false)
  }

  async function saveNotes() {
    if (localNotes === safeStr(task.fields[FIELDS.NOTES])) return
    setSavingNotes(true)
    await onUpdate(task.id, { [FIELDS.NOTES]: localNotes })
    setSavingNotes(false)
  }

  function handleDuePreset(days) {
    const d = new Date(); d.setDate(d.getDate() + days)
    const val = d.toISOString().slice(0, 10)
    setLocalDue(val)
    onUpdate(task.id, { [FIELDS.DUE_DATE]: val })
  }

  function handleDueChange(val) {
    setLocalDue(val)
    onUpdate(task.id, { [FIELDS.DUE_DATE]: val || null })
  }

  function handleStatusChange(newStatus) {
    if (newStatus === status) return
    const today  = new Date().toISOString().slice(0, 10)
    const fields = { [FIELDS.STATUS]: newStatus }
    if (newStatus === 'Done') fields[FIELDS.COMPLETED_AT] = today
    else                      fields[FIELDS.COMPLETED_AT] = null
    onUpdate(task.id, fields)
  }

  function handleStarToggle() {
    onUpdate(task.id, { [FIELDS.TODAY]: !isStarred })
  }

  async function handleCopyContent() {
    const text = [
      safeStr(task.fields[FIELDS.TITLE]),
      `Status: ${status}  Due: ${localDue || 'none'}`,
      localBody  || null,
      localNotes ? `Notes: ${localNotes}` : null,
    ].filter(Boolean).join('\n')
    try {
      await copyToClipboard(text)
      setCopied(true); setTimeout(() => setCopied(false), 1200)
      onToast('Copied to clipboard')
    } catch { onToast('Copy failed') }
  }

  async function handleCopyLink() {
    const url = `https://thomasshepard.github.io/shep-portal/#/tasks/${task.id}`
    try {
      await copyToClipboard(url)
      setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1200)
      onToast('Link copied')
    } catch { onToast('Copy failed') }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 px-5 pt-5 pb-3 border-b border-slate-100">
        <div className="flex-1 min-w-0">
          <input
            value={localTitle}
            onChange={e => setLocalTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
            className={`w-full text-lg font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-slate-400 focus:outline-none transition-colors ${isDone ? 'line-through text-slate-400' : ''}`}
            aria-label="Task title"
          />
          {savingTitle && <p className="text-[10px] text-slate-400 mt-0.5">Saving…</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Copy content */}
          <button
            onClick={handleCopyContent}
            title="Copy task content"
            className="p-1.5 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-50"
            style={{ minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
          </button>
          {/* Copy link */}
          <button
            onClick={handleCopyLink}
            title="Copy link to this task"
            className="p-1.5 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-50"
            style={{ minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {linkCopied
              ? <Check size={13} className="text-green-500" />
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            }
          </button>
          {/* Star */}
          <button
            onClick={handleStarToggle}
            title={isStarred ? 'Unstar' : 'Star for Today'}
            className="p-1.5"
            style={{ minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Star size={14} className={isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-300'} />
          </button>
          {/* Open full page (drawer variant, desktop only) */}
          {variant === 'drawer' && onOpenFull && (
            <button
              onClick={onOpenFull}
              title="Open full page"
              className="p-1.5 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-50 hidden md:flex items-center justify-center"
              style={{ minWidth: 32, minHeight: 32 }}
            >
              <Maximize2 size={13} />
            </button>
          )}
          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 ml-1"
            style={{ minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Scrollable body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Meta strip */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${modulePillCls}`}>{module}</span>
          {actionUrl && (
            <a
              href={actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-500 flex items-center gap-0.5 hover:text-slate-700"
            >
              Open <ExternalLink size={10} />
            </a>
          )}
        </div>

        {/* Status pills */}
        <div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Status</p>
          <div className="flex gap-1.5 flex-wrap">
            {Object.keys(STATUS_CONFIG).map(s => {
              const active = s === status
              return (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
                    active
                      ? STATUS_CONFIG[s].active
                      : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400 hover:text-slate-600'
                  }`}
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>

        {/* Due date */}
        {!isDone && (
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Due Date</p>
            <div className="flex gap-1.5 mb-1.5">
              {[['Today', 0], ['Tomorrow', 1], ['Next week', 7]].map(([label, days]) => {
                const val = (() => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) })()
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleDuePreset(days)}
                    className={`flex-1 text-xs font-medium px-2 py-1 rounded-lg border transition-colors ${
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
                className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              {localDue && (
                <button
                  type="button"
                  onClick={() => handleDueChange('')}
                  className="text-xs text-slate-400 hover:text-red-500 px-2 py-1 rounded border border-slate-200 hover:border-red-300 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Description</p>
          <textarea
            value={localBody}
            onChange={e => setLocalBody(e.target.value)}
            onBlur={saveBody}
            rows={3}
            placeholder="Add description…"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
          />
          {savingBody && <p className="text-[10px] text-slate-400 mt-0.5">Saving…</p>}
        </div>

        {/* Notes */}
        <div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</p>
          <textarea
            value={localNotes}
            onChange={e => setLocalNotes(e.target.value)}
            onBlur={saveNotes}
            rows={4}
            placeholder="Add notes…"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
          />
          {savingNotes && <p className="text-[10px] text-slate-400 mt-0.5">Saving…</p>}
        </div>

        {/* Comments */}
        <TaskComments taskId={task.id} taskAssigneeId={safeStr(task.fields[FIELDS.USER_ID])} currentUserId={currentUserId} taskTitle={localTitle} onToast={onToast} />

      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between">
        {variant === 'page' ? (
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">
            ← All tasks
          </button>
        ) : (
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">
            Close
          </button>
        )}
        <button
          onClick={() => onDelete(task)}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </div>
  )
}
