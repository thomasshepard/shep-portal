import { useState } from 'react'
import { X, Plus, ChevronDown, ChevronUp, Link2 } from 'lucide-react'
import { createRecord, updateRecord, fmtCurrency, PM_BASE_ID } from '../lib/airtable'
import toast from 'react-hot-toast'
import { JOB_STATUS_STYLE, PROJECT_STATUSES, JOB_STATUSES, BID_STATUSES } from '../lib/projectStatus'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const arr = v => Array.isArray(v) ? v : []
const safeNum = v => (v == null ? 0 : Number(v) || 0)

export default function ProjectDetailModal({
  project, jobs, bidsByJob, vendors, maintenance, address, onClose,
  setProjects, setJobs, setBids,
}) {
  const pf = project.fields || {}
  const [form, setForm] = useState({
    shortScope: pf['Short Scope'] || '',
    scopeOfWork: pf['Scope of Work'] || '',
    status: pf.Status || 'Idea',
    budget: pf.Budget ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [addingJob, setAddingJob] = useState(false)
  const [jobForm, setJobForm] = useState({ name: '', description: '', targetBudget: '' })
  const [expandedJobs, setExpandedJobs] = useState(new Set(jobs.map(j => j.id)))
  const [biddingJobId, setBiddingJobId] = useState(null)

  const linkedMaintenance = arr(pf['Maintenance Request'])
    .map(id => maintenance.find(m => m.id === id))
    .filter(Boolean)

  function toggleJob(id) {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSaveProject(e) {
    e.preventDefault()
    setSaving(true)
    const fields = {
      'Short Scope': form.shortScope,
      'Scope of Work': form.scopeOfWork,
      Status: form.status,
    }
    if (form.budget !== '') fields.Budget = Number(form.budget)
    const { error } = await updateRecord('Project', project.id, fields, PM_BASE_ID)
    setSaving(false)
    if (error) return toast.error('Failed to save: ' + error)
    toast.success('Project updated')
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, fields: { ...p.fields, ...fields } } : p))
  }

  async function handleAddJob(e) {
    e.preventDefault()
    if (!jobForm.name.trim()) return toast.error('Job needs a name')
    const fields = { Name: jobForm.name, Project: [project.id], Status: 'Needs Bids' }
    if (jobForm.description) fields.Description = jobForm.description
    if (jobForm.targetBudget !== '') fields['Target Budget'] = Number(jobForm.targetBudget)
    const { data, error } = await createRecord('Jobs', fields, PM_BASE_ID)
    if (error) return toast.error('Failed to add job: ' + error)
    setJobs(prev => [...prev, data])
    setExpandedJobs(prev => new Set(prev).add(data.id))
    setJobForm({ name: '', description: '', targetBudget: '' })
    setAddingJob(false)
    toast.success('Job added')
  }

  async function handleJobStatusChange(job, status) {
    const { error } = await updateRecord('Jobs', job.id, { Status: status }, PM_BASE_ID)
    if (error) return toast.error('Failed to update job: ' + error)
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, fields: { ...j.fields, Status: status } } : j))
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <div>
            <h2 className="font-semibold text-gray-900">{pf['Short Scope'] || 'Project'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{address}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <form onSubmit={handleSaveProject} className="p-6 space-y-4 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input value={form.shortScope} onChange={e => setForm(f => ({ ...f, shortScope: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inp}>
                {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scope of work</label>
            <textarea value={form.scopeOfWork} onChange={e => setForm(f => ({ ...f, scopeOfWork: e.target.value }))} rows={2} className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" step="0.01" min="0" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} className={inp + ' pl-6'} />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {linkedMaintenance.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Link2 size={12} /> Linked to maintenance request{linkedMaintenance.length > 1 ? 's' : ''}: {linkedMaintenance.map(m => m.fields?.Name).filter(Boolean).join(', ')}
            </div>
          )}
        </form>

        <div className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-800 text-sm">Jobs</h3>
            <button onClick={() => setAddingJob(v => !v)} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
              <Plus size={13} /> Add job
            </button>
          </div>

          {addingJob && (
            <form onSubmit={handleAddJob} className="bg-gray-50 rounded-lg p-4 space-y-3">
              <input
                value={jobForm.name}
                onChange={e => setJobForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. LVP Flooring Install"
                className={inp}
                autoFocus
              />
              <textarea
                value={jobForm.description}
                onChange={e => setJobForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Description (optional)"
                rows={2}
                className={inp}
              />
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" step="0.01" min="0" placeholder="Target budget (optional)"
                    value={jobForm.targetBudget}
                    onChange={e => setJobForm(f => ({ ...f, targetBudget: e.target.value }))}
                    className={inp + ' pl-6'}
                  />
                </div>
                <button type="button" onClick={() => setAddingJob(false)} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700">Add</button>
              </div>
            </form>
          )}

          {jobs.length === 0 && !addingJob && (
            <p className="text-sm text-gray-400 text-center py-6">No jobs yet — add the first one.</p>
          )}

          {jobs.map(job => {
            const jf = job.fields || {}
            const status = (jf.Status || 'Needs Bids').toLowerCase()
            const jobBids = bidsByJob[job.id] || []
            const expanded = expandedJobs.has(job.id)
            const needsMoreBids = jobBids.length < 3 && !['completed', 'cancelled'].includes(status)
            return (
              <div key={job.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-3 bg-white cursor-pointer" onClick={() => toggleJob(job.id)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-gray-800 text-sm truncate">{jf.Name}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-xs flex-shrink-0 ${JOB_STATUS_STYLE[status] || 'bg-gray-100 text-gray-600'}`}>{jf.Status}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 flex-shrink-0">
                    {safeNum(jf['Target Budget']) > 0 && <span>{fmtCurrency(safeNum(jf['Target Budget']))}</span>}
                    <span>{jobBids.length} bid{jobBids.length !== 1 ? 's' : ''}</span>
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-2">
                    {jf.Description && <p className="text-xs text-gray-500">{jf.Description}</p>}

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Status:</label>
                      <select
                        value={jf.Status || 'Needs Bids'}
                        onChange={e => handleJobStatusChange(job, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {needsMoreBids && (
                      <p className="text-xs text-amber-600">Aim for at least 3 bids — {3 - jobBids.length} more recommended.</p>
                    )}

                    {jobBids.length > 0 && (
                      <div className="space-y-1.5">
                        {jobBids.map(bid => {
                          const bf = bid.fields || {}
                          const vendor = vendors.find(v => arr(bf.Vendor).includes(v.id))
                          const awarded = bf.Select === 'Quote/Project Awarded'
                          return (
                            <div key={bid.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${awarded ? 'bg-green-50 border border-green-200' : 'bg-white border border-gray-200'}`}>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-800 truncate">{vendor?.fields?.Name || 'Unknown vendor'}</p>
                                <p className="text-gray-400">{bf.Select}</p>
                              </div>
                              <span className="font-medium text-gray-700 flex-shrink-0">{safeNum(bf.Amount) > 0 ? fmtCurrency(safeNum(bf.Amount)) : '—'}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {biddingJobId === job.id ? (
                      <BidForm
                        job={job}
                        vendors={vendors}
                        setBids={setBids}
                        onDone={() => setBiddingJobId(null)}
                      />
                    ) : (
                      <button onClick={() => setBiddingJobId(job.id)} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 pt-1">
                        <Plus size={12} /> Add bid
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BidForm({ job, vendors, setBids, onDone }) {
  const [vendorId, setVendorId] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('Pending Quote Schedule')
  const [details, setDetails] = useState('')
  const [saving, setSaving] = useState(false)

  const sorted = [...vendors].sort((a, b) => (a.fields?.Name || '').localeCompare(b.fields?.Name || ''))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!vendorId) return toast.error('Pick a subcontractor')
    setSaving(true)
    const fields = {
      Vendor: [vendorId],
      Job: [job.id],
      Project: arr(job.fields?.Project),
      Select: status,
    }
    if (amount !== '') fields.Amount = Number(amount)
    if (details) fields['Quote Details'] = details
    const { data, error } = await createRecord('Quote', fields, PM_BASE_ID)
    setSaving(false)
    if (error) return toast.error('Failed to add bid: ' + error)
    setBids(prev => [...prev, data])
    toast.success('Bid added')
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <select value={vendorId} onChange={e => setVendorId(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">Select subcontractor...</option>
        {sorted.map(v => <option key={v.id} value={v.id}>{v.fields?.Name || 'Unnamed'}</option>)}
      </select>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
          <input type="number" step="0.01" min="0" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} className="w-full text-xs border border-gray-300 rounded pl-5 pr-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
          {BID_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900">Cancel</button>
        <button type="submit" disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Adding…' : 'Add Bid'}
        </button>
      </div>
    </form>
  )
}
