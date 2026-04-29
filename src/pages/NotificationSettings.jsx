import { useState, useEffect } from 'react'
import { Settings, Bell, Clock, Pause } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { usePushSubscription } from '../hooks/usePushSubscription'
import { supabase } from '../lib/supabase'
import { notify } from '../lib/notifications'

const MODULE_LABELS = {
  tasks:      { label: 'Tasks',      color: 'bg-slate-100 text-slate-700'   },
  happy_cuts: { label: 'Happy Cuts', color: 'bg-emerald-100 text-emerald-700' },
  properties: { label: 'Properties', color: 'bg-blue-100 text-blue-700'     },
  incubator:  { label: 'Incubator',  color: 'bg-amber-100 text-amber-700'   },
  chickens:   { label: 'Chickens',   color: 'bg-orange-100 text-orange-700' },
  documents:  { label: 'Documents',  color: 'bg-purple-100 text-purple-700' },
  llcs:       { label: 'LLCs',       color: 'bg-slate-100 text-slate-700'   },
  alerts:     { label: 'Alerts',     color: 'bg-red-100 text-red-700'       },
  system:     { label: 'System',     color: 'bg-gray-100 text-gray-700'     },
}

const DELIVERY_OPTIONS = ['instant', 'digest', 'off']
const DELIVERY_LABELS  = { instant: 'Instant', digest: 'Digest', off: 'Off' }

const TZ_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
]

const PAUSE_PRESETS = [
  { label: '1 hour',       hours: 1 },
  { label: 'End of day',   hours: null, endOfDay: true },
  { label: 'End of week',  hours: null, endOfWeek: true },
]

function getPauseUntil(preset) {
  const now = new Date()
  if (preset.hours) {
    return new Date(now.getTime() + preset.hours * 3600000).toISOString()
  }
  if (preset.endOfDay) {
    const eod = new Date(now); eod.setHours(23, 59, 59, 0); return eod.toISOString()
  }
  if (preset.endOfWeek) {
    const dow = now.getDay(); const daysToSun = 7 - dow
    const eow = new Date(now); eow.setDate(now.getDate() + daysToSun); eow.setHours(23, 59, 59, 0)
    return eow.toISOString()
  }
}

export default function NotificationSettings() {
  const { session }  = useAuth()
  const userId       = session?.user?.id
  const push         = usePushSubscription()

  const [prefs,   setPrefs]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState(null)
  const [sound,   setSound]   = useState(localStorage.getItem('notif:sound') !== 'false')

  useEffect(() => {
    if (!userId) return
    supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setPrefs(data || buildDefaults(userId))
        setLoading(false)
      })
  }, [userId])

  function buildDefaults(uid) {
    return {
      user_id: uid,
      email_enabled: true, push_enabled: true,
      mod_tasks: true, mod_happy_cuts: true, mod_properties: true,
      mod_incubator: true, mod_chickens: true, mod_documents: true,
      mod_llcs: true, mod_alerts: true, mod_system: true,
      delivery_tasks: 'instant', delivery_happy_cuts: 'digest', delivery_properties: 'instant',
      delivery_incubator: 'digest', delivery_chickens: 'digest', delivery_documents: 'digest',
      delivery_llcs: 'digest', delivery_alerts: 'instant', delivery_system: 'instant',
      paused_until: null,
      quiet_hours_start: null, quiet_hours_end: null,
      timezone: 'America/Chicago',
    }
  }

  function set(key, val) { setPrefs(p => ({ ...p, [key]: val })) }

  async function handleSave() {
    if (!prefs || !userId) return
    setSaving(true)
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ ...prefs, updated_at: new Date().toISOString() })
    if (error) {
      showToast('Failed to save settings')
    } else {
      showToast('Settings saved')
    }
    setSaving(false)
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500) }

  async function handleTestNotification() {
    if (!userId) return
    await notify({
      userIds:  userId,
      title:    'Test notification from Shep Portal',
      body:     'Your notification setup is working.',
      module:   'system',
      category: 'system',
      severity: 'info',
    })
    showToast('Test notification sent')
  }

  async function handlePause(preset) {
    const pausedUntil = getPauseUntil(preset)
    set('paused_until', pausedUntil)
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: userId, paused_until: pausedUntil, updated_at: new Date().toISOString() })
    if (!error) showToast(`Notifications paused until ${new Date(pausedUntil).toLocaleTimeString()}`)
  }

  async function handleResume() {
    set('paused_until', null)
    await supabase
      .from('notification_preferences')
      .update({ paused_until: null, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    showToast('Notifications resumed')
  }

  function toggleSound(val) {
    setSound(val)
    localStorage.setItem('notif:sound', val ? 'true' : 'false')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isPaused = prefs?.paused_until && new Date(prefs.paused_until) > new Date()

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-16">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings size={20} className="text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-800">Notification Settings</h2>
      </div>

      {/* Vacation mode */}
      {isPaused ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Pause size={16} className="text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              Paused until {new Date(prefs.paused_until).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
          <button onClick={handleResume} className="text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 px-3 py-1 rounded-lg">
            Resume
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700 mb-1">Vacation mode</p>
          <p className="text-xs text-slate-500 mb-3">Suppress non-critical emails and push while away. In-app notifications still appear.</p>
          <div className="flex gap-2">
            {PAUSE_PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => handlePause(preset)}
                className="flex-1 text-xs font-medium px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-700 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Channel toggles */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="px-4 py-3">
          <p className="text-sm font-semibold text-slate-700 mb-3">Channels</p>
          <div className="space-y-3">
            {[
              { label: 'Email notifications', key: 'email_enabled' },
              { label: 'Push notifications',  key: 'push_enabled'  },
              { label: 'Sound on new notification', custom: true },
            ].map(row => {
              if (row.custom) {
                return (
                  <div key="sound" className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Sound on new notification</span>
                    <Toggle value={sound} onChange={toggleSound} />
                  </div>
                )
              }
              return (
                <div key={row.key} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{row.label}</span>
                  <Toggle value={!!prefs?.[row.key]} onChange={v => set(row.key, v)} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Push subscribe in-page */}
      {push.supported && !push.subscribed && prefs?.push_enabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-amber-600" />
            <p className="text-sm text-amber-800">Enable push on this device</p>
          </div>
          <button onClick={push.subscribe} disabled={push.loading} className="text-xs font-semibold bg-amber-500 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
            Enable
          </button>
        </div>
      )}

      {/* Quiet hours */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={14} className="text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Quiet hours</p>
        </div>
        <p className="text-xs text-slate-500 mb-3">No emails between these hours. Critical notifications bypass this.</p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[11px] text-slate-500 mb-1 block">From</label>
            <select
              value={prefs?.quiet_hours_start ?? ''}
              onChange={e => set('quiet_hours_start', e.target.value === '' ? null : Number(e.target.value))}
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">None</option>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-slate-500 mb-1 block">To</label>
            <select
              value={prefs?.quiet_hours_end ?? ''}
              onChange={e => set('quiet_hours_end', e.target.value === '' ? null : Number(e.target.value))}
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">None</option>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-slate-500 mb-1 block">Timezone</label>
            <select
              value={prefs?.timezone || 'America/Chicago'}
              onChange={e => set('timezone', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {TZ_OPTIONS.map(tz => (
                <option key={tz} value={tz}>{tz.replace('America/', '').replace('Pacific/', '')}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Per-category delivery grid */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700 mb-1">Email delivery per module</p>
        <p className="text-xs text-slate-500 mb-3">
          <strong>Instant</strong> — email on each event.{' '}
          <strong>Digest</strong> — bundled in the 7am summary.{' '}
          <strong>Off</strong> — in-app only. Critical events always email instantly.
        </p>
        <div className="space-y-1">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_repeat(3,56px)] gap-1 mb-2">
            <div />
            {DELIVERY_OPTIONS.map(o => (
              <div key={o} className="text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{DELIVERY_LABELS[o]}</div>
            ))}
          </div>
          {/* Module rows */}
          {Object.entries(MODULE_LABELS).map(([key, { label, color }]) => {
            const modKey = `mod_${key}`
            const delKey = `delivery_${key}`
            return (
              <div key={key} className="grid grid-cols-[1fr_repeat(3,56px)] gap-1 items-center py-1 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!prefs?.[modKey]}
                    onChange={e => set(modKey, e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                  />
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${color}`}>{label}</span>
                </div>
                {DELIVERY_OPTIONS.map(opt => (
                  <div key={opt} className="flex justify-center">
                    <input
                      type="radio"
                      name={`delivery_${key}`}
                      value={opt}
                      checked={prefs?.[delKey] === opt}
                      onChange={() => set(delKey, opt)}
                      className="w-3.5 h-3.5 border-slate-300 text-amber-500 focus:ring-amber-400"
                      disabled={!prefs?.[modKey]}
                    />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-slate-900 text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        <button
          onClick={handleTestNotification}
          className="px-4 text-sm font-medium border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50"
        >
          Test
        </button>
      </div>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${value ? 'bg-amber-500' : 'bg-slate-200'}`}
      role="switch"
      aria-checked={value}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}
