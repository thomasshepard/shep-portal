import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../hooks/useNotifications'

const MODULE_BADGES = {
  happy_cuts:  { label: 'Happy Cuts', cls: 'bg-green-100 text-green-700' },
  incubator:   { label: 'Incubator',  cls: 'bg-amber-100 text-amber-700' },
  properties:  { label: 'Properties', cls: 'bg-blue-100 text-blue-700' },
  chickens:    { label: 'Chickens',   cls: 'bg-orange-100 text-orange-700' },
  documents:   { label: 'Docs',       cls: 'bg-purple-100 text-purple-700' },
  llcs:        { label: 'LLCs',       cls: 'bg-slate-100 text-slate-700' },
  alerts:      { label: 'Alerts',     cls: 'bg-red-100 text-red-700' },
  system:      { label: 'System',     cls: 'bg-gray-100 text-gray-600' },
}

const SEVERITY_DOT = {
  critical:       'bg-red-500',
  action_needed:  'bg-amber-500',
  info:           'bg-gray-400',
}

const SEVERITY_BORDER = {
  critical:       'border-l-red-500',
  action_needed:  'border-l-amber-500',
  info:           'border-l-gray-300',
}

function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

export default function Notifications() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const { notifications, loading, markRead, dismiss, dismissAll } = useNotifications(userId)

  const [filter, setFilter] = useState('all') // 'all' | 'unread' | 'action_needed' | module key

  // Build filter chips from active modules
  const activeModules = [...new Set(notifications.map(n => n.module))]

  const filtered = notifications.filter(n => {
    if (filter === 'all') return true
    if (filter === 'unread') return !n.read
    if (filter === 'action_needed') return n.severity === 'action_needed' || n.severity === 'critical'
    return n.module === filter
  })

  function handleCardClick(n) {
    if (!n.read) markRead(n.id)
  }

  function handleGo(e, n) {
    e.stopPropagation()
    if (!n.read) markRead(n.id)
    if (n.action_url) window.location.hash = n.action_url.replace(/^.*#/, '')
  }

  function handleDismiss(e, n) {
    e.stopPropagation()
    dismiss(n.id)
  }

  const FILTER_CHIPS = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'action_needed', label: 'Action Needed' },
    ...activeModules.map(m => ({ key: m, label: MODULE_BADGES[m]?.label || m })),
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Notifications</h2>
        {notifications.length > 0 && (
          <button onClick={dismissAll}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors">
            Dismiss all
          </button>
        )}
      </div>

      {/* Filter chips */}
      {notifications.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {FILTER_CHIPS.map(chip => (
            <button key={chip.key} onClick={() => setFilter(chip.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === chip.key
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
              }`}>
              {chip.label}
              {chip.key === 'unread' && notifications.filter(n => !n.read).length > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Notification cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <p className="text-2xl mb-2">✓</p>
          <p className="text-gray-500 font-medium">You're all caught up.</p>
          {filter !== 'all' && (
            <button onClick={() => setFilter('all')} className="mt-2 text-sm text-amber-600 hover:text-amber-800">
              View all notifications
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const mod = MODULE_BADGES[n.module] || MODULE_BADGES.system
            const dot = SEVERITY_DOT[n.severity] || SEVERITY_DOT.info
            const border = SEVERITY_BORDER[n.severity] || SEVERITY_BORDER.info
            return (
              <div
                key={n.id}
                onClick={() => handleCardClick(n)}
                className={`bg-white rounded-xl border border-gray-200 border-l-4 ${border} p-4 cursor-pointer hover:shadow-sm transition-shadow ${!n.read ? 'ring-1 ring-amber-100' : ''}`}
              >
                {/* Top row */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${mod.cls}`}>
                    {mod.label}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">{relativeTime(n.created_at)}</span>
                </div>

                {/* Title */}
                <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                  {n.title}
                </p>

                {/* Body */}
                {n.body && (
                  <p className="text-sm text-gray-500 mt-1">{n.body}</p>
                )}

                {/* Action row */}
                <div className="flex items-center justify-end gap-3 mt-3 pt-2 border-t border-gray-50">
                  <button onClick={e => handleDismiss(e, n)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                    Dismiss ×
                  </button>
                  {n.action_url && (
                    <button onClick={e => handleGo(e, n)}
                      className="text-xs text-amber-600 hover:text-amber-800 font-medium transition-colors">
                      Go →
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
