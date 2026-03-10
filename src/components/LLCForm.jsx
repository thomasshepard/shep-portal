import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

const emptyForm = {
  Name: '',
  Owners: '',
  'Date Formed': '',
  Purpose: '',
  'Link to Docs': '',
  'Registered Agent': '',
  'State Incorporated': '',
  EIN: '',
  Status: 'Active',
  'Annual Report Due Date': '',
  'Annual Report Status': 'N/A',
  'Annual Report Fee': '',
  'Operating Agreement': false,
  'Bank Account': '',
  Notes: '',
}

const STATUS_OPTIONS = ['Active', 'Dissolved', 'Suspended', 'Pending']
const AR_STATUS_OPTIONS = ['Current', 'Due Soon', 'Overdue', 'N/A']

export default function LLCForm({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    if (initial) {
      setForm({
        Name: initial['Name'] || '',
        Owners: initial['Owners'] || '',
        'Date Formed': initial['Date Formed'] || '',
        Purpose: initial['Purpose'] || '',
        'Link to Docs': initial['Link to Docs'] || '',
        'Registered Agent': initial['Registered Agent'] || '',
        'State Incorporated': initial['State Incorporated'] || '',
        EIN: initial['EIN'] || '',
        Status: initial['Status'] || 'Active',
        'Annual Report Due Date': initial['Annual Report Due Date'] || '',
        'Annual Report Status': initial['Annual Report Status'] || 'N/A',
        'Annual Report Fee': initial['Annual Report Fee'] ?? '',
        'Operating Agreement': initial['Operating Agreement'] || false,
        'Bank Account': initial['Bank Account'] || '',
        Notes: initial['Notes'] || '',
      })
    }
  }, [initial])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function handleSubmit(e) {
    e.preventDefault()
    const fields = { ...form }
    if (!fields['Annual Report Fee'] && fields['Annual Report Fee'] !== 0) delete fields['Annual Report Fee']
    else fields['Annual Report Fee'] = Number(fields['Annual Report Fee'])
    if (!fields['Date Formed']) delete fields['Date Formed']
    if (!fields['Annual Report Due Date']) delete fields['Annual Report Due Date']
    onSave(fields)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-gray-900">{initial ? 'Edit LLC' : 'Add LLC'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <F label="Name *">
            <input required value={form.Name} onChange={e => set('Name', e.target.value)} className={inp} />
          </F>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <F label="Owners">
              <input value={form.Owners} onChange={e => set('Owners', e.target.value)} className={inp} placeholder="comma-separated" />
            </F>
            <F label="Date Formed">
              <input type="date" value={form['Date Formed']} onChange={e => set('Date Formed', e.target.value)} className={inp} />
            </F>
          </div>

          <F label="Purpose">
            <textarea value={form.Purpose} onChange={e => set('Purpose', e.target.value)} rows={2} className={inp} />
          </F>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <F label="State Incorporated">
              <input list="state-list" value={form['State Incorporated']} onChange={e => set('State Incorporated', e.target.value)} className={inp} />
              <datalist id="state-list">
                <option value="Wyoming" />
                <option value="Tennessee" />
                <option value="Florida" />
                <option value="Delaware" />
                <option value="Nevada" />
              </datalist>
            </F>
            <F label="EIN">
              <input value={form.EIN} onChange={e => set('EIN', e.target.value)} className={inp} placeholder="XX-XXXXXXX" />
            </F>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <F label="Status">
              <select value={form.Status} onChange={e => set('Status', e.target.value)} className={inp}>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </F>
            <F label="Registered Agent">
              <input value={form['Registered Agent']} onChange={e => set('Registered Agent', e.target.value)} className={inp} />
            </F>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <F label="Annual Report Status">
              <select value={form['Annual Report Status']} onChange={e => set('Annual Report Status', e.target.value)} className={inp}>
                {AR_STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </F>
            <F label="Annual Report Due Date">
              <input type="date" value={form['Annual Report Due Date']} onChange={e => set('Annual Report Due Date', e.target.value)} className={inp} />
            </F>
            <F label="Annual Report Fee ($)">
              <input type="number" step="0.01" value={form['Annual Report Fee']} onChange={e => set('Annual Report Fee', e.target.value)} className={inp} placeholder="0.00" />
            </F>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <F label="Bank Account">
              <input value={form['Bank Account']} onChange={e => set('Bank Account', e.target.value)} className={inp} placeholder="Bank name + last 4" />
            </F>
            <F label="Link to Docs">
              <input type="url" value={form['Link to Docs']} onChange={e => set('Link to Docs', e.target.value)} className={inp} placeholder="https://..." />
            </F>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="op_agree" checked={form['Operating Agreement']} onChange={e => set('Operating Agreement', e.target.checked)} className="rounded" />
            <label htmlFor="op_agree" className="text-sm text-gray-700">Operating Agreement on file</label>
          </div>

          <F label="Notes">
            <textarea value={form.Notes} onChange={e => set('Notes', e.target.value)} rows={3} className={inp} />
          </F>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add LLC'}
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
