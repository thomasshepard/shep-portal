import { useEffect, useState } from 'react'
import { fetchAllRecords, createRecord, PM_BASE_ID } from '../lib/airtable'
import { notify, getUserIdsWithPermission } from '../lib/notifications'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function MaintenanceSubmit() {
  const [properties, setProperties] = useState([])
  const [loadingProps, setLoadingProps] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    propertyId: '',
    description: '',
  })

  useEffect(() => {
    fetchAllRecords('Property', { fields: ['Address'] }, PM_BASE_ID).then(res => {
      setProperties(res.data || [])
      setLoadingProps(false)
    })
  }, [])

  function set(key, val) { setForm(prev => ({ ...prev, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name || !form.description || !form.propertyId) {
      toast.error('Please fill in all required fields')
      return
    }
    setSubmitting(true)
    const fields = {
      Name: `${form.name} — ${form.description.slice(0, 60)}`,
      'Request Notes': `Submitted by: ${form.name}\n\n${form.description}`,
      'Contact Phone': form.phone || undefined,
      'Contact Email': form.email || undefined,
      Date: new Date().toISOString().split('T')[0],
      Status: 'Open',
      Property: [form.propertyId],
    }
    // Remove undefined values
    Object.keys(fields).forEach(k => fields[k] === undefined && delete fields[k])

    const { error, data: createdRecord } = await createRecord('Maintenance Requests', fields, PM_BASE_ID)
    if (error) {
      toast.error('Failed to submit request. Please try again.')
    } else {
      setSubmitted(true)
      // Notify all users with property access
      try {
        const propName = properties.find(p => p.id === form.propertyId)?.fields?.Address || 'a property'
        const pmUserIds = await getUserIdsWithPermission('can_view_properties')
        const desc = form.description.slice(0, 80)
        const recordId = createdRecord?.records?.[0]?.id || ''
        notify({
          userIds:   pmUserIds,
          title:     `${form.name} at ${propName}: "${desc}"`,
          module:    'properties',
          category:  'properties',
          severity:  'action_needed',
          actionUrl: '/#/properties',
          sourceKey: `maint:${recordId}`,
        })
      } catch {}
    }
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <>
        <Toaster position="top-right" />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Request Submitted</h2>
            <p className="text-gray-500 text-sm">Your maintenance request has been received. We'll be in touch shortly.</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Maintenance Request</h1>
          <p className="text-sm text-gray-500 mb-6">Submit a maintenance request for your unit.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Your Name *">
              <input
                required
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className={inp}
                placeholder="Jane Smith"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  className={inp}
                  placeholder="555-0123"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  className={inp}
                  placeholder="jane@example.com"
                />
              </Field>
            </div>
            <Field label="Property *">
              {loadingProps ? (
                <p className="text-sm text-gray-500 py-2">Loading properties...</p>
              ) : (
                <select
                  required
                  value={form.propertyId}
                  onChange={e => set('propertyId', e.target.value)}
                  className={inp}
                >
                  <option value="">Select property...</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.fields?.Address || p.id}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Description *">
              <textarea
                required
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={4}
                className={inp}
                placeholder="Describe the issue in detail..."
              />
            </Field>
            <button
              type="submit"
              disabled={submitting || loadingProps}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </form>
        </div>
      </div>
    </>
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
