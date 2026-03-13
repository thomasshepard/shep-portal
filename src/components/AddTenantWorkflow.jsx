import { useState } from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { createRecord, updateRecord, PM_BASE_ID } from '../lib/airtable'
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
  { label: 'Other', value: 'other', months: null },
]

function getMonthsFromTerm(term, custom) {
  if (term === 'mtm') return 1
  if (term === 'other') return parseInt(custom) || 0
  return parseInt(term) || 0
}

function calcEndDate(startDate, months) {
  if (!startDate || !months) return ''
  const d = new Date(startDate + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

/**
 * Props:
 *   propertyId    — Airtable Property record ID
 *   propertyName  — display string
 *   unitId        — Airtable Rental Unit record ID
 *   unitName      — display string
 *   onClose       — fn
 *   onSuccess     — fn called after successful creation
 */
export default function AddTenantWorkflow({ propertyId, propertyName, unitId, unitName, onClose, onSuccess }) {
  const [step, setStep] = useState(1)

  const [tenantData, setTenantData] = useState({
    Name: '', Email: '', 'Phone number': '',
    'Name - Secondary': '', 'Email - Secondary': '', 'Phone number - Secondary': '',
    'Stripe Customer ID': '',
  })

  const [leaseData, setLeaseData] = useState({
    Name: '', 'Rent Amount': '', 'Start Date': '', 'End Date': '',
    Terms: '', 'Google Drive': '', 'Pet Rent (Dog)': '', 'Pet Rent (Cat)': '',
    'Other Fees to Tenant': '', 'Managed by': '', Note: '',
  })

  const [leaseTerm, setLeaseTerm] = useState('')
  const [leaseTermCustom, setLeaseTermCustom] = useState('')
  const [executing, setExecuting] = useState(false)
  const [execSteps, setExecSteps] = useState([])

  function setT(k, v) { setTenantData(prev => ({ ...prev, [k]: v })) }
  function setL(k, v) { setLeaseData(prev => ({ ...prev, [k]: v })) }

  function handleTermChange(val) {
    setLeaseTerm(val)
    const opt = LEASE_TERM_OPTIONS.find(o => o.value === val)
    if (opt?.months && leaseData['Start Date']) {
      setL('End Date', calcEndDate(leaseData['Start Date'], opt.months))
    }
  }

  function handleStartDateChange(val) {
    setL('Start Date', val)
    const months = getMonthsFromTerm(leaseTerm, leaseTermCustom)
    if (months && val) setL('End Date', calcEndDate(val, months))
  }

  function handleTermCustomChange(val) {
    setLeaseTermCustom(val)
    const months = parseInt(val) || 0
    if (months && leaseData['Start Date']) setL('End Date', calcEndDate(leaseData['Start Date'], months))
  }

  function validateStep1() {
    if (!tenantData.Name.trim()) { toast.error('Name is required'); return false }
    if (!tenantData.Email.trim()) { toast.error('Email is required'); return false }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(tenantData.Email)) { toast.error('Enter a valid email'); return false }
    return true
  }

  function validateStep2() {
    if (!leaseData.Name.trim()) { toast.error('Lease name is required'); return false }
    if (!leaseData['Rent Amount']) { toast.error('Rent amount is required'); return false }
    if (!leaseData['Start Date']) { toast.error('Start date is required'); return false }
    if (!leaseData['End Date']) { toast.error('End date is required'); return false }
    if (!leaseData.Terms) { toast.error('Terms are required'); return false }
    return true
  }

  function goToStep2() {
    if (!validateStep1()) return
    if (!leaseData.Name) setL('Name', tenantData.Name)
    setStep(2)
  }

  function goToStep3() {
    if (!validateStep2()) return
    setStep(3)
  }

  function addExecStep(msg, status) {
    setExecSteps(prev => {
      if (status === 'success' || status === 'error') {
        const idx = [...prev].reverse().findIndex(s => s.msg === msg && s.status === 'loading')
        if (idx >= 0) {
          const realIdx = prev.length - 1 - idx
          const next = [...prev]
          next[realIdx] = { msg, status }
          return next
        }
      }
      return [...prev, { msg, status }]
    })
  }

  async function execute() {
    setExecuting(true)
    setExecSteps([])

    // 1. Create Tenant (no "Property" field — tenant's unit is determined through lease)
    addExecStep('Creating tenant record…', 'loading')
    const tenantFields = {
      Name: tenantData.Name,
      Email: tenantData.Email,
      'Application Status': 'Active',
      'Tenant Lifecycle': 'Active',
    }
    if (tenantData['Phone number']) tenantFields['Phone number'] = tenantData['Phone number']
    if (tenantData['Name - Secondary']) tenantFields['Name - Secondary'] = tenantData['Name - Secondary']
    if (tenantData['Email - Secondary']) tenantFields['Email - Secondary'] = tenantData['Email - Secondary']
    if (tenantData['Phone number - Secondary']) tenantFields['Phone number - Secondary'] = tenantData['Phone number - Secondary']
    if (tenantData['Stripe Customer ID']) tenantFields['Stripe Customer ID'] = tenantData['Stripe Customer ID']

    const tenantRes = await createRecord('Tenants', tenantFields, PM_BASE_ID)
    if (tenantRes.error) {
      addExecStep('Creating tenant record…', 'error')
      setExecSteps(prev => [...prev, { msg: tenantRes.error, status: 'detail' }])
      setExecuting(false)
      return
    }
    const tenantId = tenantRes.data.id
    addExecStep('Creating tenant record…', 'success')

    // 2. Create Lease Agreement
    // "Property" field on Lease links to Rental Units (not Property table)
    addExecStep('Creating lease agreement…', 'loading')
    const rentAmount = parseFloat(leaseData['Rent Amount']) || 0
    const months = getMonthsFromTerm(leaseTerm, leaseTermCustom)
    const leaseFields = {
      Name: leaseData.Name,
      Email: tenantData.Email,
      Status: 'Open',
      'Rent Amount': rentAmount,
      'Lease Amount': rentAmount,
      'Property': [unitId],            // links to Rental Unit record
      'Tenant Management': [tenantId],
    }
    if (months) leaseFields['Months on Lease'] = months
    const textKeys = ['Terms', 'Google Drive', 'Managed by', 'Note', 'Start Date', 'End Date']
    textKeys.forEach(k => { if (leaseData[k]) leaseFields[k] = leaseData[k] })
    const numKeys = ['Pet Rent (Dog)', 'Pet Rent (Cat)', 'Other Fees to Tenant']
    numKeys.forEach(k => { if (leaseData[k] !== '') leaseFields[k] = parseFloat(leaseData[k]) || 0 })

    const leaseRes = await createRecord('Lease Agreements', leaseFields, PM_BASE_ID)
    if (leaseRes.error) {
      addExecStep('Creating lease agreement…', 'error')
      setExecSteps(prev => [...prev, {
        msg: `${leaseRes.error} — Tenant created (${tenantId}) but lease failed. Add lease manually.`,
        status: 'detail',
      }])
      setExecuting(false)
      return
    }
    const leaseId = leaseRes.data.id
    addExecStep('Creating lease agreement…', 'success')

    // 3. Link Tenant → Lease (Airtable auto-links the Rental Unit via the Lease's "Property" field)
    addExecStep('Linking tenant to lease…', 'loading')
    const linkRes = await updateRecord('Tenants', tenantId, { 'Lease Agreements': [leaseId] }, PM_BASE_ID)
    if (linkRes.error) {
      addExecStep('Linking tenant to lease…', 'error')
    } else {
      addExecStep('Linking tenant to lease…', 'success')
    }

    toast.success(`${tenantData.Name} added to ${unitName}!`)
    onClose()
    onSuccess()
  }

  const showFooter = !executing

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[95vh] flex flex-col shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">
            {executing ? 'Creating Tenant…'
              : step === 1 ? 'New Tenant — Step 1 of 3: Tenant Info'
              : step === 2 ? 'New Tenant — Step 2 of 3: Lease Details'
              : 'New Tenant — Step 3 of 3: Review & Confirm'}
          </h2>
          <button onClick={onClose} disabled={executing} className="text-gray-400 hover:text-gray-700 disabled:opacity-40">
            <X size={20} />
          </button>
        </div>

        {/* Step indicator */}
        {!executing && (
          <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 flex-shrink-0">
            {[1, 2, 3].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step === s ? 'bg-blue-600 text-white' : step > s ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {step > s ? <Check size={12} /> : s}
                </div>
                {i < 2 && <div className={`h-px w-8 ${step > s ? 'bg-green-400' : 'bg-gray-200'}`} />}
              </div>
            ))}
            <span className="text-xs text-gray-500 ml-2">{propertyName} — {unitName}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-blue-50 text-blue-700 text-sm px-3 py-2 rounded-lg">
                Adding tenant to: <strong>{unitName}</strong>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Full Name *">
                  <input type="text" value={tenantData.Name} onChange={e => setT('Name', e.target.value)} className={inp} placeholder="Jane Smith" />
                </FormField>
                <FormField label="Email *">
                  <input type="email" value={tenantData.Email} onChange={e => setT('Email', e.target.value)} className={inp} placeholder="jane@example.com" />
                </FormField>
                <FormField label="Phone">
                  <input type="tel" value={tenantData['Phone number']} onChange={e => setT('Phone number', e.target.value)} className={inp} placeholder="555-0123" />
                </FormField>
                <FormField label="Stripe Customer ID">
                  <input type="text" value={tenantData['Stripe Customer ID']} onChange={e => setT('Stripe Customer ID', e.target.value)} className={inp} placeholder="cus_..." />
                </FormField>
              </div>
              <p className="text-xs font-medium text-gray-500 pt-1">Secondary Contact (optional)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Name">
                  <input type="text" value={tenantData['Name - Secondary']} onChange={e => setT('Name - Secondary', e.target.value)} className={inp} />
                </FormField>
                <FormField label="Email">
                  <input type="email" value={tenantData['Email - Secondary']} onChange={e => setT('Email - Secondary', e.target.value)} className={inp} />
                </FormField>
                <FormField label="Phone">
                  <input type="tel" value={tenantData['Phone number - Secondary']} onChange={e => setT('Phone number - Secondary', e.target.value)} className={inp} />
                </FormField>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Lease Name *">
                  <input type="text" value={leaseData.Name} onChange={e => setL('Name', e.target.value)} className={inp} />
                </FormField>
                <FormField label="Rent Amount *">
                  <input type="number" step="0.01" min="0" value={leaseData['Rent Amount']} onChange={e => setL('Rent Amount', e.target.value)} className={inp} placeholder="Monthly rent" />
                </FormField>
                <FormField label="Lease Term">
                  <select value={leaseTerm} onChange={e => handleTermChange(e.target.value)} className={inp}>
                    <option value="">Select term…</option>
                    {LEASE_TERM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </FormField>
                {leaseTerm === 'other' && (
                  <FormField label="Months">
                    <input type="number" min="1" value={leaseTermCustom} onChange={e => handleTermCustomChange(e.target.value)} className={inp} placeholder="e.g. 18" />
                  </FormField>
                )}
                <FormField label="Start Date *">
                  <input type="date" value={leaseData['Start Date']} onChange={e => handleStartDateChange(e.target.value)} className={inp} />
                </FormField>
                <FormField label="End Date *">
                  <input type="date" value={leaseData['End Date']} onChange={e => setL('End Date', e.target.value)} className={inp} />
                </FormField>
                <FormField label="Terms *">
                  <select value={leaseData.Terms} onChange={e => setL('Terms', e.target.value)} className={inp}>
                    <option value="">Select terms…</option>
                    {TERMS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </FormField>
                <FormField label="Managed By">
                  <select value={leaseData['Managed by']} onChange={e => setL('Managed by', e.target.value)} className={inp}>
                    <option value="">Select…</option>
                    {MANAGED_BY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Lease Document (Google Drive URL)">
                <input type="url" value={leaseData['Google Drive']} onChange={e => setL('Google Drive', e.target.value)} className={inp} placeholder="Google Drive link to lease PDF" />
              </FormField>
              <div className="grid grid-cols-3 gap-4">
                <FormField label="Pet Rent (Dog)">
                  <input type="number" step="0.01" min="0" value={leaseData['Pet Rent (Dog)']} onChange={e => setL('Pet Rent (Dog)', e.target.value)} className={inp} />
                </FormField>
                <FormField label="Pet Rent (Cat)">
                  <input type="number" step="0.01" min="0" value={leaseData['Pet Rent (Cat)']} onChange={e => setL('Pet Rent (Cat)', e.target.value)} className={inp} />
                </FormField>
                <FormField label="Other Fees">
                  <input type="number" step="0.01" min="0" value={leaseData['Other Fees to Tenant']} onChange={e => setL('Other Fees to Tenant', e.target.value)} className={inp} />
                </FormField>
              </div>
              <FormField label="Notes">
                <textarea value={leaseData.Note} onChange={e => setL('Note', e.target.value)} rows={2} className={inp} />
              </FormField>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && !executing && (
            <div className="space-y-5">
              <ReviewSection title="Tenant">
                <ReviewRow label="Name" value={tenantData.Name} />
                <ReviewRow label="Email" value={tenantData.Email} />
                {tenantData['Phone number'] && <ReviewRow label="Phone" value={tenantData['Phone number']} />}
                {tenantData['Name - Secondary'] && (
                  <ReviewRow label="Secondary" value={`${tenantData['Name - Secondary']}${tenantData['Email - Secondary'] ? ` (${tenantData['Email - Secondary']})` : ''}`} />
                )}
                {tenantData['Stripe Customer ID'] && <ReviewRow label="Stripe ID" value={tenantData['Stripe Customer ID']} />}
              </ReviewSection>
              <ReviewSection title="Lease">
                <ReviewRow label="Name" value={leaseData.Name} />
                <ReviewRow label="Rent" value={leaseData['Rent Amount'] ? `$${Number(leaseData['Rent Amount']).toLocaleString()}/mo` : '—'} />
                {leaseTerm && (
                  <ReviewRow label="Lease Term" value={
                    LEASE_TERM_OPTIONS.find(o => o.value === leaseTerm)?.label +
                    (leaseTerm === 'other' && leaseTermCustom ? ` (${leaseTermCustom} mo)` : '')
                  } />
                )}
                <ReviewRow label="Start" value={leaseData['Start Date']} />
                <ReviewRow label="End" value={leaseData['End Date']} />
                <ReviewRow label="Terms" value={leaseData.Terms} />
                {leaseData['Google Drive'] && <ReviewRow label="Lease Doc" value="Linked" />}
                {leaseData['Managed by'] && <ReviewRow label="Managed By" value={leaseData['Managed by']} />}
                {leaseData['Pet Rent (Dog)'] && <ReviewRow label="Pet Rent (Dog)" value={`$${leaseData['Pet Rent (Dog)']}`} />}
                {leaseData['Pet Rent (Cat)'] && <ReviewRow label="Pet Rent (Cat)" value={`$${leaseData['Pet Rent (Cat)']}`} />}
                {leaseData['Other Fees to Tenant'] && <ReviewRow label="Other Fees" value={`$${leaseData['Other Fees to Tenant']}`} />}
              </ReviewSection>
              <ReviewSection title="Assignment">
                <ReviewRow label="Property" value={propertyName} />
                <ReviewRow label="Unit" value={unitName} />
              </ReviewSection>
            </div>
          )}

          {/* Execution progress */}
          {executing && (
            <div className="space-y-2 py-2">
              {execSteps.map((s, i) => (
                <div key={i} className={`flex items-start gap-3 text-sm ${s.status === 'detail' ? 'pl-8 text-xs text-gray-500' : ''}`}>
                  {s.status !== 'detail' && (
                    <span className="flex-shrink-0 mt-0.5">
                      {s.status === 'loading' && <Loader2 size={15} className="animate-spin text-blue-500" />}
                      {s.status === 'success' && <Check size={15} className="text-green-500" />}
                      {s.status === 'error' && <span className="text-red-500 font-bold text-xs">✗</span>}
                    </span>
                  )}
                  <span className={s.status === 'error' ? 'text-red-600' : s.status === 'detail' ? 'text-gray-500' : s.status === 'success' ? 'text-gray-700' : 'text-gray-400'}>
                    {s.msg}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {showFooter && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 flex-shrink-0">
            {step > 1 ? (
              <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg">
                Back
              </button>
            ) : (
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            )}
            {step < 3 && (
              <button onClick={step === 1 ? goToStep2 : goToStep3} className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700">
                Next →
              </button>
            )}
            {step === 3 && (
              <button onClick={execute} className="px-5 py-2 bg-green-600 text-white text-sm rounded-lg font-medium hover:bg-green-700">
                Create Tenant
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function FormField({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

function ReviewSection({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="bg-gray-50 rounded-lg divide-y divide-gray-100">{children}</div>
    </div>
  )
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800 text-right max-w-xs truncate">{value || '—'}</span>
    </div>
  )
}
