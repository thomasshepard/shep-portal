import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../hooks/useNotifications'
import { usePushSubscription } from '../hooks/usePushSubscription'

const MODULE_BADGES = {
  happy_cuts:  { label: 'Happy Cuts', cls: 'bg-green-100 text-green-700',   icon: '🌿' },
  incubator:   { label: 'Incubator',  cls: 'bg-amber-100 text-amber-700',   icon: '🥚' },
  properties:  { label: 'Properties', cls: 'bg-blue-100 text-blue-700',     icon: '🏠' },
  chickens:    { label: 'Chickens',   cls: 'bg-orange-100 text-orange-700', icon: '🐔' },
  documents:   { label: 'Docs',       cls: 'bg-purple-100 text-purple-700', icon: '📄' },
  llcs:        { label: 'LLCs',       cls: 'bg-slate-100 text-slate-700',   icon: '🏢' },
  alerts:      { label: 'Alerts',     cls: 'bg-red-100 text-red-700',       icon: '🚨' },
  system:      { label: 'System',     cls: 'bg-gray-100 text-gray-600',     icon: '⚙️' },
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

const DROPDOWN_ID = 'notif-bell-dropdown'

export default function NotificationBell() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const { notifications, unreadCount, markRead, markAllRead, dismiss, snooze } = useNotifications(userId)
  const { supported: pushSupported, subscribed, permission, loading: pushLoading, subscribe, unsubscribe } = usePushSubscription()
  const [open, setOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 16 })
  const [pinging, setPinging] = useState(false)
  const buttonRef    = useRef(null)
  const dropdownRef  = useRef(null)
  const prevCountRef = useRef(unreadCount)
  const prevFocusRef = useRef(null)   // element focused before dropdown opened

  // Animate-ping badge when unread count increases
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setPinging(true)
      const t = setTimeout(() => setPinging(false), 2000)
      return () => clearTimeout(t)
    }
    prevCountRef.current = unreadCount
  }, [unreadCount])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Move focus into dropdown when it opens; restore when it closes
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        const first = dropdownRef.current?.querySelector('[role="menuitem"], button, a[href]')
        first?.focus()
      }, 0)
    } else if (prevFocusRef.current) {
      prevFocusRef.current.focus()
      prevFocusRef.current = null
    }
  }, [open])

  function closeDropdown() { setOpen(false) }

  function handleBellClick() {
    if (window.innerWidth < 640) { window.location.hash = '/notifications'; return }
    if (!open) {
      prevFocusRef.current = document.activeElement
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) setDropdownPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) })
    }
    setOpen(prev => !prev)
  }

  // Keyboard handling inside the dropdown: Arrow keys, Escape, Tab cycling (focus trap)
  const handleDropdownKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { closeDropdown(); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const items = Array.from(dropdownRef.current?.querySelectorAll('[role="menuitem"]') || [])
      if (!items.length) return
      const idx = items.indexOf(document.activeElement)
      if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
      else items[Math.max(idx - 1, 0)]?.focus()
    }
    if (e.key === 'Tab') {
      // Focus trap: cycle within dropdown
      const focusable = Array.from(
        dropdownRef.current?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled])') || []
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last  = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }, [])

  function handleNotificationClick(n) {
    if (!n.read) markRead(n.id)
    if (n.action_url) window.location.hash = n.action_url.replace(/^.*#/, '')
    closeDropdown()
  }

  function handleSnooze(e, n) { e.stopPropagation(); snooze(n.id) }
  function handleDismiss(e, n) { e.stopPropagation(); dismiss(n.id) }

  const recent = notifications.slice(0, 5)

  return (
    <>
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={handleBellClick}
        className="relative p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={DROPDOWN_ID}
      >
        <Bell size={20} aria-hidden="true" />
        {unreadCount > 0 && (
          <>
            {pinging && (
              <span
                className="animate-ping absolute top-0.5 right-0.5 inline-flex h-[18px] w-[18px] rounded-full bg-red-400 opacity-75"
                aria-hidden="true"
              />
            )}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute', top: '2px', right: '2px',
                minWidth: '18px', height: '18px',
                background: '#ef4444', color: '#fff',
                fontSize: '11px', fontWeight: 700, borderRadius: '9999px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px', lineHeight: 1, pointerEvents: 'none',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </>
        )}
      </button>

      {/* Dropdown — fixed-positioned so overflow:hidden parents don't clip it */}
      {open && (
        <div
          id={DROPDOWN_ID}
          ref={dropdownRef}
          onKeyDown={handleDropdownKeyDown}
          style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right, width: '340px', zIndex: 9999 }}
          className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden"
          role="dialog"
          aria-label="Notifications"
          aria-modal="false"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Notifications</p>
            {unreadCount > 0 && (
              <button
                role="menuitem"
                onClick={() => { markAllRead(); closeDropdown() }}
                className="text-xs text-amber-600 hover:text-amber-800 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div
            role="menu"
            aria-label="Recent notifications"
            className="overflow-y-auto divide-y divide-gray-50"
            style={{ maxHeight: '380px' }}
          >
            {recent.length === 0 ? (
              <div className="text-center py-10 px-4">
                <p className="text-2xl mb-2">🔔</p>
                <p className="text-sm text-gray-500 font-medium">No notifications</p>
                <p className="text-xs text-gray-400 mt-1">Lease expirations, task reminders, and more will appear here.</p>
              </div>
            ) : (
              recent.map(n => {
                const mod  = MODULE_BADGES[n.module] || MODULE_BADGES.system
                const dot  = SEVERITY_DOT[n.severity] || SEVERITY_DOT.info
                const isTask = n.module === 'system' && n.source_key?.startsWith('task:')
                return (
                  <button
                    key={n.id}
                    role="menuitem"
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${!n.read ? 'bg-amber-50' : ''}`}
                  >
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dot}`} aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-sm leading-none" aria-hidden="true">{mod.icon}</span>
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
                      {/* Inline Snooze/Dismiss for task notifications */}
                      {isTask && (
                        <div className="flex items-center gap-3 mt-1.5">
                          <button
                            role="menuitem"
                            onClick={e => handleSnooze(e, n)}
                            className="text-[11px] text-gray-400 hover:text-amber-600 transition-colors"
                          >
                            Snooze 1h ⏰
                          </button>
                          <button
                            role="menuitem"
                            onClick={e => handleDismiss(e, n)}
                            className="text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                          >
                            Dismiss ×
                          </button>
                        </div>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 bg-gray-50">
            {/* Push toggle */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell size={13} className="text-gray-400" aria-hidden="true" />
                <span className="text-xs text-gray-600 font-medium">Push alerts</span>
              </div>
              {!pushSupported ? (
                <span className="text-[11px] text-gray-400">Not supported</span>
              ) : permission === 'denied' ? (
                <span className="text-[11px] text-red-400">Blocked in settings</span>
              ) : (
                <button
                  role="menuitem"
                  onClick={() => subscribed ? unsubscribe() : subscribe()}
                  disabled={pushLoading}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    subscribed ? 'bg-amber-500' : 'bg-gray-200'
                  } ${pushLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  aria-label={subscribed ? 'Disable push notifications' : 'Enable push notifications'}
                  aria-pressed={subscribed}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    subscribed ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{notifications.length} active</span>
                <button
                  role="menuitem"
                  onClick={() => { window.location.hash = '/notifications/settings'; closeDropdown() }}
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Settings →
                </button>
              </div>
              <button
                role="menuitem"
                onClick={() => { window.location.hash = '/notifications'; closeDropdown() }}
                className="text-xs text-amber-600 hover:text-amber-800 font-medium"
              >
                View all →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
