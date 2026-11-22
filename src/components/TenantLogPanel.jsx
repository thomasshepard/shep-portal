import { useState, useEffect, useCallback } from 'react'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth.jsx'
import TenantLogForm from './TenantLogForm.jsx'
import {
  fetchLogForProperty,
  setLogStatus,
  getTodayDate,
  TL_READ,
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

export default function TenantLogPanel({ propertyId, propertyLabel, tenants }) {
  const { isAdmin, isVA } = useAuth()

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [showResolved, setShowResolved] = useState(false)
  const [resolvingId, setResolvingId] = useState(null)
  const [resolutionText, setResolutionText] = useState('')
  const [statusUpdating, setStatusUpdating] = useState(null)

  const loadEntries = useCallback(async () => {
    if (!propertyId) {
      setEntries([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await fetchLogForProperty(propertyId)
      if (error) {
        toast.error('Failed to load tenant log: ' + error)
        setEntries([])
      } else {
        setEntries(data || [])
      }
    } catch (err) {
      toast.error('Failed to load tenant log: ' + (err.message || String(err)))
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => {
    if (isAdmin || isVA) {
      loadEntries()
    }
  }, [isAdmin, isVA, loadEntries])

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

  function getTenantName(tenantLinks) {
    const tId = arr(tenantLinks)[0]
    if (!tId) return null
    const match = arr(tenants).find((t) => t?.id === tId)
    return match?.fields?.Name || null
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
    const { error } = await setLogStatus(record.id, nextStatus)
    setStatusUpdating(null)

    if (error) {
      toast.error('Failed to update status: ' + error)
      return
    }

    toast.success(`Status updated to ${nextStatus}`)
    setEntries((prev) =>
      prev.map((item) => {
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
    )
  }

  async function handleConfirmResolution(recordId) {
    setStatusUpdating(recordId)
    const trimmed = resolutionText.trim()
    const { error } = await setLogStatus(recordId, 'Resolved', trimmed || undefined)
    setStatusUpdating(null)

    if (error) {
      toast.error('Failed to update status: ' + error)
      return
    }

    toast.success('Status updated to Resolved')
    setResolvingId(null)
    setResolutionText('')

    setEntries((prev) =>
      prev.map((item) => {
        if (item.id === recordId) {
          const updatedFields = {
            ...item.fields,
            [TL_READ.STATUS]: 'Resolved',
            [TL_READ.RESOLVED_DATE]: getTodayDate(),
          }
          if (trimmed) {
            updatedFields[TL_READ.RESOLUTION] = trimmed
          }
          return { ...item, fields: updatedFields }
        }
        return item
      })
    )
  }

  const openEntries = []
  const resolvedEntries = []
  for (const entry of entries) {
    const status = safeStr(entry.fields?.[TL_READ.STATUS]).trim()
    if (status === 'Resolved') {
      resolvedEntries.push(entry)
    } else {
      openEntries.push(entry)
    }
  }

  function renderRow(record) {
    const rf = record.fields || {}
    const date = rf[TL_READ.DATE] || (record.createdTime ? record.createdTime.split('T')[0] : '')
    const type = safeStr(rf[TL_READ.TYPE])
    const urgency = safeStr(rf[TL_READ.URGENCY])
    const status = safeStr(rf[TL_READ.STATUS]) || 'Open'
    const summary = safeStr(rf[TL_READ.SUMMARY])
    const tenantName = getTenantName(rf[TL_READ.TENANT])
    const loggedBy = safeStr(rf[TL_READ.LOGGED_BY])
    const details = safeStr(rf[TL_READ.DETAILS])
    const resolution = safeStr(rf[TL_READ.RESOLUTION])
    const resolvedDate = rf[TL_READ.RESOLVED_DATE]
    const expanded = expandedIds.has(record.id)
    const isResolving = resolvingId === record.id

    return (
      <div key={record.id} className="border border-gray-100 rounded-lg overflow-hidden bg-white">
        <div
          className="flex items-start justify-between gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => toggleExpand(record.id)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-800 text-sm">
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
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
              {date && <span>{fmtDate(date)}</span>}
              {type && <span>{type}</span>}
              {tenantName && <span>Tenant: {tenantName}</span>}
              {loggedBy && <span>Logged by {loggedBy}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <select
              value={isResolving ? 'Resolved' : status}
              onChange={(e) => handleStatusSelect(record, e.target.value)}
              disabled={statusUpdating === record.id}
              className="text-xs font-medium border border-gray-300 rounded-lg px-2 py-1 bg-white text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              className="text-gray-400 hover:text-gray-700 p-1"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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
              className="flex-1 min-w-0 border border-blue-300 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              autoFocus
              disabled={statusUpdating === record.id}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => handleConfirmResolution(record.id)}
                disabled={statusUpdating === record.id}
                className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {statusUpdating === record.id ? 'Saving…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setResolvingId(null)}
                disabled={statusUpdating === record.id}
                className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
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
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800">Tenant Log</h2>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} /> Log it
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading tenant log…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">No tenant log entries.</p>
      ) : (
        <div className="space-y-3">
          {openEntries.length === 0 && (
            <p className="text-sm text-gray-500">No open log entries.</p>
          )}

          {openEntries.length > 0 && (
            <div className="space-y-2">
              {openEntries.map((entry) => renderRow(entry))}
            </div>
          )}

          {resolvedEntries.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowResolved((prev) => !prev)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                {showResolved ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showResolved
                  ? `Hide resolved (${resolvedEntries.length})`
                  : `Show resolved (${resolvedEntries.length})`}
              </button>
              {showResolved && (
                <div className="space-y-2 mt-3">
                  {resolvedEntries.map((entry) => renderRow(entry))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <TenantLogForm
          open={showForm}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            loadEntries()
          }}
          propertyId={propertyId}
          propertyLabel={propertyLabel}
          tenants={tenants}
        />
      )}
    </div>
  )
}
