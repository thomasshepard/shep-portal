import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import toast from 'react-hot-toast'

const empty = { title: '', slug: '', description: '', icon: '', content: '', is_active: true }

export default function AdminContent() {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | page object
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase.from('pages').select('*').order('title')
    if (error) toast.error('Failed to load pages')
    else setPages(data || [])
    setLoading(false)
  }

  function openNew() { setForm(empty); setEditing('new') }
  function openEdit(p) { setForm({ title: p.title, slug: p.slug, description: p.description || '', icon: p.icon || '', content: p.content || '', is_active: p.is_active }); setEditing(p) }
  function close() { setEditing(null) }

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function save() {
    if (!form.title || !form.slug) return toast.error('Title and slug are required')
    setSaving(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    let error
    if (editing === 'new') {
      ({ error } = await supabase.from('pages').insert({ ...payload, created_at: new Date().toISOString() }))
    } else {
      ({ error } = await supabase.from('pages').update(payload).eq('id', editing.id))
    }
    if (error) toast.error(error.message)
    else { toast.success('Saved'); close(); load() }
    setSaving(false)
  }

  async function remove(id) {
    if (!confirm('Delete this tool?')) return
    const { error } = await supabase.from('pages').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Deleted'); load() }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Content Management</h1>
        <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus size={16} /> New Tool
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {pages.length === 0 ? (
          <p className="p-8 text-center text-gray-500 text-sm">No tools yet. Create one above.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {pages.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{p.icon || '🔧'}</span>
                  <div>
                    <p className="font-medium text-gray-800">{p.title}</p>
                    <p className="text-xs text-gray-400">/{p.slug}</p>
                  </div>
                  {!p.is_active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Hidden</span>}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-blue-600"><Pencil size={16} /></button>
                  <button onClick={() => remove(p.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {editing !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">{editing === 'new' ? 'New Tool' : 'Edit Tool'}</h2>
              <button onClick={close} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Title" value={form.title} onChange={v => setField('title', v)} />
                <Field label="Slug" value={form.slug} onChange={v => setField('slug', v)} placeholder="e.g. my-tool" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Icon (emoji)" value={form.icon} onChange={v => setField('icon', v)} placeholder="🔧" />
                <div className="flex items-center gap-2 mt-5">
                  <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setField('is_active', e.target.checked)} className="rounded" />
                  <label htmlFor="is_active" className="text-sm text-gray-700">Active (visible to users)</label>
                </div>
              </div>
              <Field label="Description" value={form.description} onChange={v => setField('description', v)} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HTML Content</label>
                <textarea
                  value={form.content}
                  onChange={e => setField('content', e.target.value)}
                  rows={12}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="<!DOCTYPE html>..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={close} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
