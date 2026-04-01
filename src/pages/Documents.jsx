import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Search, X, FileText, AlertTriangle, ExternalLink, Calendar,
  ChevronLeft, ChevronRight, ChevronDown, Plus, Upload, Share2, Flag, Mail,
} from 'lucide-react'
import { fetchAllRecords, updateRecord, DOCS_BASE_ID } from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const PAT = import.meta.env.VITE_AIRTABLE_PAT
const DOCS_TABLE_ID = 'tbltkTOMpJHPIUBXN'
const DRIVE_FOLDER_ID = '1RTkUVNYXnbYjd8gNPBgzgx_N9RWWFNTD'
const PAGE_SIZE = 25

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

// Formats any ISO date or datetime string → "Sep 25, 2025"
function fmtDate(str) {
  if (!str || str === '—') return null
  const d = new Date(str.includes('T') ? str : str + 'T12:00:00')
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtYear(str) {
  if (!str || str === '—') return null
  const m = str.match(/(\d{4})/)
  return m ? m[1] : null
}

function parseDoc(record) {
  const f = record.fields || {}
  const attachments = arr(pick(f, 'Attachments', 'File', 'Scan', 'Document'))
  // Tags is a singleLineText field containing a plain comma-separated string
  const tags = safeStr(f['Tags'] || f['fldNDnNI658sbNde0'] || '', '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
  return {
    id: record.id,
    createdTime: record.createdTime || '',
    date: safeStr(pick(f, 'Date', 'Document Date'), ''),
    name: safeStr(pick(f, 'Name', 'Document Name', 'Title'), 'Untitled'),
    category: safeStr(pick(f, 'Category', 'Document Type', 'Type'), ''),
    entity: safeStr(pick(f, 'Entity', 'LLC', 'Property', 'Related Entity'), ''),
    summary: safeStr(pick(f, 'Summary', 'AI Summary'), ''),
    notes: safeStr(pick(f, 'Description', 'Notes'), ''),
    isMail: f['IsMail'] === true,
    sender: safeStr(f['Sender'] || '', ''),
    recipient: safeStr(f['Recipient'] || '', ''),
    ocr: safeStr(f['OCR'] || '', ''),
    tags,
    shared: f['Shared'] === true,
    duplicate: f['Duplicate'] === true,
    attachments,
    raw: f,
  }
}

const CATEGORY_COLORS = {
  default:   'bg-blue-50 text-blue-700',
  tax:       'bg-green-50 text-green-700',
  legal:     'bg-purple-50 text-purple-700',
  insurance: 'bg-orange-50 text-orange-700',
  financial: 'bg-teal-50 text-teal-700',
  deed:      'bg-yellow-50 text-yellow-700',
  contract:  'bg-pink-50 text-pink-700',
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
  { id: 'az',     label: 'Name A–Z' },
  { id: 'za',     label: 'Name Z–A' },
]

const STANDARD_KEYS = new Set([
  'Name', 'Document Name', 'Title',
  'Category', 'Document Type', 'Type',
  'Entity', 'LLC', 'Property', 'Related Entity',
  'Date', 'Document Date',
  'Summary', 'AI Summary',
  'Description', 'Notes',
  'Attachments', 'File', 'Scan', 'Document',
  'Tags', 'Shared', 'Duplicate',
  'IsMail', 'Sender', 'Recipient', 'OCR',
  'Created', 'Last Modified', 'Needs Cleanup',
])

// Ensure Tags, Shared, Duplicate fields exist; create if missing
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
    if (!fieldNames.has('Duplicate')) {
      creates.push(fetch(`https://api.airtable.com/v0/meta/bases/${DOCS_BASE_ID}/tables/${table.id}/fields`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Duplicate', type: 'checkbox', options: { icon: 'check', color: 'redBright' } }),
      }))
    }
    if (creates.length > 0) await Promise.all(creates)
  } catch {
    // Non-fatal — fields may already exist
  }
}


function paginationPages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i)
  const pages = []
  const left = Math.max(0, current - 2)
  const right = Math.min(total - 1, current + 2)
  if (left > 0) { pages.push(0); if (left > 1) pages.push('…') }
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total - 1) { if (right < total - 2) pages.push('…'); pages.push(total - 1) }
  return pages
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Documents() {
  const { isAdmin, profile } = useAuth()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [notConfigured, setNotConfigured] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCategories, setFilterCategories] = useState([])
  const [filterEntity, setFilterEntity] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterTags, setFilterTags] = useState([])
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(null)
  const [attachIdx, setAttachIdx] = useState(0)

  const fileInputRef = useRef(null)
  const gridRef = useRef(null)

  useEffect(() => {
    async function init() {
      if (!DOCS_BASE_ID) { setNotConfigured(true); setLoading(false); return }
      await ensureDocsFields()
      await load()
    }
    init()
  }, [])

  // Reset to page 1 when filters or sort change
  useEffect(() => { setPage(0) }, [search, filterCategories, filterEntity, filterYear, filterTags, sort])

  async function load() {
    setLoading(true)
    let res = await fetchAllRecords('Documents', {}, DOCS_BASE_ID)
    if (res.error) res = await fetchAllRecords('Scanned Documents', {}, DOCS_BASE_ID)
    if (res.error) {
      toast.error('Failed to load documents: ' + res.error)
      setLoading(false)
      return
    }
    // Filter out duplicates at load time — never show them
    setDocs((res.data || []).map(parseDoc).filter(d => !d.duplicate))
    setLoading(false)
  }

  function handleUpdateDoc(docId, updatedFields) {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, ...updatedFields } : d))
    setSelected(prev => prev?.id === docId ? { ...prev, ...updatedFields } : prev)
  }

  function handleMarkDuplicate(docId) {
    setDocs(prev => prev.filter(d => d.id !== docId))
    setSelected(null)
  }

  function handleAddDocument() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    window.open(`https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`, '_blank')
    toast('Google Drive opened — drag your file into the folder. n8n will process it automatically.', { icon: '📂', duration: 6000 })
  }

  function goToPage(p) {
    setPage(p)
    setTimeout(() => gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  // Build filter option lists
  const categories = useMemo(() => [...new Set(docs.map(d => d.category).filter(c => c && c !== '—'))].sort(), [docs])
  const entities   = useMemo(() => [...new Set(docs.map(d => d.entity).filter(e => e && e !== '—'))].sort(), [docs])
  const years      = useMemo(() => [...new Set(docs.map(d => fmtYear(d.createdTime)).filter(Boolean))].sort().reverse(), [docs])
  const allTags    = useMemo(() => {
    const s = new Set()
    docs.forEach(d => d.tags.forEach(t => s.add(t)))
    return [...s].sort()
  }, [docs])

  // Tags the current non-admin user is allowed to see (null = admin, sees all)
  const userAllowedTags = useMemo(() => {
    if (isAdmin) return null
    const v = profile?.allowed_tags
    if (!v) return []
    return Array.isArray(v) ? v : v.split(',').map(t => t.trim()).filter(Boolean)
  }, [isAdmin, profile])

  // Filtered + sorted list
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let result = docs.filter(d => {
      if (!isAdmin) {
        if (!userAllowedTags?.length) return false
        if (!d.tags.some(t => userAllowedTags.includes(t))) return false
      }
      if (filterCategories.length > 0 && !filterCategories.includes(d.category)) return false
      if (filterEntity && d.entity !== filterEntity) return false
      if (filterYear && fmtYear(d.createdTime) !== filterYear) return false
      if (filterTags.length > 0 && !filterTags.some(t => d.tags.includes(t))) return false
      if (q && !d.name.toLowerCase().includes(q) &&
          !d.summary.toLowerCase().includes(q) &&
          !d.entity.toLowerCase().includes(q) &&
          !d.category.toLowerCase().includes(q)) return false
      return true
    })
    // Sort by filed date (createdTime) or name
    result = [...result]
    if (sort === 'newest') result.sort((a, b) => b.createdTime.localeCompare(a.createdTime))
    else if (sort === 'oldest') result.sort((a, b) => a.createdTime.localeCompare(b.createdTime))
    else if (sort === 'az') result.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'za') result.sort((a, b) => b.name.localeCompare(a.name))
    return result
  }, [docs, search, filterCategories, filterEntity, filterYear, filterTags, sort, isAdmin, userAllowedTags])

  const pageCount  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const hasFilters = filterCategories.length > 0 || filterEntity || filterYear || filterTags.length > 0

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
        {isAdmin && (
          <button
            onClick={handleAddDocument}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Upload size={15} />
            Add Document
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="w-full h-9 pl-9 pr-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {categories.length > 0 && (
          <MultiSelectDropdown
            label="All Categories"
            options={categories}
            selected={filterCategories}
            onChange={setFilterCategories}
          />
        )}

        {entities.length > 0 && (
          <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} className="h-9 text-sm border border-gray-300 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Entities</option>
            {entities.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        )}

        {years.length > 0 && (
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="h-9 text-sm border border-gray-300 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}

        {allTags.length > 0 && (
          <MultiSelectDropdown
            label="All Tags"
            options={allTags}
            selected={filterTags}
            onChange={setFilterTags}
          />
        )}

        <select value={sort} onChange={e => setSort(e.target.value)} className="h-9 text-sm border border-gray-300 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>

        {hasFilters && (
          <button
            onClick={() => { setFilterCategories([]); setFilterEntity(''); setFilterYear(''); setFilterTags([]) }}
            className="h-9 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Grid */}
      <div ref={gridRef}>
        {paginated.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FileText size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">{docs.length === 0 ? 'No documents found.' : 'No results match your filters.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginated.map(doc => (
              <DocCard key={doc.id} doc={doc} onClick={() => { setSelected(doc); setAttachIdx(0) }} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <PaginationBar
          page={page}
          pageCount={pageCount}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          onPage={goToPage}
        />
      )}

      {/* Detail Modal */}
      {selected && (
        <DocModal
          doc={selected}
          attachIdx={attachIdx}
          setAttachIdx={setAttachIdx}
          onClose={() => setSelected(null)}
          onUpdateDoc={handleUpdateDoc}
          onMarkDuplicate={handleMarkDuplicate}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}

// ── MultiSelectDropdown ───────────────────────────────────────────────────────

function MultiSelectDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const buttonLabel = selected.length === 0
    ? label
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="h-9 text-sm border border-gray-300 rounded-lg px-3 bg-white flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
      >
        {buttonLabel}
        <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-44 py-1 max-h-60 overflow-y-auto">
          <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.length === 0}
              onChange={() => onChange([])}
              className="rounded"
            />
            <span className="text-sm text-gray-700">All</span>
          </label>
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => {
                  if (selected.includes(opt)) onChange(selected.filter(s => s !== opt))
                  else onChange([...selected, opt])
                }}
                className="rounded"
              />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PaginationBar ─────────────────────────────────────────────────────────────

function PaginationBar({ page, pageCount, total, pageSize, onPage }) {
  const start = page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, total)
  const pages = paginationPages(page, pageCount)

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
      <p className="text-sm text-gray-500">Showing {start}–{end} of {total}</p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-2 text-gray-400 text-sm">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`min-w-[32px] h-8 rounded-lg text-sm font-medium transition-colors ${
                p === page
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p + 1}
            </button>
          )
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === pageCount - 1}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ── DocCard ──────────────────────────────────────────────────────────────────

function DocCard({ doc, onClick }) {
  const thumb = doc.attachments[0]?.thumbnails?.large?.url || doc.attachments[0]?.thumbnails?.small?.url
  const filedDate = fmtDate(doc.createdTime)
  const ext = doc.attachments[0]?.filename?.split('.').pop()?.toLowerCase() || ''
  const isPdf = ext === 'pdf' || doc.attachments[0]?.type === 'application/pdf'
  const isImg = doc.attachments[0]?.type?.startsWith('image/')

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 transition-all text-left w-full"
    >
      {thumb ? (
        <div className="h-20 overflow-hidden bg-gray-100 rounded-t-xl">
          <img src={thumb} alt={doc.name} className="w-full h-full object-cover" />
        </div>
      ) : doc.attachments.length > 0 ? (
        <div className={`h-20 flex items-center justify-center border-b rounded-t-xl ${isPdf ? 'bg-red-50' : isImg ? 'bg-blue-50' : 'bg-gray-50'}`}>
          <span className={`text-3xl font-bold tracking-tight select-none ${isPdf ? 'text-red-200' : isImg ? 'text-blue-200' : 'text-gray-200'}`}>
            {isPdf ? 'P' : isImg ? 'I' : 'F'}
          </span>
        </div>
      ) : null}

      <div className="p-5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-gray-900 text-[14px] leading-snug line-clamp-2">{doc.name}</p>
          {doc.category && doc.category !== '—' && (
            <span className={`text-xs px-2.5 py-0.5 rounded-full flex-shrink-0 font-medium ${categoryColor(doc.category)}`}>
              {doc.category}
            </span>
          )}
        </div>
        {doc.entity && doc.entity !== '—' && <p className="text-xs text-gray-500">{doc.entity}</p>}
        {filedDate && (
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Calendar size={10} className="flex-shrink-0" />
            Filed {filedDate}
          </p>
        )}
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {doc.tags.slice(0, 3).map(t => (
              <span key={t} className="text-xs bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{t}</span>
            ))}
            {doc.tags.length > 3 && <span className="text-xs text-gray-400">+{doc.tags.length - 3}</span>}
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

function DocModal({ doc, attachIdx, setAttachIdx, onClose, onUpdateDoc, onMarkDuplicate, isAdmin }) {
  const attachment = doc.attachments[attachIdx] || null
  const isPdf   = attachment?.type === 'application/pdf' || attachment?.filename?.toLowerCase().endsWith('.pdf')
  const isImage = attachment?.type?.startsWith('image/')
  const thumb   = attachment?.thumbnails?.large?.url || attachment?.thumbnails?.small?.url
  const total   = doc.attachments.length

  const filedDate = fmtDate(doc.createdTime)
  const docDate   = fmtDate(doc.date)

  const [localTags, setLocalTags] = useState(doc.tags)
  const [tagInput, setTagInput] = useState('')
  const [ocrOpen, setOcrOpen] = useState(false)
  const [localShared, setLocalShared] = useState(doc.shared)
  const tagInputRef = useRef(null)

  const extraFields = Object.entries(doc.raw).filter(([k]) => !STANDARD_KEYS.has(k))

  // Share via SMS
  function handleShare() {
    const url = doc.attachments[0]?.url || ''
    const msg = `${doc.name} — ${url}`
    window.location.href = 'sms:?body=' + encodeURIComponent(msg)
  }

  async function addTag() {
    const tag = tagInput.trim()
    if (!tag || localTags.includes(tag)) { setTagInput(''); return }
    const newTags = [...localTags, tag]
    setLocalTags(newTags)
    setTagInput('')
    onUpdateDoc(doc.id, { tags: newTags })
    const { error } = await updateRecord('Documents', doc.id, { Tags: newTags.join(', ') }, DOCS_BASE_ID)
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
    const { error } = await updateRecord('Documents', doc.id, { Tags: newTags.join(', ') }, DOCS_BASE_ID)
    if (error) {
      toast.error('Failed to remove tag')
      setLocalTags(localTags)
      onUpdateDoc(doc.id, { tags: localTags })
    }
  }

  async function toggleShared() {
    const newVal = !localShared
    setLocalShared(newVal)
    onUpdateDoc(doc.id, { shared: newVal })
    const { error } = await updateRecord('Documents', doc.id, { Shared: newVal }, DOCS_BASE_ID)
    if (error) {
      toast.error('Failed to update shared status')
      setLocalShared(!newVal)
      onUpdateDoc(doc.id, { shared: !newVal })
    }
  }

  async function handleMarkDuplicate() {
    const { error } = await updateRecord('Documents', doc.id, { Duplicate: true }, DOCS_BASE_ID)
    if (error) { toast.error('Failed to mark as duplicate'); return }
    toast.success('Marked as duplicate')
    onMarkDuplicate(doc.id)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 text-xl leading-snug">{doc.name}</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {doc.category && doc.category !== '—' && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${categoryColor(doc.category)}`}>{doc.category}</span>
              )}
              {doc.isMail && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                  <Mail size={10} /> Physical mail
                </span>
              )}
              {doc.entity && doc.entity !== '—' && <span className="text-xs text-gray-500">{doc.entity}</span>}
              {filedDate && <span className="text-xs text-gray-400">Filed: {filedDate}</span>}
              {docDate && <span className="text-xs text-gray-400">Doc date: {docDate}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
            <button
              onClick={handleShare}
              disabled={doc.attachments.length === 0}
              title="Share via SMS"
              className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            >
              <Share2 size={18} />
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700">
              <X size={18} />
            </button>
          </div>
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
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Summary</p>
                <div className="bg-blue-50/70 rounded-lg p-3">
                  <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{doc.summary}</p>
                </div>
              </div>
            )}
            {doc.notes && doc.notes !== '—' && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Notes</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{doc.notes}</p>
              </div>
            )}

            {/* Mail Details — only when IsMail = true */}
            {doc.isMail && (doc.sender || doc.recipient) && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Mail Details</p>
                <div className="border border-gray-200 rounded-lg p-3 grid grid-cols-[4rem_1fr] gap-x-4 gap-y-2">
                  {doc.sender && (
                    <>
                      <span className="text-xs text-gray-400 font-medium pt-0.5">From</span>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{doc.sender}</p>
                    </>
                  )}
                  {doc.recipient && (
                    <>
                      <span className="text-xs text-gray-400 font-medium pt-0.5">To</span>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{doc.recipient}</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Tags */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Tags</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {localTags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="text-teal-400 hover:text-teal-700 ml-0.5" title="Remove tag">
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {localTags.length === 0 && <span className="text-xs text-gray-400">No tags yet</span>}
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
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Shared with Partners</p>
                <p className="text-xs text-gray-400 mt-0.5">Visible to partner users</p>
              </div>
              <button
                onClick={isAdmin ? toggleShared : undefined}
                disabled={!isAdmin}
                title={isAdmin ? (localShared ? 'Click to unshare' : 'Click to share') : 'Admin only'}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  localShared ? 'bg-blue-500' : 'bg-gray-200'
                } ${isAdmin ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    localShared ? 'translate-x-4' : 'translate-x-0.5'
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
                    if (!display || display === '—') return null
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

            {/* OCR text — collapsible, collapsed by default */}
            {doc.ocr && doc.ocr !== '—' && (
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Full OCR Text</p>
                  <button
                    onClick={() => setOcrOpen(o => !o)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {ocrOpen ? 'Hide text' : 'Show text'}
                  </button>
                </div>
                {ocrOpen && (
                  <pre className="font-mono text-xs text-gray-600 bg-gray-50 rounded-lg p-3 max-h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {doc.ocr}
                  </pre>
                )}
              </div>
            )}

            {total === 0 && !doc.summary && !doc.notes && (
              <p className="text-sm text-gray-400 text-center py-4">No additional details.</p>
            )}

            {/* Duplicate flag — admin only */}
            {isAdmin && (
              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={handleMarkDuplicate}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Flag size={12} /> Mark as Duplicate
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
