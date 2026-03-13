import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Search, X, FileText, AlertTriangle, ExternalLink,
  ChevronLeft, ChevronRight, Plus, Upload, Share2, Flag,
} from 'lucide-react'
import { fetchAllRecords, updateRecord, DOCS_BASE_ID } from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const PAT = import.meta.env.VITE_AIRTABLE_PAT
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
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
  const rawTags = arr(f['Tags'])
  const tags = rawTags.map(t => (typeof t === 'object' ? (t.name || '') : String(t))).filter(Boolean)
  return {
    id: record.id,
    createdTime: record.createdTime || '',            // filed date — top-level Airtable field
    date: safeStr(pick(f, 'Date', 'Document Date'), ''), // document date from AI extraction
    name: safeStr(pick(f, 'Name', 'Document Name', 'Title'), 'Untitled'),
    category: safeStr(pick(f, 'Category', 'Document Type', 'Type'), ''),
    entity: safeStr(pick(f, 'Entity', 'LLC', 'Property', 'Related Entity'), ''),
    summary: safeStr(pick(f, 'Summary', 'AI Summary'), ''),
    notes: safeStr(pick(f, 'Description', 'Notes'), ''),
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

async function uploadToDrive(accessToken, file) {
  const metadata = { name: file.name, parents: [DRIVE_FOLDER_ID] }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', file)
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
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
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(null)
  const [attachIdx, setAttachIdx] = useState(0)

  // Google Drive upload state
  const [uploading, setUploading] = useState(false)
  const [gisReady, setGisReady] = useState(false)
  const fileInputRef = useRef(null)
  const pendingFileRef = useRef(null)
  const tokenClientRef = useRef(null)
  const gridRef = useRef(null)

  // Load GIS script for Google Drive upload (admin only)
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !isAdmin) return
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => {
      tokenClientRef.current = window.google?.accounts?.oauth2?.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: async (response) => {
          if (response.error || !pendingFileRef.current) {
            toast.error('Google auth failed')
            setUploading(false)
            return
          }
          try {
            await uploadToDrive(response.access_token, pendingFileRef.current)
            toast.success('Document uploaded — n8n will process it shortly')
          } catch (e) {
            toast.error('Upload failed: ' + e.message)
          } finally {
            setUploading(false)
            pendingFileRef.current = null
          }
        },
      })
      if (tokenClientRef.current) setGisReady(true)
    }
    document.head.appendChild(script)
    return () => { try { document.head.removeChild(script) } catch {} }
  }, [isAdmin])

  useEffect(() => {
    async function init() {
      if (!DOCS_BASE_ID) { setNotConfigured(true); setLoading(false); return }
      await ensureDocsFields()
      await load()
    }
    init()
  }, [])

  // Reset to page 1 when filters or sort change
  useEffect(() => { setPage(0) }, [search, filterCategory, filterEntity, filterYear, filterTag, sort])

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
    if (!tokenClientRef.current) {
      toast.error('Google auth not ready — try again in a moment')
      return
    }
    pendingFileRef.current = file
    setUploading(true)
    tokenClientRef.current.requestAccessToken({ prompt: '' })
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

  // Filtered + sorted list
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let result = docs.filter(d => {
      if (!isAdmin && !d.shared) return false
      if (filterCategory && d.category !== filterCategory) return false
      if (filterEntity && d.entity !== filterEntity) return false
      if (filterYear && fmtYear(d.createdTime) !== filterYear) return false
      if (filterTag && !d.tags.includes(filterTag)) return false
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
  }, [docs, search, filterCategory, filterEntity, filterYear, filterTag, sort, isAdmin])

  const pageCount  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
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
        {isAdmin && (
          <button
            onClick={handleAddDocument}
            disabled={uploading || !GOOGLE_CLIENT_ID || (GOOGLE_CLIENT_ID && !gisReady)}
            title={!GOOGLE_CLIENT_ID ? 'Google OAuth not configured — see CLAUDE.md' : 'Upload PDF to Google Drive'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Upload size={15} />
            {uploading ? 'Uploading…' : 'Add Document'}
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

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow text-left w-full"
    >
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
          {doc.category && doc.category !== '—' && (
            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${categoryColor(doc.category)}`}>
              {doc.category}
            </span>
          )}
        </div>
        {doc.entity && doc.entity !== '—' && <p className="text-xs text-gray-500">{doc.entity}</p>}
        {filedDate && <p className="text-xs text-gray-400">Filed {filedDate}</p>}
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {doc.tags.slice(0, 3).map(t => (
              <span key={t} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t}</span>
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
  const [localShared, setLocalShared] = useState(doc.shared)
  const [tagInput, setTagInput] = useState('')
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
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 text-lg leading-snug">{doc.name}</h2>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {doc.category && doc.category !== '—' && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor(doc.category)}`}>{doc.category}</span>
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
                    <button onClick={() => removeTag(tag)} className="text-blue-400 hover:text-blue-700 ml-0.5" title="Remove tag">
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
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  localShared ? 'translate-x-5' : 'translate-x-0'
                }`} />
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
