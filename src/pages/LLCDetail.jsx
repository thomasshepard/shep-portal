import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, Plus, ExternalLink, AlertTriangle } from 'lucide-react'
import {
  fetchAllRecords, updateRecord, deleteRecord, createRecord,
  fmtDate, fmtCurrency, fmtPercent, fmtField, airtableConfigured,
} from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import LLCForm from '../components/LLCForm'
import ComplianceForm from '../components/ComplianceForm'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const arStatusColors = {
  Current: 'bg-green-100 text-green-700',
  'Due Soon': 'bg-yellow-100 text-yellow-700 border border-yellow-300',
  Overdue: 'bg-red-100 text-red-700 border border-red-300',
  'N/A': 'bg-gray-100 text-gray-500',
}

const compStatusColors = {
  Filed: 'bg-green-100 text-green-700',
  Pending: 'bg-yellow-100 text-yellow-700',
  Overdue: 'bg-red-100 text-red-700',
}

export default function LLCDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const [llc, setLlc] = useState(null)
  const [properties, setProperties] = useState([])
  const [compliance, setCompliance] = useState([])
  const [loading, setLoading] = useState(true)

  const [showEditLLC, setShowEditLLC] = useState(false)
  const [savingLLC, setSavingLLC] = useState(false)

  const [compModal, setCompModal] = useState(null) // null | 'new' | record
  const [savingComp, setSavingComp] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)

    // Fetch the LLC record
    const { data: allLlcs, error: llcErr } = await fetchAllRecords('LLCs', {
      filterByFormula: `RECORD_ID()="${id}"`,
    })
    if (llcErr || !allLlcs?.length) {
      toast.error('LLC not found')
      navigate('/llcs')
      return
    }
    const record = allLlcs[0]
    setLlc(record)

    // Linked property record IDs (Properties + Properties 2)
    const propIds = [
      ...(record.fields['Properties'] || []),
      ...(record.fields['Properties 2'] || []),
    ]

    // Fetch properties and compliance in parallel
    const [propRes, compRes] = await Promise.all([
      propIds.length
        ? fetchAllRecords('Properties', {
            filterByFormula: `OR(${propIds.map(pid => `RECORD_ID()="${pid}"`).join(',')})`,
          })
        : Promise.resolve({ data: [], error: null }),
      fetchAllRecords('Compliance Log', {
        filterByFormula: `FIND("${id}", ARRAYJOIN({LLCs}))`,
        sort: { field: 'Due Date', direction: 'desc' },
      }),
    ])

    if (propRes.error) toast.error('Failed to load properties: ' + propRes.error)
    if (compRes.error) toast.error('Failed to load compliance: ' + compRes.error)

    setProperties(propRes.data || [])
    setCompliance(compRes.data || [])
    setLoading(false)
  }

  // LLC edit/delete
  async function handleEditLLC(fields) {
    setSavingLLC(true)
    const { error } = await updateRecord('LLCs', id, fields)
    if (error) toast.error('Failed to update: ' + error)
    else { toast.success('LLC updated'); setShowEditLLC(false); load() }
    setSavingLLC(false)
  }

  async function handleDeleteLLC() {
    if (!confirm(`Delete "${llc.fields['Name']}"? This cannot be undone.`)) return
    const { error } = await deleteRecord('LLCs', id)
    if (error) toast.error('Failed to delete: ' + error)
    else { toast.success('LLC deleted'); navigate('/llcs') }
  }

  // Compliance create/edit/delete
  async function handleSaveComp(fields) {
    setSavingComp(true)
    let error
    if (compModal === 'new') {
      ({ error } = await createRecord('Compliance Log', fields))
    } else {
      ({ error } = await updateRecord('Compliance Log', compModal.id, fields))
    }
    if (error) toast.error('Failed to save: ' + error)
    else { toast.success('Saved'); setCompModal(null); load() }
    setSavingComp(false)
  }

  async function handleDeleteComp(record) {
    if (!confirm('Delete this compliance entry?')) return
    const { error } = await deleteRecord('Compliance Log', record.id)
    if (error) toast.error('Failed to delete: ' + error)
    else { toast.success('Deleted'); load() }
  }

  if (!airtableConfigured()) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
        <AlertTriangle size={32} className="mx-auto text-yellow-500 mb-3" />
        <p className="font-medium text-yellow-800">Airtable is not configured.</p>
      </div>
    )
  }

  if (loading) return <LoadingSpinner />
  if (!llc) return null

  const f = llc.fields
  const arStatus = f['Annual Report Status']
  const arWarn = arStatus === 'Due Soon' || arStatus === 'Overdue'

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/llcs')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-3">
          <ArrowLeft size={16} /> Back to LLCs
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{f['Name'] || '—'}</h1>
            <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
              f['Status'] === 'Active' ? 'bg-green-100 text-green-700' :
              f['Status'] === 'Dissolved' ? 'bg-red-100 text-red-700' :
              f['Status'] === 'Suspended' ? 'bg-yellow-100 text-yellow-700' :
              'bg-orange-100 text-orange-700'
            }`}>{f['Status'] || '—'}</span>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowEditLLC(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                <Pencil size={14} /> Edit
              </button>
              <button onClick={handleDeleteLLC} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <DetailRow label="Owners" value={fmtField(f['Owners'])} />
          <DetailRow label="Date Formed" value={fmtDate(f['Date Formed'])} />
          <DetailRow label="State Incorporated" value={fmtField(f['State Incorporated'])} />
          <DetailRow label="EIN" value={fmtField(f['EIN'])} />
          <DetailRow label="Registered Agent" value={fmtField(f['Registered Agent'])} />
          <DetailRow label="Bank Account" value={fmtField(f['Bank Account'])} />
          <DetailRow label="Operating Agreement" value={f['Operating Agreement'] ? 'Yes' : 'No'} />
          <DetailRow
            label="Link to Docs"
            value={
              f['Link to Docs']
                ? <a href={f['Link to Docs']} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                    Open <ExternalLink size={12} />
                  </a>
                : '—'
            }
          />
          {f['Purpose'] && (
            <div className="sm:col-span-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Purpose</span>
              <p className="text-sm text-gray-700 mt-1">{f['Purpose']}</p>
            </div>
          )}
          {f['Notes'] && (
            <div className="sm:col-span-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Notes</span>
              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{f['Notes']}</p>
            </div>
          )}
        </div>
      </div>

      {/* Annual Report card */}
      <div className={`rounded-xl border p-6 ${arWarn ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200'}`}>
        <h2 className={`font-semibold mb-3 ${arWarn ? 'text-yellow-800' : 'text-gray-800'}`}>Annual Report</h2>
        <div className="flex flex-wrap items-center gap-4">
          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${arStatusColors[arStatus] || 'bg-gray-100 text-gray-500'}`}>
            {arStatus || 'N/A'}
          </span>
          <DetailRow label="Due Date" value={fmtDate(f['Annual Report Due Date'])} inline />
          <DetailRow label="Fee" value={fmtCurrency(f['Annual Report Fee'])} inline />
        </div>
        {arWarn && (
          <p className="text-sm text-yellow-700 mt-3 flex items-center gap-1.5">
            <AlertTriangle size={14} /> Annual report requires attention.
          </p>
        )}
      </div>

      {/* Properties section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Properties Held by {f['Name']}</h2>
        {properties.length === 0 ? (
          <p className="text-sm text-gray-500">No properties linked to this LLC.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Address', 'Status', 'Investment Type', 'Market Value', 'Mortgage', 'Equity', 'ROE', 'LTV'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {properties.map(r => {
                  const p = r.fields
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-gray-800 font-medium whitespace-nowrap">{p['Address'] || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{p['Status'] || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{p['Investment Type'] || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{fmtCurrency(p['Est Market Value'])}</td>
                      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{fmtCurrency(p['Mortgage Amount'])}</td>
                      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{fmtCurrency(p['Equity'])}</td>
                      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{fmtPercent(p['Return on Equity'])}</td>
                      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{fmtPercent(p['LTV'])}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Compliance section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Compliance History</h2>
          {isAdmin && (
            <button
              onClick={() => setCompModal('new')}
              className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} /> Add Entry
            </button>
          )}
        </div>
        {compliance.length === 0 ? (
          <p className="text-sm text-gray-500">No compliance records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Type', 'Status', 'Due Date', 'Date Filed', 'Cost', 'Confirmation #', 'Notes', ''].map((h, i) => (
                    <th key={i} className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {compliance.map(r => {
                  const c = r.fields
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap">{c['Type'] || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${compStatusColors[c['Status']] || 'bg-gray-100 text-gray-600'}`}>
                          {c['Status'] || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(c['Due Date'])}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(c['Date Filed'])}</td>
                      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{fmtCurrency(c['Cost'])}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{c['Confirmation Number'] || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500 max-w-[160px] truncate">{c['Notes'] || '—'}</td>
                      {isAdmin && (
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setCompModal(r)} className="text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
                            <button onClick={() => handleDeleteComp(r)} className="text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* LLC edit modal */}
      {showEditLLC && (
        <LLCForm
          initial={f}
          onSave={handleEditLLC}
          onClose={() => setShowEditLLC(false)}
          saving={savingLLC}
        />
      )}

      {/* Compliance modal */}
      {compModal !== null && (
        <ComplianceForm
          initial={compModal === 'new' ? null : compModal.fields}
          llcRecordId={id}
          onSave={handleSaveComp}
          onClose={() => setCompModal(null)}
          saving={savingComp}
        />
      )}
    </div>
  )
}

function DetailRow({ label, value, inline }) {
  if (inline) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-gray-500">{label}:</span>
        <span className="text-sm font-medium text-gray-800">{value}</span>
      </div>
    )
  }
  return (
    <div>
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <p className="text-sm text-gray-800 mt-0.5">{value}</p>
    </div>
  )
}
