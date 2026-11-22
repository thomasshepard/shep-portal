import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchAllRecords, PM_BASE_ID } from '../lib/airtable.js'
import { useAuth } from '../hooks/useAuth.jsx'
import {
  TL_TYPES,
  TL_URGENCY,
  getTodayDate,
  createLogEntry,
  arr,
} from '../lib/tenantLog.js'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function recordIdFilter(ids) {
  if (!ids || ids.length === 0) return 'FALSE()'
  if (ids.length === 1) return `RECORD_ID()="${ids[0]}"`
  return `OR(${ids.map((id) => `RECORD_ID()="${id}"`).join(',')})`
}

function safeRender(val, fallback = '—') {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'object') {
    if (val.specialValue) return fallback
    if (val.error) return fallback
    if (Array.isArray(val)) {
      const parts = val.map((v) => (typeof v === 'object' ? (v.name || String(v.id) || '') : String(v))).filter(Boolean)
      return parts.length ? parts.join(', ') : fallback
    }
    if (val.name) return val.name
    if (val.id) return String(val.id)
    return fallback
  }
  return String(val)
}

export default function TenantLogForm({
  open,
  onClose,
  onSaved,
  propertyId,
  propertyLabel,
  properties = [],
  tenants,
}) {
  const { profile } = useAuth()

  const [selectedProperty, setSelectedProperty] = useState(propertyId || '')
  const [selectedTenant, setSelectedTenant] = useState('')
  const [type, setType] = useState(TL_TYPES[0] || 'Call')
  const [summary, setSummary] = useState('')
  const [details, setDetails] = useState('')
  const [urgency, setUrgency] = useState('Normal')
  const [date, setDate] = useState(getTodayDate())

  const [loadedTenants, setLoadedTenants] = useState([])
  const [loadingTenants, setLoadingTenants] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const effectivePropertyId = propertyId || selectedProperty

  // Reset or initialize state when modal opens or propertyId changes
  useEffect(() => {
    if (open) {
      setSelectedProperty(propertyId || '')
      setSelectedTenant('')
      setType(TL_TYPES[0] || 'Call')
      setSummary('')
      setDetails('')
      setUrgency('Normal')
      setDate(getTodayDate())
      setError(null)
    }
  }, [open, propertyId])

  // Load tenants when not explicitly provided
  useEffect(() => {
    if (tenants !== undefined && tenants !== null) {
      return
    }

    if (!open || !effectivePropertyId) {
      setLoadedTenants([])
      setLoadingTenants(false)
      return
    }

    let cancelled = false

    async function loadTenants() {
      setLoadingTenants(true)
      try {
        let unitRecords = []
        const propRecord = arr(properties).find((p) => p.id === effectivePropertyId)
        const unitIdsFromProp = arr(propRecord?.fields?.['Rental Units'])

        if (unitIdsFromProp.length > 0) {
          const unitsRes = await fetchAllRecords(
            'Rental Units',
            { filterByFormula: recordIdFilter(unitIdsFromProp) },
            PM_BASE_ID
          )
          unitRecords = arr(unitsRes.data)
        } else {
          const unitsRes = await fetchAllRecords(
            'Rental Units',
            { filterByFormula: `FIND("${effectivePropertyId}", ARRAYJOIN({Property}))` },
            PM_BASE_ID
          )
          unitRecords = arr(unitsRes.data)
        }

        if (cancelled) return

        const leaseIds = [...new Set(unitRecords.flatMap((u) => arr(u.fields?.['Lease Agreements'])))]
        if (leaseIds.length === 0) {
          if (!cancelled) {
            setLoadedTenants([])
            setLoadingTenants(false)
          }
          return
        }

        const leasesRes = await fetchAllRecords(
          'Lease Agreements',
          { filterByFormula: recordIdFilter(leaseIds) },
          PM_BASE_ID
        )
        if (cancelled) return

        const leasesData = arr(leasesRes.data)
        const activeLeases = leasesData.filter(
          (l) => (l.fields?.Status || '').toLowerCase() !== 'closed'
        )
        const tenantIds = [
          ...new Set(activeLeases.flatMap((l) => arr(l.fields?.['Tenant Management']))),
        ]

        if (tenantIds.length === 0) {
          if (!cancelled) {
            setLoadedTenants([])
            setLoadingTenants(false)
          }
          return
        }

        const tenantsRes = await fetchAllRecords(
          'Tenants',
          { filterByFormula: recordIdFilter(tenantIds) },
          PM_BASE_ID
        )
        if (cancelled) return

        if (!cancelled) {
          setLoadedTenants(arr(tenantsRes.data))
        }
      } catch (err) {
        console.error('Failed to load tenants for property:', err)
        if (!cancelled) {
          setLoadedTenants([])
        }
      } finally {
        if (!cancelled) {
          setLoadingTenants(false)
        }
      }
    }

    loadTenants()

    return () => {
      cancelled = true
    }
  }, [open, effectivePropertyId, tenants, properties])

  if (!open) return null

  const availableTenants = tenants !== undefined && tenants !== null ? tenants : loadedTenants
  const uniqueTenants = []
  const seenIds = new Set()
  for (const t of arr(availableTenants)) {
    if (t && t.id && !seenIds.has(t.id)) {
      seenIds.add(t.id)
      uniqueTenants.push(t)
    }
  }

  const fixedPropertyLabel =
    propertyLabel ||
    arr(properties).find((p) => p.id === propertyId)?.fields?.Address ||
    arr(properties).find((p) => p.id === propertyId)?.fields?.Name ||
    propertyId ||
    'Property'

  function handlePropertyChange(e) {
    setSelectedProperty(e.target.value)
    setSelectedTenant('')
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!effectivePropertyId) {
      const msg = 'Property is required'
      setError(msg)
      toast.error(msg)
      return
    }

    if (!summary.trim()) {
      const msg = 'Summary is required'
      setError(msg)
      toast.error(msg)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const loggedBy = profile?.full_name || profile?.email || ''
      const { data, error: saveError } = await createLogEntry({
        property: effectivePropertyId,
        tenant: selectedTenant || undefined,
        type,
        summary: summary.trim(),
        details: details.trim(),
        urgency,
        date: date || getTodayDate(),
        status: 'Open',
        source: 'Portal',
        loggedBy,
      })

      if (saveError) {
        setError(saveError)
        toast.error(saveError)
        setSaving(false)
        return
      }

      toast.success('Tenant log entry saved')
      if (onSaved) {
        onSaved(data)
      }
      if (onClose) {
        onClose()
      }
    } catch (err) {
      const msg = err.message || 'Failed to save log entry'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">Log Tenant Interaction</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            {/* Property & Tenant */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property <span className="text-red-500">*</span>
                </label>
                {propertyId ? (
                  <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-800 font-medium truncate">
                    {fixedPropertyLabel}
                  </div>
                ) : (
                  <select
                    value={selectedProperty}
                    onChange={handlePropertyChange}
                    className={inp}
                    required
                  >
                    <option value="">Select a property…</option>
                    {arr(properties).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fields?.Address || p.fields?.Name || p.id}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tenant <span className="text-xs text-gray-400 font-normal">(optional)</span>
                </label>
                <select
                  value={selectedTenant}
                  onChange={(e) => setSelectedTenant(e.target.value)}
                  className={inp}
                  disabled={loadingTenants}
                >
                  <option value="">
                    {loadingTenants ? 'Loading tenants…' : 'None'}
                  </option>
                  {uniqueTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {safeRender(t.fields?.Name, 'Unknown Tenant')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Type, Urgency, Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className={inp}
                >
                  {TL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  className={inp}
                >
                  {TL_URGENCY.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inp}
                />
              </div>
            </div>

            {/* Summary */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Summary <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="e.g. Kitchen sink leaking"
                className={inp}
                required
              />
            </div>

            {/* Details */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Details <span className="text-xs text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Full notes or context..."
                rows={3}
                className={inp}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
