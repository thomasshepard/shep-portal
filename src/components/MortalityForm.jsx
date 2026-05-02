import { useState } from 'react'
import { X } from 'lucide-react'
import { createRecord, updateRecord, CHICKENS_BASE_ID } from '../lib/airtable'
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

const today = () => new Date().toISOString().slice(0, 10)

export default function MortalityForm({ flock, onClose, onSaved }) {
  const [form, setForm] = useState({ date: today(), count: 1, cause: 'Unknown', notes: '' })
  const [saving, setSaving] = useState(false)

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    const count = Number(form.count)
    if (count < 1) return toast.error('Count must be at least 1')
    setSaving(true)

    // 1. Create mortality log record
    const { error: logErr } = await createRecord('Mortality log', {
      Flocks: [flock.id],
      Date: form.date,
      Count: count,
      Cause: form.cause,
      Notes: form.notes || undefined,
    }, CHICKENS_BASE_ID)

    if (logErr) {
      toast.error(logErr)
      setSaving(false)
      return
    }

    // 2. Update flock's Current Count
    const newCount = Math.max(0, (flock.fields['Current Count'] || 0) - count)
    const { error: updateErr } = await updateRecord('Flocks', flock.id, { 'Current Count': newCount }, CHICKENS_BASE_ID)

    if (updateErr) {
      toast.error('Loss recorded but count update failed: ' + updateErr)
    } else {
      toast.success(`Loss recorded — count updated to ${newCount}`)
    }

    onSaved()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">Record Loss</h2>
            <p className="text-xs text-gray-500">{flock.fields.Name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field label="Date">
            <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} className={inp} required />
          </Field>

          <Field label="Count">
            <input type="number" min="1" value={form.count} onChange={e => setF('count', e.target.value)} className={inp} />
          </Field>

          <Field label="Cause">
            <select value={form.cause} onChange={e => setF('cause', e.target.value)} className={inp}>
              <option>Unknown</option>
              <option>Leg Issues</option>
              <option>Heart Failure</option>
              <option>Predator</option>
              <option>Smothering</option>
              <option>Illness</option>
              <option>Other</option>
            </select>
          </Field>

          <Field label="Notes">
            <input value={form.notes} onChange={e => setF('notes', e.target.value)} className={inp} placeholder="Optional details" />
          </Field>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
            Feeding schedule quarts are based on your original calculation. Recalculate if bird count has changed significantly.
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Record Loss'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
