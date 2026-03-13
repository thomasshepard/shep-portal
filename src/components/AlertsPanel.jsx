import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, RotateCcw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

const SEVERITY_STYLES = {
  critical: { border: 'border-l-red-500', dot: 'bg-red-500' },
  warning:  { border: 'border-l-orange-400', dot: 'bg-orange-400' },
  info:     { border: 'border-l-yellow-400', dot: 'bg-yellow-400' },
}

const FILTERS = {
  all:         { label: 'All',         match: () => true },
  critical:    { label: 'Critical',    match: a => a.severity === 'critical' },
  payments:    { label: 'Payments',    match: a => a.type === 'late_payment' },
  leases:      { label: 'Leases',      match: a => a.type === 'lease_expiring' || a.type === 'lease_expired' },
  maintenance: { label: 'Maintenance', match: a => a.type === 'maintenance_open' },
  loans:       { label: 'Loans',       match: a => a.type === 'loan_maturity' },
}

export default function AlertsPanel({ alerts = [], onDismiss, onRestore, propertyFilter, compact = false }) {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState('all')
  const [showDismissed, setShowDismissed] = useState(false)
  const [dismissingId, setDismissingId] = useState(null)
  const [dismissNotes, setDismissNotes] = useState('')

  const scoped = propertyFilter ? alerts.filter(a => a.propertyId === propertyFilter) : alerts
  const active = scoped.filter(a => !a.dismissed)
  const dismissed = scoped.filter(a => a.dismissed)

  const filterFn = FILTERS[activeFilter]?.match || (() => true)
  const visible = active.filter(filterFn)

  const counts = {
    total:    active.length,
    critical: active.filter(a => a.severity === 'critical').length,
    warning:  active.filter(a => a.severity === 'warning').length,
    info:     active.filter(a => a.severity === 'info').length,
  }

  if (counts.total === 0 && dismissed.length === 0) return null

  async function handleDismiss(alertId) {
    if (dismissingId === alertId) {
      await onDismiss(alertId, dismissNotes)
      setDismissingId(null)
      setDismissNotes('')
    } else {
      setDismissingId(alertId)
      setDismissNotes('')
    }
  }

  function cancelDismiss() {
    setDismissingId(null)
    setDismissNotes('')
  }

  function handleRowClick(alert) {
    if (!compact && alert.propertyId) navigate(`/properties/${alert.propertyId}`)
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-amber-100">
        <div className="flex items-center gap-2 font-semibold text-amber-700">
          <AlertTriangle size={16} />
          Alerts ({counts.total})
        </div>
        {counts.total > 0 && (
          <div className="flex items-center gap-2 text-xs">
            {counts.critical > 0 && <span className="text-red-600 font-medium">{counts.critical} critical</span>}
            {counts.warning  > 0 && <span className="text-orange-500 font-medium">{counts.warning} warning</span>}
            {counts.info     > 0 && <span className="text-yellow-600">{counts.info} info</span>}
          </div>
        )}
      </div>

      {/* Filter chips — full layout only */}
      {!compact && counts.total > 0 && (
        <div className="flex items-center gap-2 px-5 py-2 overflow-x-auto border-b border-amber-50">
          {Object.entries(FILTERS).map(([key, { label, match }]) => {
            const cnt = key === 'all' ? active.length : active.filter(match).length
            if (key !== 'all' && cnt === 0) return null
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors ${
                  activeFilter === key
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {label}{key !== 'all' && cnt > 0 ? ` (${cnt})` : ''}
              </button>
            )
          })}
        </div>
      )}

      {/* Alert rows */}
      <div className="divide-y divide-gray-50">
        {visible.map(alert => {
          const s = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info
          const isDismissing = dismissingId === alert.id
          return (
            <div key={alert.id} className={`border-l-4 ${s.border}`}>
              <div
                className={`flex items-start gap-3 px-4 py-3 transition-colors ${!compact && alert.propertyId ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                onClick={() => !isDismissing && handleRowClick(alert)}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${s.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm text-gray-800">{alert.title}</span>
                    {!compact && alert.propertyName && (
                      <span className="text-xs text-gray-400 truncate">{alert.propertyName}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5 leading-snug">{alert.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{alert.action}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDismiss(alert.id) }}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-700 p-1 rounded"
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>

              {isDismissing && (
                <div className="px-4 pb-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <input
                    autoFocus
                    type="text"
                    value={dismissNotes}
                    onChange={e => setDismissNotes(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleDismiss(alert.id)
                      if (e.key === 'Escape') cancelDismiss()
                    }}
                    placeholder="Note (optional) — Enter to confirm"
                    className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded hover:bg-amber-700"
                  >
                    Dismiss
                  </button>
                  <button onClick={cancelDismiss} className="text-xs text-gray-500 hover:text-gray-700">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {visible.length === 0 && counts.total > 0 && (
          <p className="px-5 py-4 text-sm text-gray-400 text-center">No {activeFilter !== 'all' ? activeFilter : ''} alerts.</p>
        )}
      </div>

      {/* Dismissed section */}
      {dismissed.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowDismissed(v => !v)}
            className="w-full flex items-center gap-1.5 px-5 py-2.5 text-xs text-gray-400 hover:text-gray-600 text-left"
          >
            {showDismissed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showDismissed ? 'Hide' : 'Show'} dismissed ({dismissed.length})
          </button>
          {showDismissed && (
            <div className="divide-y divide-gray-50 border-t border-gray-100">
              {dismissed.map(alert => (
                <div key={alert.id} className="flex items-start gap-3 px-4 py-3 opacity-50">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-gray-400" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm text-gray-600">{alert.title}</span>
                    <p className="text-sm text-gray-500 mt-0.5 leading-snug">{alert.message}</p>
                    {alert.dismissedBy && (
                      <p className="text-xs text-gray-400 mt-0.5">Dismissed by {alert.dismissedBy}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onRestore(alert.id)}
                    className="flex-shrink-0 text-gray-400 hover:text-blue-600 p-1 rounded"
                    title="Restore"
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
