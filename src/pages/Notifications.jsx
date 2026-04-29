import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from '../hooks/useNotifications'
import { updateTask, FIELDS } from '../lib/tasks'
import { supabase } from '../lib/supabase'

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

function dayGroup(isoString) {
  const d = new Date(isoString)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)
  const weekStart = new Date(todayStart.getTime() - 6 * 86400000)
  if (d >= todayStart)     return 'Today'
  if (d >= yesterdayStart) return 'Yesterday'
  if (d >= weekStart)      return 'This week'
  return 'Older'
}

function extractTaskRecordId(sourceKey) {
  if (!sourceKey) return null
  const parts = sourceKey.split(':')
  const last = parts[parts.length - 1]
  return last?.startsWith('rec') ? last : null
}

export default function Notifications() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const { notifications, loading, markRead, dismiss, dismissAll, snooze, trackClick } = useNotifications(userId)
  const navigate = useNavigate()

  const [filter, setFilter] = useState('all')
  const [focused, setFocused] = useState(-1)
  const [completingId, setCompletingId] = useState(null)
  const [everHad, setEverHad] = useState(null) // null=loading, true=yes, false=never

  // Check localStorage first; fall back to a one-off count query.
  // Once true, the result is cached so we never re-query.
  useEffect(() => {
    if (localStorage.getItem('notif:ever_had')) { setEverHad(true); return }
    if (!userId) return
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .limit(1)
      .then(({ count }) => {
        if (count && count > 0) { localStorage.setItem('notif:ever_had', '1'); setEverHad(true) }
        else setEverHad(false)
      })
  }, [userId])

  // Cache the flag as soon as we see any live notifications
  useEffect(() => {
    if (notifications.length > 0 && !localStorage.getItem('notif:ever_had')) {
      localStorage.setItem('notif:ever_had', '1')
      setEverHad(true)
    }
  }, [notifications.length])

  const activeModules = [...new Set(notifications.map(n => n.module))]

  const filtered = notifications.filter(n => {
    if (filter === 'all') return true
    if (filter === 'unread') return !n.read
    if (filter === 'action_needed') return n.severity === 'action_needed' || n.severity === 'critical'
    return n.module === filter
  })

  // Build day-grouped sections
  const groups = []
  let curGroup = null
  for (const n of filtered) {
    const g = dayGroup(n.created_at)
    if (g !== curGroup) { groups.push({ label: g, items: [n] }); curGroup = g }
    else groups[groups.length - 1].items.push(n)
  }

  // Keyboard navigation: j/k move focus, Enter=go, e=dismiss, s=snooze
  useEffect(() => {
    function onKey(e) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'j') { e.preventDefault(); setFocused(i => Math.min(i + 1, filtered.length - 1)) }
      else if (e.key === 'k') { e.preventDefault(); setFocused(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter' && focused >= 0) {
        const n = filtered[focused]
        if (n?.action_url) { trackClick(n.id); markRead(n.id); window.location.hash = n.action_url.replace(/^.*#/, '') }
      }
      else if (e.key === 'e' && focused >= 0) { dismiss(filtered[focused]?.id); setFocused(i => Math.max(i - 1, 0)) }
      else if (e.key === 's' && focused >= 0) { snooze(filtered[focused]?.id); setFocused(i => Math.max(i - 1, 0)) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filtered, focused, markRead, dismiss, snooze, trackClick])

  async function handleCompleteTask(e, n) {
    e.stopPropagation()
    const taskId = extractTaskRecordId(n.source_key)
    if (!taskId) return
    setCompletingId(n.id)
    try {
      await updateTask(taskId, {
        [FIELDS.STATUS]:       'Done',
        [FIELDS.COMPLETED_AT]: new Date().toISOString().slice(0, 10),
      })
      dismiss(n.id)
    } catch {}
    setCompletingId(null)
  }

  function handleGo(e, n) {
    e.stopPropagation()
    markRead(n.id)
    trackClick(n.id)
    if (n.action_url) window.location.hash = n.action_url.replace(/^.*#/, '')
  }

  function handleDismiss(e, n) { e.stopPropagation(); dismiss(n.id) }
  function handleSnooze(e, n)   { e.stopPropagation(); snooze(n.id) }

  const unreadCount = notifications.filter(n => !n.read).length

  const FILTER_CHIPS = [
    { key: 'all',           label: 'All' },
    { key: 'unread',        label: 'Unread' },
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/notifications/settings')}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Settings
          </button>
          {notifications.length > 0 && (
            <button onClick={dismissAll} className="text-sm text-gray-500 hover:text-red-600 transition-colors">
              Dismiss all
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      {notifications.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {FILTER_CHIPS.map(chip => (
            <button
              key={chip.key}
              onClick={() => setFilter(chip.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === chip.key
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
              }`}
            >
              {chip.label}
              {chip.key === 'unread' && unreadCount > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Keyboard hint */}
      {filtered.length > 0 && (
        <p className="text-xs text-gray-400 hidden sm:block">
          j / k to navigate · Enter to open · e to dismiss · s to snooze
        </p>
      )}

      {/* Notification cards */}
      {filtered.length === 0 ? (
        // Brand-new user who has never had a notification: show education copy.
        // Everyone else (filtered view, or returning users who dismissed everything): plain "caught up".
        filter === 'all' && everHad === false ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-3xl mb-3">🔔</p>
            <p className="text-gray-800 font-semibold mb-1">You're all set.</p>
            <p className="text-gray-500 text-sm mb-4">You'll get a ping here when:</p>
            <div className="text-left max-w-xs mx-auto space-y-2 mb-6">
              {[
                'Someone assigns you a task',
                'A task you own is overdue or due today',
                'A lease is about to expire',
                'A maintenance request comes in (admins)',
                'Incubator candles are due',
              ].map(text => (
                <p key={text} className="text-sm text-gray-500 flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                  {text}
                </p>
              ))}
            </div>
            <button
              onClick={() => navigate('/notifications/settings')}
              className="text-sm text-amber-600 hover:text-amber-800 font-medium"
            >
              Manage what you receive →
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center">
            <p className="text-2xl mb-2">✓</p>
            <p className="text-gray-500 font-medium">You're all caught up.</p>
            {filter !== 'all' && (
              <button onClick={() => setFilter('all')} className="mt-2 text-sm text-amber-600 hover:text-amber-800">
                View all notifications
              </button>
            )}
          </div>
        )
      ) : (
        <div className="space-y-5">
          {groups.map(({ label, items }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{label}</p>
              <div className="space-y-2">
                {items.map(n => {
                  const globalIdx = filtered.indexOf(n)
                  const isTask = n.module === 'system' && n.source_key?.startsWith('task:')
                  const taskRecordId = extractTaskRecordId(n.source_key)
                  const mod    = MODULE_BADGES[n.module] || MODULE_BADGES.system
                  const dot    = SEVERITY_DOT[n.severity]    || SEVERITY_DOT.info
                  const border = SEVERITY_BORDER[n.severity] || SEVERITY_BORDER.info
                  return (
                    <div
                      key={n.id}
                      onClick={() => { markRead(n.id); setFocused(globalIdx) }}
                      tabIndex={0}
                      className={`bg-white rounded-xl border border-gray-200 border-l-4 ${border} p-4 cursor-pointer hover:shadow-sm transition-shadow ${!n.read ? 'ring-1 ring-amber-100' : ''} ${globalIdx === focused ? 'ring-2 ring-amber-400' : ''}`}
                    >
                      {/* Top row */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                        <span className="text-sm leading-none" aria-hidden="true">{mod.icon}</span>
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
                      {n.body && <p className="text-sm text-gray-500 mt-1">{n.body}</p>}

                      {/* Action row */}
                      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-gray-50 flex-wrap">
                        <button
                          onClick={e => handleDismiss(e, n)}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                        >
                          Dismiss ×
                        </button>
                        <button
                          onClick={e => handleSnooze(e, n)}
                          className="text-xs text-gray-400 hover:text-amber-500 transition-colors"
                        >
                          Snooze 1h ⏰
                        </button>
                        {isTask && taskRecordId && (
                          <button
                            onClick={e => handleCompleteTask(e, n)}
                            disabled={completingId === n.id}
                            className="text-xs text-green-600 hover:text-green-800 transition-colors disabled:opacity-50"
                          >
                            {completingId === n.id ? 'Saving…' : 'Done ✓'}
                          </button>
                        )}
                        {n.action_url && (
                          <button
                            onClick={e => handleGo(e, n)}
                            className="text-xs text-amber-600 hover:text-amber-800 font-medium transition-colors ml-auto"
                          >
                            Go →
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
