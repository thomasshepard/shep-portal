import { useState } from 'react'
import { X } from 'lucide-react'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function MaintenanceForm({ record, onSave, onClose }) {
  const f = record?.fields || {}
  const [form, setForm] = useState({
    Status: f.Status || '',
    Resolution: f.Resolution || '',
    'Resolution Estimate': f['Resolution Estimate'] || '',
  })
  const [saving, setSaving] = useState(false)

  function set(key, val) { setForm(prev => ({ ...prev, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const fields = { ...form }
    if (!fields['Resolution Estimate']) delete fields['Resolution Estimate']
    await onSave(fields, record.id)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Update Maintenance Request</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm font-medium text-gray-700 bg-gray-50 px-3 py-2 rounded-lg">{f.Name || 'Maintenance Request'}</p>
          <Field label="Status">
            <select value={form.Status} onChange={e => set('Status', e.target.value)} className={inp}>
              <option value="">Select status...</option>
              {['Open', 'In Progress', 'Pending Vendor', 'Scheduled', 'Completed', 'Resolved', 'Emergency'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Resolution">
            <textarea
              value={form.Resolution}
              onChange={e => set('Resolution', e.target.value)}
              rows={3}
              className={inp}
              placeholder="Describe the resolution..."
            />
          </Field>
          <Field label="Resolution Estimate">
            <input type="date" value={form['Resolution Estimate']} onChange={e => set('Resolution Estimate', e.target.value)} className={inp} />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
