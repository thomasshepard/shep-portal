import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { fetchAllRecords, fmtCurrency, fmtDate, PM_BASE_ID } from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import { useAlerts } from '../hooks/useAlerts'
import LoadingSpinner from '../components/LoadingSpinner'
import AlertsPanel from '../components/AlertsPanel'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  'Active': 'bg-green-100 text-green-700',
  'Owned': 'bg-green-100 text-green-700',
  'Occupied': 'bg-green-100 text-green-700',
  'Vacant': 'bg-gray-100 text-gray-600',
  'Rehab': 'bg-orange-100 text-orange-700',
  'Listed': 'bg-blue-100 text-blue-700',
  'Sold': 'bg-gray-100 text-gray-500',
  'Pending': 'bg-yellow-100 text-yellow-700',
}

function isSold(prop) {
  return (prop.fields?.Status || '').toLowerCase() === 'sold'
}

export default function Properties() {
  const { isAdmin, isVA, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState([])
  const [rentalUnits, setRentalUnits] = useState([])
  const [leases, setLeases] = useState([])
  const [tenants, setTenants] = useState([])
  const [invoicePayments, setInvoicePayments] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [loans, setLoans] = useState([])
  const [rentRollOpen, setRentRollOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const userName = profile?.full_name || profile?.email || 'Unknown'
  const { alerts, dismiss, restore } = useAlerts(
    { properties, rentalUnits, leases, tenants, invoicePayments, maintenance, loans },
    userName
  )

  useEffect(() => {
    async function load() {
      try {
        const [propRes, unitsRes, leasesRes, tenantsRes, invRes, maintRes, loansRes] = await Promise.all([
          fetchAllRecords('Property', {}, PM_BASE_ID),
          fetchAllRecords('Rental Units', {}, PM_BASE_ID),
          fetchAllRecords('Lease Agreements', {}, PM_BASE_ID),
          fetchAllRecords('Tenants', {}, PM_BASE_ID),
          fetchAllRecords('Invoices Payments', {}, PM_BASE_ID),
          fetchAllRecords('Maintenance Requests', {}, PM_BASE_ID),
          fetchAllRecords('Current Loans', {}, PM_BASE_ID),
        ])
        if (propRes.error) throw new Error(propRes.error)
        setProperties(propRes.data || [])
        setRentalUnits(unitsRes.data || [])
        setLeases(leasesRes.data || [])
        setTenants(tenantsRes.data || [])
        setInvoicePayments(invRes.data || [])
        setMaintenance(maintRes.data || [])
        setLoans(loansRes.data || [])
      } catch (e) {
        toast.error('Failed to load properties: ' + e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <LoadingSpinner />

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const thisMonth = today.getMonth()
  const thisYear = today.getFullYear()
  const in90 = new Date(today)
  in90.setDate(in90.getDate() + 90)

  // Owned properties (exclude Sold)
  const ownedProperties = properties.filter(p => !isSold(p))
  const displayProperties = showAll ? properties : ownedProperties

  // Lease-centric occupancy: a unit is occupied if it has any non-Closed lease
  const occupiedUnitIds = new Set(
    leases
      .filter(l => (l.fields?.Status || '').toLowerCase() !== 'closed')
      .flatMap(l => l.fields?.Property || [])  // Lease "Property" field → Rental Unit IDs
  )

  const openMaintenance = maintenance.filter(m => {
    const s = (m.fields?.Status || '').toLowerCase()
    return !['completed', 'resolved'].includes(s)
  })

  const latePayments = invoicePayments.filter(p => {
    const s = p.fields?.Status || ''
    const due = p.fields?.['Due Date'] ? new Date(p.fields['Due Date']) : null
    if (!due) return false
    const d = new Date(due); d.setHours(0, 0, 0, 0)
    return s !== 'Paid' && d < today
  })

  // Admin portfolio summary — owned properties only
  const ownedUnits = rentalUnits.filter(u => {
    // only count units belonging to owned properties
    // find via property records' Rental Units field
    return ownedProperties.some(p => (p.fields?.['Rental Units'] || []).includes(u.id))
  })
  const totalPortfolioValue = ownedProperties.reduce((s, p) => s + (p.fields?.['Est Market Value'] || 0), 0)
  const totalEquity = ownedProperties.reduce((s, p) => s + (p.fields?.['Equity'] || 0), 0)
  const monthlyCashFlow = ownedProperties.reduce((s, p) => s + ((p.fields?.['Estimated Revenue'] || 0) - (p.fields?.['Monthly PI (from Current Loans)'] || 0)), 0)
  const occupiedCount = ownedUnits.filter(u => occupiedUnitIds.has(u.id)).length

  // VA summary
  const paymentsDue = invoicePayments.filter(p => {
    const s = p.fields?.Status || ''
    const due = p.fields?.['Due Date'] ? new Date(p.fields['Due Date']) : null
    if (!due) return false
    return s === 'Pending' && due.getMonth() === thisMonth && due.getFullYear() === thisYear
  })

  // Per-property indexes
  const unitsByProperty = buildIndex(rentalUnits, null, ownedProperties)  // built differently below
  const maintByProperty = buildIndexByField(maintenance, 'Property')
  const paymentsByProperty = buildIndexByField(invoicePayments, 'Property')
  const leasesByUnit = buildIndexByField(leases, 'Property')  // Lease.Property → unit IDs

  // Map unit → property for rent roll
  const unitToPropertyId = {}
  properties.forEach(p => {
    ;(p.fields?.['Rental Units'] || []).forEach(uid => { unitToPropertyId[uid] = p.id })
  })

  const propMap = {}
  properties.forEach(p => { propMap[p.id] = p })
  const tenantMap = {}
  tenants.forEach(t => { if (t?.id) tenantMap[t.id] = t })
  const unitMap = {}
  rentalUnits.forEach(u => { if (u?.id) unitMap[u.id] = u })

  // Rent roll: non-Closed leases from owned properties only
  const rentRollLeases = leases.filter(l => {
    const status = (l.fields?.Status || '').toLowerCase()
    if (status === 'closed') return false
    const unitId = (l.fields?.Property || [])[0]
    const propId = unitToPropertyId[unitId]
    if (!propId) return false
    return !isSold(propMap[propId])
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
        <button
          onClick={() => setShowAll(v => !v)}
          className="text-sm text-gray-500 hover:text-gray-800 border border-gray-300 rounded-lg px-3 py-1.5"
        >
          {showAll ? 'Hide archived' : 'Show all properties'}
        </button>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {isAdmin ? (
          <>
            <SummaryCard label="Portfolio Value" value={fmtCurrency(totalPortfolioValue)} />
            <SummaryCard label="Total Equity" value={fmtCurrency(totalEquity)} />
            <SummaryCard label="Monthly Cash Flow" value={fmtCurrency(monthlyCashFlow)} highlight={monthlyCashFlow >= 0 ? 'green' : 'red'} />
            <SummaryCard label="Occupancy" value={ownedUnits.length ? `${occupiedCount}/${ownedUnits.length}` : '—'} />
            <SummaryCard label="Open Maintenance" value={openMaintenance.length} highlight={openMaintenance.length > 0 ? 'yellow' : null} />
          </>
        ) : (
          <>
            <SummaryCard label="Properties" value={ownedProperties.length} />
            <SummaryCard label="Payments Due" value={paymentsDue.length} highlight={paymentsDue.length > 0 ? 'yellow' : null} />
            <SummaryCard label="Late Payments" value={latePayments.length} highlight={latePayments.length > 0 ? 'red' : null} />
            <SummaryCard label="Open Maintenance" value={openMaintenance.length} highlight={openMaintenance.length > 0 ? 'yellow' : null} />
          </>
        )}
      </div>

      {/* Alerts */}
      <AlertsPanel alerts={alerts} onDismiss={dismiss} onRestore={restore} />

      {/* Property Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayProperties.map(prop => {
          const pf = prop.fields || {}
          const sold = isSold(prop)
          const propUnitIds = pf['Rental Units'] || []
          const units = propUnitIds.map(uid => unitMap[uid]).filter(Boolean)
          const isPrimaryResidence = pf['Investment Type'] === 'Primary Residence'
          const occupiedPropCount = units.filter(u => occupiedUnitIds.has(u.id)).length

          const propMaint = maintByProperty[prop.id] || []
          const propPayments = paymentsByProperty[prop.id] || []
          const propLeases = propUnitIds.flatMap(uid => leasesByUnit[uid] || [])

          const openMaintCount = propMaint.filter(m => !['completed', 'resolved'].includes((m.fields?.Status || '').toLowerCase())).length
          const leaseExpiring = propLeases.some(l => {
            const end = l.fields?.['End Date'] ? new Date(l.fields['End Date']) : null
            return end && end >= today && end <= in90
          })
          const propLate = propPayments.filter(p => {
            const s = p.fields?.Status || ''
            const due = p.fields?.['Due Date'] ? new Date(p.fields['Due Date']) : null
            if (!due) return false
            const d = new Date(due); d.setHours(0, 0, 0, 0)
            return s !== 'Paid' && d < today
          })
          const alertCount = (leaseExpiring ? 1 : 0) + propLate.length + (openMaintCount > 0 ? 1 : 0)

          const activeRent = propLeases
            .filter(l => (l.fields?.Status || '').toLowerCase() !== 'closed')
            .reduce((s, l) => s + (l.fields?.['Rent Amount'] || l.fields?.['Lease Amount'] || 0), 0)

          const propPaymentsDue = propPayments.filter(p => {
            const s = p.fields?.Status || ''
            const due = p.fields?.['Due Date'] ? new Date(p.fields['Due Date']) : null
            if (!due) return false
            return s === 'Pending' && due.getMonth() === thisMonth && due.getFullYear() === thisYear
          }).length

          const cashFlow = (pf['Estimated Revenue'] || 0) - (pf['Monthly PI (from Current Loans)'] || 0)

          return (
            <Link
              key={prop.id}
              to={`/properties/${prop.id}`}
              className={`bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow block ${sold ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{pf.Address || 'Untitled'}</h3>
                  {!isVA && pf.Owner && <p className="text-xs text-gray-400 mt-0.5">{pf.Owner}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  {alertCount > 0 && !sold && (
                    <span className="bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{alertCount}</span>
                  )}
                  {pf['Investment Type'] && (
                    <span className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded-full">{pf['Investment Type']}</span>
                  )}
                  {pf.Status && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[pf.Status] || 'bg-gray-100 text-gray-600'}`}>{pf.Status}</span>
                  )}
                </div>
              </div>

              {units.length > 0 && !isPrimaryResidence && (
                <p className="text-sm text-gray-500 mb-3">{occupiedPropCount}/{units.length} units occupied</p>
              )}

              {isAdmin ? (
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Market Value</p>
                    <p className="font-medium text-gray-800">{fmtCurrency(pf['Est Market Value'])}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Equity</p>
                    <p className="font-medium text-gray-800">{fmtCurrency(pf['Equity'])}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Cash Flow</p>
                    <p className={`font-medium ${cashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtCurrency(cashFlow)}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Total Rent</p>
                    <p className="font-medium text-gray-800">{fmtCurrency(activeRent)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Due This Month</p>
                    <p className={`font-medium ${propPaymentsDue > 0 ? 'text-amber-600' : 'text-gray-800'}`}>{propPaymentsDue}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Late</p>
                    <p className={`font-medium ${propLate.length > 0 ? 'text-red-600' : 'text-gray-800'}`}>{propLate.length}</p>
                  </div>
                </div>
              )}
            </Link>
          )
        })}
      </div>

      {/* Rent Roll */}
      <div className="bg-white rounded-xl border border-gray-200">
        <button
          onClick={() => setRentRollOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 text-left"
        >
          <h2 className="font-semibold text-gray-800">Rent Roll ({rentRollLeases.length} active leases)</h2>
          {rentRollOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {rentRollOpen && (
          <div className="overflow-x-auto border-t border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Property</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Unit</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Tenant</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Rent</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Lease End</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Mo. Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rentRollLeases.map(l => {
                  const lf = l.fields || {}
                  const unitId = (lf.Property || [])[0]
                  const unit = unitMap[unitId]
                  const propId = unitToPropertyId[unitId]
                  const prop = propMap[propId]
                  const tenant = tenantMap[(lf['Tenant Management'] || [])[0]]
                  return (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-700">{prop?.fields?.Address || '—'}</td>
                      <td className="px-4 py-2 text-gray-500">{unit?.fields?.Name || '—'}</td>
                      <td className="px-4 py-2 text-gray-700">{tenant?.fields?.Name || '—'}</td>
                      <td className="px-4 py-2 text-right font-medium">{fmtCurrency(lf['Rent Amount'] || lf['Lease Amount'])}</td>
                      <td className="px-4 py-2 text-gray-500">{fmtDate(lf['End Date'])}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{lf['Months Remaining on Lease'] ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              {rentRollLeases.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                    <td className="px-4 py-2" colSpan={3}>Total</td>
                    <td className="px-4 py-2 text-right">
                      {fmtCurrency(rentRollLeases.reduce((s, l) => s + (l.fields?.['Rent Amount'] || l.fields?.['Lease Amount'] || 0), 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// Build index: record.fields[linkedField] → [records]
function buildIndexByField(records, linkedField) {
  const idx = {}
  records.forEach(r => {
    ;(r.fields?.[linkedField] || []).forEach(id => {
      if (!idx[id]) idx[id] = []
      idx[id].push(r)
    })
  })
  return idx
}

// Unused overload kept for compatibility — properties don't use the old buildIndex
function buildIndex() { return {} }

function SummaryCard({ label, value, highlight }) {
  const colors = { green: 'text-green-600', red: 'text-red-600', yellow: 'text-amber-600' }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${highlight ? colors[highlight] : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
