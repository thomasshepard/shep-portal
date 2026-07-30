import { useState, useMemo } from 'react'
import { Plus, Wrench, Hammer, ClipboardList } from 'lucide-react'
import { createRecord, fmtCurrency, PM_BASE_ID } from '../lib/airtable'
import { PROJECT_STATUS_STYLE, PROJECT_STATUS_ORDER } from '../lib/projectStatus'
import toast from 'react-hot-toast'
import ProjectDetailModal from './ProjectDetailModal'
import SubcontractorsPanel from './SubcontractorsPanel'

const arr = v => Array.isArray(v) ? v : []
const safeNum = v => (v == null ? 0 : Number(v) || 0)

export default function ProjectsPanel({
  projects, jobs, bids, vendors, rentalUnits, properties, maintenance,
  setProjects, setJobs, setBids, setVendors,
}) {
  const [tab, setTab] = useState('projects') // 'projects' | 'subs'
  const [statusFilter, setStatusFilter] = useState('active') // 'active' | 'all' | 'done'
  const [detailProject, setDetailProject] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ propertyId: '', shortScope: '', scopeOfWork: '', budget: '' })
  const [saving, setSaving] = useState(false)

  const unitMap = useMemo(() => {
    const m = {}; rentalUnits.forEach(u => { m[u.id] = u }); return m
  }, [rentalUnits])
  const propMap = useMemo(() => {
    const m = {}; properties.forEach(p => { m[p.id] = p }); return m
  }, [properties])

  function addressForUnit(unitId) {
    const unit = unitMap[unitId]
    const propId = arr(unit?.fields?.Property)[0]
    return propMap[propId]?.fields?.Address || unit?.fields?.Name || 'Unknown property'
  }
  function addressForProject(proj) {
    const unitId = arr(proj.fields?.Property)[0]
    return addressForUnit(unitId)
  }

  const jobsByProject = useMemo(() => {
    const idx = {}
    jobs.forEach(j => { arr(j.fields?.Project).forEach(pid => { (idx[pid] = idx[pid] || []).push(j) }) })
    return idx
  }, [jobs])
  const bidsByJob = useMemo(() => {
    const idx = {}
    bids.forEach(b => { arr(b.fields?.Job).forEach(jid => { (idx[jid] = idx[jid] || []).push(b) }) })
    return idx
  }, [bids])

  const activeOwnedProperties = properties.filter(p => (p.fields?.Status || '') !== 'Sold')

  const filteredProjects = projects
    .filter(p => {
      const s = (p.fields?.Status || '').toLowerCase()
      if (statusFilter === 'active') return !['done', 'cancelled'].includes(s)
      if (statusFilter === 'done') return s === 'done'
      return true
    })
    .sort((a, b) => {
      const ai = PROJECT_STATUS_ORDER.indexOf((a.fields?.Status || '').toLowerCase())
      const bi = PROJECT_STATUS_ORDER.indexOf((b.fields?.Status || '').toLowerCase())
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

  async function handleCreateProject(e) {
    e.preventDefault()
    if (!form.propertyId) return toast.error('Pick a property')
    setSaving(true)
    try {
      // Project links to a Rental Unit, not Property directly. Most properties
      // already have one; some (esp. flips) don't — create one transparently
      // rather than making the user deal with that modeling detail.
      let unit = rentalUnits.find(u => arr(u.fields?.Property).includes(form.propertyId))
      if (!unit) {
        const address = propMap[form.propertyId]?.fields?.Address || 'Property'
        const { data, error } = await createRecord('Rental Units', {
          Name: `${address} - Whole House`,
          Property: [form.propertyId],
        }, PM_BASE_ID, { typecast: true })
        if (error) throw new Error(error)
        unit = data
      }

      const fields = {
        'Short Scope': form.shortScope || 'Project',
        Status: 'Idea',
        Property: [unit.id],
      }
      if (form.scopeOfWork) fields['Scope of Work'] = form.scopeOfWork
      if (form.budget !== '') fields.Budget = Number(form.budget)

      const { data, error } = await createRecord('Project', fields, PM_BASE_ID)
      if (error) throw new Error(error)
      setProjects(prev => [...prev, data])
      toast.success('Project created')
      setCreating(false)
      setForm({ propertyId: '', shortScope: '', scopeOfWork: '', budget: '' })
      setDetailProject(data)
    } catch (err) {
      toast.error(err.message || 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          <button
            onClick={() => setTab('projects')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tab === 'projects' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Hammer size={14} /> Projects
          </button>
          <button
            onClick={() => setTab('subs')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tab === 'subs' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ClipboardList size={14} /> Subcontractors
          </button>
        </div>
        {tab === 'projects' && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={15} /> New Project
          </button>
        )}
      </div>

      {tab === 'subs' ? (
        <SubcontractorsPanel vendors={vendors} bids={bids} jobs={jobs} projects={projects} setVendors={setVendors} addressForProject={addressForProject} />
      ) : (
        <>
          <div className="flex gap-1.5">
            {[['active', 'Active'], ['all', 'All'], ['done', 'Done']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredProjects.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <Hammer className="mx-auto text-gray-300 mb-2" size={28} />
              <p className="text-sm text-gray-500">No projects here yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProjects.map(proj => {
                const pf = proj.fields || {}
                const status = (pf.Status || 'Idea').toLowerCase()
                const projJobs = jobsByProject[proj.id] || []
                const needsBidsCount = projJobs.filter(j => (j.fields?.Status || '') === 'Needs Bids').length
                const totalBids = projJobs.reduce((sum, j) => sum + (bidsByJob[j.id]?.length || 0), 0)
                return (
                  <button
                    key={proj.id}
                    onClick={() => setDetailProject(proj)}
                    className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{pf['Short Scope'] || 'Untitled project'}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs flex-shrink-0 ${PROJECT_STATUS_STYLE[status] || 'bg-gray-100 text-gray-600'}`}>
                        {pf.Status || 'Idea'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{addressForProject(proj)}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{projJobs.length} job{projJobs.length !== 1 ? 's' : ''}</span>
                      {needsBidsCount > 0 && <span className="text-amber-600 font-medium">{needsBidsCount} need{needsBidsCount === 1 ? 's' : ''} bids</span>}
                      {totalBids > 0 && <span>{totalBids} bid{totalBids !== 1 ? 's' : ''} total</span>}
                      {safeNum(pf.Budget) > 0 && <span className="ml-auto font-medium text-gray-700">{fmtCurrency(safeNum(pf.Budget))}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {creating && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">New Project</h2>
              <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-gray-700">&times;</button>
            </div>
            <form onSubmit={handleCreateProject} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
                <select
                  value={form.propertyId}
                  onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select a property...</option>
                  {activeOwnedProperties.map(p => (
                    <option key={p.id} value={p.id}>{p.fields?.Address || 'Untitled'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Short name</label>
                <input
                  value={form.shortScope}
                  onChange={e => setForm(f => ({ ...f, shortScope: e.target.value }))}
                  placeholder="Renovation, Roof replacement, ..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scope of work</label>
                <textarea
                  value={form.scopeOfWork}
                  onChange={e => setForm(f => ({ ...f, scopeOfWork: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Budget (optional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={form.budget}
                    onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
                  {saving ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailProject && (
        <ProjectDetailModal
          project={projects.find(p => p.id === detailProject.id) || detailProject}
          jobs={jobsByProject[detailProject.id] || []}
          bidsByJob={bidsByJob}
          vendors={vendors}
          maintenance={maintenance}
          address={addressForProject(detailProject)}
          onClose={() => setDetailProject(null)}
          setProjects={setProjects}
          setJobs={setJobs}
          setBids={setBids}
          setVendors={setVendors}
        />
      )}
    </div>
  )
}
