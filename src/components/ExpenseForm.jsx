import { useState, useEffect } from 'react'
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

const empty = {
  date: today(),
  category: 'Feed',
  description: '',
  amount: '',
  quantity: '',
  unitCost: '',
  flockId: '',
  vendor: '',
  notes: '',
}

export default function ExpenseForm({ expense, flocks, onClose, onSaved }) {
  const editing = !!expense
  const [form, setForm] = useState(() => {
    if (!expense) return empty
    const flockId = expense.fields.Flock?.[0] || ''
    return {
      date: expense.fields.Date || today(),
      category: expense.fields.Category || 'Feed',
      description: expense.fields.Description || '',
      amount: expense.fields.Amount ?? '',
      quantity: expense.fields.Quantity ?? '',
      unitCost: expense.fields['Unit Cost'] ?? '',
      flockId,
      vendor: expense.fields.Vendor || '',
      notes: expense.fields.Notes || '',
    }
  })
  const [saving, setSaving] = useState(false)

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Auto-compute unit cost
  useEffect(() => {
    const amt = parseFloat(form.amount)
    const qty = parseFloat(form.quantity)
    if (amt > 0 && qty > 0) {
      setF('unitCost', (amt / qty).toFixed(2))
    }
  }, [form.amount, form.quantity])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.description) return toast.error('Description is required')
    if (!form.amount) return toast.error('Amount is required')
    setSaving(true)

    const fields = {
      Date: form.date,
      Category: form.category,
      Description: form.description,
      Amount: parseFloat(form.amount),
      Vendor: form.vendor || undefined,
      Notes: form.notes || undefined,
    }
    if (form.quantity) fields.Quantity = parseFloat(form.quantity)
    if (form.unitCost) fields['Unit Cost'] = parseFloat(form.unitCost)
    if (form.flockId) fields.Flock = [{ id: form.flockId }]

    let result
    if (editing) {
      result = await updateRecord('Chicken Expenses', expense.id, fields, CHICKENS_BASE_ID)
    } else {
      result = await createRecord('Chicken Expenses', fields, CHICKENS_BASE_ID)
    }

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(editing ? 'Expense updated' : 'Expense added')
      onSaved()
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{editing ? 'Edit Expense' : 'Add Expense'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">
              <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} className={inp} required />
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={e => setF('category', e.target.value)} className={inp}>
                <option>Chicks</option>
                <option>Feed</option>
                <option>Equipment</option>
                <option>Bedding</option>
                <option>Supplements/Medication</option>
                <option>Processing</option>
                <option>Utilities</option>
                <option>Other</option>
              </select>
            </Field>
          </div>

          <Field label="Description *">
            <input value={form.description} onChange={e => setF('description', e.target.value)} className={inp}
              placeholder="50-lb bag Purina Start & Grow" required />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Amount ($) *">
              <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setF('amount', e.target.value)} className={inp} placeholder="0.00" required />
            </Field>
            <Field label="Quantity">
              <input type="number" min="0" step="any" value={form.quantity} onChange={e => setF('quantity', e.target.value)} className={inp} placeholder="1" />
            </Field>
            <Field label="Unit Cost">
              <input type="number" min="0" step="0.01" value={form.unitCost} onChange={e => setF('unitCost', e.target.value)} className={inp} placeholder="auto" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Flock (optional)">
              <select value={form.flockId} onChange={e => setF('flockId', e.target.value)} className={inp}>
                <option value="">None / General</option>
                {flocks.map(f => (
                  <option key={f.id} value={f.id}>{f.fields.Name}</option>
                ))}
              </select>
            </Field>
            <Field label="Vendor">
              <input value={form.vendor} onChange={e => setF('vendor', e.target.value)} className={inp} placeholder="Tractor Supply" />
            </Field>
          </div>

          <Field label="Notes">
            <input value={form.notes} onChange={e => setF('notes', e.target.value)} className={inp} />
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
