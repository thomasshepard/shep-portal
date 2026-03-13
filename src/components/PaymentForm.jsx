import { useState } from 'react'
import { X } from 'lucide-react'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function PaymentForm({ record, onSave, onClose }) {
  const f = record?.fields || {}
  const [form, setForm] = useState({
    Name: f.Name || '',
    'Month Due': f['Month Due'] || '',
    'Due Date': f['Due Date'] || '',
    'Date of Payment': f['Date of Payment'] || '',
    'Invoice Amount': f['Invoice Amount'] || '',
    Status: f.Status || 'Pending',
    Notes: f.Notes || '',
  })
  const [saving, setSaving] = useState(false)

  function set(key, val) { setForm(prev => ({ ...prev, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const fields = { ...form }
    if (fields['Invoice Amount'] !== '') fields['Invoice Amount'] = parseFloat(fields['Invoice Amount']) || 0
    if (!fields['Due Date']) delete fields['Due Date']
    if (!fields['Date of Payment']) delete fields['Date of Payment']
    await onSave(fields, record?.id)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{record ? 'Edit Payment' : 'Add Payment'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field label="Name *">
            <input required value={form.Name} onChange={e => set('Name', e.target.value)} className={inp} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Month Due">
              <input value={form['Month Due']} onChange={e => set('Month Due', e.target.value)} className={inp} placeholder="e.g. March 2026" />
            </Field>
            <Field label="Amount">
              <input type="number" step="0.01" value={form['Invoice Amount']} onChange={e => set('Invoice Amount', e.target.value)} className={inp} />
            </Field>
            <Field label="Due Date">
              <input type="date" value={form['Due Date']} onChange={e => set('Due Date', e.target.value)} className={inp} />
            </Field>
            <Field label="Date of Payment">
              <input type="date" value={form['Date of Payment']} onChange={e => set('Date of Payment', e.target.value)} className={inp} />
            </Field>
          </div>
          <Field label="Status">
            <select value={form.Status} onChange={e => set('Status', e.target.value)} className={inp}>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
              <option value="Late">Late</option>
              <option value="Partial">Partial</option>
            </select>
          </Field>
          <Field label="Notes">
            <textarea value={form.Notes} onChange={e => set('Notes', e.target.value)} rows={2} className={inp} />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
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
