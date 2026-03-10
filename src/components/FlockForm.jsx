import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import { createRecord, updateRecord, deleteRecord, CHICKENS_BASE_ID } from '../lib/airtable'
import toast from 'react-hot-toast'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

const empty = {
  Name: '',
  Breed: 'Cornish Cross',
  'Hatch Date': '',
  'Starting Count': '',
  'Current Count': '',
  Status: 'Brooding',
  'Processing Date': '',
  'Feed Type': '',
  Notes: '',
}

export default function FlockForm({ flock, onClose, onSaved }) {
  const editing = !!flock
  const [form, setForm] = useState(() => {
    if (!flock) return empty
    return {
      Name: flock.fields.Name || '',
      Breed: flock.fields.Breed || 'Cornish Cross',
      'Hatch Date': flock.fields['Hatch Date'] || '',
      'Starting Count': flock.fields['Starting Count'] ?? '',
      'Current Count': flock.fields['Current Count'] ?? '',
      Status: flock.fields.Status || 'Brooding',
      'Processing Date': flock.fields['Processing Date'] || '',
      'Feed Type': flock.fields['Feed Type'] || '',
      Notes: flock.fields.Notes || '',
    }
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.Name) return toast.error('Name is required')
    if (!form['Hatch Date']) return toast.error('Hatch Date is required')
    if (form['Starting Count'] === '') return toast.error('Starting Count is required')
    setSaving(true)

    const fields = {
      Name: form.Name,
      Breed: form.Breed,
      'Hatch Date': form['Hatch Date'],
      'Starting Count': Number(form['Starting Count']),
      'Current Count': Number(form['Current Count'] !== '' ? form['Current Count'] : form['Starting Count']),
      Status: form.Status,
      'Feed Type': form['Feed Type'] || undefined,
      Notes: form.Notes || undefined,
    }
    if (form['Processing Date']) fields['Processing Date'] = form['Processing Date']

    let result
    if (editing) {
      result = await updateRecord('Flocks', flock.id, fields, CHICKENS_BASE_ID)
    } else {
      result = await createRecord('Flocks', fields, CHICKENS_BASE_ID)
    }

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(editing ? 'Flock updated' : 'Flock created')
      onSaved()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(`Delete flock "${flock.fields.Name}"?\n\nThis also removes all feeding schedule entries, mortality logs, and flock-linked expenses. This cannot be undone.`)) return
    setDeleting(true)
    const { error } = await deleteRecord('Flocks', flock.id, CHICKENS_BASE_ID)
    if (error) {
      toast.error(error)
      setDeleting(false)
    } else {
      toast.success('Flock deleted')
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{editing ? 'Edit Flock' : 'Add Flock'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <Field label="Flock Name *">
            <input value={form.Name} onChange={e => setF('Name', e.target.value)} className={inp} placeholder="Spring 2026 Batch" required />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Breed">
              <select value={form.Breed} onChange={e => setF('Breed', e.target.value)} className={inp}>
                <option>Cornish Cross</option>
                <option>Freedom Ranger</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={form.Status} onChange={e => setF('Status', e.target.value)} className={inp}>
                <option>Brooding</option>
                <option>Growing</option>
                <option>Ready to Process</option>
                <option>Processed</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Hatch Date *">
              <input type="date" value={form['Hatch Date']} onChange={e => setF('Hatch Date', e.target.value)} className={inp} required />
            </Field>
            <Field label="Processing Date">
              <input type="date" value={form['Processing Date']} onChange={e => setF('Processing Date', e.target.value)} className={inp} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Starting Count *">
              <input type="number" min="0" value={form['Starting Count']} onChange={e => setF('Starting Count', e.target.value)} className={inp} placeholder="25" required />
            </Field>
            <Field label="Current Count *">
              <input type="number" min="0" value={form['Current Count']} onChange={e => setF('Current Count', e.target.value)} className={inp} placeholder="25" required />
            </Field>
          </div>

          <Field label="Feed Type">
            <input value={form['Feed Type']} onChange={e => setF('Feed Type', e.target.value)} className={inp} placeholder="Purina Start & Grow" />
          </Field>

          <Field label="Notes">
            <textarea value={form.Notes} onChange={e => setF('Notes', e.target.value)} className={inp} rows={3} />
          </Field>

          <div className="flex items-center justify-between pt-2">
            {editing ? (
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 disabled:opacity-50">
                <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete Flock'}
              </button>
            ) : <span />}

            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Flock'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
