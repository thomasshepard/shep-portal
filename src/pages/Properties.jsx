import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, MapPin, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const statusColors = {
  active: 'bg-green-100 text-green-700',
  rehab: 'bg-yellow-100 text-yellow-700',
  listed: 'bg-blue-100 text-blue-700',
  sold: 'bg-gray-100 text-gray-600',
  pending: 'bg-orange-100 text-orange-700',
}

const emptyForm = {
  name: '', address: '', city: '', status: 'active',
  purchase_price: '', rehab_budget: '', arv: '', notes: '',
}

export default function Properties() {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  useEffect(() => { load() }, [])

  function load() {
    supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load properties')
        else setProperties(data || [])
        setLoading(false)
      })
  }

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.name) return toast.error('Name is required')
    setSaving(true)
    const payload = {
      name: form.name,
      address: form.address || null,
      city: form.city || null,
      status: form.status,
      purchase_price: form.purchase_price ? Number(form.purchase_price) : null,
      rehab_budget: form.rehab_budget ? Number(form.rehab_budget) : null,
      arv: form.arv ? Number(form.arv) : null,
      notes: form.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('properties').insert(payload)
    if (error) toast.error(error.message)
    else { toast.success('Property added'); setShowForm(false); setForm(emptyForm); load() }
    setSaving(false)
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
        {isAdmin && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} /> Add Property
          </button>
        )}
      </div>

      {properties.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Building2 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No properties yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map(p => (
            <div
              key={p.id}
              onClick={() => navigate(`/properties/${p.id}`)}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
            >
              {p.thumbnail_url ? (
                <img src={p.thumbnail_url} alt={p.name} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-gray-100 flex items-center justify-center">
                  <Building2 size={36} className="text-gray-300" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{p.name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[p.status] || 'bg-gray-100 text-gray-600'}`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                  <MapPin size={13} />
                  {p.address}{p.city ? `, ${p.city}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Property Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Add Property</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <Field label="Name *" value={form.name} onChange={v => setField('name', v)} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Address" value={form.address} onChange={v => setField('address', v)} />
                <Field label="City" value={form.city} onChange={v => setField('city', v)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setField('status', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="rehab">Rehab</option>
                  <option value="listed">Listed</option>
                  <option value="pending">Pending</option>
                  <option value="sold">Sold</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Purchase Price" value={form.purchase_price} onChange={v => setField('purchase_price', v)} placeholder="0" type="number" />
                <Field label="Rehab Budget" value={form.rehab_budget} onChange={v => setField('rehab_budget', v)} placeholder="0" type="number" />
                <Field label="ARV" value={form.arv} onChange={v => setField('arv', v)} placeholder="0" type="number" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setField('notes', e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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
                  {saving ? 'Saving…' : 'Add Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
