import { useEffect, useState } from 'react'
import { X, Copy, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { STATUSES, TYPES, OWNERS, workstreamToFormValues, safeUrl } from '../lib/workstreams'
import WorkstreamTasks from './WorkstreamTasks'

const inputCls =
  'w-full min-h-[44px] rounded-lg border border-gray-300 px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

/**
 * Full-screen on mobile, right-side drawer on desktop.
 * record === null means "create new". An existing record opens on its Tasks tab.
 *
 * Props:
 *   record      — Airtable workstream record or null
 *   saving      — boolean
 *   onSave      — (formValues) => Promise<boolean>  (true = close)
 *   onClose     — () => void
 *   tasks       — { open, done, total } for this workstream
 *   taskActions — actions from useWorkstreamTasks
 *   tasksLoading / tasksError / onRetryTasks — task load state
 */
export default function WorkstreamDrawer({
  record, saving, onSave, onClose,
  tasks, taskActions, tasksLoading, tasksError, onRetryTasks,
}) {
  const [form, setForm] = useState(() => workstreamToFormValues(record?.fields))
  const [error, setError] = useState('')
  const isNew = !record
  const [tab, setTab] = useState(isNew ? 'details' : 'tasks')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))
  const url = safeUrl(form.sessionUrl)

  async function copyLink() {
    if (!form.sessionUrl) return
    try {
      await navigator.clipboard.writeText(form.sessionUrl)
      toast.success('Session link copied')
    } catch {
      toast.error('Could not copy — select and copy the URL manually')
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    if (form.sessionUrl && !url) { setError('Claude session URL must start with http(s)://'); return }
    setError('')
    const ok = await onSave(form)
    if (ok) onClose()
  }

  const tabCls = active =>
    `flex-1 min-h-[48px] text-sm font-semibold border-b-2 transition-colors ${
      active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'}`

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? 'New workstream' : 'Edit workstream'}
        className="fixed z-50 bg-white shadow-2xl flex flex-col inset-0 md:inset-y-0 md:right-0 md:left-auto md:w-[480px]"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 truncate">
            {isNew ? 'New workstream' : (record.fields?.Name || 'Workstream')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        {!isNew && (
          <div className="flex border-b border-gray-200 flex-shrink-0" role="tablist">
            <button role="tab" aria-selected={tab === 'tasks'} className={tabCls(tab === 'tasks')} onClick={() => setTab('tasks')}>
              Tasks{tasks?.total ? ` · ${tasks.open.length} open` : ''}
            </button>
            <button role="tab" aria-selected={tab === 'details'} className={tabCls(tab === 'details')} onClick={() => setTab('details')}>
              Details
            </button>
          </div>
        )}

        {tab === 'tasks' && !isNew ? (
          <div className="flex-1 min-h-0">
            <WorkstreamTasks
              ws={record}
              tasks={tasks}
              actions={taskActions}
              loading={tasksLoading}
              error={tasksError}
              onRetry={onRetryTasks}
            />
          </div>
        ) : (
          <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <Field label="Name">
                <input className={inputCls} value={form.name} onChange={set('name')} autoFocus={isNew} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Type">
                  <select className={inputCls} value={form.type} onChange={set('type')}>
                    <option value="">—</option>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select className={inputCls} value={form.status} onChange={set('status')}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Owner">
                  <select className={inputCls} value={form.owner} onChange={set('owner')}>
                    <option value="">—</option>
                    {OWNERS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Next action">
                <textarea className={inputCls} rows={3} value={form.nextAction} onChange={set('nextAction')} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Waiting on">
                  <input className={inputCls} value={form.waitingOn} onChange={set('waitingOn')} />
                </Field>
                <Field label="Next checkpoint">
                  <input type="date" className={inputCls} value={form.checkpoint} onChange={set('checkpoint')} />
                </Field>
              </div>

              <Field label="Notes">
                <textarea className={inputCls} rows={6} value={form.notes} onChange={set('notes')} />
              </Field>

              <div className="rounded-xl border border-gray-200 p-3 space-y-3 bg-gray-50">
                <Field label="Claude session name">
                  <input className={inputCls} value={form.sessionName} onChange={set('sessionName')} />
                </Field>
                <Field label="Claude session URL">
                  <input
                    type="url"
                    inputMode="url"
                    className={inputCls}
                    value={form.sessionUrl}
                    onChange={set('sessionUrl')}
                    placeholder="https://claude.ai/..."
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyLink}
                    disabled={!form.sessionUrl}
                    className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <Copy size={16} /> Copy session link
                  </button>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <ExternalLink size={16} /> Open
                    </a>
                  )}
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex gap-3 px-4 py-3 border-t border-gray-200 flex-shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[48px] rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 min-h-[48px] rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
