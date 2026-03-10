import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Landmark, Plus, AlertTriangle } from 'lucide-react'
import { fetchAllRecords, createRecord, fmtDate, fmtCurrency, airtableConfigured } from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import LLCForm from '../components/LLCForm'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const statusColors = {
  Active: 'bg-green-100 text-green-700',
  Dissolved: 'bg-red-100 text-red-700',
  Suspended: 'bg-yellow-100 text-yellow-700',
  Pending: 'bg-orange-100 text-orange-700',
}

const arStatusColors = {
  Current: 'bg-green-100 text-green-700',
  'Due Soon': 'bg-yellow-100 text-yellow-700',
  Overdue: 'bg-red-100 text-red-700',
  'N/A': 'bg-gray-100 text-gray-500',
}

export default function LLCs() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [llcs, setLlcs] = useState([])
  const [properties, setProperties] = useState([])
  const [compliance, setCompliance] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [llcRes, propRes, compRes] = await Promise.all([
      fetchAllRecords('LLCs'),
      fetchAllRecords('Properties'),
      fetchAllRecords('Compliance Log'),
    ])
    if (llcRes.error) toast.error('Failed to load LLCs: ' + llcRes.error)
    if (propRes.error) toast.error('Failed to load Properties: ' + propRes.error)
    if (compRes.error) toast.error('Failed to load Compliance: ' + compRes.error)
    setLlcs(llcRes.data || [])
    setProperties(propRes.data || [])
    setCompliance(compRes.data || [])
    setLoading(false)
  }

  async function handleCreate(fields) {
    setSaving(true)
    const { error } = await createRecord('LLCs', fields)
    if (error) toast.error('Failed to create LLC: ' + error)
    else { toast.success('LLC created'); setShowForm(false); load() }
    setSaving(false)
  }

  if (!airtableConfigured()) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
        <AlertTriangle size={32} className="mx-auto text-yellow-500 mb-3" />
        <p className="font-medium text-yellow-800">Airtable is not configured.</p>
        <p className="text-sm text-yellow-700 mt-1">Add <code>VITE_AIRTABLE_PAT</code> and <code>VITE_AIRTABLE_BASE_ID</code> to your <code>.env</code> file.</p>
      </div>
    )
  }

  // Summary stats
  const activeLlcCount = llcs.filter(r => r.fields['Status'] === 'Active').length
  const totalEquity = properties.reduce((sum, r) => sum + (r.fields['Equity'] || 0), 0)
  const now = new Date()
  const in60 = new Date(now); in60.setDate(now.getDate() + 60)
  const upcomingDeadlines = compliance.filter(r => {
    const s = r.fields['Status']
    const d = r.fields['Due Date'] ? new Date(r.fields['Due Date']) : null
    return s === 'Pending' && d && d <= in60
  }).length

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">LLCs</h1>
        {isAdmin && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} /> Add LLC
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Active LLCs" value={activeLlcCount} />
        <SummaryCard label="Upcoming Deadlines" value={upcomingDeadlines} warn={upcomingDeadlines > 0} />
        <SummaryCard label="Total Properties" value={properties.length} />
        <SummaryCard label="Total Equity" value={fmtCurrency(totalEquity)} />
      </div>

      {/* LLC grid */}
      {llcs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Landmark size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No LLCs found in Airtable.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {llcs.map(record => {
            const f = record.fields
            const propCount = [
              ...(f['Properties'] || []),
              ...(f['Properties 2'] || []),
            ].length

            return (
              <div
                key={record.id}
                onClick={() => navigate(`/llcs/${record.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h2 className="text-lg font-bold text-gray-900 leading-tight">{f['Name'] || '—'}</h2>
                  <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[f['Status']] || 'bg-gray-100 text-gray-600'}`}>
                    {f['Status'] || '—'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
                  <KV label="State" value={f['State Incorporated']} />
                  <KV label="EIN" value={f['EIN']} />
                  <KV label="Owners" value={f['Owners']} />
                  <KV label="Properties" value={propCount || '0'} />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Annual Report:</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${arStatusColors[f['Annual Report Status']] || 'bg-gray-100 text-gray-500'}`}>
                      {f['Annual Report Status'] || 'N/A'}
                    </span>
                  </div>
                  {f['Annual Report Due Date'] && (
                    <span className="text-xs text-gray-400">Due {fmtDate(f['Annual Report Due Date'])}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <LLCForm onSave={handleCreate} onClose={() => setShowForm(false)} saving={saving} />
      )}
    </div>
  )
}

function SummaryCard({ label, value, warn }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200'}`}>
      <p className={`text-2xl font-bold ${warn ? 'text-yellow-700' : 'text-gray-900'}`}>{value}</p>
      <p className={`text-sm mt-0.5 ${warn ? 'text-yellow-600' : 'text-gray-500'}`}>{label}</p>
    </div>
  )
}

function KV({ label, value }) {
  return (
    <div>
      <span className="text-gray-400 text-xs">{label}: </span>
      <span className="text-gray-700 text-xs font-medium">{value || '—'}</span>
    </div>
  )
}
