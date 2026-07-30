import { useState, useMemo } from 'react'
import { Plus, Phone, Mail, ExternalLink, ChevronDown, ChevronUp, Star, ShieldCheck, Briefcase, Pencil, Archive, ArchiveRestore, Trash2, MapPin } from 'lucide-react'
import { createRecord, updateRecord, deleteRecord, fmtCurrency, PM_BASE_ID } from '../lib/airtable'
import toast from 'react-hot-toast'

const arr = v => Array.isArray(v) ? v : []
const safeNum = v => (v == null ? 0 : Number(v) || 0)

const SERVICES = [
  'Cleaning', 'Handyman', 'Plumber', 'Contractor', 'Drywall and Paint', 'Flooring',
  'HVAC', 'Gardiner', 'Landscaping', 'Tree cutting', 'Lawncare', 'Bathroom Remodelling', 'remodeling',
]

const REGIONS = ['Cookeville area', 'Bay Area, CA', 'Oak Ridge, TN', 'Lake Charles, LA', 'Unspecified']

const RATING_STYLE = {
  Preferred: 'bg-green-100 text-green-700',
  Good: 'bg-blue-100 text-blue-700',
  Fair: 'bg-amber-100 text-amber-700',
  Avoid: 'bg-red-100 text-red-700',
}

// Priority order for "who to call first": rated tiers first, unrated in the
// middle (unknown, not necessarily bad), Avoid always last regardless of how
// the rest of the list is filtered.
const RATING_ORDER = ['Preferred', 'Good', 'Fair', '', 'Avoid']
const RATING_SECTION_LABEL = {
  Preferred: 'Preferred — reach out first',
  Good: 'Good',
  Fair: 'Fair',
  '': 'Not yet rated',
  Avoid: 'Avoid',
}
const RATING_SECTION_STYLE = {
  Preferred: 'text-green-700',
  Good: 'text-blue-700',
  Fair: 'text-amber-700',
  '': 'text-gray-400',
  Avoid: 'text-red-700',
}

const emptyForm = {
  name: '', number: '', email: '', website: '', location: '', market: '', platform: '',
  services: [], notes: '', rating: '', region: '', referencesChecked: false, worksWithInvestors: false,
  favorite: false, archived: false,
}

function formFromVendor(v) {
  const vf = v.fields || {}
  return {
    name: vf.Name || '',
    number: vf.Number || '',
    email: vf.Email || '',
    website: vf.Website || '',
    location: vf['Location / Address'] || '',
    market: vf.Market || '',
    platform: vf.Platform || '',
    services: arr(vf.Service),
    notes: vf.Notes || '',
    rating: vf.Rating || '',
    region: vf.Region || '',
    referencesChecked: !!vf['References Checked'],
    worksWithInvestors: !!vf['Works With Investors'],
    favorite: !!vf.Favorite,
    archived: !!vf.Archived,
  }
}

function buildFields(form) {
  return {
    Name: form.name,
    Number: form.number,
    Email: form.email,
    Website: form.website,
    'Location / Address': form.location,
    Market: form.market,
    Platform: form.platform,
    Service: form.services,
    Notes: form.notes,
    Rating: form.rating || null,
    Region: form.region || null,
    'References Checked': form.referencesChecked,
    'Works With Investors': form.worksWithInvestors,
    Favorite: form.favorite,
    Archived: form.archived,
  }
}

export default function SubcontractorsPanel({ vendors, bids, jobs, projects, setVendors, addressForProject }) {
  const [search, setSearch] = useState('')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  const [expanded, setExpanded] = useState(new Set())
  const [creating, setCreating] = useState(false)
  const [editingVendor, setEditingVendor] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const bidsByVendor = useMemo(() => {
    const idx = {}
    bids.forEach(b => { arr(b.fields?.Vendor).forEach(vid => { (idx[vid] = idx[vid] || []).push(b) }) })
    return idx
  }, [bids])
  const jobMap = useMemo(() => {
    const m = {}; jobs.forEach(j => { m[j.id] = j }); return m
  }, [jobs])
  const projectMap = useMemo(() => {
    const m = {}; projects.forEach(p => { m[p.id] = p }); return m
  }, [projects])

  const archivedCount = vendors.filter(v => v.fields?.Archived).length

  const filtered = vendors
    .filter(v => {
      const vf = v.fields || {}
      if (!showArchived && vf.Archived) return false
      if (serviceFilter !== 'all' && !arr(vf.Service).includes(serviceFilter)) return false
      if (regionFilter !== 'all' && (vf.Region || 'Unspecified') !== regionFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const haystack = `${vf.Name || ''} ${arr(vf.Service).join(' ')}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
    .sort((a, b) => (a.fields?.Name || '').localeCompare(b.fields?.Name || ''))

  const favorites = filtered
    .filter(v => v.fields?.Favorite)
    .sort((a, b) => (a.fields?.Name || '').localeCompare(b.fields?.Name || ''))
  const nonFavorites = filtered.filter(v => !v.fields?.Favorite)

  const grouped = RATING_ORDER
    .map(tier => ({
      tier,
      label: RATING_SECTION_LABEL[tier],
      vendors: nonFavorites.filter(v => (v.fields?.Rating || '') === tier),
    }))
    .filter(g => g.vendors.length > 0)

  function toggle(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleService(s) {
    setForm(f => ({ ...f, services: f.services.includes(s) ? f.services.filter(x => x !== s) : [...f.services, s] }))
  }

  function openCreate() {
    setForm(emptyForm)
    setEditingVendor(null)
    setCreating(true)
  }

  function openEdit(vendor) {
    setForm(formFromVendor(vendor))
    setEditingVendor(vendor)
    setCreating(false)
  }

  function closeModal() {
    setCreating(false)
    setEditingVendor(null)
    setForm(emptyForm)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Name is required')
    setSaving(true)
    const fields = buildFields(form)
    if (editingVendor) {
      const { data, error } = await updateRecord('Maintenance and Vendor Mgmt', editingVendor.id, fields, PM_BASE_ID)
      setSaving(false)
      if (error) return toast.error('Failed to update subcontractor: ' + error)
      setVendors(prev => prev.map(v => v.id === data.id ? data : v))
      toast.success('Subcontractor updated')
    } else {
      const { data, error } = await createRecord('Maintenance and Vendor Mgmt', fields, PM_BASE_ID)
      setSaving(false)
      if (error) return toast.error('Failed to add subcontractor: ' + error)
      setVendors(prev => [...prev, data])
      toast.success('Subcontractor added')
    }
    closeModal()
  }

  async function handleFavoriteToggle(vendor) {
    const next = !vendor.fields?.Favorite
    setVendors(prev => prev.map(v => v.id === vendor.id ? { ...v, fields: { ...v.fields, Favorite: next } } : v))
    const { error } = await updateRecord('Maintenance and Vendor Mgmt', vendor.id, { Favorite: next }, PM_BASE_ID)
    if (error) {
      setVendors(prev => prev.map(v => v.id === vendor.id ? { ...v, fields: { ...v.fields, Favorite: !next } } : v))
      toast.error('Failed to update favorite: ' + error)
    }
  }

  async function handleArchiveToggle(vendor) {
    const next = !vendor.fields?.Archived
    setVendors(prev => prev.map(v => v.id === vendor.id ? { ...v, fields: { ...v.fields, Archived: next } } : v))
    const { error } = await updateRecord('Maintenance and Vendor Mgmt', vendor.id, { Archived: next }, PM_BASE_ID)
    if (error) {
      setVendors(prev => prev.map(v => v.id === vendor.id ? { ...v, fields: { ...v.fields, Archived: !next } } : v))
      toast.error('Failed to update: ' + error)
    } else {
      toast.success(next ? 'Subcontractor archived' : 'Subcontractor restored')
    }
  }

  async function handleDelete(vendor) {
    if (!confirm(`Permanently delete "${vendor.fields?.Name || 'this subcontractor'}"? This can't be undone.`)) return
    const { error } = await deleteRecord('Maintenance and Vendor Mgmt', vendor.id, PM_BASE_ID)
    if (error) return toast.error('Failed to delete: ' + error)
    setVendors(prev => prev.filter(v => v.id !== vendor.id))
    toast.success('Subcontractor deleted')
    closeModal()
  }

  const modalOpen = creating || !!editingVendor

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search subcontractors..."
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[180px]"
        />
        <select
          value={serviceFilter}
          onChange={e => setServiceFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All trades</option>
          {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={regionFilter}
          onChange={e => setRegionFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All areas</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded" />
          Show archived{archivedCount > 0 ? ` (${archivedCount})` : ''}
        </label>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors ml-auto"
        >
          <Plus size={15} /> Add Subcontractor
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-500">
          No subcontractors match.
        </div>
      ) : (
        <div className="space-y-5">
          {favorites.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 text-yellow-600">
                Favorites <span className="text-gray-400 font-normal normal-case">({favorites.length})</span>
              </h3>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {favorites.map(v => (
                  <VendorCard
                    key={v.id}
                    vendor={v}
                    bids={bidsByVendor[v.id] || []}
                    jobMap={jobMap}
                    projectMap={projectMap}
                    addressForProject={addressForProject}
                    expanded={expanded.has(v.id)}
                    onToggle={() => toggle(v.id)}
                    onFavoriteToggle={() => handleFavoriteToggle(v)}
                    onEdit={() => openEdit(v)}
                  />
                ))}
              </div>
            </div>
          )}
          {grouped.map(g => (
            <div key={g.tier || 'unrated'}>
              <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${RATING_SECTION_STYLE[g.tier]}`}>
                {g.label} <span className="text-gray-400 font-normal normal-case">({g.vendors.length})</span>
              </h3>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {g.vendors.map(v => (
                  <VendorCard
                    key={v.id}
                    vendor={v}
                    bids={bidsByVendor[v.id] || []}
                    jobMap={jobMap}
                    projectMap={projectMap}
                    addressForProject={addressForProject}
                    expanded={expanded.has(v.id)}
                    onToggle={() => toggle(v.id)}
                    onFavoriteToggle={() => handleFavoriteToggle(v)}
                    onEdit={() => openEdit(v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">{editingVendor ? 'Edit Subcontractor' : 'Add Subcontractor'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name">
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </Field>
                <Field label="Rating">
                  <select value={form.rating} onChange={e => setForm(f => ({ ...f, rating: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Not rated yet</option>
                    {Object.keys(RATING_STYLE).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone">
                  <input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </Field>
                <Field label="Email">
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </Field>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Trades</label>
                <div className="flex flex-wrap gap-1.5">
                  {SERVICES.map(s => (
                    <button
                      key={s} type="button" onClick={() => toggleService(s)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        form.services.includes(s) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Area">
                  <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Unspecified</option>
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Found via">
                  <input value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} placeholder="Facebook, referral, ..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </Field>
              </div>
              <Field label="Location / area detail">
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Cookeville, TN" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
              <Field label="Website">
                <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
              <Field label="Notes">
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.referencesChecked} onChange={e => setForm(f => ({ ...f, referencesChecked: e.target.checked }))} className="rounded" />
                  References/reviews checked
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.worksWithInvestors} onChange={e => setForm(f => ({ ...f, worksWithInvestors: e.target.checked }))} className="rounded" />
                  Works with investors (has investor client references)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.favorite} onChange={e => setForm(f => ({ ...f, favorite: e.target.checked }))} className="rounded" />
                  Favorite
                </label>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div>
                  {editingVendor && (
                    <button
                      type="button"
                      onClick={() => handleArchiveToggle(editingVendor)}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                    >
                      {editingVendor.fields?.Archived ? <><ArchiveRestore size={14} /> Restore</> : <><Archive size={14} /> Archive</>}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {editingVendor && (
                    <button
                      type="button"
                      onClick={() => handleDelete(editingVendor)}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                  <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
                    {saving ? 'Saving…' : editingVendor ? 'Save Changes' : 'Add Subcontractor'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
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

function VendorCard({ vendor, bids, jobMap, projectMap, addressForProject, expanded, onToggle, onFavoriteToggle, onEdit }) {
  const vf = vendor.fields || {}
  const totalValue = bids.reduce((sum, b) => sum + safeNum(b.fields?.Amount), 0)
  return (
    <div>
      <div className="flex items-start justify-between gap-3 p-4 hover:bg-gray-50">
        <button
          onClick={e => { e.stopPropagation(); onFavoriteToggle() }}
          title={vf.Favorite ? 'Unfavorite' : 'Favorite'}
          className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-yellow-500"
        >
          <Star size={16} className={vf.Favorite ? 'fill-yellow-400 text-yellow-500' : ''} />
        </button>
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 text-sm">{vf.Name || 'Unnamed'}</span>
            {vf.Rating && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs flex items-center gap-0.5 ${RATING_STYLE[vf.Rating] || 'bg-gray-100 text-gray-600'}`}>
                <Star size={10} /> {vf.Rating}
              </span>
            )}
            {vf['References Checked'] && (
              <span className="px-1.5 py-0.5 rounded-full text-xs flex items-center gap-0.5 bg-teal-50 text-teal-700" title="References/reviews checked">
                <ShieldCheck size={10} /> Referenced
              </span>
            )}
            {vf['Works With Investors'] && (
              <span className="px-1.5 py-0.5 rounded-full text-xs flex items-center gap-0.5 bg-indigo-50 text-indigo-700" title="Has investor client references">
                <Briefcase size={10} /> Investor-friendly
              </span>
            )}
            {vf.Archived && (
              <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-200 text-gray-600">Archived</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {vf.Region && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 flex items-center gap-1">
                <MapPin size={10} /> {vf.Region}
              </span>
            )}
            {arr(vf.Service).map(s => (
              <span key={s} className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{s}</span>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1.5 flex-wrap">
            {vf.Number && (
              <a href={`tel:${vf.Number}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-blue-600 hover:underline">
                <Phone size={11} />{vf.Number}
              </a>
            )}
            {vf.Email && (
              <a href={`mailto:${vf.Email}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-blue-600 hover:underline">
                <Mail size={11} />{vf.Email}
              </a>
            )}
            {vf.Website && (
              <a href={vf.Website} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-blue-600 hover:underline">
                <ExternalLink size={11} />Website
              </a>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-gray-500 flex-shrink-0 flex items-center gap-2">
          <div className="cursor-pointer" onClick={onToggle}>
            <p>{bids.length} bid{bids.length !== 1 ? 's' : ''}</p>
            {totalValue > 0 && <p className="font-medium text-gray-700">{fmtCurrency(totalValue)}</p>}
          </div>
          <button onClick={e => { e.stopPropagation(); onEdit() }} title="Edit" className="text-gray-400 hover:text-blue-600 p-1">
            <Pencil size={13} />
          </button>
          <div className="cursor-pointer" onClick={onToggle}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="bg-gray-50 border-t border-gray-100 px-4 py-3">
          {vf.Notes && <p className="text-xs text-gray-600 mb-2 whitespace-pre-wrap">{vf.Notes}</p>}
          {bids.length === 0 ? (
            <p className="text-xs text-gray-400">No bids logged yet.</p>
          ) : (
            <div className="space-y-1.5">
              {bids.map(b => {
                const bf = b.fields || {}
                const job = jobMap[arr(bf.Job)[0]]
                const project = job ? projectMap[arr(job.fields?.Project)[0]] : null
                return (
                  <div key={b.id} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 truncate">{job?.fields?.Name || 'Job'}</p>
                      <p className="text-gray-400 truncate">
                        {project ? `${addressForProject(project)} · ` : ''}{bf.Select}
                      </p>
                    </div>
                    <span className="font-medium text-gray-700 flex-shrink-0">{safeNum(bf.Amount) > 0 ? fmtCurrency(safeNum(bf.Amount)) : '—'}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
