import { useState } from 'react'
import { X } from 'lucide-react'
import { updateRecord, PM_BASE_ID } from '../lib/airtable'
import toast from 'react-hot-toast'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const TERMS_OPTIONS = [
  'Every 1st of the Month',
  'Every 5th of the Month',
  'Every 6th of the month',
  'Every 7th of the Month',
  'Every 17th of the Month',
  'Every 19th of the month',
  'Every 25th of the Month',
  'Every 26th of the Month',
  'Every 30th of the month',
]

const MANAGED_BY_OPTIONS = [
  'Thomas Shepard - East Meadow Properties',
  'Doorby',
  'Tevan Picket',
]

const LEASE_TERM_OPTIONS = [
  { label: 'Month-to-Month', value: 'mtm', months: 1 },
  { label: '6 Months', value: '6', months: 6 },
  { label: '12 Months', value: '12', months: 12 },
  { label: '24 Months', value: '24', months: 24 },
  { label: 'Custom', value: 'custom', months: null },
]

function termFromMonths(m) {
  if (m === 1) return 'mtm'
  if (m === 6) return '6'
  if (m === 12) return '12'
  if (m === 24) return '24'
  if (m) return 'custom'
  return ''
}

function calcEndDate(startDate, months) {
  if (!startDate || !months) return ''
  const d = new Date(startDate + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

export default function EditTenantModal({ tenant, lease, onSaved, onClose }) {
  const tf = tenant?.fields || {}
  const lf = lease?.fields || {}
  const months = typeof lf['Months on Lease'] === 'number' ? lf['Months on Lease'] : null

  const [tenantForm, setTenantForm] = useState({
    Name: tf.Name || '',
    Email: tf.Email || '',
    'Phone number': tf['Phone number'] || '',
    'Name - Secondary': tf['Name - Secondary'] || '',
    'Email - Secondary': tf['Email - Secondary'] || '',
    'Phone number - Secondary': tf['Phone number - Secondary'] || '',
    'Stripe Customer ID': tf['Stripe Customer ID'] || '',
  })

  const [leaseForm, setLeaseForm] = useState({
    'Rent Amount': lf['Rent Amount'] != null ? lf['Rent Amount'] : '',
    'Months on Lease': months || '',
    'Start Date': lf['Start Date'] || '',
    'End Date': lf['End Date'] || '',
    Terms: lf.Terms || '',
    'Managed by': lf['Managed by'] || '',
    'Google Drive': lf['Google Drive'] || '',
    'Pet Rent (Dog)': lf['Pet Rent (Dog)'] ? lf['Pet Rent (Dog)'] : '',
    'Pet Rent (Cat)': lf['Pet Rent (Cat)'] ? lf['Pet Rent (Cat)'] : '',
    'Other Fees to Tenant': lf['Other Fees to Tenant'] ? lf['Other Fees to Tenant'] : '',
    Note: lf.Note || '',
  })

  const [leaseTerm, setLeaseTerm] = useState(() => termFromMonths(months))
  const [leaseTermCustom, setLeaseTermCustom] = useState(() =>
    months && ![1, 6, 12, 24].includes(months) ? String(months) : ''
  )
  const [saving, setSaving] = useState(false)

  function setT(k, v) { setTenantForm(prev => ({ ...prev, [k]: v })) }
  function setL(k, v) { setLeaseForm(prev => ({ ...prev, [k]: v })) }

  function handleTermChange(val) {
    setLeaseTerm(val)
    const opt = LEASE_TERM_OPTIONS.find(o => o.value === val)
    if (opt?.months) {
      setL('Months on Lease', opt.months)
      if (leaseForm['Start Date']) {
        setL('End Date', calcEndDate(leaseForm['Start Date'], opt.months))
      }
    }
  }

  function handleTermCustomChange(val) {
    setLeaseTermCustom(val)
    const m = parseInt(val) || 0
    if (m) {
      setL('Months on Lease', m)
      if (leaseForm['Start Date']) setL('End Date', calcEndDate(leaseForm['Start Date'], m))
    }
  }

  function handleStartDateChange(val) {
    setL('Start Date', val)
    const m = typeof leaseForm['Months on Lease'] === 'number'
      ? leaseForm['Months on Lease']
      : parseInt(leaseForm['Months on Lease']) || 0
    if (m && val) setL('End Date', calcEndDate(val, m))
  }

  async function save() {
    if (!tenantForm.Name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const updates = [updateRecord('Tenants', tenant.id, tenantForm, PM_BASE_ID)]
    if (lease) {
      const leaseFields = {
        ...leaseForm,
        'Rent Amount': leaseForm['Rent Amount'] !== '' ? parseFloat(leaseForm['Rent Amount']) || 0 : undefined,
        'Months on Lease': leaseForm['Months on Lease'] !== '' ? parseInt(leaseForm['Months on Lease']) || undefined : undefined,
        'Pet Rent (Dog)': leaseForm['Pet Rent (Dog)'] !== '' ? parseFloat(leaseForm['Pet Rent (Dog)']) || 0 : null,
        'Pet Rent (Cat)': leaseForm['Pet Rent (Cat)'] !== '' ? parseFloat(leaseForm['Pet Rent (Cat)']) || 0 : null,
        'Other Fees to Tenant': leaseForm['Other Fees to Tenant'] !== '' ? parseFloat(leaseForm['Other Fees to Tenant']) || 0 : null,
      }
      updates.push(updateRecord('Lease Agreements', lease.id, leaseFields, PM_BASE_ID))
    }
    const results = await Promise.all(updates)
    setSaving(false)
    const err = results.find(r => r.error)?.error
    if (err) { toast.error('Save failed: ' + err); return }
    toast.success('Saved successfully')
    onSaved()
    onClose()
  }

  const leaseStatusBadge = lf.Status === 'Closed'
    ? <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">Ended</span>
    : <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">Active</span>

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[95vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-900">Edit Tenant — {tf.Name || 'Unknown'}</h2>
            {lease && leaseStatusBadge}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Tenant Info */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tenant Info</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Name *">
                <input type="text" value={tenantForm.Name} onChange={e => setT('Name', e.target.value)} className={inp} />
              </Field>
              <Field label="Email">
                <input type="email" value={tenantForm.Email} onChange={e => setT('Email', e.target.value)} className={inp} />
              </Field>
              <Field label="Phone">
                <input type="tel" value={tenantForm['Phone number']} onChange={e => setT('Phone number', e.target.value)} className={inp} />
              </Field>
              <Field label="Stripe Customer ID">
                <input type="text" value={tenantForm['Stripe Customer ID']} onChange={e => setT('Stripe Customer ID', e.target.value)} className={inp} />
              </Field>
            </div>
            <p className="text-xs font-medium text-gray-500 mt-4 mb-2">Secondary Contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Name">
                <input type="text" value={tenantForm['Name - Secondary']} onChange={e => setT('Name - Secondary', e.target.value)} className={inp} />
              </Field>
              <Field label="Email">
                <input type="email" value={tenantForm['Email - Secondary']} onChange={e => setT('Email - Secondary', e.target.value)} className={inp} />
              </Field>
              <Field label="Phone">
                <input type="tel" value={tenantForm['Phone number - Secondary']} onChange={e => setT('Phone number - Secondary', e.target.value)} className={inp} />
              </Field>
            </div>
          </section>

          {/* Lease Details */}
          {lease && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Lease Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Rent Amount">
                  <input type="number" step="0.01" min="0" value={leaseForm['Rent Amount']} onChange={e => setL('Rent Amount', e.target.value)} className={inp} />
                </Field>
                <Field label="Lease Term">
                  <select value={leaseTerm} onChange={e => handleTermChange(e.target.value)} className={inp}>
                    <option value="">Select term…</option>
                    {LEASE_TERM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                {leaseTerm === 'custom' && (
                  <Field label="Months">
                    <input type="number" min="1" value={leaseTermCustom} onChange={e => handleTermCustomChange(e.target.value)} className={inp} placeholder="e.g. 18" />
                  </Field>
                )}
                <Field label="Start Date">
                  <input type="date" value={leaseForm['Start Date']} onChange={e => handleStartDateChange(e.target.value)} className={inp} />
                </Field>
                <Field label="End Date">
                  <input type="date" value={leaseForm['End Date']} onChange={e => setL('End Date', e.target.value)} className={inp} />
                </Field>
                <Field label="Terms">
                  <select value={leaseForm.Terms} onChange={e => setL('Terms', e.target.value)} className={inp}>
                    <option value="">Select…</option>
                    {TERMS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Managed By">
                  <select value={leaseForm['Managed by']} onChange={e => setL('Managed by', e.target.value)} className={inp}>
                    <option value="">Select…</option>
                    {MANAGED_BY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-4 space-y-4">
                <Field label="Lease Document (Google Drive URL)">
                  <input type="url" value={leaseForm['Google Drive']} onChange={e => setL('Google Drive', e.target.value)} className={inp} placeholder="Google Drive link" />
                </Field>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Pet Rent (Dog)">
                    <input type="number" step="0.01" min="0" value={leaseForm['Pet Rent (Dog)']} onChange={e => setL('Pet Rent (Dog)', e.target.value)} className={inp} />
                  </Field>
                  <Field label="Pet Rent (Cat)">
                    <input type="number" step="0.01" min="0" value={leaseForm['Pet Rent (Cat)']} onChange={e => setL('Pet Rent (Cat)', e.target.value)} className={inp} />
                  </Field>
                  <Field label="Other Fees">
                    <input type="number" step="0.01" min="0" value={leaseForm['Other Fees to Tenant']} onChange={e => setL('Other Fees to Tenant', e.target.value)} className={inp} />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea value={leaseForm.Note} onChange={e => setL('Note', e.target.value)} rows={2} className={inp} />
                </Field>
              </div>
            </section>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
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
