import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
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

export default function NotificationBell() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(userId)
  const [open, setOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 16 })
  const buttonRef = useRef(null)
  const dropdownRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function handleBellClick() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      })
    }
    setOpen(prev => !prev)
  }

  function handleNotificationClick(n) {
    if (!n.read) markRead(n.id)
    if (n.action_url) window.location.hash = n.action_url.replace(/^.*#/, '')
    setOpen(false)
  }

  const recent = notifications.slice(0, 5)
  const badge = MODULE_BADGES

  return (
    <>
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={handleBellClick}
        className="relative p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              minWidth: '18px',
              height: '18px',
              background: '#ef4444',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '9999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              lineHeight: 1,
              pointerEvents: 'none',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown — rendered fixed so overflow:hidden parents don't clip it */}
      {open && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            right: dropdownPos.right,
            width: '320px',
            maxWidth: 'calc(100vw - 16px)',
            zIndex: 9999,
          }}
          className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={() => { markAllRead(); setOpen(false) }}
                className="text-xs text-amber-600 hover:text-amber-800 font-medium">
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto divide-y divide-gray-50" style={{ maxHeight: '360px' }}>
            {recent.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No notifications</p>
            ) : (
              recent.map(n => {
                const mod = badge[n.module] || badge.system
                const dot = SEVERITY_DOT[n.severity] || SEVERITY_DOT.info
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${!n.read ? 'bg-amber-50' : ''}`}
                  >
                    {/* Severity dot */}
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${mod.cls}`}>
                          {mod.label}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
                          {relativeTime(n.created_at)}
                        </span>
                      </div>
                      <p className={`text-sm leading-snug truncate ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{n.body}</p>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-400">{notifications.length} active</span>
            <button
              onClick={() => { window.location.hash = '/notifications'; setOpen(false) }}
              className="text-xs text-amber-600 hover:text-amber-800 font-medium"
            >
              View all →
            </button>
          </div>
        </div>
      )}
    </>
  )
}
