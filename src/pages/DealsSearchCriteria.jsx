import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { fetchAllRecords, createRecord, updateRecord, deleteRecord, FBM_BASE_ID } from '../lib/airtable'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const TABLE = 'search-items'

const emptyForm = {
  'Item Name': '',
  'Search Query': '',
  'Location': 'cookeville',
  'Radius': '',
  'Max Price': '',
  'Min Price': '',
  'Keywords Include': '',
  'Keywords Exclude': '',
  'Notes': '',
  'Active': true,
}

const arr = v => Array.isArray(v) ? v : []

function safeStr(val, fallback = '') {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'object') {
    if (val.specialValue || val.error) return fallback
    return fallback
  }
  return String(val)
}

function safeNum(val) {
  if (val === null || val === undefined || typeof val === 'object') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

export default function DealsSearchCriteria() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalItem, setModalItem] = useState(null)   // null = closed, 'new' = create, record = edit
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetchAllRecords(TABLE, {
      sort: { field: 'Item Name', direction: 'asc' },
    }, FBM_BASE_ID)
    if (res.error) {
      toast.error('Failed to load search criteria: ' + res.error)
    } else {
      setItems(res.data || [])
    }
    setLoading(false)
  }

  function openCreate() {
    setForm(emptyForm)
    setModalItem('new')
  }

  function openEdit(record) {
    const f = record.fields || {}
    setForm({
      'Item Name':         safeStr(f['Item Name']),
      'Search Query':      safeStr(f['Search Query']),
      'Location':          safeStr(f['Location'], 'cookeville'),
      'Radius':            safeNum(f['Radius']) ?? '',
      'Max Price':         safeNum(f['Max Price']) ?? '',
      'Min Price':         safeNum(f['Min Price']) ?? '',
      'Keywords Include':  safeStr(f['Keywords Include']),
      'Keywords Exclude':  safeStr(f['Keywords Exclude']),
      'Notes':             safeStr(f['Notes']),
      'Active':            f['Active'] === true,
    })
    setModalItem(record)
  }

  function closeModal() {
    setModalItem(null)
    setForm(emptyForm)
  }

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form['Item Name'].trim()) return toast.error('Item Name is required')
    if (!form['Search Query'].trim()) return toast.error('Search Query is required')
    if (!form['Location'].trim()) return toast.error('Location is required')
    setSaving(true)

    const fields = {
      'Item Name':        form['Item Name'].trim(),
      'Search Query':     form['Search Query'].trim(),
      'Location':         form['Location'].trim(),
      'Keywords Include': form['Keywords Include'].trim(),
      'Keywords Exclude': form['Keywords Exclude'].trim(),
      'Notes':            form['Notes'].trim(),
      'Active':           form['Active'],
    }
    if (form['Radius'] !== '') fields['Radius'] = Number(form['Radius'])
    if (form['Max Price'] !== '') fields['Max Price'] = Number(form['Max Price'])
    if (form['Min Price'] !== '') fields['Min Price'] = Number(form['Min Price'])

    if (modalItem === 'new') {
      const { error } = await createRecord(TABLE, fields, FBM_BASE_ID)
      if (error) { toast.error('Failed to create: ' + error); setSaving(false); return }
      toast.success(`"${fields['Item Name']}" created`)
    } else {
      const { error } = await updateRecord(TABLE, modalItem.id, fields, FBM_BASE_ID)
      if (error) { toast.error('Failed to save: ' + error); setSaving(false); return }
      toast.success('Saved')
    }

    setSaving(false)
    closeModal()
    load()
  }

  async function handleDelete(record) {
    const name = safeStr(record.fields?.['Item Name'], record.id)
    if (!confirm(`Delete "${name}"? This will stop this search from running.`)) return
    const { error } = await deleteRecord(TABLE, record.id, FBM_BASE_ID)
    if (error) { toast.error('Failed to delete: ' + error); return }
    toast.success(`"${name}" deleted`)
    setItems(prev => prev.filter(r => r.id !== record.id))
  }

  async function toggleActive(record) {
    const newVal = !(record.fields?.['Active'] === true)
    setItems(prev => prev.map(r =>
      r.id === record.id ? { ...r, fields: { ...r.fields, Active: newVal } } : r
    ))
    const { error } = await updateRecord(TABLE, record.id, { Active: newVal }, FBM_BASE_ID)
    if (error) {
      toast.error('Failed to update')
      setItems(prev => prev.map(r =>
        r.id === record.id ? { ...r, fields: { ...r.fields, Active: !newVal } } : r
      ))
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Search Criteria</h1>
          <p className="text-sm text-gray-500 mt-0.5">These searches run automatically via the Chrome extension.</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} /> Add Search
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-center px-4 py-3 font-medium text-gray-600 w-16">Active</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Item Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Search Query</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Max Price</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Matches</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No search criteria yet. Add one to get started.
                  </td>
                </tr>
              )}
              {items.map(record => {
                const f = record.fields || {}
                const isActive = f['Active'] === true
                return (
                  <tr
                    key={record.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => openEdit(record)}
                  >
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <ActiveToggle active={isActive} onChange={() => toggleActive(record)} />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {safeStr(f['Item Name'], '—')}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                      {safeStr(f['Search Query'], '—')}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {safeNum(f['Max Price']) != null ? `$${safeNum(f['Max Price']).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {safeStr(f['Location'], '—')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {arr(f['matches']).length > 0
                        ? <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{arr(f['matches']).length.toLocaleString()}</span>
                        : <span className="text-xs text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(record)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(record)}
                          className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create Modal */}
      {modalItem !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div
            className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="font-semibold text-gray-900">
                {modalItem === 'new' ? 'Add Search' : `Edit — ${safeStr(modalItem.fields?.['Item Name'])}`}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <Field label="Item Name *">
                <input
                  required
                  value={form['Item Name']}
                  onChange={e => setField('Item Name', e.target.value)}
                  placeholder="e.g. John Deere Mower"
                  className={inp}
                />
              </Field>

              <Field label="Search Query *" hint="Keywords sent to Facebook Marketplace search">
                <input
                  required
                  value={form['Search Query']}
                  onChange={e => setField('Search Query', e.target.value)}
                  placeholder="e.g. john deere mower"
                  className={inp}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Location *" hint="FB location slug">
                  <input
                    required
                    value={form['Location']}
                    onChange={e => setField('Location', e.target.value)}
                    placeholder="cookeville"
                    className={inp}
                  />
                </Field>
                <Field label="Radius (miles)" hint="Search radius on FB">
                  <input
                    type="number"
                    min={1}
                    value={form['Radius']}
                    onChange={e => setField('Radius', e.target.value)}
                    placeholder="e.g. 40"
                    className={inp}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Max Price">
                  <input
                    type="number"
                    min={0}
                    value={form['Max Price']}
                    onChange={e => setField('Max Price', e.target.value)}
                    placeholder="e.g. 2000"
                    className={inp}
                  />
                </Field>
                <Field label="Min Price">
                  <input
                    type="number"
                    min={0}
                    value={form['Min Price']}
                    onChange={e => setField('Min Price', e.target.value)}
                    placeholder="optional"
                    className={inp}
                  />
                </Field>
              </div>

              <Field label="Keywords Include" hint="Comma-separated. Listing must match at least one.">
                <input
                  value={form['Keywords Include']}
                  onChange={e => setField('Keywords Include', e.target.value)}
                  placeholder="e.g. riding, zero turn"
                  className={inp}
                />
              </Field>

              <Field label="Keywords Exclude" hint="Comma-separated. Listing is rejected if any match.">
                <input
                  value={form['Keywords Exclude']}
                  onChange={e => setField('Keywords Exclude', e.target.value)}
                  placeholder="e.g. parts, broken"
                  className={inp}
                />
              </Field>

              <Field label="Notes">
                <textarea
                  rows={2}
                  value={form['Notes']}
                  onChange={e => setField('Notes', e.target.value)}
                  placeholder="Internal notes…"
                  className={inp + ' resize-none'}
                />
              </Field>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form['Active']}
                  onChange={e => setField('Active', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-700">Active — Chrome extension runs this search</span>
              </label>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : modalItem === 'new' ? 'Create' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ActiveToggle({ active, onChange }) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
        active ? 'bg-emerald-500' : 'bg-gray-200'
      }`}
      title={active ? 'Active — click to pause' : 'Inactive — click to activate'}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
        active ? 'translate-x-4' : 'translate-x-0.5'
      }`} />
    </button>
  )
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      {children}
    </div>
  )
}
