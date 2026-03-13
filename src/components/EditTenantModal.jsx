import { useState } from 'react'
import { X } from 'lucide-react'
import { updateRecord, PM_BASE_ID } from '../lib/airtable'
import toast from 'react-hot-toast'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const APPLICATION_STATUS_OPTIONS = ['Active', 'Notice', 'Moved Out', 'Evicted', 'Broke Lease', 'Pending']
const LIFECYCLE_OPTIONS = ['Active', 'Notice', 'Dispositioned', 'Broke Lease', 'Moved Out', 'Evicted']
const LEASE_STATUS_OPTIONS = ['Open', 'Paid', 'Pending', 'Past due', 'Closed']
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
const MANAGED_BY_OPTIONS = ['Thomas Shepard - East Meadow Properties', 'Doorby']

export default function EditTenantModal({ tenant, lease, onSaved, onClose }) {
  const tf = tenant?.fields || {}
  const lf = lease?.fields || {}
  const months = lf['Months on Lease']
  const leaseTermLabel = months === 1 ? 'Month-to-Month' : months ? `${months} months` : null

  const [tenantForm, setTenantForm] = useState({
    Name: tf.Name || '',
    Email: tf.Email || '',
    'Phone number': tf['Phone number'] || '',
    'Name - Secondary': tf['Name - Secondary'] || '',
    'Email - Secondary': tf['Email - Secondary'] || '',
    'Phone number - Secondary': tf['Phone number - Secondary'] || '',
    'Stripe Customer ID': tf['Stripe Customer ID'] || '',
    'Application Status': tf['Application Status'] || '',
    'Tenant Lifecycle': tf['Tenant Lifecycle'] || '',
  })

  const [leaseForm, setLeaseForm] = useState({
    'Rent Amount': lf['Rent Amount'] != null ? lf['Rent Amount'] : '',
    'Start Date': lf['Start Date'] || '',
    'End Date': lf['End Date'] || '',
    Terms: lf.Terms || '',
    'Managed by': lf['Managed by'] || '',
    'Google Drive': lf['Google Drive'] || '',
    'Pet Rent (Dog)': lf['Pet Rent (Dog)'] != null ? lf['Pet Rent (Dog)'] : '',
    'Pet Rent (Cat)': lf['Pet Rent (Cat)'] != null ? lf['Pet Rent (Cat)'] : '',
    'Other Fees to Tenant': lf['Other Fees to Tenant'] != null ? lf['Other Fees to Tenant'] : '',
    Status: lf.Status || '',
    Note: lf.Note || '',
  })

  const [saving, setSaving] = useState(false)

  function setT(k, v) { setTenantForm(prev => ({ ...prev, [k]: v })) }
  function setL(k, v) { setLeaseForm(prev => ({ ...prev, [k]: v })) }

  async function save() {
    if (!tenantForm.Name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const updates = [updateRecord('Tenants', tenant.id, tenantForm, PM_BASE_ID)]
    if (lease) {
      updates.push(updateRecord('Lease Agreements', lease.id, {
        ...leaseForm,
        'Rent Amount': leaseForm['Rent Amount'] !== '' ? parseFloat(leaseForm['Rent Amount']) || 0 : undefined,
        'Pet Rent (Dog)': leaseForm['Pet Rent (Dog)'] !== '' ? parseFloat(leaseForm['Pet Rent (Dog)']) || 0 : undefined,
        'Pet Rent (Cat)': leaseForm['Pet Rent (Cat)'] !== '' ? parseFloat(leaseForm['Pet Rent (Cat)']) || 0 : undefined,
        'Other Fees to Tenant': leaseForm['Other Fees to Tenant'] !== '' ? parseFloat(leaseForm['Other Fees to Tenant']) || 0 : undefined,
      }, PM_BASE_ID))
    }
    const results = await Promise.all(updates)
    setSaving(false)
    const err = results.find(r => r.error)?.error
    if (err) { toast.error('Save failed: ' + err); return }
    toast.success('Saved successfully')
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[95vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">Edit Tenant — {tf.Name || 'Unknown'}</h2>
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
              <Field label="Application Status">
                <select value={tenantForm['Application Status']} onChange={e => setT('Application Status', e.target.value)} className={inp}>
                  <option value="">Select…</option>
                  {APPLICATION_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Tenant Lifecycle">
                <select value={tenantForm['Tenant Lifecycle']} onChange={e => setT('Tenant Lifecycle', e.target.value)} className={inp}>
                  <option value="">Select…</option>
                  {LIFECYCLE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
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
                <Field label="Lease Status">
                  <select value={leaseForm.Status} onChange={e => setL('Status', e.target.value)} className={inp}>
                    <option value="">Select…</option>
                    {LEASE_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                {leaseTermLabel && (
                  <Field label="Lease Term">
                    <div className={`${inp} bg-gray-50 text-gray-500 cursor-default`}>{leaseTermLabel}</div>
                  </Field>
                )}
                <Field label="Start Date">
                  <input type="date" value={leaseForm['Start Date']} onChange={e => setL('Start Date', e.target.value)} className={inp} />
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
                    <input type="number" step="0.01" min="0" value={leaseForm['Pet Rent (Dog)']} onChange={e => setL('Pet Rent (Dog)', e.target.value)} className={inp} placeholder="0.00" />
                  </Field>
                  <Field label="Pet Rent (Cat)">
                    <input type="number" step="0.01" min="0" value={leaseForm['Pet Rent (Cat)']} onChange={e => setL('Pet Rent (Cat)', e.target.value)} className={inp} placeholder="0.00" />
                  </Field>
                  <Field label="Other Fees">
                    <input type="number" step="0.01" min="0" value={leaseForm['Other Fees to Tenant']} onChange={e => setL('Other Fees to Tenant', e.target.value)} className={inp} placeholder="0.00" />
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
