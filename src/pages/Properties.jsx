import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Wrench } from 'lucide-react'
import { fetchAllRecords, updateRecord, fmtCurrency, fmtDate, PM_BASE_ID } from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import { useAlerts } from '../hooks/useAlerts'
import LoadingSpinner from '../components/LoadingSpinner'
import AlertsPanel from '../components/AlertsPanel'
import PropertyPlaybook from '../components/PropertyPlaybook'
import MaintenanceForm from '../components/MaintenanceForm'
import ProjectsPanel from '../components/ProjectsPanel'
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

// Always returns an array — Airtable linked/rollup/lookup fields can return
// non-array values (objects, null) when a record has no linked items.
const arr    = v => Array.isArray(v) ? v : []
const safeNum = v => (v == null ? 0 : Number(v) || 0)

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
  const [projects, setProjects] = useState([])
  const [jobs, setJobs] = useState([])
  const [bids, setBids] = useState([])
  const [vendors, setVendors] = useState([])
  const [rentRollOpen, setRentRollOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [view, setView] = useState('overview') // 'overview' | 'maintenance' | 'projects' | 'playbook'
  const [maintModal, setMaintModal] = useState(null)
  const [maintFilter, setMaintFilter] = useState('open') // 'open' | 'all' | 'resolved'
  const [maintPropertyFilter, setMaintPropertyFilter] = useState('all')

  const userName = profile?.full_name || profile?.email || 'Unknown'
  const { alerts, dismiss, restore } = useAlerts(
    { properties, rentalUnits, leases, tenants, invoicePayments, maintenance, loans },
    userName
  )

  useEffect(() => {
    async function load() {
      try {
        const [propRes, unitsRes, leasesRes, tenantsRes, invRes, maintRes, loansRes, projRes, jobsRes, bidsRes, vendorsRes] = await Promise.all([
          fetchAllRecords('Property', {}, PM_BASE_ID),
          fetchAllRecords('Rental Units', {}, PM_BASE_ID),
          fetchAllRecords('Lease Agreements', {}, PM_BASE_ID),
          fetchAllRecords('Tenants', {}, PM_BASE_ID),
          fetchAllRecords('Invoices Payments', {}, PM_BASE_ID),
          fetchAllRecords('Maintenance Requests', {}, PM_BASE_ID),
          fetchAllRecords('Current Loans', {}, PM_BASE_ID),
          fetchAllRecords('Project', {}, PM_BASE_ID),
          fetchAllRecords('Jobs', {}, PM_BASE_ID),
          fetchAllRecords('Quote', {}, PM_BASE_ID),
          fetchAllRecords('Maintenance and Vendor Mgmt', {}, PM_BASE_ID),
        ])
        if (propRes.error) throw new Error(propRes.error)
        setProperties(propRes.data || [])
        setRentalUnits(unitsRes.data || [])
        setLeases(leasesRes.data || [])
        setTenants(tenantsRes.data || [])
        setInvoicePayments(invRes.data || [])
        setMaintenance(maintRes.data || [])
        setLoans(loansRes.data || [])
        setProjects(projRes.data || [])
        setJobs(jobsRes.data || [])
        setBids(bidsRes.data || [])
        setVendors(vendorsRes.data || [])
      } catch (e) {
        toast.error('Failed to load properties: ' + e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleMaintSave(fields, recordId) {
    const { error } = await updateRecord('Maintenance Requests', recordId, fields, PM_BASE_ID)
    if (error) { toast.error('Failed to update: ' + error); return }
    toast.success('Maintenance updated')
    setMaintenance(prev => prev.map(m => m.id === recordId ? { ...m, fields: { ...m.fields, ...fields } } : m))
    setMaintModal(null)
  }

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
      .flatMap(l => arr(l.fields?.Property))  // Lease "Property" field → Rental Unit IDs
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

  // Admin portfolio summary
  // Portfolio Value + Equity = ALL owned properties
  // Cash Flow + Occupancy = Rental Properties only
  const rentalProperties = ownedProperties.filter(p => p.fields?.['Investment Type'] === 'Rental Property')
  const rentalUnitsOnly = rentalUnits.filter(u =>
    rentalProperties.some(p => arr(p.fields?.['Rental Units']).includes(u.id))
  )
  const totalPortfolioValue = ownedProperties.reduce((s, p) => s + (p.fields?.['Est Market Value'] || 0), 0)
  const totalEquity = ownedProperties.reduce((s, p) => s + (p.fields?.['Equity'] || 0), 0)
  const monthlyCashFlow = rentalProperties.reduce((s, p) => s + ((p.fields?.['Estimated Revenue'] || 0) - (p.fields?.['Monthly PI (from Current Loans)'] || 0)), 0)
  const occupiedCount = rentalUnitsOnly.filter(u => occupiedUnitIds.has(u.id)).length

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
    arr(p.fields?.['Rental Units']).forEach(uid => { unitToPropertyId[uid] = p.id })
  })

  const propMap = {}
  properties.forEach(p => { propMap[p.id] = p })
  const tenantMap = {}
  tenants.forEach(t => { if (t?.id) tenantMap[t.id] = t })
  const unitMap = {}
  rentalUnits.forEach(u => { if (u?.id) unitMap[u.id] = u })

  // Rent roll: non-Closed leases from Owned rental properties only
  // Excludes Fix & Flip, Primary Residence, and Sold/non-Owned properties
  const rentRollLeases = leases.filter(l => {
    const status = (l.fields?.Status || '').toLowerCase()
    if (status === 'closed') return false
    const unitId = arr(l.fields?.Property)[0]
    const propId = unitToPropertyId[unitId]
    if (!propId) return false
    const prop = propMap[propId]
    if (!prop || prop.fields?.Status !== 'Owned') return false
    const investType = prop.fields?.['Investment Type'] || ''
    return investType !== 'Fix & Flip' && investType !== 'Primary Residence'
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
        {view === 'overview' && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="text-sm text-gray-500 hover:text-gray-800 border border-gray-300 rounded-lg px-3 py-1.5"
          >
            {showAll ? 'Hide archived' : 'Show all properties'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-200 -mt-2">
        {['overview', 'maintenance', 'projects', 'playbook'].map(t => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={`pb-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              view === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {view === 'playbook' ? <PropertyPlaybook /> : view === 'maintenance' ? (
        <MaintenanceQueue
          maintenance={maintenance}
          propMap={propMap}
          tenantMap={tenantMap}
          filter={maintFilter}
          setFilter={setMaintFilter}
          propertyFilter={maintPropertyFilter}
          setPropertyFilter={setMaintPropertyFilter}
          properties={ownedProperties}
          onOpen={setMaintModal}
        />
      ) : view === 'projects' ? (
        <ProjectsPanel
          projects={projects}
          jobs={jobs}
          bids={bids}
          vendors={vendors}
          rentalUnits={rentalUnits}
          properties={properties}
          maintenance={maintenance}
          setProjects={setProjects}
          setJobs={setJobs}
          setBids={setBids}
          setVendors={setVendors}
        />
      ) : (
      <>
      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {isAdmin ? (
          <>
            <SummaryCard label="Portfolio Value" value={fmtCurrency(totalPortfolioValue)} />
            <SummaryCard label="Total Equity" value={fmtCurrency(totalEquity)} />
            <SummaryCard label="Monthly Cash Flow" value={fmtCurrency(monthlyCashFlow)} highlight={monthlyCashFlow >= 0 ? 'green' : 'red'} />
            <SummaryCard label="Occupancy" value={rentalUnitsOnly.length ? `${occupiedCount}/${rentalUnitsOnly.length}` : '—'} />
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

      {/* Property Cards — grouped by Investment Type */}
      {(() => {
        const GROUPS = [
          { key: 'rental', label: 'Rental Properties', filter: p => p.fields?.['Investment Type'] === 'Rental Property' },
          { key: 'flip', label: 'Fix & Flip', filter: p => p.fields?.['Investment Type'] === 'Fix & Flip' },
          { key: 'primary', label: 'Primary Residence', filter: p => p.fields?.['Investment Type'] === 'Primary Residence' },
          { key: 'other', label: 'Other', filter: p => !p.fields?.['Investment Type'] },
        ]
        const groups = GROUPS.map(g => ({ ...g, properties: displayProperties.filter(g.filter) })).filter(g => g.properties.length > 0)

        return groups.map(group => (
          <div key={group.key} className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {group.label} <span className="text-gray-400 font-normal normal-case">({group.properties.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.properties.map(prop => {
                const pf = prop.fields || {}
                const sold = isSold(prop)
                const propUnitIds = arr(pf['Rental Units'])
                const units = propUnitIds.map(uid => unitMap[uid]).filter(Boolean)
                const isPrimaryResidence = pf['Investment Type'] === 'Primary Residence'
                const isFixAndFlip = pf['Investment Type'] === 'Fix & Flip'
                const isRental = pf['Investment Type'] === 'Rental Property'
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
                        {pf.Status && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[pf.Status] || 'bg-gray-100 text-gray-600'}`}>{pf.Status}</span>
                        )}
                      </div>
                    </div>

                    {units.length > 0 && isRental && (
                      <p className="text-sm text-gray-500 mb-3">{occupiedPropCount}/{units.length} units occupied</p>
                    )}

                    {isAdmin ? (
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        {isFixAndFlip ? (
                          <>
                            <div>
                              <p className="text-xs text-gray-400">Market Value</p>
                              <p className="font-medium text-gray-800">{fmtCurrency(pf['Est Market Value'])}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400">Total Debt</p>
                              <p className="font-medium text-gray-800">{fmtCurrency(pf['Mortgage Amount'])}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400">Equity</p>
                              <p className="font-medium text-gray-800">{fmtCurrency(pf['Equity'])}</p>
                            </div>
                          </>
                        ) : isPrimaryResidence ? (
                          <>
                            <div>
                              <p className="text-xs text-gray-400">Market Value</p>
                              <p className="font-medium text-gray-800">{fmtCurrency(pf['Est Market Value'])}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400">Equity</p>
                              <p className="font-medium text-gray-800">{fmtCurrency(pf['Equity'])}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400">Monthly PI</p>
                              <p className="font-medium text-gray-800">{fmtCurrency(pf['Monthly PI (from Current Loans)'])}</p>
                            </div>
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
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
          </div>
        ))
      })()}

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
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Days Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rentRollLeases.map(l => {
                  const lf = l.fields || {}
                  const unitId = arr(lf.Property)[0]
                  const unit = unitMap[unitId]
                  const propId = unitToPropertyId[unitId]
                  const prop = propMap[propId]
                  const tenant = tenantMap[arr(lf['Tenant Management'])[0]]
                  const propPayments = paymentsByProperty[propId] || []
                  const daysOverdue = (() => {
                    const unpaid = propPayments.filter(p => {
                      const s = p.fields?.Status || ''
                      const due = p.fields?.['Due Date'] || ''
                      if (!due || s === 'Paid') return false
                      return new Date(due + 'T00:00:00') < today
                    })
                    if (!unpaid.length) return null
                    return Math.max(...unpaid.map(p => {
                      const due = new Date((p.fields?.['Due Date'] || '') + 'T00:00:00')
                      return Math.floor(safeNum(today - due) / 86400000)
                    }))
                  })()
                  return (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-700">{prop?.fields?.Address || '—'}</td>
                      <td className="px-4 py-2 text-gray-500">{unit?.fields?.Name || '—'}</td>
                      <td className="px-4 py-2 text-gray-700">{tenant?.fields?.Name || '—'}</td>
                      <td className="px-4 py-2 text-right font-medium">{fmtCurrency(lf['Rent Amount'] || lf['Lease Amount'])}</td>
                      <td className="px-4 py-2 text-gray-500">{fmtDate(lf['End Date'])}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{lf['Months Remaining on Lease'] ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        {daysOverdue != null
                          ? <span className="text-red-600">{daysOverdue}d</span>
                          : <span className="text-green-600">Current</span>}
                      </td>
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
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {maintModal && (
        <MaintenanceForm
          record={maintModal}
          tenantName={tenantMap[arr(maintModal.fields?.['Tenant Requested'])[0]]?.fields?.Name || ''}
          onSave={handleMaintSave}
          onClose={() => setMaintModal(null)}
        />
      )}
    </div>
  )
}

// Build index: record.fields[linkedField] → [records]
function buildIndexByField(records, linkedField) {
  const idx = {}
  records.forEach(r => {
    arr(r.fields?.[linkedField]).forEach(id => {
      if (!idx[id]) idx[id] = []
      idx[id].push(r)
    })
  })
  return idx
}

// Unused overload kept for compatibility — properties don't use the old buildIndex
function buildIndex() { return {} }

const MAINT_STATUS_STYLE = {
  'todo':        'bg-gray-100 text-gray-600',
  'in progress': 'bg-blue-100 text-blue-700',
  'resolved':    'bg-green-100 text-green-700',
}

function MaintenanceQueue({ maintenance, propMap, tenantMap, filter, setFilter, propertyFilter, setPropertyFilter, properties, onOpen }) {
  const today = new Date(new Date().toDateString())

  const rows = maintenance
    .map(m => {
      const mf = m.fields || {}
      const status = (mf.Status || 'Todo')
      const s = status.toLowerCase()
      const resEst = mf['Resolution Estimate'] || ''
      const overdue = s !== 'resolved' && resEst && new Date(resEst + 'T00:00:00') < today
      const propId = arr(mf.Property)[0]
      return { record: m, fields: mf, status: s, overdue, propId, resEst }
    })
    .filter(r => {
      if (filter === 'open') return r.status !== 'resolved'
      if (filter === 'resolved') return r.status === 'resolved'
      return true
    })
    .filter(r => propertyFilter === 'all' || r.propId === propertyFilter)
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      return (b.fields.Date || '').localeCompare(a.fields.Date || '')
    })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {[['open', 'Open'], ['all', 'All'], ['resolved', 'Resolved']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={propertyFilter}
          onChange={e => setPropertyFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All properties</option>
          {properties.map(p => (
            <option key={p.id} value={p.id}>{p.fields?.Address || 'Untitled'}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <Wrench className="mx-auto text-gray-300 mb-2" size={28} />
          <p className="text-sm text-gray-500">
            {filter === 'open' ? 'Nothing open — everything is resolved.' : 'No maintenance requests here.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {rows.map(({ record, fields: mf, status, overdue, propId, resEst }) => {
            const address = propMap[propId]?.fields?.Address || mf.Address || 'Unknown property'
            const tenantName = tenantMap[arr(mf['Tenant Requested'])[0]]?.fields?.Name
            const photos = Array.isArray(mf.Photos) ? mf.Photos : []
            return (
              <button
                key={record.id}
                onClick={() => onOpen(record)}
                className="w-full flex items-start justify-between gap-4 p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 text-sm">{mf.Name || 'Maintenance request'}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${MAINT_STATUS_STYLE[status] || 'bg-gray-100 text-gray-600'}`}>
                      {mf.Status || 'Todo'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {address}{tenantName ? ` · ${tenantName}` : ''}
                  </p>
                  {mf['Request Notes'] && (
                    <p className="text-sm text-gray-600 mt-1.5 line-clamp-1">{mf['Request Notes']}</p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right text-xs text-gray-500 space-y-1">
                  {safeNum(mf['Estimated Cost']) > 0 && <p className="text-gray-700 font-medium">{fmtCurrency(safeNum(mf['Estimated Cost']))}</p>}
                  {resEst && (
                    <p className={overdue ? 'text-red-600 font-medium' : ''}>{overdue ? 'Overdue' : fmtDate(resEst)}</p>
                  )}
                  {photos.length > 0 && <p>{photos.length} photo{photos.length !== 1 ? 's' : ''}</p>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
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
