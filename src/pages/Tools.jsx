import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wrench, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const emptyForm = { title: '', slug: '', description: '', icon: '', content: '', is_active: true }

export default function Tools() {
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  useEffect(() => { load() }, [])

  function load() {
    supabase
      .from('pages')
      .select('id, title, slug, description, icon, is_active')
      .eq('is_active', true)
      .order('title')
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load tools')
        else setTools(data || [])
        setLoading(false)
      })
  }

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.title || !form.slug) return toast.error('Title and slug are required')
    setSaving(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('pages').insert({
      ...form,
      created_at: now,
      updated_at: now,
    })
    if (error) toast.error(error.message)
    else { toast.success('Tool created'); setShowForm(false); setForm(emptyForm); load() }
    setSaving(false)
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tools</h1>
        {isAdmin && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} /> Create Tool
          </button>
        )}
      </div>

      {tools.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Wrench size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No tools available yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {tools.map(tool => (
            <button
              key={tool.id}
              onClick={() => navigate(`/tools/${tool.slug}`)}
              className="bg-white rounded-xl border border-gray-200 p-6 text-left hover:shadow-md hover:border-blue-200 transition-all group"
            >
              <div className="text-3xl mb-3">{tool.icon || '🔧'}</div>
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600">{tool.title}</h3>
              {tool.description && <p className="text-sm text-gray-500 mt-1">{tool.description}</p>}
            </button>
          ))}
        </div>
      )}

      {/* Create Tool Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Create Tool</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Title *" value={form.title} onChange={v => setField('title', v)} />
                <Field label="Slug *" value={form.slug} onChange={v => setField('slug', v)} placeholder="e.g. my-tool" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Icon (emoji)" value={form.icon} onChange={v => setField('icon', v)} placeholder="🔧" />
                <Field label="Description" value={form.description} onChange={v => setField('description', v)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HTML Content</label>
                <textarea
                  value={form.content}
                  onChange={e => setField('content', e.target.value)}
                  rows={10}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="<!DOCTYPE html>..."
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="tool_is_active"
                  checked={form.is_active}
                  onChange={e => setField('is_active', e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="tool_is_active" className="text-sm text-gray-700">Active (visible to all users immediately)</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Create Tool'}
                </button>
              </div>
            </form>
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
