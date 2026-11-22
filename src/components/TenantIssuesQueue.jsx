import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth.jsx'
import TenantLogForm from './TenantLogForm.jsx'
import {
  fetchOpenIssues,
  setLogStatus,
  TL_READ,
  TL_TYPES,
  safeStr,
  arr,
} from '../lib/tenantLog.js'
import { fmtDate } from '../lib/airtable.js'

function getStatusBadgeClass(status) {
  const s = safeStr(status).toLowerCase()
  if (s === 'resolved') {
    return 'bg-green-100 text-green-700'
  }
  if (s === 'in progress') {
    return 'bg-blue-100 text-blue-700'
  }
  return 'bg-amber-100 text-amber-700'
}

function sortIssues(list) {
  return [...list].sort((a, b) => {
    const isUrgentA = safeStr(a.fields?.[TL_READ.URGENCY]).trim().toLowerCase() === 'urgent'
    const isUrgentB = safeStr(b.fields?.[TL_READ.URGENCY]).trim().toLowerCase() === 'urgent'
    if (isUrgentA && !isUrgentB) return -1
    if (!isUrgentA && isUrgentB) return 1

    const dateA = safeStr(a.fields?.[TL_READ.DATE])
    const dateB = safeStr(b.fields?.[TL_READ.DATE])
    if (dateA && dateB && dateA !== dateB) {
      return dateA.localeCompare(dateB)
    }
    if (dateA && !dateB) return -1
    if (!dateA && dateB) return 1

    const createdA = safeStr(a.createdTime)
    const createdB = safeStr(b.createdTime)
    return createdA.localeCompare(createdB)
  })
}

export default function TenantIssuesQueue({ properties = [] }) {
  const { isAdmin, isVA } = useAuth()

  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [resolvingId, setResolvingId] = useState(null)
  const [resolutionText, setResolutionText] = useState('')
  const [statusUpdating, setStatusUpdating] = useState(null)

  const loadIssues = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await fetchOpenIssues()
      if (err) {
        toast.error('Failed to load open issues: ' + err)
        setError(err)
        setIssues([])
      } else {
        setIssues(data || [])
      }
    } catch (err) {
      const msg = err.message || String(err)
      toast.error('Failed to load open issues: ' + msg)
      setError(msg)
      setIssues([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin || isVA) {
      loadIssues()
    }
  }, [isAdmin, isVA, loadIssues])

  if (!isAdmin && !isVA) {
    return null
  }

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleStatusSelect(record, nextStatus) {
    const currentStatus = safeStr(record.fields?.[TL_READ.STATUS], 'Open')
    if (nextStatus === currentStatus && resolvingId !== record.id) return

    if (nextStatus === 'Resolved') {
      setResolvingId(record.id)
      setResolutionText('')
      return
    }

    if (resolvingId === record.id) {
      setResolvingId(null)
    }

    setStatusUpdating(record.id)
    const { error: updateErr } = await setLogStatus(record.id, nextStatus)
    setStatusUpdating(null)

    if (updateErr) {
      toast.error('Failed to update status: ' + updateErr)
      return
    }

    toast.success(`Status updated to ${nextStatus}`)
    setIssues((prev) => {
      const updated = prev.map((item) => {
        if (item.id === record.id) {
          return {
            ...item,
            fields: {
              ...item.fields,
              [TL_READ.STATUS]: nextStatus,
            },
          }
        }
        return item
      })
      return sortIssues(updated)
    })
  }

  async function handleConfirmResolution(recordId) {
    setStatusUpdating(recordId)
    const trimmed = resolutionText.trim()
    const { error: updateErr } = await setLogStatus(recordId, 'Resolved', trimmed || undefined)
    setStatusUpdating(null)

    if (updateErr) {
      toast.error('Failed to update status: ' + updateErr)
      return
    }

    toast.success('Status updated to Resolved')
    setResolvingId(null)
    setResolutionText('')

    setIssues((prev) => prev.filter((item) => item.id !== recordId))
  }

  const filteredIssues = issues.filter((record) => {
    const rf = record.fields || {}
    if (propertyFilter !== 'all') {
      const propLinks = arr(rf[TL_READ.PROPERTY])
      if (!propLinks.includes(propertyFilter)) return false
    }
    if (typeFilter !== 'all') {
      const issueType = safeStr(rf[TL_READ.TYPE])
      if (issueType !== typeFilter) return false
    }
    return true
  })

  function renderRow(record) {
    const rf = record.fields || {}
    const date = rf[TL_READ.DATE] || (record.createdTime ? record.createdTime.split('T')[0] : '')
    const type = safeStr(rf[TL_READ.TYPE])
    const urgency = safeStr(rf[TL_READ.URGENCY])
    const status = safeStr(rf[TL_READ.STATUS]) || 'Open'
    const summary = safeStr(rf[TL_READ.SUMMARY])
    const loggedBy = safeStr(rf[TL_READ.LOGGED_BY])
    const details = safeStr(rf[TL_READ.DETAILS])
    const resolution = safeStr(rf[TL_READ.RESOLUTION])
    const resolvedDate = rf[TL_READ.RESOLVED_DATE]
    const expanded = expandedIds.has(record.id)
    const isResolving = resolvingId === record.id

    const propId = arr(rf[TL_READ.PROPERTY])[0]
    const propRecord = arr(properties).find((p) => p.id === propId)
    const address = propRecord?.fields?.Address || propRecord?.fields?.Name || (propId ? 'Property' : '—')

    return (
      <div key={record.id} className="border border-gray-100 rounded-lg overflow-hidden bg-white">
        <div
          className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => toggleExpand(record.id)}
        >
          <div className="flex-1 min-w-0">
            {propId ? (
              <Link
                to={`/properties/${propId}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center min-h-[44px] sm:min-h-0 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline break-words"
              >
                {address}
              </Link>
            ) : (
              <span className="inline-flex items-center min-h-[44px] sm:min-h-0 text-sm font-medium text-gray-700 break-words">
                {address}
              </span>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-800 text-sm break-words">
                {summary || 'Untitled entry'}
              </span>
              {urgency === 'Urgent' && (
                <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  Urgent
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(status)}`}>
                {status}
              </span>
            </div>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-1">
              {date && <span>{fmtDate(date)}</span>}
              {type && <span>{type}</span>}
              {loggedBy && <span>Logged by {loggedBy}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-1 flex-1 sm:hidden">
              {['Open', 'In progress', 'Resolved'].map((s) => {
                const isActive = (isResolving ? 'Resolved' : status) === s
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={statusUpdating === record.id}
                    aria-pressed={isActive}
                    onClick={() => handleStatusSelect(record, s)}
                    className={`min-h-[44px] rounded-lg border text-xs font-medium px-1 transition-colors ${
                      isActive
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-300 text-gray-700 active:bg-gray-100'
                    }`}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
            <select
              value={isResolving ? 'Resolved' : status}
              onChange={(e) => handleStatusSelect(record, e.target.value)}
              disabled={statusUpdating === record.id}
              className="hidden sm:block text-xs font-medium border border-gray-300 rounded-lg px-2 py-1 bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              title="Change status"
            >
              <option value="Open">Open</option>
              <option value="In progress">In progress</option>
              <option value="Resolved">Resolved</option>
            </select>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleExpand(record.id)
              }}
              className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 text-gray-400 hover:text-gray-700"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
        </div>

        {isResolving && (
          <div
            className="border-t border-blue-100 bg-blue-50/80 p-3 flex flex-col sm:flex-row sm:items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <label htmlFor={`resolution-${record.id}`} className="text-xs font-medium text-blue-900 whitespace-nowrap">
              Resolution (optional):
            </label>
            <input
              id={`resolution-${record.id}`}
              type="text"
              value={resolutionText}
              onChange={(e) => setResolutionText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleConfirmResolution(record.id)
                } else if (e.key === 'Escape') {
                  setResolvingId(null)
                }
              }}
              placeholder="What fixed it?"
              className="flex-1 min-w-0 min-h-[44px] sm:min-h-0 border border-blue-300 rounded-lg px-2.5 py-1 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              autoFocus
              disabled={statusUpdating === record.id}
            />
            <div className="flex items-center gap-2 sm:flex-shrink-0">
              <button
                type="button"
                onClick={() => handleConfirmResolution(record.id)}
                disabled={statusUpdating === record.id}
                className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 px-3 py-1 text-sm sm:text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {statusUpdating === record.id ? 'Saving…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setResolvingId(null)}
                disabled={statusUpdating === record.id}
                className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 px-3 py-1 text-sm sm:text-xs text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {expanded && (
          <div className="border-t border-gray-100 p-3 bg-gray-50 text-sm space-y-2">
            {details && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">Details</p>
                <p className="text-gray-700 whitespace-pre-wrap">{details}</p>
              </div>
            )}
            {resolution && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">
                  Resolution{resolvedDate ? ` (${fmtDate(resolvedDate)})` : ''}
                </p>
                <p className="text-gray-700 whitespace-pre-wrap">{resolution}</p>
              </div>
            )}
            {!details && !resolution && (
              <p className="text-xs text-gray-400 italic">No additional details recorded.</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar & Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[44px] sm:min-h-0 sm:order-2 text-sm font-medium text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} /> Log it
        </button>

        <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-3 sm:flex-wrap sm:order-1">
          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 text-base sm:text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All properties</option>
            {arr(properties).map((p) => (
              <option key={p.id} value={p.id}>
                {p.fields?.Address || p.fields?.Name || p.id}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-0 text-base sm:text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All types</option>
            {TL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">Loading open issues…</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-red-200 p-6 text-center text-red-600 text-sm">
          Failed to load open issues: {error}
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            {issues.length === 0
              ? 'No open issues.'
              : 'No issues match the selected filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredIssues.map((record) => renderRow(record))}
        </div>
      )}

      {showForm && (
        <TenantLogForm
          open={showForm}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            loadIssues()
          }}
          properties={properties}
        />
      )}
    </div>
  )
}
