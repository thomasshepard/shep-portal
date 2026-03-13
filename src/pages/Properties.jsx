import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { fetchAllRecords, fmtCurrency, fmtDate, PM_BASE_ID } from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
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

export default function Properties() {
  const { isAdmin, isVA } = useAuth()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState([])
  const [rentalUnits, setRentalUnits] = useState([])
  const [leases, setLeases] = useState([])
  const [tenants, setTenants] = useState([])
  const [invoicePayments, setInvoicePayments] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [alertsOpen, setAlertsOpen] = useState(true)
  const [rentRollOpen, setRentRollOpen] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [propRes, unitsRes, leasesRes, tenantsRes, invRes, maintRes] = await Promise.all([
          fetchAllRecords('Property', {}, PM_BASE_ID),
          fetchAllRecords('Rental Units', {}, PM_BASE_ID),
          fetchAllRecords('Lease Agreements', {}, PM_BASE_ID),
          fetchAllRecords('Tenants', {}, PM_BASE_ID),
          fetchAllRecords('Invoices Payments', {}, PM_BASE_ID),
          fetchAllRecords('Maintenance Requests', {}, PM_BASE_ID),
        ])
        if (propRes.error) throw new Error(propRes.error)
        setProperties(propRes.data || [])
        setRentalUnits(unitsRes.data || [])
        setLeases(leasesRes.data || [])
        setTenants(tenantsRes.data || [])
        setInvoicePayments(invRes.data || [])
        setMaintenance(maintRes.data || [])
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

  // Admin portfolio summary
  const totalPortfolioValue = properties.reduce((s, p) => s + (p.fields?.['Est Market Value'] || 0), 0)
  const totalEquity = properties.reduce((s, p) => s + (p.fields?.['Equity'] || 0), 0)
  const monthlyCashFlow = properties.reduce((s, p) => s + ((p.fields?.['Estimated Revenue'] || 0) - (p.fields?.['Monthly PI (from Current Loans)'] || 0)), 0)
  const occupiedUnits = rentalUnits.filter(u => {
    const s = (u.fields?.Status || '').toLowerCase()
    return s === 'occupied' || s === 'active'
  }).length

  // VA summary
  const paymentsDue = invoicePayments.filter(p => {
    const s = p.fields?.Status || ''
    const due = p.fields?.['Due Date'] ? new Date(p.fields['Due Date']) : null
    if (!due) return false
    return s === 'Pending' && due.getMonth() === thisMonth && due.getFullYear() === thisYear
  })

  // Alerts
  const expiringLeases = leases.filter(l => {
    const end = l.fields?.['End Date'] ? new Date(l.fields['End Date']) : null
    return end && end >= today && end <= in90
  })
  const emergencyMaint = maintenance.filter(m => {
    const s = (m.fields?.Status || '').toLowerCase()
    return s.includes('emergency') || s.includes('urgent')
  })
  const hasAlerts = expiringLeases.length > 0 || latePayments.length > 0 || emergencyMaint.length > 0

  // Per-property indexes
  const unitsByProperty = buildIndex(rentalUnits, 'Property')
  const leasesByProperty = buildIndex(leases, 'Property')
  const paymentsByProperty = buildIndex(invoicePayments, 'Property')
  const maintByProperty = buildIndex(maintenance, 'Property')

  // Rent roll
  const tenantMap = {}
  tenants.forEach(t => { tenantMap[t.id] = t })
  const propMap = {}
  properties.forEach(p => { propMap[p.id] = p })

  const activeLeases = leases.filter(l => {
    const s = (l.fields?.Status || '').toLowerCase()
    return s === 'active' || l.fields?.['Lease Active'] === 1
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Properties</h1>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {isAdmin ? (
          <>
            <SummaryCard label="Portfolio Value" value={fmtCurrency(totalPortfolioValue)} />
            <SummaryCard label="Total Equity" value={fmtCurrency(totalEquity)} />
            <SummaryCard label="Monthly Cash Flow" value={fmtCurrency(monthlyCashFlow)} highlight={monthlyCashFlow >= 0 ? 'green' : 'red'} />
            <SummaryCard label="Occupancy" value={rentalUnits.length ? `${occupiedUnits}/${rentalUnits.length}` : '—'} />
            <SummaryCard label="Open Maintenance" value={openMaintenance.length} highlight={openMaintenance.length > 0 ? 'yellow' : null} />
          </>
        ) : (
          <>
            <SummaryCard label="Properties" value={properties.length} />
            <SummaryCard label="Payments Due" value={paymentsDue.length} highlight={paymentsDue.length > 0 ? 'yellow' : null} />
            <SummaryCard label="Late Payments" value={latePayments.length} highlight={latePayments.length > 0 ? 'red' : null} />
            <SummaryCard label="Open Maintenance" value={openMaintenance.length} highlight={openMaintenance.length > 0 ? 'yellow' : null} />
          </>
        )}
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <div className="bg-white rounded-xl border border-amber-200">
          <button
            onClick={() => setAlertsOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 text-left"
          >
            <div className="flex items-center gap-2 font-semibold text-amber-700">
              <AlertTriangle size={16} />
              Alerts ({expiringLeases.length + latePayments.length + emergencyMaint.length})
            </div>
            {alertsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {alertsOpen && (
            <div className="px-5 pb-4 space-y-2">
              {expiringLeases.map(l => {
                const end = new Date(l.fields['End Date'])
                const days = Math.ceil((end - today) / 86400000)
                const cls = days < 30
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : days < 60
                  ? 'bg-orange-50 text-orange-700 border-orange-200'
                  : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                return (
                  <div key={l.id} className={`text-sm px-3 py-2 rounded-lg border ${cls}`}>
                    <strong>Lease Expiring:</strong> {l.fields?.Name || l.id} — expires {fmtDate(l.fields['End Date'])} ({days} days)
                  </div>
                )
              })}
              {latePayments.map(p => (
                <div key={p.id} className="text-sm px-3 py-2 rounded-lg border bg-red-50 text-red-700 border-red-200">
                  <strong>Late Payment:</strong> {p.fields?.Name || p.id} — due {fmtDate(p.fields?.['Due Date'])}
                </div>
              ))}
              {emergencyMaint.map(m => (
                <div key={m.id} className="text-sm px-3 py-2 rounded-lg border bg-red-50 text-red-700 border-red-200">
                  <strong>Emergency Maintenance:</strong> {m.fields?.Name || m.id}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Property Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {properties.map(prop => {
          const f = prop.fields || {}
          const units = unitsByProperty[prop.id] || []
          const occupied = units.filter(u => {
            const s = (u.fields?.Status || '').toLowerCase()
            return s === 'occupied' || s === 'active'
          }).length
          const propLeases = leasesByProperty[prop.id] || []
          const propPayments = paymentsByProperty[prop.id] || []
          const propMaint = maintByProperty[prop.id] || []

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
            .filter(l => (l.fields?.Status || '').toLowerCase() === 'active' || l.fields?.['Lease Active'] === 1)
            .reduce((s, l) => s + (l.fields?.['Rent Amount'] || l.fields?.['Lease Amount'] || 0), 0)

          const propPaymentsDue = propPayments.filter(p => {
            const s = p.fields?.Status || ''
            const due = p.fields?.['Due Date'] ? new Date(p.fields['Due Date']) : null
            if (!due) return false
            return s === 'Pending' && due.getMonth() === thisMonth && due.getFullYear() === thisYear
          }).length

          const cashFlow = (f['Estimated Revenue'] || 0) - (f['Monthly PI (from Current Loans)'] || 0)

          return (
            <Link
              key={prop.id}
              to={`/properties/${prop.id}`}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow block"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{f.Address || 'Untitled'}</h3>
                  {!isVA && f.Owner && <p className="text-xs text-gray-400 mt-0.5">{f.Owner}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  {alertCount > 0 && (
                    <span className="bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{alertCount}</span>
                  )}
                  {f['Investment Type'] && (
                    <span className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded-full">{f['Investment Type']}</span>
                  )}
                  {f.Status && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[f.Status] || 'bg-gray-100 text-gray-600'}`}>{f.Status}</span>
                  )}
                </div>
              </div>

              {units.length > 0 && (
                <p className="text-sm text-gray-500 mb-3">{occupied}/{units.length} units occupied</p>
              )}

              {isAdmin ? (
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Market Value</p>
                    <p className="font-medium text-gray-800">{fmtCurrency(f['Est Market Value'])}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Equity</p>
                    <p className="font-medium text-gray-800">{fmtCurrency(f['Equity'])}</p>
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
          <h2 className="font-semibold text-gray-800">Rent Roll ({activeLeases.length} active leases)</h2>
          {rentRollOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {rentRollOpen && (
          <div className="overflow-x-auto border-t border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Property</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Tenant</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Rent</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Lease End</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Mo. Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeLeases.map(l => {
                  const f = l.fields || {}
                  const tenant = tenantMap[(f['Tenant Management'] || [])[0]]
                  const prop = propMap[(f.Property || [])[0]]
                  return (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-700">{prop?.fields?.Address || '—'}</td>
                      <td className="px-4 py-2 text-gray-700">{tenant?.fields?.Name || '—'}</td>
                      <td className="px-4 py-2 text-right font-medium">{fmtCurrency(f['Rent Amount'] || f['Lease Amount'])}</td>
                      <td className="px-4 py-2 text-gray-500">{fmtDate(f['End Date'])}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{f['Months Remaining on Lease'] ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              {activeLeases.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                    <td className="px-4 py-2" colSpan={2}>Total</td>
                    <td className="px-4 py-2 text-right">
                      {fmtCurrency(activeLeases.reduce((s, l) => s + (l.fields?.['Rent Amount'] || l.fields?.['Lease Amount'] || 0), 0))}
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

function buildIndex(records, linkedField) {
  const idx = {}
  records.forEach(r => {
    ;(r.fields?.[linkedField] || []).forEach(id => {
      if (!idx[id]) idx[id] = []
      idx[id].push(r)
    })
  })
  return idx
}

function SummaryCard({ label, value, highlight }) {
  const colors = { green: 'text-green-600', red: 'text-red-600', yellow: 'text-amber-600' }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${highlight ? colors[highlight] : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
