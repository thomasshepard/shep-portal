import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, MessageCircle, Code2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import LoadingSpinner from '../../components/LoadingSpinner'
import toast from 'react-hot-toast'

const empty = {
  name: '', purpose: '', status: 'active', host: '',
  repo_url: '', contact_label: '', contact_url: '', model_provider: '', notes: '',
}

const STATUS_STYLES = {
  active:  { dot: 'bg-green-500', label: 'Active' },
  stale:   { dot: 'bg-amber-500', label: 'Stale' },
  offline: { dot: 'bg-gray-400',  label: 'Offline' },
}

export default function AdminAgents() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | agent object
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('agents').select('*').order('sort_order').order('name')
    if (error) toast.error('Failed to load agents')
    else setAgents(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() { setForm(empty); setEditing('new') }
  function openEdit(a) {
    setForm({
      name: a.name, purpose: a.purpose || '', status: a.status, host: a.host || '',
      repo_url: a.repo_url || '', contact_label: a.contact_label || '', contact_url: a.contact_url || '',
      model_provider: a.model_provider || '', notes: a.notes || '',
    })
    setEditing(a)
  }
  function close() { setEditing(null) }
  function setField(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function save() {
    if (!form.name.trim()) return toast.error('Name is required')
    setSaving(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    const { error } = editing === 'new'
      ? await supabase.from('agents').insert(payload)
      : await supabase.from('agents').update(payload).eq('id', editing.id)
    if (error) toast.error(error.message)
    else { toast.success('Saved'); close(); load() }
    setSaving(false)
  }

  async function remove(id) {
    if (!confirm('Remove this agent from the fleet list?')) return
    const { error } = await supabase.from('agents').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Removed'); load() }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Fleet</h1>
          <p className="text-sm text-gray-500 mt-1">Where your agents live and how to reach them.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus size={16} /> Add Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 text-sm">
          No agents yet. Add one above.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map(a => {
            const st = STATUS_STYLES[a.status] || STATUS_STYLES.offline
            return (
              <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                    <p className="font-medium text-gray-900 truncate">{a.name}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(a)} className="text-gray-300 hover:text-blue-500"><Pencil size={15} /></button>
                    <button onClick={() => remove(a.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                </div>

                {a.purpose && <p className="text-sm text-gray-500 mt-2">{a.purpose}</p>}

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {a.host && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{a.host}</span>}
                  {a.model_provider && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{a.model_provider}</span>}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{st.label}</span>
                </div>

                {(a.contact_url || a.repo_url) && (
                  <div className="flex gap-2 mt-4">
                    {a.contact_url && (
                      <a href={a.contact_url} target="_blank" rel="noreferrer"
                         className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-gray-200 rounded-lg py-2 text-gray-700 hover:bg-gray-50">
                        <MessageCircle size={13} /> {a.contact_label || 'Message'}
                      </a>
                    )}
                    {a.repo_url && (
                      <a href={a.repo_url} target="_blank" rel="noreferrer"
                         className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-gray-200 rounded-lg py-2 text-gray-700 hover:bg-gray-50">
                        <Code2 size={13} /> Repo
                      </a>
                    )}
                  </div>
                )}

                {a.notes && <p className="text-xs text-gray-400 mt-3 border-t border-gray-100 pt-2">{a.notes}</p>}
              </div>
            )
          })}
        </div>
      )}

      {editing !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">{editing === 'new' ? 'Add Agent' : 'Edit Agent'}</h2>
              <button onClick={close} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Name" value={form.name} onChange={v => setField('name', v)} placeholder="Hermes — ops and VPS" />
              <Field label="Purpose" value={form.purpose} onChange={v => setField('purpose', v)} placeholder="What it's for, in a sentence" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setField('status', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">Active</option>
                    <option value="stale">Stale</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>
                <Field label="Host" value={form.host} onChange={v => setField('host', v)} placeholder="Hostinger srv962330" />
              </div>
              <Field label="Model / provider" value={form.model_provider} onChange={v => setField('model_provider', v)} placeholder="Claude, or DeepSeek via OpenRouter" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Contact label" value={form.contact_label} onChange={v => setField('contact_label', v)} placeholder="Telegram" />
                <Field label="Contact URL" value={form.contact_url} onChange={v => setField('contact_url', v)} placeholder="https://t.me/..." />
              </div>
              <Field label="Repo URL" value={form.repo_url} onChange={v => setField('repo_url', v)} placeholder="https://github.com/..." />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setField('notes', e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
