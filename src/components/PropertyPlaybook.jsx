import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Plus, Pencil, Trash2, X, Copy, Check, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'
import toast from 'react-hot-toast'

// Fixed category order; anything else falls into "Other".
const CATEGORIES = ['Application Criteria', 'Policies', 'Lead Messaging', 'Other']

// Explicit Markdown element styles (no Tailwind typography plugin installed).
const MD = {
  h1: p => <h1 className="text-lg font-bold text-gray-900 mt-4 mb-2 first:mt-0" {...p} />,
  h2: p => <h2 className="text-base font-bold text-gray-900 mt-4 mb-2 first:mt-0" {...p} />,
  h3: p => <h3 className="text-sm font-semibold text-gray-900 mt-3 mb-1 first:mt-0" {...p} />,
  p: p => <p className="mb-2 leading-relaxed" {...p} />,
  ul: p => <ul className="list-disc pl-5 mb-2 space-y-1" {...p} />,
  ol: p => <ol className="list-decimal pl-5 mb-2 space-y-1" {...p} />,
  li: p => <li className="leading-relaxed" {...p} />,
  a: p => <a className="text-blue-600 underline" target="_blank" rel="noreferrer" {...p} />,
  strong: p => <strong className="font-semibold text-gray-900" {...p} />,
  blockquote: p => <blockquote className="border-l-2 border-gray-200 pl-3 italic text-gray-500 my-2" {...p} />,
  code: p => <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-[0.85em]" {...p} />,
  hr: () => <hr className="my-3 border-gray-200" />,
}
const empty = { category: 'Application Criteria', title: '', body: '', is_template: false, sort_order: 0 }

export default function PropertyPlaybook() {
  const { session, isAdmin } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState({})            // id → bool (expanded)
  const [editing, setEditing] = useState(null)    // null | 'new' | entry
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase
      .from('property_resources')
      .select('*')
      .order('category')
      .order('sort_order')
      .order('title')
    if (error) toast.error('Failed to load playbook: ' + error.message)
    else setEntries(data || [])
    setLoading(false)
  }

  function openNew() { setForm(empty); setEditing('new') }
  function openEdit(e) {
    setForm({ category: e.category, title: e.title, body: e.body || '', is_template: e.is_template, sort_order: e.sort_order || 0 })
    setEditing(e)
  }
  function close() { setEditing(null) }
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.title.trim()) return toast.error('Title is required')
    setSaving(true)
    const payload = { ...form, title: form.title.trim(), updated_at: new Date().toISOString(), updated_by: session?.user?.id || null }
    let error
    if (editing === 'new') ({ error } = await supabase.from('property_resources').insert(payload))
    else ({ error } = await supabase.from('property_resources').update(payload).eq('id', editing.id))
    if (error) toast.error(error.message)
    else { toast.success('Saved'); close(); load() }
    setSaving(false)
  }

  async function remove(e) {
    if (!confirm(`Delete "${e.title}"?`)) return
    const { error } = await supabase.from('property_resources').delete().eq('id', e.id)
    if (error) toast.error(error.message)
    else { toast.success('Deleted'); load() }
  }

  if (loading) return <LoadingSpinner />

  const grouped = CATEGORIES
    .map(cat => ({ cat, items: entries.filter(e => (CATEGORIES.includes(e.category) ? e.category : 'Other') === cat) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">Renter criteria, policies, and lead-message scripts — your reference playbook.</p>
        {isAdmin && (
          <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex-shrink-0">
            <Plus size={16} /> New entry
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <FileText className="mx-auto text-gray-300 mb-3" size={32} />
          <p className="text-gray-500 text-sm">No playbook entries yet.{isAdmin && ' Click “New entry” to add your application criteria, pet policy, or lead-message templates.'}</p>
        </div>
      ) : (
        grouped.map(group => (
          <div key={group.cat} className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {group.cat} <span className="text-gray-400 font-normal normal-case">({group.items.length})</span>
            </h2>
            <div className="space-y-3">
              {group.items.map(e => (
                <Card key={e.id} entry={e} expanded={!!open[e.id]} onToggle={() => setOpen(o => ({ ...o, [e.id]: !o[e.id] }))} isAdmin={isAdmin} onEdit={() => openEdit(e)} onDelete={() => remove(e)} />
              ))}
            </div>
          </div>
        ))
      )}

      {editing !== null && (
        <EditModal editing={editing} form={form} setField={setField} saving={saving} onSave={save} onClose={close} />
      )}
    </div>
  )
}

function Card({ entry, expanded, onToggle, isAdmin, onEdit, onDelete }) {
  const [copied, setCopied] = useState(false)

  async function copy(ev) {
    ev.stopPropagation()
    try {
      await navigator.clipboard.writeText(entry.body || '')
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 gap-3">
        <button onClick={onToggle} className="flex items-center gap-2 text-left flex-1 min-w-0">
          {expanded ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
          <span className="font-semibold text-gray-800 truncate">{entry.title}</span>
          {entry.is_template && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">Template</span>}
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          {entry.is_template && (
            <button onClick={copy} title="Copy text" className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 rounded-md px-2 py-1">
              {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}
            </button>
          )}
          {isAdmin && (
            <>
              <button onClick={onEdit} title="Edit" className="text-gray-400 hover:text-blue-600 p-1"><Pencil size={15} /></button>
              <button onClick={onDelete} title="Delete" className="text-gray-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
            </>
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4">
          {entry.body?.trim()
            ? <div className="text-sm text-gray-700"><ReactMarkdown components={MD}>{entry.body}</ReactMarkdown></div>
            : <p className="text-sm text-gray-400 italic">No content yet.</p>}
        </div>
      )}
    </div>
  )
}

function EditModal({ editing, form, setField, saving, onSave, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{editing === 'new' ? 'New entry' : 'Edit entry'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={form.category} onChange={e => setField('category', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort order</label>
              <input type="number" value={form.sort_order} onChange={e => setField('sort_order', Number(e.target.value) || 0)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input value={form.title} onChange={e => setField('title', e.target.value)} placeholder="e.g. Pet Policy" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.is_template} onChange={e => setField('is_template', e.target.checked)} className="rounded" />
            Copy-paste template (shows a “Copy” button — use for lead messages)
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content <span className="text-gray-400 font-normal">(Markdown — **bold**, - lists, # headings)</span></label>
            <textarea value={form.body} onChange={e => setField('body', e.target.value)} rows={14} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Paste your Word-doc content here…" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={onSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
