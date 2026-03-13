import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Edit2, X, Plus, ExternalLink, Phone, Mail } from 'lucide-react'
import { fetchAllRecords, createRecord, updateRecord, fmtCurrency, fmtPercent, fmtDate, PM_BASE_ID } from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import PaymentForm from '../components/PaymentForm'
import MaintenanceForm from '../components/MaintenanceForm'
import AddTenantWorkflow from '../components/AddTenantWorkflow'
import EditTenantModal from '../components/EditTenantModal'
import AlertsPanel from '../components/AlertsPanel'
import { useAlerts } from '../hooks/useAlerts'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  'Active': 'bg-green-100 text-green-700',
  'Occupied': 'bg-green-100 text-green-700',
  'Vacant': 'bg-gray-100 text-gray-600',
  'Rehab': 'bg-orange-100 text-orange-700',
  'Listed': 'bg-blue-100 text-blue-700',
  'Sold': 'bg-gray-100 text-gray-500',
  'Pending': 'bg-yellow-100 text-yellow-700',
}

function recordIdFilter(ids) {
  if (!ids || ids.length === 0) return 'FALSE()'
  if (ids.length === 1) return `RECORD_ID()="${ids[0]}"`
  return `OR(${ids.map(id => `RECORD_ID()="${id}"`).join(',')})`
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// Always returns an array — Airtable linked/rollup/lookup fields can return
// non-array values (objects, null) when a record has no linked items.
const arr = v => Array.isArray(v) ? v : []

export default function PropertyDetail() {
  const { id } = useParams()
  const { isAdmin, isVA, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [property, setProperty] = useState(null)
  const [rentalUnits, setRentalUnits] = useState([])
  const [leases, setLeases] = useState([])
  const [tenants, setTenants] = useState([])
  const [leaseInvoices, setLeaseInvoices] = useState([])
  const [invoicePayments, setInvoicePayments] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [utilities, setUtilities] = useState([])
  const [bills, setBills] = useState([])
  const [loans, setLoans] = useState([])

  const [editingProperty, setEditingProperty] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [utilitiesOpen, setUtilitiesOpen] = useState(false)
  const [billsOpen, setBillsOpen] = useState(false)
  const [paymentModal, setPaymentModal] = useState(null)
  const [maintModal, setMaintModal] = useState(null)
  const [expandedMaint, setExpandedMaint] = useState(new Set())
  const [addTenantUnit, setAddTenantUnit] = useState(null)   // rental unit record or null
  const [editTenantData, setEditTenantData] = useState(null) // { tenant, lease } or null
  const unitsRef = useRef(null)

  const userName = profile?.full_name || profile?.email || 'Unknown'
  const { alerts, dismiss, restore } = useAlerts(
    { properties: property ? [property] : [], rentalUnits, leases, tenants, invoicePayments, maintenance, loans },
    userName
  )

  useEffect(() => { load() }, [id])

  function handleWorkflowSuccess() {
    load().then(() => {
      setTimeout(() => {
        unitsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    })
  }

  async function load() {
    setLoading(true)
    try {
      // 1. Fetch the Property record
      const propRes = await fetchAllRecords('Property', { filterByFormula: `RECORD_ID()="${id}"` }, PM_BASE_ID)
      if (propRes.error) throw new Error(propRes.error)
      const prop = propRes.data?.[0]
      if (!prop) throw new Error('Property not found')
      setProperty(prop)

      const f = prop.fields || {}
      const unitIds = arr(f['Rental Units'])
      const loanIds = arr(f['Current Loans'])
      const billIds = arr(f['Bills Payment'])
      const utilIds = arr(f['Utilities'])
      const invPayIds = arr(f['Invoices Payments'])

      // 2. Fetch Rental Units + other property-linked data in parallel
      const [unitsRes, invPayRes, maintRes, utilRes, loansRes, billsRes] = await Promise.all([
        unitIds.length > 0
          ? fetchAllRecords('Rental Units', { filterByFormula: recordIdFilter(unitIds) }, PM_BASE_ID)
          : Promise.resolve({ data: [] }),
        invPayIds.length > 0
          ? fetchAllRecords('Invoices Payments', { filterByFormula: recordIdFilter(invPayIds) }, PM_BASE_ID)
          : Promise.resolve({ data: [] }),
        fetchAllRecords('Maintenance Requests', { filterByFormula: `FIND("${id}", ARRAYJOIN({Property}))` }, PM_BASE_ID),
        utilIds.length > 0
          ? fetchAllRecords('Utilities', { filterByFormula: recordIdFilter(utilIds) }, PM_BASE_ID)
          : Promise.resolve({ data: [] }),
        isAdmin && loanIds.length > 0
          ? fetchAllRecords('Current Loans', { filterByFormula: recordIdFilter(loanIds) }, PM_BASE_ID)
          : Promise.resolve({ data: [] }),
        isAdmin && billIds.length > 0
          ? fetchAllRecords('Bills Payment', { filterByFormula: recordIdFilter(billIds) }, PM_BASE_ID)
          : Promise.resolve({ data: [] }),
      ])

      const units = unitsRes.data || []
      setRentalUnits(units)
      setInvoicePayments(invPayRes.data || [])
      setMaintenance(maintRes.data || [])
      setUtilities(utilRes.data || [])
      setLoans(loansRes.data || [])
      setBills(billsRes.data || [])

      // 3. Fetch Lease Agreements for all units
      const leaseIds = [...new Set(units.flatMap(u => arr(u.fields?.['Lease Agreements'])))]
      if (leaseIds.length === 0) {
        setLeases([])
        setTenants([])
        setLeaseInvoices([])
        return
      }

      const leasesRes = await fetchAllRecords('Lease Agreements', { filterByFormula: recordIdFilter(leaseIds) }, PM_BASE_ID)
      const leasesData = leasesRes.data || []
      setLeases(leasesData)

      // 4. Fetch Tenants from active leases (Status != "Closed")
      const activeLeases = leasesData.filter(l => (l.fields?.Status || '').toLowerCase() !== 'closed')
      const tenantIds = [...new Set(activeLeases.flatMap(l => arr(l.fields?.['Tenant Management'])))]
      const leaseInvIds = [...new Set(leasesData.flatMap(l => arr(l.fields?.['Lease Invoice'])))]

      const [tenantsRes, leaseInvRes] = await Promise.all([
        tenantIds.length > 0
          ? fetchAllRecords('Tenants', { filterByFormula: recordIdFilter(tenantIds) }, PM_BASE_ID)
          : Promise.resolve({ data: [] }),
        leaseInvIds.length > 0
          ? fetchAllRecords('Lease Invoice', { filterByFormula: recordIdFilter(leaseInvIds) }, PM_BASE_ID)
          : Promise.resolve({ data: [] }),
      ])
      setTenants(tenantsRes.data || [])
      setLeaseInvoices(leaseInvRes.data || [])
    } catch (e) {
      toast.error('Failed to load property: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function savePropertyEdit() {
    setSaving(true)
    const { error } = await updateRecord('Property', id, editForm, PM_BASE_ID)
    if (error) {
      toast.error('Failed to save: ' + error)
    } else {
      toast.success('Property updated')
      setProperty(prev => ({ ...prev, fields: { ...prev.fields, ...editForm } }))
      setEditingProperty(false)
    }
    setSaving(false)
  }

  async function handlePaymentSave(fields, recordId) {
    if (recordId) {
      const { error } = await updateRecord('Invoices Payments', recordId, fields, PM_BASE_ID)
      if (error) { toast.error('Failed to update: ' + error); return }
      toast.success('Payment updated')
      setInvoicePayments(prev => prev.map(p => p.id === recordId ? { ...p, fields: { ...p.fields, ...fields } } : p))
    } else {
      const { data, error } = await createRecord('Invoices Payments', { ...fields, Property: [id] }, PM_BASE_ID)
      if (error) { toast.error('Failed to create: ' + error); return }
      toast.success('Payment added')
      if (data) setInvoicePayments(prev => [...prev, data])
    }
    setPaymentModal(null)
  }

  async function handleMaintSave(fields, recordId) {
    const { error } = await updateRecord('Maintenance Requests', recordId, fields, PM_BASE_ID)
    if (error) { toast.error('Failed to update: ' + error); return }
    toast.success('Maintenance updated')
    setMaintenance(prev => prev.map(m => m.id === recordId ? { ...m, fields: { ...m.fields, ...fields } } : m))
    setMaintModal(null)
  }

  if (loading) return <LoadingSpinner />
  if (!property) return <div className="p-8 text-center text-gray-500">Property not found.</div>

  const f = property.fields || {}
  const isPrimaryResidence = f['Investment Type'] === 'Primary Residence'

  // Build lookup maps
  const tenantMap = {}
  tenants.forEach(t => { if (t?.id) tenantMap[t.id] = t })
  const leaseMap = {}
  leases.forEach(l => { if (l?.id) leaseMap[l.id] = l })
  const leaseInvMap = {}
  leaseInvoices.forEach(li => { if (li?.id) leaseInvMap[li.id] = li })

  function toggleMaint(mid) {
    setExpandedMaint(prev => {
      const next = new Set(prev)
      next.has(mid) ? next.delete(mid) : next.add(mid)
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <Link to="/properties" className="text-sm text-blue-600 hover:underline">← Properties</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{safeRender(f.Address, 'Property')}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {f['Investment Type'] && (
              <span className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded-full">{safeRender(f['Investment Type'])}</span>
            )}
            {f.Status && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[safeRender(f.Status, '')] || 'bg-gray-100 text-gray-600'}`}>{safeRender(f.Status)}</span>
            )}
            {f['Type of Property'] && (
              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{safeRender(f['Type of Property'])}</span>
            )}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setEditForm({ Status: f.Status || '', 'Est Market Value': f['Est Market Value'] || '', Notes: f.Notes || '' }); setEditingProperty(true) }}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 flex-shrink-0"
          >
            <Edit2 size={14} /> Edit
          </button>
        )}
      </div>

      {/* Financial Overview — Admin Only */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Financial Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <FinRow label="Market Value" value={fmtCurrency(safeNum(f['Est Market Value']))} />
            <FinRow label="Purchase Price" value={fmtCurrency(safeNum(f['Purchase Price']))} />
            <FinRow label="Date Acquired" value={fmtDate(safeRender(f['Date Acquired'], ''))} />
            <FinRow label="Mortgage Amount" value={fmtCurrency(safeNum(f['Mortgage Amount']))} />
            <FinRow label="Equity" value={fmtCurrency(safeNum(f['Equity']))} />
            <FinRow label="LTV" value={safeNum(f['LTV']) != null ? fmtPercent(safeNum(f['LTV']) * 100) : '—'} />
            <FinRow label="Return on Equity" value={safeNum(f['Return on Equity']) != null ? fmtPercent(safeNum(f['Return on Equity']) * 100) : '—'} />
            <FinRow label="Monthly PI" value={fmtCurrency(safeNum(f['Monthly PI (from Current Loans)']))} />
            <FinRow label="Est. Revenue" value={fmtCurrency(safeNum(f['Estimated Revenue']))} />
            <FinRow label="Cash Flow" value={fmtCurrency((safeNum(f['Estimated Revenue']) || 0) - (safeNum(f['Monthly PI (from Current Loans)']) || 0))} />
            <FinRow label="HELOC (75%)" value={fmtCurrency(safeNum(f['HELOC (75%)']))} />
            <FinRow label="HELOC (80%)" value={fmtCurrency(safeNum(f['HELOC (80%)']))} />
            <FinRow label="Selling Cost" value={fmtCurrency(safeNum(f['Selling Cost']))} />
            <FinRow label="Accessible Equity" value={fmtCurrency(safeNum(f['Accessible Equity (if sold)']))} />
            <FinRow label="2024 Taxes" value={fmtCurrency(safeNum(f['2024 Taxes']))} />
            <FinRow label="Title In Name of" value={safeRender(f['Title In Name of'])} />
          </div>
          {f.Notes && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{safeRender(f.Notes, '')}</p>
            </div>
          )}
          {loans.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Current Loans</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Name</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Current Amt</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Monthly PI</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Rate</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Maturity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loans.map(loan => {
                      const lf = loan.fields || {}
                      const rateNum = safeNum(lf.Rate)
                      const rate = rateNum != null ? (rateNum < 1 ? fmtPercent(rateNum * 100) : fmtPercent(rateNum)) : '—'
                      return (
                        <tr key={loan.id}>
                          <td className="px-3 py-2">{safeRender(lf.Name)}</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(safeNum(lf['Current Amount']))}</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(safeNum(lf['Monthly PI']))}</td>
                          <td className="px-3 py-2">{rate} {safeRender(lf['Rate Fixed/Variable'], '')}</td>
                          <td className="px-3 py-2">{fmtDate(safeRender(lf['Maturity Date'], ''))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alerts — compact, scoped to this property */}
      {!isPrimaryResidence && (
        <AlertsPanel alerts={alerts} onDismiss={dismiss} onRestore={restore} propertyFilter={id} compact />
      )}

      {/* Units & Tenants — hidden for Primary Residence */}
      {!isPrimaryResidence && <div ref={unitsRef} className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Units & Tenants</h2>
        <div className="space-y-4">
          {rentalUnits.length === 0 && <p className="text-sm text-gray-500">No rental units.</p>}
          {rentalUnits.map(unit => {
            const uf = unit?.fields || {}
            const unitLeases = arr(uf['Lease Agreements'])
              .map(lid => leaseMap[lid])
              .filter(Boolean)

            // Lease-centric occupancy: occupied if any lease is not "Closed"
            const activeLease = unitLeases.find(l =>
              (l.fields?.Status || '').toLowerCase() !== 'closed'
            )
            const isOccupied = !!activeLease

            // — VACANT CARD —
            if (!isOccupied) {
              const estIncome = safeNum(uf['Estimated Income']) || 0
              return (
                <div key={unit.id} className="border-2 border-orange-200 rounded-xl p-4 bg-orange-50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">{safeRender(uf.Name, 'Unit')}</span>
                      <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">VACANT</span>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => setAddTenantUnit(unit)}
                        className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700"
                      >
                        <Plus size={14} /> Add Tenant
                      </button>
                    )}
                  </div>
                  {estIncome > 0 && (
                    <p className="text-sm text-orange-700 mt-2 font-medium">
                      Potential: {fmtCurrency(estIncome)}/mo
                    </p>
                  )}
                </div>
              )
            }

            // — OCCUPIED CARD —
            const lf = activeLease.fields || {}
            const tenantId = arr(lf['Tenant Management'])[0]
            const tenant = tenantId ? tenantMap[tenantId] : null
            const tf = tenant?.fields || {}

            const rent = safeNum(lf['Rent Amount']) || safeNum(lf['Lease Amount']) || 0
            const petDog = safeNum(lf['Pet Rent (Dog)']) || 0
            const petCat = safeNum(lf['Pet Rent (Cat)']) || 0
            const otherFees = safeNum(lf['Other Fees to Tenant']) || 0
            const months = safeNum(lf['Months on Lease'])
            const monthsRemaining = safeNum(lf['Months Remaining on Lease'])
            const remainingColor = monthsRemaining == null ? 'text-gray-700' : monthsRemaining <= 0 ? 'text-red-600' : monthsRemaining <= 3 ? 'text-orange-500' : monthsRemaining <= 6 ? 'text-yellow-600' : 'text-gray-700'

            const leaseTermLabel = months === 1 ? 'Month-to-month' : months != null ? `${months} months` : null
            const latestLeaseInv = leaseInvMap[arr(lf['Lease Invoice']).at(-1)]

            const phone = safeRender(tf['Phone number'], '')
            const email = safeRender(tf.Email, '')
            const leaseStatus = safeRender(lf.Status, '')
            const terms = safeRender(lf.Terms, '')
            const googleDrive = safeRender(lf['Google Drive'], '')
            const stripeId = safeRender(tf['Stripe Customer ID'], '')

            return (
              <div key={unit.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                {/* Row 1: Unit name + Occupied badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">{safeRender(uf.Name, 'Unit')}</span>
                    <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">Occupied</span>
                    {leaseStatus && leaseStatus !== 'Open' && (
                      <span className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded-full">{leaseStatus}</span>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setEditTenantData({ tenant, lease: activeLease })}
                        className="flex items-center gap-1 text-xs text-gray-500 border border-gray-300 rounded-lg px-2 py-1.5 hover:bg-gray-50"
                      >
                        <Edit2 size={12} /> Edit Tenant
                      </button>
                      <button
                        disabled
                        title="Coming soon"
                        className="flex items-center gap-1 text-xs text-gray-400 border border-gray-200 rounded-lg px-2 py-1.5 cursor-not-allowed"
                      >
                        Move Out
                      </button>
                    </div>
                  )}
                </div>

                {/* Row 2: Tenant name */}
                <div>
                  <p className="text-lg font-bold text-gray-900">{safeRender(tf.Name, 'Unknown Tenant')}</p>
                  {tenant && (
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      {phone && (
                        <a href={`tel:${phone}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                          <Phone size={13} /> {phone}
                        </a>
                      )}
                      {email && (
                        <a href={`mailto:${email}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                          <Mail size={13} /> {email}
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Row 3: Rent + Terms */}
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-xl font-bold text-gray-900">{fmtCurrency(rent)}<span className="text-sm font-normal text-gray-500">/mo</span></span>
                  {terms && <span className="text-sm text-gray-500">{terms}</span>}
                  {petDog > 0 && <span className="text-sm text-gray-500">+ {fmtCurrency(petDog)} dog</span>}
                  {petCat > 0 && <span className="text-sm text-gray-500">+ {fmtCurrency(petCat)} cat</span>}
                  {otherFees > 0 && <span className="text-sm text-gray-500">+ {fmtCurrency(otherFees)} fees</span>}
                </div>

                {/* Row 4: Lease dates */}
                <div className="text-sm text-gray-600 space-y-0.5">
                  {(lf['Start Date'] || lf['End Date']) && (
                    <p>
                      Lease: {fmtDate(safeRender(lf['Start Date'], ''))} → {fmtDate(safeRender(lf['End Date'], ''))}
                      {leaseTermLabel && <span className="text-gray-400"> ({leaseTermLabel})</span>}
                    </p>
                  )}
                  {monthsRemaining != null && (
                    <p>
                      Remaining: <span className={`font-semibold ${remainingColor}`}>
                        {monthsRemaining <= 0 ? 'Expired' : `${monthsRemaining} month${monthsRemaining !== 1 ? 's' : ''}`}
                      </span>
                    </p>
                  )}
                </div>

                {/* Row 5: Stripe + Lease doc */}
                <div className="flex items-center gap-3 flex-wrap text-sm">
                  {stripeId && (
                    <span className="text-xs text-gray-400">Stripe: {stripeId}</span>
                  )}
                  {googleDrive ? (
                    <a href={googleDrive} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline border border-blue-200 rounded px-2 py-1">
                      <ExternalLink size={11} /> View Lease Doc
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400 border border-gray-200 rounded px-2 py-1">No lease doc</span>
                  )}
                </div>

                {/* Latest invoice */}
                {latestLeaseInv && (
                  <div className="pt-2 border-t border-gray-100 flex items-center gap-3 text-xs flex-wrap">
                    <span className="text-gray-400">Latest Invoice:</span>
                    <span className={`px-1.5 py-0.5 rounded-full ${latestLeaseInv.fields?.Status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {safeRender(latestLeaseInv.fields?.Status)}
                    </span>
                    <span className="text-gray-500">{fmtDate(safeRender(latestLeaseInv.fields?.['Due Date'], ''))}</span>
                    {latestLeaseInv.fields?.['Link to Invoice'] && (
                      <a href={safeRender(latestLeaseInv.fields['Link to Invoice'], '')} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-0.5">
                        View <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>}

      {/* Invoices & Payments — hidden for Primary Residence */}
      {!isPrimaryResidence && <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Invoices & Payments</h2>
          <button
            onClick={() => setPaymentModal('new')}
            className="flex items-center gap-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50"
          >
            <Plus size={14} /> Add Payment
          </button>
        </div>

        {leaseInvoices.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-medium text-gray-500 mb-2">Lease Invoices (Stripe)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Invoice ID</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Due Date</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaseInvoices.map(inv => {
                    const invStatus = safeRender(inv.fields?.Status, '')
                    const invLink = safeRender(inv.fields?.['Link to Invoice'], '')
                    return (
                      <tr key={inv.id}>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{safeRender(inv.fields?.['Stripe Invoice ID'])}</td>
                        <td className="px-3 py-2">{fmtDate(safeRender(inv.fields?.['Due Date'], ''))}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-xs ${invStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {invStatus || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {invLink && (
                            <a href={invLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Payment Records</p>
          {invoicePayments.length === 0 ? (
            <p className="text-sm text-gray-500">No payment records.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Name</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Month</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Due</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Paid</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Amount</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoicePayments.map(p => {
                    const pf = p.fields || {}
                    const pStatus = safeRender(pf.Status, '')
                    const sc = pStatus === 'Paid' ? 'bg-green-100 text-green-700' : pStatus === 'Late' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-700">{safeRender(pf.Name)}</td>
                        <td className="px-3 py-2 text-gray-500">{safeRender(pf['Month Due'])}</td>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(safeRender(pf['Due Date'], ''))}</td>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(safeRender(pf['Date of Payment'], ''))}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmtCurrency(safeNum(pf['Invoice Amount']))}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-xs ${sc}`}>{pStatus || '—'}</span>
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => setPaymentModal(p)} className="text-gray-400 hover:text-gray-700">
                            <Edit2 size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>}

      {/* Maintenance */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Maintenance Requests</h2>
        {maintenance.length === 0 ? (
          <p className="text-sm text-gray-500">No maintenance requests.</p>
        ) : (
          <div className="space-y-2">
            {maintenance.map(m => {
              const mf = m.fields || {}
              const expanded = expandedMaint.has(m.id)
              const mStatus = safeRender(mf.Status, '')
              const ms = mStatus.toLowerCase()
              const sc = ms.includes('complet') || ms.includes('resolved')
                ? 'bg-green-100 text-green-700'
                : ms.includes('progress')
                ? 'bg-blue-100 text-blue-700'
                : ms.includes('emergency') || ms.includes('urgent')
                ? 'bg-red-100 text-red-700'
                : 'bg-yellow-100 text-yellow-700'
              const mAddr = safeRender(mf.Address, '')
              const mDate = safeRender(mf.Date, '')
              const mResEst = safeRender(mf['Resolution Estimate'], '')
              const mNotes = safeRender(mf['Request Notes'], '')
              const mResolution = safeRender(mf.Resolution, '')
              const mPhone = safeRender(mf['Contact Phone'], '')
              const mEmail = safeRender(mf['Contact Email'], '')
              return (
                <div key={m.id} className="border border-gray-100 rounded-lg overflow-hidden">
                  <div
                    className="flex items-start justify-between gap-3 p-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleMaint(m.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800 text-sm">{safeRender(mf.Name)}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-xs ${sc}`}>{mStatus || 'Open'}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                        {mDate && <span>{fmtDate(mDate)}</span>}
                        {mAddr && <span>{mAddr}</span>}
                        {safeNum(mf['Estimated Cost']) > 0 && <span>Est: {fmtCurrency(safeNum(mf['Estimated Cost']))}</span>}
                        {mResEst && <span>Resolve by: {fmtDate(mResEst)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); setMaintModal(m) }}
                        className="text-gray-400 hover:text-gray-700"
                        title="Update status"
                      >
                        <Edit2 size={13} />
                      </button>
                      {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </div>
                  {expanded && (
                    <div className="border-t border-gray-100 p-3 bg-gray-50 text-sm space-y-2">
                      {mNotes && (
                        <div>
                          <p className="text-xs font-medium text-gray-500">Request Notes</p>
                          <p className="text-gray-700 whitespace-pre-wrap">{mNotes}</p>
                        </div>
                      )}
                      {mResolution && (
                        <div>
                          <p className="text-xs font-medium text-gray-500">Resolution</p>
                          <p className="text-gray-700 whitespace-pre-wrap">{mResolution}</p>
                        </div>
                      )}
                      {mPhone && (
                        <p className="text-xs text-gray-500">
                          Contact:{' '}
                          <a href={`tel:${mPhone}`} className="text-blue-600">{mPhone}</a>
                          {mEmail && (
                            <> / <a href={`mailto:${mEmail}`} className="text-blue-600">{mEmail}</a></>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Utilities */}
      <div className="bg-white rounded-xl border border-gray-200">
        <button
          onClick={() => setUtilitiesOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 text-left"
        >
          <h2 className="font-semibold text-gray-800">Utilities ({utilities.length})</h2>
          {utilitiesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {utilitiesOpen && (
          <div className="border-t border-gray-100">
            {utilities.length === 0 ? (
              <p className="px-5 py-3 text-sm text-gray-500">No utilities.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Type</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Who Pays</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Billing Cycle</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Payment Method</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Due Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {utilities.map(u => (
                      <tr key={u.id}>
                        <td className="px-4 py-2 font-medium">{safeRender(u.fields?.['Utility Type'])}</td>
                        <td className="px-4 py-2 text-gray-600">{safeRender(u.fields?.['Who Pays?'])}</td>
                        <td className="px-4 py-2 text-gray-600">{safeRender(u.fields?.['Billing Cycle'])}</td>
                        <td className="px-4 py-2 text-gray-600">{safeRender(u.fields?.['Payment Method'])}</td>
                        <td className="px-4 py-2 text-gray-600">{safeRender(u.fields?.['Payment Due Date'])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bills — Admin Only */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200">
          <button
            onClick={() => setBillsOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 text-left"
          >
            <h2 className="font-semibold text-gray-800">Bills ({bills.length})</h2>
            {billsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {billsOpen && (
            <div className="border-t border-gray-100">
              {bills.length === 0 ? (
                <p className="px-5 py-3 text-sm text-gray-500">No bills.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Bill</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Vendor</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Amount</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Date</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bills.map(b => (
                        <tr key={b.id}>
                          <td className="px-4 py-2 font-medium">{safeRender(b.fields?.['Bill Name'])}</td>
                          <td className="px-4 py-2 text-gray-600">{safeRender(b.fields?.['Vendor / Payee'])}</td>
                          <td className="px-4 py-2 text-right">{fmtCurrency(safeNum(b.fields?.['Amount Paid']))}</td>
                          <td className="px-4 py-2 text-gray-600">{fmtDate(safeRender(b.fields?.['Payment Date'], ''))}</td>
                          <td className="px-4 py-2 text-gray-600">{safeRender(b.fields?.Category)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Airtable source link — Admin only */}
      {isAdmin && (
        <div className="text-center py-2">
          <a
            href={`https://airtable.com/${PM_BASE_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Data source: Airtable — Property Management ↗
          </a>
        </div>
      )}

      {/* Edit Property Modal */}
      {editingProperty && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Edit Property</h2>
              <button onClick={() => setEditingProperty(false)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <ModalField label="Status">
                <select value={editForm.Status || ''} onChange={e => setEditForm(ef => ({ ...ef, Status: e.target.value }))} className={inp}>
                  <option value="">Select...</option>
                  {['Active', 'Owned', 'Rehab', 'Listed', 'Sold', 'Pending', 'Vacant'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </ModalField>
              <ModalField label="Est. Market Value">
                <input
                  type="number"
                  value={editForm['Est Market Value'] || ''}
                  onChange={e => setEditForm(ef => ({ ...ef, 'Est Market Value': parseFloat(e.target.value) || 0 }))}
                  className={inp}
                />
              </ModalField>
              <ModalField label="Notes">
                <textarea
                  value={editForm.Notes || ''}
                  onChange={e => setEditForm(ef => ({ ...ef, Notes: e.target.value }))}
                  rows={3}
                  className={inp}
                />
              </ModalField>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditingProperty(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                <button onClick={savePropertyEdit} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentModal && (
        <PaymentForm
          record={paymentModal === 'new' ? null : paymentModal}
          onSave={handlePaymentSave}
          onClose={() => setPaymentModal(null)}
        />
      )}

      {maintModal && (
        <MaintenanceForm
          record={maintModal}
          onSave={handleMaintSave}
          onClose={() => setMaintModal(null)}
        />
      )}

      {addTenantUnit && (
        <AddTenantWorkflow
          propertyId={id}
          propertyName={safeRender(f.Address, '')}
          unitId={addTenantUnit.id}
          unitName={safeRender(addTenantUnit.fields?.Name, 'Unit')}
          onClose={() => setAddTenantUnit(null)}
          onSuccess={handleWorkflowSuccess}
        />
      )}

      {editTenantData && (
        <EditTenantModal
          tenant={editTenantData.tenant}
          lease={editTenantData.lease}
          onSaved={load}
          onClose={() => setEditTenantData(null)}
        />
      )}
    </div>
  )
}

// Safely render any Airtable field value as a string.
// Handles {specialValue:"NaN"}, {error:"#ERROR!"}, linked record objects,
// arrays of objects, and plain primitives.
function safeRender(val, fallback = '—') {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'object') {
    if (val.specialValue) return fallback
    if (val.error) return fallback
    if (Array.isArray(val)) {
      const parts = val.map(v => typeof v === 'object' ? (v.name || String(v.id) || '') : String(v)).filter(Boolean)
      return parts.length ? parts.join(', ') : fallback
    }
    if (val.name) return val.name
    if (val.id) return String(val.id)
    return fallback
  }
  return String(val)
}

// Returns a number or null; never returns an object/NaN from formula fields.
function safeNum(val) {
  if (val === null || val === undefined || typeof val === 'object') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

// TODO: Add escrow tracking fields (taxes through escrow, insurance through escrow)
// These would be boolean fields on the Property table in Airtable

function FinRow({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium text-gray-800">{value}</p>
    </div>
  )
}

function ModalField({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
