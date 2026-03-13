import { useEffect, useState, useMemo } from 'react'
import { Search, X, FileText, AlertTriangle, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchAllRecords, DOCS_BASE_ID } from '../lib/airtable'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

// Always returns an array
const arr = v => Array.isArray(v) ? v : []

// Safely render any Airtable field value as a string
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

// Pick first non-empty value from a list of field name aliases
function pick(fields, ...keys) {
  for (const key of keys) {
    const v = fields[key]
    if (v !== null && v !== undefined && v !== '') return v
  }
  return null
}

// Extract structured fields from a raw Airtable record
function parseDoc(record) {
  const f = record.fields || {}
  const attachments = arr(pick(f, 'Attachments', 'File', 'Scan', 'Document'))
  return {
    id: record.id,
    name: safeStr(pick(f, 'Name', 'Document Name', 'Title'), 'Untitled'),
    category: safeStr(pick(f, 'Category', 'Document Type', 'Type'), ''),
    entity: safeStr(pick(f, 'Entity', 'LLC', 'Property', 'Related Entity'), ''),
    date: safeStr(pick(f, 'Date', 'Document Date'), ''),
    summary: safeStr(pick(f, 'Summary', 'AI Summary'), ''),
    notes: safeStr(pick(f, 'Description', 'Notes'), ''),
    attachments,
    raw: f,
  }
}

function fmtYear(dateStr) {
  if (!dateStr || dateStr === '—') return null
  const m = dateStr.match(/(\d{4})/)
  return m ? m[1] : null
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

export default function Documents() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [notConfigured, setNotConfigured] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [selected, setSelected] = useState(null)   // doc open in modal
  const [attachIdx, setAttachIdx] = useState(0)    // current attachment in modal

  useEffect(() => { load() }, [])

  async function load() {
    if (!DOCS_BASE_ID) { setNotConfigured(true); setLoading(false); return }
    setLoading(true)

    // Try "Documents" first, fall back to "Scanned Documents"
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

  // Build filter options from live data
  const categories = useMemo(() => {
    const s = new Set(docs.map(d => d.category).filter(Boolean))
    return [...s].sort()
  }, [docs])

  const entities = useMemo(() => {
    const s = new Set(docs.map(d => d.entity).filter(Boolean))
    return [...s].sort()
  }, [docs])

  const years = useMemo(() => {
    const s = new Set(docs.map(d => fmtYear(d.date)).filter(Boolean))
    return [...s].sort().reverse()
  }, [docs])

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return docs.filter(d => {
      if (filterCategory && d.category !== filterCategory) return false
      if (filterEntity && d.entity !== filterEntity) return false
      if (filterYear && fmtYear(d.date) !== filterYear) return false
      if (q && !d.name.toLowerCase().includes(q) && !d.summary.toLowerCase().includes(q) && !d.entity.toLowerCase().includes(q) && !d.category.toLowerCase().includes(q)) return false
      return true
    })
  }, [docs, search, filterCategory, filterEntity, filterYear])

  if (notConfigured) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
        <AlertTriangle size={32} className="mx-auto text-yellow-500 mb-3" />
        <p className="font-medium text-yellow-800">Documents base is not configured.</p>
        <p className="text-sm text-yellow-700 mt-1">
          Add <code className="bg-yellow-100 px-1 rounded">VITE_AIRTABLE_DOCS_BASE_ID</code> to your <code className="bg-yellow-100 px-1 rounded">.env</code> file and restart the dev server.
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

        {(filterCategory || filterEntity || filterYear) && (
          <button
            onClick={() => { setFilterCategory(''); setFilterEntity(''); setFilterYear('') }}
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
        />
      )}
    </div>
  )
}

function DocCard({ doc, onClick }) {
  const thumb = doc.attachments[0]?.thumbnails?.large?.url || doc.attachments[0]?.thumbnails?.small?.url

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow text-left w-full"
    >
      {/* Thumbnail — Airtable provides thumbnails for both images and PDFs */}
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
        {doc.entity && <p className="text-xs text-gray-500">{doc.entity}</p>}
        {doc.date && doc.date !== '—' && <p className="text-xs text-gray-400">{doc.date}</p>}
        {doc.summary && doc.summary !== '—' && (
          <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{doc.summary}</p>
        )}
      </div>
    </button>
  )
}

function DocModal({ doc, attachIdx, setAttachIdx, onClose }) {
  const attachment = doc.attachments[attachIdx] || null
  const isPdf = attachment?.type === 'application/pdf' || attachment?.filename?.toLowerCase().endsWith('.pdf')
  const isImage = attachment?.type?.startsWith('image/')
  const total = doc.attachments.length

  // Extra fields: show anything not already covered by the standard mapping
  const STANDARD_KEYS = new Set(['Name', 'Document Name', 'Title', 'Category', 'Document Type', 'Type',
    'Entity', 'LLC', 'Property', 'Related Entity', 'Date', 'Document Date',
    'Summary', 'AI Summary', 'Description', 'Notes', 'Attachments', 'File', 'Scan', 'Document'])
  const extraFields = Object.entries(doc.raw).filter(([k]) => !STANDARD_KEYS.has(k))

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
              {doc.entity && <span className="text-xs text-gray-500">{doc.entity}</span>}
              {doc.date && doc.date !== '—' && <span className="text-xs text-gray-400">{doc.date}</span>}
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
                <div className="bg-gray-50 flex items-center justify-center gap-3 py-8">
                  <FileText size={32} className="text-gray-400" />
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
          <div className="px-6 py-5 space-y-4">
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
