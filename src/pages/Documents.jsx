import { useEffect, useState, useMemo, useRef } from 'react'
import { Search, X, FileText, AlertTriangle, ExternalLink, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { fetchAllRecords, updateRecord, DOCS_BASE_ID } from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const PAT = import.meta.env.VITE_AIRTABLE_PAT
const DOCS_TABLE_ID = 'tbltkTOMpJHPIUBXN'

// ── Helpers ─────────────────────────────────────────────────────────────────

const arr = v => Array.isArray(v) ? v : []

function safeStr(val, fallback = '—') {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'object') {
    if (val.specialValue || val.error) return fallback
    if (Array.isArray(val)) {
      const parts = val.map(v => typeof v === 'object' ? (v.name || '') : String(v)).filter(Boolean)
      return parts.length ? parts.join(', ') : fallback
    }
    if (val.name) return val.name
    return fallback
  }
  return String(val)
}

function pick(fields, ...keys) {
  for (const key of keys) {
    const v = fields[key]
    if (v !== null && v !== undefined && v !== '') return v
  }
  return null
}

// Format ISO date string as "Sep 25, 2025"
function fmtDate(dateStr) {
  if (!dateStr || dateStr === '—') return null
  // Add noon to avoid timezone-shift issues with date-only strings
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtYear(dateStr) {
  if (!dateStr || dateStr === '—') return null
  const m = dateStr.match(/(\d{4})/)
  return m ? m[1] : null
}

function parseDoc(record) {
  const f = record.fields || {}
  const attachments = arr(pick(f, 'Attachments', 'File', 'Scan', 'Document'))
  const rawTags = arr(f['Tags'])
  const tags = rawTags.map(t => (typeof t === 'object' ? (t.name || '') : String(t))).filter(Boolean)
  return {
    id: record.id,
    name: safeStr(pick(f, 'Name', 'Document Name', 'Title'), 'Untitled'),
    category: safeStr(pick(f, 'Category', 'Document Type', 'Type'), ''),
    entity: safeStr(pick(f, 'Entity', 'LLC', 'Property', 'Related Entity'), ''),
    date: safeStr(pick(f, 'Date', 'Document Date'), ''),
    summary: safeStr(pick(f, 'Summary', 'AI Summary'), ''),
    notes: safeStr(pick(f, 'Description', 'Notes'), ''),
    tags,
    shared: f['Shared'] === true,
    attachments,
    raw: f,
  }
}

const CATEGORY_COLORS = {
  default: 'bg-blue-50 text-blue-700',
  tax: 'bg-green-50 text-green-700',
  legal: 'bg-purple-50 text-purple-700',
  insurance: 'bg-orange-50 text-orange-700',
  financial: 'bg-teal-50 text-teal-700',
  deed: 'bg-yellow-50 text-yellow-700',
  contract: 'bg-pink-50 text-pink-700',
}

function categoryColor(cat) {
  if (!cat) return CATEGORY_COLORS.default
  const lower = cat.toLowerCase()
  for (const [key, cls] of Object.entries(CATEGORY_COLORS)) {
    if (lower.includes(key)) return cls
  }
  return CATEGORY_COLORS.default
}

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'az', label: 'Name A–Z' },
  { id: 'za', label: 'Name Z–A' },
]

// Fields handled by parseDoc — exclude from "Additional Fields"
const STANDARD_KEYS = new Set([
  'Name', 'Document Name', 'Title',
  'Category', 'Document Type', 'Type',
  'Entity', 'LLC', 'Property', 'Related Entity',
  'Date', 'Document Date',
  'Summary', 'AI Summary',
  'Description', 'Notes',
  'Attachments', 'File', 'Scan', 'Document',
  'Tags', 'Shared', 'Created', 'Last Modified', 'Needs Cleanup',
])

// Check Airtable schema and create Tags/Shared fields if missing
async function ensureDocsFields() {
  if (!PAT || !DOCS_BASE_ID) return
  try {
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${DOCS_BASE_ID}/tables`, {
      headers: { Authorization: `Bearer ${PAT}` },
    })
    if (!res.ok) return
    const json = await res.json()
    const table = (json.tables || []).find(t => t.name === 'Documents')
    if (!table) return
    const fieldNames = new Set((table.fields || []).map(f => f.name))
    const creates = []
    if (!fieldNames.has('Tags')) {
      creates.push(fetch(`https://api.airtable.com/v0/meta/bases/${DOCS_BASE_ID}/tables/${table.id}/fields`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Tags', type: 'multipleSelects', options: { choices: [] } }),
      }))
    }
    if (!fieldNames.has('Shared')) {
      creates.push(fetch(`https://api.airtable.com/v0/meta/bases/${DOCS_BASE_ID}/tables/${table.id}/fields`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Shared', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } }),
      }))
    }
    if (creates.length > 0) await Promise.all(creates)
  } catch {
    // Non-fatal — fields may already exist
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Documents() {
  const { isAdmin } = useAuth()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [notConfigured, setNotConfigured] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [sort, setSort] = useState('newest')
  const [selected, setSelected] = useState(null)
  const [attachIdx, setAttachIdx] = useState(0)

  useEffect(() => {
    async function init() {
      if (!DOCS_BASE_ID) { setNotConfigured(true); setLoading(false); return }
      await ensureDocsFields()
      await load()
    }
    init()
  }, [])

  async function load() {
    setLoading(true)
    let res = await fetchAllRecords('Documents', {}, DOCS_BASE_ID)
    if (res.error) {
      res = await fetchAllRecords('Scanned Documents', {}, DOCS_BASE_ID)
    }
    if (res.error) {
      toast.error('Failed to load documents: ' + res.error)
      setLoading(false)
      return
    }
    setDocs((res.data || []).map(parseDoc))
    setLoading(false)
  }

  function handleUpdateDoc(docId, updatedFields) {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, ...updatedFields } : d))
    // Keep modal in sync
    setSelected(prev => prev?.id === docId ? { ...prev, ...updatedFields } : prev)
  }

  // Build filter options from live data
  const categories = useMemo(() => [...new Set(docs.map(d => d.category).filter(Boolean))].sort(), [docs])
  const entities = useMemo(() => [...new Set(docs.map(d => d.entity).filter(Boolean))].sort(), [docs])
  const years = useMemo(() => [...new Set(docs.map(d => fmtYear(d.date)).filter(Boolean))].sort().reverse(), [docs])
  const allTags = useMemo(() => {
    const s = new Set()
    docs.forEach(d => d.tags.forEach(t => s.add(t)))
    return [...s].sort()
  }, [docs])

  // Filtered + sorted list
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let result = docs.filter(d => {
      // Non-admin users only see Shared documents
      if (!isAdmin && !d.shared) return false
      if (filterCategory && d.category !== filterCategory) return false
      if (filterEntity && d.entity !== filterEntity) return false
      if (filterYear && fmtYear(d.date) !== filterYear) return false
      if (filterTag && !d.tags.includes(filterTag)) return false
      if (q && !d.name.toLowerCase().includes(q) && !d.summary.toLowerCase().includes(q) &&
          !d.entity.toLowerCase().includes(q) && !d.category.toLowerCase().includes(q)) return false
      return true
    })

    // Apply sort
    result = [...result]
    if (sort === 'newest') result.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    else if (sort === 'oldest') result.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    else if (sort === 'az') result.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'za') result.sort((a, b) => b.name.localeCompare(a.name))

    return result
  }, [docs, search, filterCategory, filterEntity, filterYear, filterTag, sort, isAdmin])

  const hasFilters = filterCategory || filterEntity || filterYear || filterTag

  if (notConfigured) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
        <AlertTriangle size={32} className="mx-auto text-yellow-500 mb-3" />
        <p className="font-medium text-yellow-800">Documents base is not configured.</p>
        <p className="text-sm text-yellow-700 mt-1">
          Add <code className="bg-yellow-100 px-1 rounded">VITE_AIRTABLE_DOCS_BASE_ID</code> to your{' '}
          <code className="bg-yellow-100 px-1 rounded">.env</code> file and restart the dev server.
        </p>
      </div>
    )
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">{docs.length} records · {filtered.length} shown</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {categories.length > 0 && (
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {entities.length > 0 && (
          <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Entities</option>
            {entities.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        )}

        {years.length > 0 && (
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}

        {allTags.length > 0 && (
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Tags</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        {/* Sort */}
        <select value={sort} onChange={e => setSort(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>

        {hasFilters && (
          <button
            onClick={() => { setFilterCategory(''); setFilterEntity(''); setFilterYear(''); setFilterTag('') }}
            className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">{docs.length === 0 ? 'No documents found.' : 'No results match your filters.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(doc => (
            <DocCard key={doc.id} doc={doc} onClick={() => { setSelected(doc); setAttachIdx(0) }} />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <DocModal
          doc={selected}
          attachIdx={attachIdx}
          setAttachIdx={setAttachIdx}
          onClose={() => setSelected(null)}
          onUpdateDoc={handleUpdateDoc}
        />
      )}
    </div>
  )
}

// ── DocCard ──────────────────────────────────────────────────────────────────

function DocCard({ doc, onClick }) {
  const thumb = doc.attachments[0]?.thumbnails?.large?.url || doc.attachments[0]?.thumbnails?.small?.url
  const displayDate = fmtDate(doc.date)

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow text-left w-full"
    >
      {/* Thumbnail */}
      {thumb ? (
        <div className="h-36 overflow-hidden bg-gray-100">
          <img src={thumb} alt={doc.name} className="w-full h-full object-cover" />
        </div>
      ) : doc.attachments.length > 0 ? (
        <div className="h-36 bg-gray-50 flex items-center justify-center border-b border-gray-100">
          <FileText size={36} className="text-gray-300" />
          <span className="text-xs text-gray-400 ml-2">{doc.attachments.length} file{doc.attachments.length !== 1 ? 's' : ''}</span>
        </div>
      ) : null}

      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-gray-900 text-sm leading-snug line-clamp-2">{doc.name}</p>
          {doc.category && (
            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${categoryColor(doc.category)}`}>
              {doc.category}
            </span>
          )}
        </div>
        {doc.entity && doc.entity !== '—' && <p className="text-xs text-gray-500">{doc.entity}</p>}
        {displayDate && <p className="text-xs text-gray-400">{displayDate}</p>}
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {doc.tags.slice(0, 3).map(t => (
              <span key={t} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t}</span>
            ))}
            {doc.tags.length > 3 && (
              <span className="text-xs text-gray-400">+{doc.tags.length - 3}</span>
            )}
          </div>
        )}
        {doc.summary && doc.summary !== '—' && (
          <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{doc.summary}</p>
        )}
      </div>
    </button>
  )
}

// ── DocModal ─────────────────────────────────────────────────────────────────

function DocModal({ doc, attachIdx, setAttachIdx, onClose, onUpdateDoc }) {
  const attachment = doc.attachments[attachIdx] || null
  const isPdf = attachment?.type === 'application/pdf' || attachment?.filename?.toLowerCase().endsWith('.pdf')
  const isImage = attachment?.type?.startsWith('image/')
  const thumb = attachment?.thumbnails?.large?.url || attachment?.thumbnails?.small?.url
  const total = doc.attachments.length
  const displayDate = fmtDate(doc.date)

  const [localTags, setLocalTags] = useState(doc.tags)
  const [localShared, setLocalShared] = useState(doc.shared)
  const [tagInput, setTagInput] = useState('')
  const tagInputRef = useRef(null)

  const extraFields = Object.entries(doc.raw).filter(([k]) => !STANDARD_KEYS.has(k))

  async function addTag() {
    const tag = tagInput.trim()
    if (!tag || localTags.includes(tag)) { setTagInput(''); return }
    const newTags = [...localTags, tag]
    setLocalTags(newTags)
    setTagInput('')
    onUpdateDoc(doc.id, { tags: newTags })
    const { error } = await updateRecord('Documents', doc.id, { Tags: newTags }, DOCS_BASE_ID)
    if (error) {
      toast.error('Failed to save tag')
      setLocalTags(localTags)
      onUpdateDoc(doc.id, { tags: localTags })
    }
  }

  async function removeTag(tag) {
    const newTags = localTags.filter(t => t !== tag)
    setLocalTags(newTags)
    onUpdateDoc(doc.id, { tags: newTags })
    const { error } = await updateRecord('Documents', doc.id, { Tags: newTags }, DOCS_BASE_ID)
    if (error) {
      toast.error('Failed to remove tag')
      setLocalTags(localTags)
      onUpdateDoc(doc.id, { tags: localTags })
    }
  }

  async function toggleShared() {
    const newShared = !localShared
    setLocalShared(newShared)
    onUpdateDoc(doc.id, { shared: newShared })
    const { error } = await updateRecord('Documents', doc.id, { Shared: newShared }, DOCS_BASE_ID)
    if (error) {
      toast.error('Failed to update Shared flag')
      setLocalShared(localShared)
      onUpdateDoc(doc.id, { shared: localShared })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 text-lg leading-snug">{doc.name}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {doc.category && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor(doc.category)}`}>{doc.category}</span>
              )}
              {doc.entity && doc.entity !== '—' && <span className="text-xs text-gray-500">{doc.entity}</span>}
              {displayDate && <span className="text-xs text-gray-400">{displayDate}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 flex-shrink-0 mt-0.5">
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Attachment Viewer */}
          {total > 0 && (
            <div className="border-b border-gray-100">
              {isImage && attachment?.url && (
                <div className="bg-gray-50 flex items-center justify-center p-4 max-h-80">
                  <img
                    src={attachment.url}
                    alt={attachment.filename}
                    className="max-h-72 max-w-full object-contain rounded-lg shadow"
                  />
                </div>
              )}
              {isPdf && (
                <div className="bg-gray-50">
                  {/* Thumbnail preview */}
                  {thumb && (
                    <div className="flex items-center justify-center p-4 border-b border-gray-100">
                      <img
                        src={thumb}
                        alt={attachment.filename}
                        className="max-h-64 max-w-full object-contain rounded shadow"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-3 py-5">
                    <FileText size={28} className="text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">{attachment.filename}</p>
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-1.5 text-sm text-blue-600 hover:underline"
                      >
                        <ExternalLink size={13} /> Open PDF
                      </a>
                    </div>
                  </div>
                </div>
              )}
              {!isImage && !isPdf && attachment && (
                <div className="bg-gray-50 flex items-center justify-center gap-3 py-6">
                  <FileText size={28} className="text-gray-400" />
                  <a
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                  >
                    <ExternalLink size={13} /> {attachment.filename || 'Open file'}
                  </a>
                </div>
              )}

              {/* Attachment navigation */}
              {total > 1 && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50">
                  <button
                    onClick={() => setAttachIdx(i => Math.max(0, i - 1))}
                    disabled={attachIdx === 0}
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-xs text-gray-500">
                    {attachment?.filename || `File ${attachIdx + 1}`} · {attachIdx + 1} of {total}
                  </span>
                  <button
                    onClick={() => setAttachIdx(i => Math.min(total - 1, i + 1))}
                    disabled={attachIdx === total - 1}
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Text content */}
          <div className="px-6 py-5 space-y-5">
            {doc.summary && doc.summary !== '—' && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Summary</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{doc.summary}</p>
              </div>
            )}
            {doc.notes && doc.notes !== '—' && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Notes</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{doc.notes}</p>
              </div>
            )}

            {/* Tags */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {localTags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-blue-400 hover:text-blue-700 ml-0.5"
                      title="Remove tag"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {localTags.length === 0 && (
                  <span className="text-xs text-gray-400">No tags yet</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={tagInputRef}
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  placeholder="Add a tag…"
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={addTag}
                  className="p-1.5 text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                  title="Add tag"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

            {/* Shared with partners */}
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">Shared with partners</p>
                <p className="text-xs text-gray-400 mt-0.5">Partners with document access can view this record</p>
              </div>
              <button
                onClick={toggleShared}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  localShared ? 'bg-blue-600' : 'bg-gray-200'
                }`}
                role="switch"
                aria-checked={localShared}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                    localShared ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {extraFields.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Additional Fields</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {extraFields.map(([k, v]) => {
                    const display = safeStr(v, '')
                    if (!display) return null
                    return (
                      <div key={k}>
                        <p className="text-xs text-gray-400">{k}</p>
                        <p className="text-sm text-gray-700 font-medium">{display}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {total === 0 && !doc.summary && !doc.notes && (
              <p className="text-sm text-gray-400 text-center py-4">No additional details.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
