import { useEffect, useState, useMemo, useCallback } from 'react'
import { ShoppingBag, ThumbsDown, RotateCcw, ExternalLink } from 'lucide-react'
import { fetchAllRecords, updateRecord, FBM_BASE_ID } from '../lib/airtable'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

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

function scoreBadge(score) {
  if (score == null) return null
  if (score >= 8) return { label: score, cls: 'bg-green-500 text-white' }
  if (score >= 6) return { label: score, cls: 'bg-yellow-500 text-white' }
  return { label: score, cls: 'bg-gray-400 text-white' }
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

// ── Score filter logic ─────────────────────────────────────────────────────────

const SCORE_FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'hot',      label: '🔥 Hot (8-10)' },
  { id: 'good',     label: 'Good (6-7)' },
  { id: 'low',      label: 'Low (1-5)' },
  { id: 'unscored', label: 'Unscored' },
]

function matchesScoreFilter(score, filterId) {
  if (filterId === 'all') return true
  if (filterId === 'hot') return score != null && score >= 8
  if (filterId === 'good') return score != null && score >= 6 && score < 8
  if (filterId === 'low') return score != null && score < 6
  if (filterId === 'unscored') return score == null
  return true
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Deals() {
  const [records, setRecords] = useState([])
  const [searchItemMap, setSearchItemMap] = useState({})   // recordId → Item Name
  const [loading, setLoading] = useState(true)
  const [dismissedCount, setDismissedCount] = useState(0)
  const [showDismissed, setShowDismissed] = useState(false)
  const [scoreFilter, setScoreFilter] = useState('all')
  const [itemFilter, setItemFilter] = useState('all')

  useEffect(() => { load() }, [showDismissed])

  async function load() {
    setLoading(true)
    try {
      const formula = showDismissed ? '' : 'NOT({Dismissed})'
      const [matchesRes, itemsRes, dismissedRes] = await Promise.all([
        fetchAllRecords('matches', {
          filterByFormula: formula,
          sort: { field: 'Date Found', direction: 'desc' },
        }, FBM_BASE_ID),
        fetchAllRecords('search-items', {}, FBM_BASE_ID),
        fetchAllRecords('matches', {
          filterByFormula: '{Dismissed}=TRUE()',
          fields: ['Listing ID'],
        }, FBM_BASE_ID),
      ])

      if (matchesRes.error) throw new Error(matchesRes.error)

      // Build search-item lookup map
      const itemMap = {}
      arr(itemsRes.data).forEach(r => {
        if (r?.id) itemMap[r.id] = safeStr(r.fields?.['Item Name'], r.id)
      })
      setSearchItemMap(itemMap)
      setRecords(matchesRes.data || [])
      setDismissedCount(dismissedRes.data?.length || 0)
    } catch (e) {
      toast.error('Failed to load deals: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // Unique search items for filter bar
  const allItems = useMemo(() => {
    const s = new Set()
    records.forEach(r => {
      const itemId = arr(r.fields?.['search-items'])[0]
      if (itemId && searchItemMap[itemId]) s.add(searchItemMap[itemId])
    })
    return [...s].sort()
  }, [records, searchItemMap])

  // Filtered list
  const filtered = useMemo(() => {
    return records.filter(r => {
      const score = safeNum(r.fields?.['Deal Score'])
      if (!matchesScoreFilter(score, scoreFilter)) return false
      if (itemFilter !== 'all') {
        const itemId = arr(r.fields?.['search-items'])[0]
        const itemName = itemId ? searchItemMap[itemId] : ''
        if (itemName !== itemFilter) return false
      }
      return true
    })
  }, [records, scoreFilter, itemFilter, searchItemMap])

  // Dismiss a deal
  const dismiss = useCallback(async (record) => {
    // Optimistically remove
    setRecords(prev => prev.filter(r => r.id !== record.id))
    setDismissedCount(c => c + 1)

    const { error } = await updateRecord('matches', record.id, { Dismissed: true }, FBM_BASE_ID)
    if (error) {
      toast.error('Failed to dismiss deal')
      setRecords(prev => {
        // Re-insert in roughly the right position (prepend, will re-sort on next load)
        return [record, ...prev]
      })
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

  // Restore a dismissed deal
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
          <h1 className="text-2xl font-bold text-gray-900">Deals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} of {records.length} shown
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
      </div>

      {/* Filter bar */}
      <div className="space-y-2">
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
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── DealCard ──────────────────────────────────────────────────────────────────

function DealCard({ record, searchItemMap, showDismissed, onDismiss, onRestore }) {
  const f = record.fields || {}
  const [imgError, setImgError] = useState(false)

  const score = safeNum(f['Deal Score'])
  const badge = scoreBadge(score)
  const imageUrl = safeStr(f['Image URL'])
  const url = safeStr(f['URL'])
  const title = safeStr(f['Title'], 'Untitled')
  const priceText = safeStr(f['Price Text'])
  const price = priceText || (safeNum(f['Price']) != null ? `$${safeNum(f['Price']).toLocaleString()}` : null)
  const locLine = locationLine(f)
  const withinRange = f['Within Range'] === true
  const date = safeStr(f['Date Found'])
  const isDismissed = f['Dismissed'] === true

  const itemId = arr(f['search-items'])[0]
  const itemName = itemId ? searchItemMap[itemId] : null

  const showImg = imageUrl && !imgError

  function handleCardClick(e) {
    // Don't navigate if clicking the thumb-down or restore buttons
    if (e.target.closest('[data-action]')) return
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      onClick={handleCardClick}
      className={`bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer flex flex-col ${
        isDismissed ? 'opacity-50' : ''
      }`}
    >
      {/* Image area */}
      <div className="relative h-44 bg-gray-100 flex-shrink-0">
        {showImg ? (
          <img
            src={imageUrl}
            alt={title}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag size={40} className="text-gray-300" />
          </div>
        )}

        {/* Score badge */}
        {badge && (
          <div className={`absolute top-2 right-2 ${badge.cls} text-xs font-bold px-2 py-1 rounded-lg shadow`}>
            {badge.label}
          </div>
        )}

        {/* Within Range dot */}
        {withinRange && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-white/90 rounded-full px-2 py-0.5 shadow">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-xs font-medium text-green-700">In range</span>
          </div>
        )}

        {/* External link overlay hint */}
        {url && (
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100">
            <ExternalLink size={14} className="text-white drop-shadow" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        {/* Title */}
        <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{title}</p>

        {/* Price */}
        {price && (
          <p className="text-lg font-bold text-gray-900 leading-none">{price}</p>
        )}

        {/* Location + hub */}
        {locLine && (
          <p className="text-xs text-gray-500 leading-snug">{locLine}</p>
        )}

        {/* Footer row: item tag + date + action button */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {itemName && (
              <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                {itemName}
              </span>
            )}
            {date && (
              <span className="text-xs text-gray-400 flex-shrink-0">{relativeTime(date)}</span>
            )}
          </div>

          {/* Thumb-down / Restore */}
          {isDismissed ? (
            <button
              data-action="restore"
              onClick={e => { e.stopPropagation(); onRestore(record) }}
              title="Restore deal"
              className="flex-shrink-0 p-1.5 text-gray-400 hover:text-green-600 transition-colors"
            >
              <RotateCcw size={15} />
            </button>
          ) : (
            <button
              data-action="dismiss"
              onClick={e => { e.stopPropagation(); onDismiss(record) }}
              title="Dismiss deal"
              className="flex-shrink-0 p-1.5 text-gray-300 hover:text-red-400 transition-colors"
            >
              <ThumbsDown size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
