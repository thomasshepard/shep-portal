import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

const emptyForm = {
  Type: 'Annual Report',
  'Due Date': '',
  'Date Filed': '',
  Status: 'Pending',
  Cost: '',
  'Confirmation Number': '',
  Notes: '',
}

const TYPE_OPTIONS = [
  'Annual Report',
  'Registered Agent Renewal',
  'EIN Application',
  'Operating Agreement Update',
  'State Registration',
]
const STATUS_OPTIONS = ['Filed', 'Pending', 'Overdue']

export default function ComplianceForm({ initial, llcRecordId, onSave, onClose, saving }) {
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    if (initial) {
      setForm({
        Type: initial.Type || 'Annual Report',
        'Due Date': initial['Due Date'] || '',
        'Date Filed': initial['Date Filed'] || '',
        Status: initial.Status || 'Pending',
        Cost: initial.Cost ?? '',
        'Confirmation Number': initial['Confirmation Number'] || '',
        Notes: initial.Notes || '',
      })
    } else {
      setForm(emptyForm)
    }
  }, [initial])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function handleSubmit(e) {
    e.preventDefault()
    const fields = { ...form }
    if (!fields['Due Date']) delete fields['Due Date']
    if (!fields['Date Filed']) delete fields['Date Filed']
    if (fields.Cost === '' || fields.Cost == null) delete fields.Cost
    else fields.Cost = Number(fields.Cost)
    // Link to the LLC
    if (llcRecordId) fields['LLCs'] = [llcRecordId]
    onSave(fields)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{initial ? 'Edit Compliance Entry' : 'Add Compliance Entry'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <F label="Type">
              <select value={form.Type} onChange={e => set('Type', e.target.value)} className={inp}>
                {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </F>
            <F label="Status">
              <select value={form.Status} onChange={e => set('Status', e.target.value)} className={inp}>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </F>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <F label="Due Date">
              <input type="date" value={form['Due Date']} onChange={e => set('Due Date', e.target.value)} className={inp} />
            </F>
            <F label="Date Filed">
              <input type="date" value={form['Date Filed']} onChange={e => set('Date Filed', e.target.value)} className={inp} />
            </F>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <F label="Cost ($)">
              <input type="number" step="0.01" value={form.Cost} onChange={e => set('Cost', e.target.value)} className={inp} placeholder="0.00" />
            </F>
            <F label="Confirmation Number">
              <input value={form['Confirmation Number']} onChange={e => set('Confirmation Number', e.target.value)} className={inp} />
            </F>
          </div>

          <F label="Notes">
            <textarea value={form.Notes} onChange={e => set('Notes', e.target.value)} rows={3} className={inp} />
          </F>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function F({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
