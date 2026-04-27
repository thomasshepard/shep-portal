import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingBag, ThumbsDown, RotateCcw, X, ExternalLink, Search } from 'lucide-react'
import { fetchAllRecords, updateRecord, FBM_BASE_ID } from '../lib/airtable'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const PAT = import.meta.env.VITE_AIRTABLE_PAT
const PAGE_SIZE = 24

// ── Helpers ────────────────────────────────────────────────────────────────────

const arr = v => Array.isArray(v) ? v : []

function safeStr(val, fallback = '') {
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

function safeNum(val) {
  if (val === null || val === undefined || typeof val === 'object') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function relativeTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400 / 7)}w ago`
  return `${Math.floor(diff / 86400 / 30)}mo ago`
}

function fmtFullDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function scoreBadge(score) {
  if (score == null) return null
  if (score >= 8) return { label: score, cls: 'bg-green-500 text-white' }
  if (score >= 6) return { label: score, cls: 'bg-yellow-500 text-white' }
  return { label: score, cls: 'bg-gray-400 text-white' }
}

function scoreLabel(score) {
  if (score == null) return ''
  if (score >= 8) return 'Strong Deal'
  if (score >= 6) return 'Worth a Look'
  return 'Low Priority'
}

function scoreTextColor(score) {
  if (score == null) return 'text-gray-500'
  if (score >= 8) return 'text-green-600'
  if (score >= 6) return 'text-yellow-600'
  return 'text-gray-500'
}

function locationLine(f) {
  const parts = []
  const loc = safeStr(f['Location'])
  const dist = safeNum(f['Distance (miles)'])
  const hub = safeStr(f['Nearest Hub'])
  if (loc) parts.push(loc)
  if (dist != null) parts.push(`${dist} mi`)
  if (hub) parts.push(hub)
  return parts.join(' · ')
}

// Build Airtable filterByFormula — score filter is server-side
function buildFormula(showDismissed, withinRange, availableOnly, scoreFilter) {
  const parts = []
  if (!showDismissed) parts.push('{Dismissed} != TRUE()')
  if (withinRange) parts.push('{Within Range} = TRUE()')
  if (availableOnly) parts.push('OR({Status} = "Available", {Status} = "", BLANK() = {Status})')
  if (scoreFilter === 'hot')      parts.push('{Deal Score} >= 8')
  else if (scoreFilter === 'good')     parts.push('AND({Deal Score} >= 6, {Deal Score} < 8)')
  else if (scoreFilter === 'low')      parts.push('AND({Deal Score} < 6, NOT(BLANK() = {Deal Score}))')
  else if (scoreFilter === 'unscored') parts.push('BLANK() = {Deal Score}')
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `AND(${parts.join(', ')})`
}

// Fetch a single page of matches from Airtable
async function fetchMatchPage(formula, offset) {
  const query = new URLSearchParams()
  query.set('pageSize', String(PAGE_SIZE))
  query.set('sort[0][field]', 'Date Found')
  query.set('sort[0][direction]', 'desc')
  if (formula) query.set('filterByFormula', formula)
  if (offset) query.set('offset', offset)
  const res = await fetch(
    `https://api.airtable.com/v0/${FBM_BASE_ID}/${encodeURIComponent('matches')}?${query}`,
    { headers: { Authorization: `Bearer ${PAT}` } }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }
  const json = await res.json()
  return { records: json.records || [], nextOffset: json.offset || null }
}

// ── Score filter definitions ──────────────────────────────────────────────────

const SCORE_FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'hot',      label: '🔥 Hot (8-10)' },
  { id: 'good',     label: 'Good (6-7)' },
  { id: 'low',      label: 'Low (1-5)' },
  { id: 'unscored', label: 'Unscored' },
]

// ── Main component ─────────────────────────────────────────────────────────────

export default function Deals() {
  const [records, setRecords] = useState([])
  const [searchItemMap, setSearchItemMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [dismissedCount, setDismissedCount] = useState(0)
  const [showDismissed, setShowDismissed] = useState(false)
  const [withinRange, setWithinRange] = useState(false)
  const [availableOnly, setAvailableOnly] = useState(true)
  const [scoreFilter, setScoreFilter] = useState('all')
  const [itemFilter, setItemFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [keywordFilter, setKeywordFilter] = useState('')

  // Pagination state
  const [pageNum, setPageNum] = useState(1)
  const [nextOffset, setNextOffset] = useState(null)
  const [prevOffsets, setPrevOffsets] = useState([])
  const [fetchTrigger, setFetchTrigger] = useState(0)
  const currentOffsetRef = useRef(undefined)

  // Fetch search-items lookup map once on mount
  useEffect(() => {
    fetchAllRecords('search-items', {}, FBM_BASE_ID).then(res => {
      const map = {}
      arr(res.data).forEach(r => {
        if (r?.id) map[r.id] = safeStr(r.fields?.['Item Name'], r.id)
      })
      setSearchItemMap(map)
    })
  }, [])

  // Reset pagination and re-fetch when filter params change
  useEffect(() => {
    currentOffsetRef.current = undefined
    setPageNum(1)
    setNextOffset(null)
    setPrevOffsets([])
    setFetchTrigger(t => t + 1)
  }, [showDismissed, withinRange, availableOnly, scoreFilter, itemFilter])

  // Fetch current page whenever fetchTrigger increments
  useEffect(() => {
    load(currentOffsetRef.current)
  }, [fetchTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load(offset) {
    setLoading(true)
    try {
      const formula = buildFormula(showDismissed, withinRange, availableOnly, scoreFilter)
      const dismissedFormula = withinRange
        ? 'AND({Dismissed} = TRUE(), {Within Range} = TRUE())'
        : '{Dismissed} = TRUE()'

      const [pageResult, dismissedRes] = await Promise.all([
        fetchMatchPage(formula, offset),
        fetchAllRecords('matches', { filterByFormula: dismissedFormula, fields: ['Listing ID'] }, FBM_BASE_ID),
      ])

      setRecords(pageResult.records)
      setNextOffset(pageResult.nextOffset)
      setDismissedCount(dismissedRes.data?.length || 0)
    } catch (e) {
      toast.error('Failed to load deals: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function goNext() {
    if (!nextOffset) return
    setPrevOffsets(p => [...p, currentOffsetRef.current])
    currentOffsetRef.current = nextOffset
    setPageNum(p => p + 1)
    setFetchTrigger(t => t + 1)
  }

  function goPrev() {
    if (pageNum <= 1) return
    const newPrev = [...prevOffsets]
    currentOffsetRef.current = newPrev.pop()
    setPrevOffsets(newPrev)
    setPageNum(p => p - 1)
    setFetchTrigger(t => t + 1)
  }

  // Item filter is client-side only (linked record — can't easily formula-filter)
  const allItems = useMemo(() => {
    const s = new Set()
    records.forEach(r => {
      const itemId = arr(r.fields?.['search-items'])[0]
      if (itemId && searchItemMap[itemId]) s.add(searchItemMap[itemId])
    })
    return [...s].sort()
  }, [records, searchItemMap])

  const filtered = useMemo(() => {
    let result = records
    if (itemFilter !== 'all') {
      result = result.filter(r => {
        const itemId = arr(r.fields?.['search-items'])[0]
        const itemName = itemId ? searchItemMap[itemId] : ''
        return itemName === itemFilter
      })
    }
    if (keywordFilter.trim()) {
      const kw = keywordFilter.toLowerCase()
      result = result.filter(r => {
        const f = r.fields || {}
        return (
          safeStr(f['Title']).toLowerCase().includes(kw) ||
          safeStr(f['Description']).toLowerCase().includes(kw) ||
          safeStr(f['Seller']).toLowerCase().includes(kw)
        )
      })
    }
    return result
  }, [records, itemFilter, searchItemMap, keywordFilter])

  const dismiss = useCallback(async (record) => {
    setRecords(prev => prev.filter(r => r.id !== record.id))
    setDismissedCount(c => c + 1)
    setSelected(prev => prev?.id === record.id ? null : prev)

    const { error } = await updateRecord('matches', record.id, { Dismissed: true }, FBM_BASE_ID)
    if (error) {
      toast.error('Failed to dismiss deal')
      setRecords(prev => [record, ...prev])
      setDismissedCount(c => c - 1)
      return
    }

    toast(
      t => (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-800">Deal removed</span>
          <button
            onClick={async () => {
              toast.dismiss(t.id)
              await updateRecord('matches', record.id, { Dismissed: false }, FBM_BASE_ID)
              setRecords(prev => [record, ...prev])
              setDismissedCount(c => c - 1)
              toast.success('Deal restored')
            }}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            Undo
          </button>
        </div>
      ),
      { duration: 5000 }
    )
  }, [])

  const restore = useCallback(async (record) => {
    setRecords(prev => prev.map(r =>
      r.id === record.id ? { ...r, fields: { ...r.fields, Dismissed: false } } : r
    ))
    setDismissedCount(c => Math.max(0, c - 1))

    const { error } = await updateRecord('matches', record.id, { Dismissed: false }, FBM_BASE_ID)
    if (error) {
      toast.error('Failed to restore deal')
      setRecords(prev => prev.map(r =>
        r.id === record.id ? { ...r, fields: { ...r.fields, Dismissed: true } } : r
      ))
      setDismissedCount(c => c + 1)
      return
    }
    toast.success('Deal restored')
  }, [])

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facebook Deals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} on this page
            {dismissedCount > 0 && (
              <>
                {' · '}
                <button
                  onClick={() => {
                    setShowDismissed(v => !v)
                    setScoreFilter('all')
                    setItemFilter('all')
                  }}
                  className="text-gray-400 hover:text-gray-700 underline-offset-2 hover:underline"
                >
                  {showDismissed ? 'Hide dismissed' : `Show dismissed (${dismissedCount})`}
                </button>
              </>
            )}
          </p>
        </div>
        <Link
          to="/deals/search-criteria"
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Manage searches →
        </Link>
      </div>

      {/* Filter bar */}
      <div className="space-y-2">
        {/* Keyword search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search titles, descriptions, sellers…"
            value={keywordFilter}
            onChange={e => setKeywordFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Toggle row */}
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleBtn active={withinRange} onClick={() => setWithinRange(v => !v)}>
            📍 Within Range
          </ToggleBtn>
          <ToggleBtn active={availableOnly} onClick={() => setAvailableOnly(v => !v)}>
            ✅ Available only
          </ToggleBtn>
        </div>

        {/* Score filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {SCORE_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setScoreFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                scoreFilter === f.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Item filters */}
        {allItems.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setItemFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                itemFilter === 'all'
                  ? 'bg-gray-800 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              All Items
            </button>
            {allItems.map(item => (
              <button
                key={item}
                onClick={() => setItemFilter(item === itemFilter ? 'all' : item)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  itemFilter === item
                    ? 'bg-gray-800 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ShoppingBag size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-500">
            {records.length === 0
              ? 'No matches found yet. Make sure the Chrome extension is running.'
              : 'No deals match your filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(record => (
            <DealCard
              key={record.id}
              record={record}
              searchItemMap={searchItemMap}
              showDismissed={showDismissed}
              onDismiss={dismiss}
              onRestore={restore}
              onSelect={() => setSelected(record)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(pageNum > 1 || nextOffset) && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">Page {pageNum}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              disabled={pageNum <= 1}
              className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <button
              onClick={goNext}
              disabled={!nextOffset}
              className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <DealModal
          record={selected}
          searchItemMap={searchItemMap}
          onClose={() => setSelected(null)}
          onDismiss={dismiss}
          onRestore={restore}
        />
      )}
    </div>
  )
}

// ── ToggleBtn ──────────────────────────────────────────────────────────────────

function ToggleBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
        active
          ? 'bg-emerald-600 text-white border-emerald-600'
          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

// ── DealCard ──────────────────────────────────────────────────────────────────

function DealCard({ record, searchItemMap, showDismissed, onDismiss, onRestore, onSelect }) {
  const f = record.fields || {}
  const [imgError, setImgError] = useState(false)

  const score = safeNum(f['Deal Score'])
  const badge = scoreBadge(score)
  const imageUrl = safeStr(f['Image URL'])
  const title = safeStr(f['Title']) || safeStr(f['Description']).split('\n')[0].trim().slice(0, 80) || 'Untitled'
  const priceText = safeStr(f['Price Text'])
  const price = safeNum(f['Price'])
  const prevPrice = safeNum(f['Previous Price'])
  const displayPrice = priceText || (price != null && price > 0 ? `$${price.toLocaleString()}` : null)
  const priceDiff = (price != null && price > 0 && prevPrice != null && price !== prevPrice) ? price - prevPrice : null
  const url = safeStr(f['URL'])
  const locLine = locationLine(f)
  const withinRange = f['Within Range'] === true
  const date = safeStr(f['Date Found'])
  const isDismissed = f['Dismissed'] === true
  const itemId = arr(f['search-items'])[0]
  const itemName = itemId ? searchItemMap[itemId] : null
  const showImg = imageUrl && !imgError

  function handleCardClick(e) {
    if (e.target.closest('[data-action]')) return
    onSelect()
  }

  return (
    <div
      onClick={handleCardClick}
      className={`bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer flex flex-col ${
        isDismissed ? 'opacity-50' : ''
      }`}
    >
      <div className="relative h-44 bg-gray-100 flex-shrink-0">
        {showImg ? (
          <img src={imageUrl} alt={title} onError={() => setImgError(true)} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag size={40} className="text-gray-300" />
          </div>
        )}
        {badge && (
          <div className={`absolute top-2 right-2 ${badge.cls} text-xs font-bold px-2 py-1 rounded-lg shadow`}>
            {badge.label}
          </div>
        )}
        {withinRange && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-white/90 rounded-full px-2 py-0.5 shadow">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-xs font-medium text-green-700">In range</span>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{title}</p>
        {displayPrice && (
          <div>
            <p className="text-lg font-bold text-gray-900 leading-none">{displayPrice}</p>
            {priceDiff !== null && (
              <p className={`text-xs mt-0.5 ${priceDiff < 0 ? 'text-green-600' : 'text-orange-500'}`}>
                {priceDiff < 0 ? '📉 Price drop' : '📈 Price up'}
              </p>
            )}
          </div>
        )}
        {locLine && <p className="text-xs text-gray-500 leading-snug">{locLine}</p>}

        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {itemName && (
              <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                {itemName}
              </span>
            )}
            {date && <span className="text-xs text-gray-400 flex-shrink-0">{relativeTime(date)}</span>}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {url && (
              <a
                data-action="link"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                title="Open on Facebook"
                className="p-1.5 text-gray-300 hover:text-blue-500 transition-colors"
              >
                <ExternalLink size={15} />
              </a>
            )}
            {isDismissed ? (
              <button data-action="restore" onClick={e => { e.stopPropagation(); onRestore(record) }} title="Restore deal"
                className="p-1.5 text-gray-400 hover:text-green-600 transition-colors">
                <RotateCcw size={15} />
              </button>
            ) : (
              <button data-action="dismiss" onClick={e => { e.stopPropagation(); onDismiss(record) }} title="Dismiss deal"
                className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
                <ThumbsDown size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── DealModal ─────────────────────────────────────────────────────────────────

function DealModal({ record, searchItemMap, onClose, onDismiss, onRestore }) {
  const f = record.fields || {}
  const [imgError, setImgError] = useState(false)

  const title = safeStr(f['Title']) || safeStr(f['Description']).split('\n')[0].trim().slice(0, 80) || 'Untitled'
  const priceText = safeStr(f['Price Text'])
  const price = safeNum(f['Price'])
  const prevPrice = safeNum(f['Previous Price'])
  const displayPrice = priceText || (price != null && price > 0 ? `$${price.toLocaleString()}` : null)
  const priceDiff = (price != null && price > 0 && prevPrice != null && price !== prevPrice) ? price - prevPrice : null
  const status = safeStr(f['Status'])
  const score = safeNum(f['Deal Score'])
  const scoreNotes = safeStr(f['Score Notes'])
  const description = safeStr(f['Description'])
  const url = safeStr(f['URL'])
  const imageUrl = safeStr(f['Image URL'])
  const date = safeStr(f['Date Found'])
  const hub = safeStr(f['Nearest Hub'])
  const dist = safeNum(f['Distance (miles)'])
  const driveTime = safeNum(f['Drive Time (min)'])
  const seller = safeStr(f['Seller'])
  const isDismissed = f['Dismissed'] === true
  const itemId = arr(f['search-items'])[0]
  const itemName = itemId ? searchItemMap[itemId] : null

  const STATUS_CLS = {
    Available: 'bg-green-100 text-green-700',
    Sold: 'bg-red-100 text-red-700',
    'Price Drop': 'bg-yellow-100 text-yellow-700',
    Unknown: 'bg-gray-100 text-gray-600',
  }
  const statusCls = status ? STATUS_CLS[status] : null

  const logisticsParts = []
  if (hub) logisticsParts.push(hub)
  if (dist != null) logisticsParts.push(`${dist} mi`)
  if (driveTime != null) logisticsParts.push(`~${driveTime} min drive`)
  const logisticsLine = logisticsParts.join(' · ')

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900 text-base leading-snug">{title}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {displayPrice && (
                  <div className="flex items-center gap-2">
                    {priceDiff !== null && (
                      <span className="text-sm text-gray-400 line-through">${prevPrice.toLocaleString()}</span>
                    )}
                    <span className="text-xl font-bold text-gray-900">{displayPrice}</span>
                    {priceDiff !== null && (
                      <span className={`text-sm font-medium ${priceDiff < 0 ? 'text-green-600' : 'text-orange-500'}`}>
                        {priceDiff < 0 ? '📉' : '📈'}
                      </span>
                    )}
                  </div>
                )}
                {status && statusCls && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCls}`}>{status}</span>
                )}
                {itemName && (
                  <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">{itemName}</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 flex-shrink-0 mt-0.5">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {(imageUrl || url) && (
            <div className="border-b border-gray-100">
              {imageUrl && !imgError && (
                <a href={url || imageUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={imageUrl} alt={title} onError={() => setImgError(true)} className="w-full object-cover max-h-72" />
                </a>
              )}
              {url && (
                <div className="px-5 py-3">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:underline">
                    View on Facebook →
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="px-5 py-4 space-y-5">
            {score != null && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">AI Analysis</p>
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-4xl font-black ${scoreTextColor(score)}`}>{score}</span>
                  <div>
                    <p className={`font-semibold ${scoreTextColor(score)}`}>{scoreLabel(score)}</p>
                    <p className="text-xs text-gray-400">out of 10</p>
                  </div>
                </div>
                {scoreNotes && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{scoreNotes}</p>}
              </div>
            )}

            {description && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{description}</p>
              </div>
            )}

            {(logisticsLine || seller) && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Logistics</p>
                {logisticsLine && <p className="text-sm text-gray-700">{logisticsLine}</p>}
                {seller && <p className="text-sm text-gray-500 mt-0.5">Seller: {seller}</p>}
              </div>
            )}

            {date && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Found</p>
                <p className="text-sm text-gray-700">{relativeTime(date)} ({fmtFullDate(date)})</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
          {isDismissed ? (
            <button onClick={() => { onRestore(record); onClose() }}
              className="flex items-center gap-2 text-sm text-green-600 hover:text-green-800 font-medium">
              <RotateCcw size={15} /> Restore deal
            </button>
          ) : (
            <button onClick={() => { onDismiss(record); onClose() }}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-500 font-medium">
              <ThumbsDown size={15} /> Dismiss deal
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
