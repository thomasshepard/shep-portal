import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'
import {
  Scissors, MapPin, ChevronLeft, ChevronRight, X, Plus,
  CheckCircle, Calendar, DollarSign, Users, BarChart2, Loader2,
} from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────────────────
const HC_BASE = import.meta.env.VITE_AIRTABLE_HAPPY_CUTS_BASE_ID
const HC_PAT  = import.meta.env.VITE_AIRTABLE_PAT
const AT_BASE = `https://api.airtable.com/v0/${HC_BASE}`
const ANTH_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

const CONTACTS_TABLE = 'tbl1Y1siC5qV2fX8J'
const SCHEDULE_TABLE = 'tbli7OArESf2SHL10'

// Contacts field IDs
const CF = {
  name: 'fldGL097AcMkuoEOV', phone: 'fld8Pvw9PVZ2NbFAK',
  address: 'fldKeMIk04Z0jDLGB', city: 'fldrU58CIWkwZSXdq',
  status: 'fldffTQUz4vtdmdQC', source: 'fldo96pa3p3atK1II',
  lotSize: 'fldVU5PtL0plCLwNT', introMow: 'fldISodjHRyqQjxrW',
  rate: 'fldyMY0Ol45rigJB3', frequency: 'fldFhIhpjT7ZQ3uUR',
  specInstr: 'fldj6kBhVPzCMaodF', lastContact: 'fldL0kROy9gmqGn6n',
  notes: 'fldnB5pgFTZCrtnKp', mows: 'fldZEPF6RRobDt68t',
  intLog: 'fldjvR4YIoKITpbbn',
}

// Schedule field IDs
const SF = {
  mowId: 'fldSrspOHhEOnQOxY', clientName: 'fldjSJ0x5rJ3S0FYm',
  date: 'fldcu9rgNI8REbrE0', type: 'fldBt3Ewb6EGd3a4S',
  status: 'fldzyHzszEVZGhs6U', amount: 'fldJoKhtQX4MujAOi',
  payMethod: 'fldZx0GDaJkLML2ID', stripeId: 'fldC06DE4htmBScNM',
  invStatus: 'fldhiIRXuRlvp3QXO', duration: 'fldsVZmdyFnXAIszv',
  notes: 'fldos2p3iwvUCKlH6', contacts: 'fldemlueed8aZMi7J',
}

// ─── Airtable helpers ─────────────────────────────────────────────────────────
const arr = v => Array.isArray(v) ? v : []

function safeStr(val, fallback = '') {
  if (val == null || val === '') return fallback
  if (typeof val === 'object') {
    if (Array.isArray(val)) return val.map(v => typeof v === 'object' ? (v.name || '') : String(v)).filter(Boolean).join(', ') || fallback
    if (val.name) return val.name
    return fallback
  }
  return String(val)
}

function safeNum(val, fallback = null) {
  if (val == null || typeof val === 'object') return fallback
  const n = Number(val)
  return isNaN(n) ? fallback : n
}

async function atGet(table, query = '') {
  const r = await fetch(`${AT_BASE}/${table}${query}`, { headers: { Authorization: `Bearer ${HC_PAT}` } })
  return r.json()
}
async function atPost(table, body) {
  const r = await fetch(`${AT_BASE}/${table}`, { method: 'POST', headers: { Authorization: `Bearer ${HC_PAT}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return r.json()
}
async function atPatch(table, id, fields) {
  const r = await fetch(`${AT_BASE}/${table}/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${HC_PAT}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields, typecast: true }) })
  return r.json()
}
async function fetchAll(table) {
  const records = []; let offset = null
  do {
    let qs = '?returnFieldsByFieldId=true'
    if (offset) qs += `&offset=${offset}`
    const json = await atGet(table, qs)
    if (!json.records) throw new Error(`[${table}] ${json.error?.type || ''}: ${json.error?.message || JSON.stringify(json)}`)
    records.push(...json.records); offset = json.offset || null
  } while (offset)
  return records
}

// ─── Parse functions ──────────────────────────────────────────────────────────
function parseContact(r) {
  const f = r.fields || {}
  return {
    id: r.id,
    name: safeStr(f[CF.name]),
    phone: safeStr(f[CF.phone]),
    address: safeStr(f[CF.address]),
    city: safeStr(f[CF.city]),
    status: safeStr(f[CF.status]),
    source: safeStr(f[CF.source]),
    lotSize: safeStr(f[CF.lotSize]),
    introMow: f[CF.introMow] || false,
    rate: safeNum(f[CF.rate]),
    frequency: safeStr(f[CF.frequency]),
    specInstr: safeStr(f[CF.specInstr]),
    lastContact: safeStr(f[CF.lastContact]),
    notes: safeStr(f[CF.notes]),
    mowIds: arr(f[CF.mows]),
    intLogIds: arr(f[CF.intLog]),
  }
}

function parseMow(r) {
  const f = r.fields || {}
  return {
    id: r.id,
    mowId: safeStr(f[SF.mowId]),
    clientName: safeStr(f[SF.clientName]),
    date: safeStr(f[SF.date]),
    type: safeStr(f[SF.type]),
    status: safeStr(f[SF.status]),
    amount: safeNum(f[SF.amount]),
    payMethod: safeStr(f[SF.payMethod]),
    stripeId: safeStr(f[SF.stripeId]),
    invStatus: safeStr(f[SF.invStatus]),
    duration: safeNum(f[SF.duration]),
    notes: safeStr(f[SF.notes]),
    contactIds: arr(f[SF.contacts]),
  }
}

// ─── Date / format helpers ────────────────────────────────────────────────────
function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function mapsUrl(address, city) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address} ${city} TN`)}` }
function fmtCurrency(val) { const n = safeNum(val); return n == null ? '—' : `$${n % 1 === 0 ? n : n.toFixed(2)}` }
function fmtDateShort(str) { if (!str) return ''; const d = new Date(str.includes('T') ? str : str + 'T12:00:00'); return isNaN(d) ? str : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
function getMonday(date) { const d = new Date(date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); d.setDate(diff); d.setHours(0,0,0,0); return d }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d }
function dateToStr(d) { return d.toLocaleDateString('en-CA') }

// ─── Status colors ────────────────────────────────────────────────────────────
const CONTACT_STATUS = {
  Active: 'bg-green-100 text-green-700',
  Lead: 'bg-yellow-100 text-yellow-700',
  Scheduled: 'bg-blue-100 text-blue-700',
  Cold: 'bg-gray-100 text-gray-500',
  Lost: 'bg-red-100 text-red-700',
}
const MOW_STATUS = {
  Scheduled: 'bg-blue-100 text-blue-700',
  Completed: 'bg-green-100 text-green-700',
  Cancelled: 'bg-gray-100 text-gray-500',
  'No-show': 'bg-red-100 text-red-700',
}
const INV_STATUS = {
  'Not Sent': 'bg-gray-100 text-gray-500',
  Sent: 'bg-yellow-100 text-yellow-700',
  Paid: 'bg-green-100 text-green-700',
  Waived: 'bg-purple-100 text-purple-600',
}

// ─── Weather helpers ──────────────────────────────────────────────────────────
function weatherIcon(code) {
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫'
  if (code <= 67) return '🌧'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦'
  return '⛈'
}
function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long' })
}

// ─── WeatherModal ─────────────────────────────────────────────────────────────
function WeatherModal({ weather, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800 text-lg">7-Day Forecast</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs uppercase tracking-wide">
              <th className="text-left pb-2">Day</th>
              <th className="text-center pb-2">Icon</th>
              <th className="text-right pb-2">High</th>
              <th className="text-right pb-2">Rain %</th>
            </tr>
          </thead>
          <tbody>
            {weather.daily.time.map((date, i) => (
              <tr key={date} className="border-t border-gray-100">
                <td className="py-2 text-gray-700">{dayLabel(date)}</td>
                <td className="py-2 text-center text-lg">{weatherIcon(weather.daily.weathercode[i])}</td>
                <td className="py-2 text-right text-gray-700">{weather.daily.temperature_2m_max[i]}°</td>
                <td className="py-2 text-right text-gray-500">{weather.daily.precipitation_probability_max[i]}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── WeatherBanner ────────────────────────────────────────────────────────────
function WeatherBanner({ weather }) {
  const [showModal, setShowModal] = useState(false)

  if (!weather) return null

  const next3 = [0, 1, 2].map(i => ({
    date: weather.daily.time[i],
    prob: weather.daily.precipitation_probability_max[i],
    temp: weather.daily.temperature_2m_max[i],
    code: weather.daily.weathercode[i],
  }))

  const rainyDay = next3.find(d => d.prob > 50)
  if (!rainyDay) return null

  return (
    <>
      <button
        className="w-full bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-left text-sm text-blue-700 font-medium flex items-center gap-2 mb-3"
        onClick={() => setShowModal(true)}
      >
        <span className="text-base">{weatherIcon(rainyDay.code)}</span>
        <span>Rain likely {dayLabel(rainyDay.date)} ({rainyDay.prob}%) · High {rainyDay.temp}°</span>
      </button>
      {showModal && <WeatherModal weather={weather} onClose={() => setShowModal(false)} />}
    </>
  )
}

// ─── ConfirmCompleteModal ─────────────────────────────────────────────────────
function ConfirmCompleteModal({ mow, contact, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)
  const name = contact?.name || mow.clientName

  async function handleConfirm() {
    setLoading(true)
    try {
      await atPatch(SCHEDULE_TABLE, mow.id, { [SF.status]: 'Completed' })
      // TODO: Replace with actual Stripe invoice link from fldC06DE4htmBScNM once Stripe integration built
      window.open('https://dashboard.stripe.com/invoices', '_blank')
      toast.success(`${name} marked complete!`)
      onConfirm()
    } catch {
      toast.error('Failed to update')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800 text-lg mb-2">Mark Complete</h3>
        <p className="text-gray-600 text-sm mb-6">
          Mark <strong>{name}</strong> complete and open {fmtCurrency(mow.amount)} invoice?
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-green-600 text-white font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── EditMowModal ─────────────────────────────────────────────────────────────
function EditMowModal({ mow, onClose, onSave }) {
  const [form, setForm] = useState({
    date: mow.date || '',
    notes: mow.notes || '',
    type: mow.type || '',
    status: mow.status || 'Scheduled',
    amount: mow.amount != null ? String(mow.amount) : '',
    payMethod: mow.payMethod || '',
    invStatus: mow.invStatus || 'Not Sent',
    duration: mow.duration != null ? String(mow.duration) : '',
  })
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)
    try {
      await atPatch(SCHEDULE_TABLE, mow.id, {
        [SF.date]: form.date || undefined,
        [SF.notes]: form.notes || undefined,
        [SF.type]: form.type || undefined,
        [SF.status]: form.status || undefined,
        [SF.amount]: form.amount ? parseFloat(form.amount) : undefined,
        [SF.payMethod]: form.payMethod || undefined,
        [SF.invStatus]: form.invStatus || undefined,
        [SF.duration]: form.duration ? parseFloat(form.duration) : undefined,
      })
      toast.success('Mow updated')
      onSave()
    } catch {
      toast.error('Failed to save')
    } finally {
      setLoading(false)
    }
  }

  const field = (label, key, type = 'text', opts = null) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {opts ? (
        <select
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
          value={form[key]}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        >
          {opts.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
          value={form[key]}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        />
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Edit Mow</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          {field('Date', 'date', 'date')}
          {field('Time Note (e.g. 8am start)', 'notes')}
          {field('Type', 'type', 'text', ['Intro', 'One-time', 'Recurring'])}
          {field('Status', 'status', 'text', ['Scheduled', 'Completed', 'Cancelled', 'No-show'])}
          {field('Amount ($)', 'amount', 'number')}
          {field('Pay Method', 'payMethod', 'text', ['Cash', 'Stripe', 'Venmo', 'Zelle', 'Other'])}
          {field('Invoice Status', 'invStatus', 'text', ['Not Sent', 'Sent', 'Paid', 'Waived'])}
          {field('Duration (min)', 'duration', 'number')}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium">Cancel</button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── JobDetail ────────────────────────────────────────────────────────────────
function JobDetail({ mow, contact, onBack, onRefresh }) {
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleComplete() {
    setConfirmOpen(false)
    onRefresh()
    onBack()
  }

  return (
    <div className="fixed inset-0 bg-white z-40 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 z-10">
        <button onClick={onBack} className="text-green-600 font-medium flex items-center gap-1 min-h-[48px] px-2">
          <ChevronLeft size={20} />
          Back
        </button>
        <h2 className="text-lg font-bold text-gray-800 flex-1">{contact?.name || mow.clientName}</h2>
      </div>

      <div className="px-4 py-5 space-y-4 pb-32">
        {/* Address */}
        {contact && (
          <a
            href={mapsUrl(contact.address, contact.city)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-green-600 font-medium text-sm"
          >
            <MapPin size={16} />
            {contact.address}{contact.city ? `, ${contact.city}` : ''}
          </a>
        )}

        {/* Details row */}
        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
          <span>{fmtDateShort(mow.date)}</span>
          {mow.type && <span className="text-gray-400">·</span>}
          {mow.type && <span>{mow.type}</span>}
          {mow.amount != null && <span className="text-gray-400">·</span>}
          {mow.amount != null && <span className="font-semibold text-gray-800">{fmtCurrency(mow.amount)}</span>}
        </div>

        {/* Status badge */}
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${MOW_STATUS[mow.status] || 'bg-gray-100 text-gray-500'}`}>
          {mow.status || 'Unknown'}
        </span>

        {/* Special instructions */}
        {contact?.specInstr && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-700 mb-1">⚠️ YARD NOTES</p>
            <p className="text-sm text-amber-800">{contact.specInstr}</p>
          </div>
        )}

        {/* Text link */}
        {contact?.phone && (
          <a
            href={`sms:${contact.phone}`}
            className="flex items-center gap-2 text-blue-600 font-medium text-sm min-h-[48px]"
          >
            💬 Text {contact.name}
          </a>
        )}

        {/* Edit button */}
        <button
          onClick={() => setEditOpen(true)}
          className="w-full py-3 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm"
        >
          ✏️ Edit This Mow
        </button>
      </div>

      {/* Mark Complete pinned to bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
        <button
          onClick={() => setConfirmOpen(true)}
          className="w-full h-14 bg-green-600 text-white font-semibold rounded-xl text-base flex items-center justify-center gap-2"
        >
          <CheckCircle size={20} />
          ✅ Mark Complete + Invoice
        </button>
      </div>

      {editOpen && (
        <EditMowModal
          mow={mow}
          onClose={() => setEditOpen(false)}
          onSave={() => { setEditOpen(false); onRefresh() }}
        />
      )}
      {confirmOpen && (
        <ConfirmCompleteModal
          mow={mow}
          contact={contact}
          onClose={() => setConfirmOpen(false)}
          onConfirm={handleComplete}
        />
      )}
    </div>
  )
}

// ─── MowCard ──────────────────────────────────────────────────────────────────
function MowCard({ mow, contact, onOpenJob }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-800">{contact?.name || mow.clientName}</span>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${MOW_STATUS[mow.status] || 'bg-gray-100 text-gray-500'}`}>
          {mow.status}
        </span>
      </div>
      {contact && (
        <p className="text-sm text-gray-500 mb-1">{contact.address}{contact.city ? `, ${contact.city}` : ''}</p>
      )}
      <p className="text-sm text-gray-600 mb-3">
        {mow.type}{mow.type && mow.amount != null ? ' · ' : ''}{mow.amount != null ? fmtCurrency(mow.amount) : ''}
      </p>
      {contact?.specInstr && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
          <p className="text-xs font-bold text-amber-700">⚠️ Special Instructions</p>
          <p className="text-xs text-amber-800 mt-0.5">{contact.specInstr}</p>
        </div>
      )}
      <div className="flex gap-2">
        {contact?.phone && (
          <a
            href={`sms:${contact.phone}`}
            className="flex-1 min-h-[48px] flex items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-medium text-sm"
          >
            💬 Text
          </a>
        )}
        {contact?.address && (
          <a
            href={mapsUrl(contact.address, contact.city)}
            target="_blank"
            rel="noreferrer"
            className="flex-1 min-h-[48px] flex items-center justify-center rounded-xl bg-gray-50 text-gray-700 font-medium text-sm"
          >
            🗺 Maps
          </a>
        )}
        <button
          onClick={onOpenJob}
          className="flex-1 min-h-[48px] flex items-center justify-center rounded-xl bg-green-600 text-white font-medium text-sm"
        >
          → Open
        </button>
      </div>
    </div>
  )
}

// ─── NudgesPanel ──────────────────────────────────────────────────────────────
function NudgesPanel({ contacts, schedules, nudges, nudgesFetched, setNudges, setNudgesFetched }) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState([])

  async function fetchNudges() {
    if (nudgesFetched) return
    setLoading(true)
    try {
      const contextStr = JSON.stringify({
        clients: contacts.slice(0, 20).map(c => ({ name: c.name, status: c.status, lastContact: c.lastContact, rate: c.rate })),
        recentMows: schedules.slice(0, 20).map(m => ({ clientName: m.clientName, date: m.date, status: m.status, amount: m.amount })),
      })
      // NOTE: VITE_ env vars are baked into the JS bundle at build time.
      // VITE_ANTHROPIC_API_KEY will be visible in the built JS. Use a server-side
      // proxy (Supabase Edge Function) in production for better security.
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTH_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-allow-browser': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          system: `You are a business advisor for Happy Cuts, a small lawn mowing business in Cookeville, TN run by Thomas Shepard. Review the client and schedule data and return 2-4 short, actionable nudges. Each nudge must be 1-2 sentences, specific to the data, and directly actionable. Return ONLY a JSON array: [{"priority":"high|medium|low","icon":"emoji","text":"nudge text"}]. No preamble, no markdown, just the JSON array.`,
          messages: [{ role: 'user', content: contextStr }],
        }),
      })
      const data = await res.json()
      const raw = data.content?.[0]?.text || '[]'
      const parsed = JSON.parse(raw)
      setNudges(Array.isArray(parsed) ? parsed : [])
    } catch {
      // fail silently
    } finally {
      setLoading(false)
      setNudgesFetched(true)
    }
  }

  function handleToggle() {
    const next = !expanded
    setExpanded(next)
    if (next && !nudgesFetched) fetchNudges()
  }

  const visible = nudges.filter((_, i) => !dismissed.includes(i))
  if (nudgesFetched && visible.length === 0 && !loading) return null

  const borderColor = { high: 'border-red-400', medium: 'border-yellow-400', low: 'border-gray-300' }

  return (
    <div className="mt-4">
      <button
        onClick={handleToggle}
        className="w-full py-3 px-4 rounded-xl bg-gray-50 border border-gray-200 text-sm font-medium text-gray-700 text-left"
      >
        🤖 AI Nudges ({expanded ? 'collapse' : 'tap to expand'})
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={20} className="animate-spin text-green-600" />
              <span className="ml-2 text-sm text-gray-500">Thinking…</span>
            </div>
          )}
          {!loading && nudges.map((n, i) => dismissed.includes(i) ? null : (
            <div
              key={i}
              className={`bg-white border-l-4 ${borderColor[n.priority] || 'border-gray-300'} border border-gray-100 rounded-r-xl p-3 flex items-start gap-2`}
            >
              <span className="text-lg flex-shrink-0">{n.icon}</span>
              <p className="text-sm text-gray-700 flex-1">{n.text}</p>
              <button
                onClick={() => setDismissed(p => [...p, i])}
                className="text-gray-300 hover:text-gray-500 flex-shrink-0 ml-1"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── AddMowModal ──────────────────────────────────────────────────────────────
function AddMowModal({ contacts, onClose, onSave }) {
  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name))
  const [contactId, setContactId] = useState(sorted[0]?.id || '')
  const [date, setDate] = useState(todayStr())
  const [timeNote, setTimeNote] = useState('')
  const [type, setType] = useState('Recurring')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedContact = contacts.find(c => c.id === contactId)
  const clientName = selectedContact?.name || ''

  async function handleSave() {
    if (!contactId || !date) { toast.error('Client and date required'); return }
    setLoading(true)
    try {
      const mowId = `${clientName} – ${date}`
      await atPost(SCHEDULE_TABLE, {
        records: [{
          fields: {
            [SF.mowId]: mowId,
            [SF.clientName]: clientName,
            [SF.date]: date,
            [SF.type]: type,
            [SF.amount]: parseFloat(amount) || 0,
            [SF.notes]: timeNote || notes || undefined,
            [SF.status]: 'Scheduled',
            [SF.contacts]: [contactId],
            [SF.invStatus]: 'Not Sent',
          },
        }],
        typecast: true,
      })
      toast.success('Mow added!')
      onSave()
    } catch {
      toast.error('Failed to add mow')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Add Mow</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Client</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
              value={contactId}
              onChange={e => setContactId(e.target.value)}
            >
              {sorted.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Time Note (e.g. 8am start)</label>
            <input type="text" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={timeNote} onChange={e => setTimeNote(e.target.value)} placeholder="8am start" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={type} onChange={e => setType(e.target.value)}>
              <option>Intro</option>
              <option>One-time</option>
              <option>Recurring</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Amount ($)</label>
            <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium">Cancel</button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Add Mow
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TodayTab ─────────────────────────────────────────────────────────────────
function TodayTab({ schedules, contactsById, weather, onOpenJob, onRefresh, nudges, nudgesFetched, setNudges, setNudgesFetched, contacts }) {
  const [addOpen, setAddOpen] = useState(false)
  const today = todayStr()
  const todayMows = schedules.filter(m => m.date === today && m.status === 'Scheduled')

  return (
    <div className="px-4 py-4 pb-28">
      <WeatherBanner weather={weather} />
      <h2 className="text-lg font-bold text-gray-800 mb-3">Today's Mows</h2>

      {todayMows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Scissors size={40} className="mb-3 opacity-40" />
          <p className="text-base font-medium">No mows scheduled today</p>
          <p className="text-sm mt-1">Tap + Add Mow to schedule one</p>
        </div>
      ) : (
        todayMows.map(mow => (
          <MowCard
            key={mow.id}
            mow={mow}
            contact={contactsById[mow.contactIds[0]]}
            onOpenJob={() => onOpenJob(mow)}
          />
        ))
      )}

      <NudgesPanel
        contacts={contacts}
        schedules={schedules}
        nudges={nudges}
        nudgesFetched={nudgesFetched}
        setNudges={setNudges}
        setNudgesFetched={setNudgesFetched}
      />

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
        <button
          onClick={() => setAddOpen(true)}
          className="w-full h-14 bg-green-600 text-white font-semibold rounded-xl text-base flex items-center justify-center gap-2"
        >
          <Plus size={20} /> Add Mow
        </button>
      </div>

      {addOpen && (
        <AddMowModal
          contacts={contacts}
          onClose={() => setAddOpen(false)}
          onSave={() => { setAddOpen(false); onRefresh() }}
        />
      )}
    </div>
  )
}

// ─── AddContactModal ──────────────────────────────────────────────────────────
function AddContactModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    name: '', phone: '', address: '', city: '', status: 'Lead',
    source: '', lotSize: '', rate: '', frequency: '', specInstr: '', notes: '',
  })
  const [loading, setLoading] = useState(false)

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSave() {
    if (!form.name) { toast.error('Name required'); return }
    setLoading(true)
    try {
      await atPost(CONTACTS_TABLE, {
        records: [{
          fields: {
            [CF.name]: form.name,
            [CF.phone]: form.phone || undefined,
            [CF.address]: form.address || undefined,
            [CF.city]: form.city || undefined,
            [CF.status]: form.status,
            [CF.source]: form.source || undefined,
            [CF.lotSize]: form.lotSize || undefined,
            [CF.rate]: form.rate ? parseFloat(form.rate) : undefined,
            [CF.frequency]: form.frequency || undefined,
            [CF.specInstr]: form.specInstr || undefined,
            [CF.notes]: form.notes || undefined,
          },
        }],
        typecast: true,
      })
      toast.success('Contact added!')
      onSave()
    } catch {
      toast.error('Failed to add contact')
    } finally {
      setLoading(false)
    }
  }

  const inp = (label, key, type = 'text', opts = null) => (
    <div key={key}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {opts ? (
        <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={form[key]} onChange={e => set(key, e.target.value)}>
          {opts.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={form[key]} onChange={e => set(key, e.target.value)} />
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Add Contact</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          {inp('Name *', 'name')}
          {inp('Phone', 'phone', 'tel')}
          {inp('Address', 'address')}
          {inp('City', 'city')}
          {inp('Status', 'status', 'text', ['Lead', 'Active', 'Scheduled', 'Cold', 'Lost'])}
          {inp('Source', 'source')}
          {inp('Lot Size', 'lotSize')}
          {inp('Recurring Rate ($)', 'rate', 'number')}
          {inp('Recurring Frequency', 'frequency', 'text', ['Weekly', 'Bi-weekly', 'Monthly', 'One-time'])}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Special Instructions</label>
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" rows={2} value={form.specInstr} onChange={e => set('specInstr', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium">Cancel</button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Add Contact
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ClientCard ───────────────────────────────────────────────────────────────
function ClientCard({ contact }) {
  const navigate = useNavigate()
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-gray-800">{contact.name}</span>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${CONTACT_STATUS[contact.status] || 'bg-gray-100 text-gray-500'}`}>
          {contact.status || 'Unknown'}
        </span>
      </div>
      {contact.address && (
        <p className="text-sm text-gray-500 mb-1">{contact.address}{contact.city ? ` · ${contact.city}` : ''}</p>
      )}
      <p className="text-sm text-gray-600 mb-3">
        {contact.rate ? `$${contact.rate}` : '—'}{contact.frequency ? ` · ${contact.frequency}` : ''}
        {contact.lastContact ? ` | Last contact: ${fmtDateShort(contact.lastContact)}` : ''}
      </p>
      <div className="flex gap-2">
        {contact.phone && (
          <a href={`sms:${contact.phone}`} className="flex-1 min-h-[48px] flex items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-medium text-sm">
            💬 Text
          </a>
        )}
        {contact.address && (
          <a href={mapsUrl(contact.address, contact.city)} target="_blank" rel="noreferrer" className="flex-1 min-h-[48px] flex items-center justify-center rounded-xl bg-gray-50 text-gray-700 font-medium text-sm">
            🗺 Maps
          </a>
        )}
        <button
          onClick={() => navigate(`/happy-cuts/client/${contact.id}`)}
          className="flex-1 min-h-[48px] flex items-center justify-center rounded-xl bg-green-600 text-white font-medium text-sm"
        >
          → View
        </button>
      </div>
    </div>
  )
}

// ─── ClientsTab ───────────────────────────────────────────────────────────────
function ClientsTab({ contacts, onRefresh }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [addOpen, setAddOpen] = useState(false)
  const statuses = ['All', 'Active', 'Lead', 'Scheduled', 'Cold', 'Lost']

  const filtered = contacts.filter(c => {
    const matchSearch = !search || `${c.name} ${c.address}`.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'All' || c.status === filter
    return matchSearch && matchFilter
  })

  return (
    <div className="px-4 py-4 pb-28">
      <input
        type="text"
        placeholder="Search name or address…"
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-3"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filter === s ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Users size={40} className="mb-3 opacity-40" />
          <p className="text-base font-medium">No contacts found</p>
        </div>
      ) : (
        filtered.map(c => <ClientCard key={c.id} contact={c} />)
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
        <button
          onClick={() => setAddOpen(true)}
          className="w-full h-14 bg-green-600 text-white font-semibold rounded-xl text-base flex items-center justify-center gap-2"
        >
          <Plus size={20} /> Add Contact
        </button>
      </div>

      {addOpen && (
        <AddContactModal
          onClose={() => setAddOpen(false)}
          onSave={() => { setAddOpen(false); onRefresh() }}
        />
      )}
    </div>
  )
}

// ─── ScheduleTab ──────────────────────────────────────────────────────────────
function ScheduleTab({ schedules, contactsById, weekStart, setWeekStart, onOpenJob, onRefresh, contacts }) {
  const [addOpen, setAddOpen] = useState(false)

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekStr = weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  function goWeek(n) { setWeekStart(w => addDays(w, n * 7)) }

  async function handleStatusChange(mow, newStatus) {
    try {
      await atPatch(SCHEDULE_TABLE, mow.id, { [SF.status]: newStatus })
      toast.success('Status updated')
      onRefresh()
    } catch {
      toast.error('Failed to update')
    }
  }

  return (
    <div className="px-4 py-4 pb-6">
      {/* Week selector */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => goWeek(-1)} className="min-h-[44px] px-3 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 text-center">
          <span className="font-semibold text-gray-800 text-sm">Week of {weekStr}</span>
        </div>
        <button
          onClick={() => setWeekStart(getMonday(new Date()))}
          className="px-3 py-2 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg min-h-[44px]"
        >
          Today
        </button>
        <button onClick={() => goWeek(1)} className="min-h-[44px] px-3 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600">
          <ChevronRight size={20} />
        </button>
      </div>

      {days.map(day => {
        const dayStr = dateToStr(day)
        const dayMows = schedules
          .filter(m => m.date === dayStr)
          .sort((a, b) => (a.notes || '').localeCompare(b.notes || ''))
        const isToday = dayStr === todayStr()
        const label = day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

        return (
          <div key={dayStr} className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-semibold ${isToday ? 'text-green-600' : 'text-gray-700'}`}>
                {isToday ? '📍 ' : ''}{label}
              </span>
              <button
                onClick={() => setAddOpen(true)}
                className="text-xs font-medium text-green-600 flex items-center gap-1 min-h-[32px] px-2"
              >
                <Plus size={14} /> Add
              </button>
            </div>
            {dayMows.length === 0 ? (
              <p className="text-xs text-gray-300 pl-2 py-1">No mows</p>
            ) : (
              dayMows.map(mow => (
                <div
                  key={mow.id}
                  className={`flex items-center gap-2 py-2.5 px-3 rounded-xl border border-gray-100 mb-1.5 ${mow.status === 'Completed' ? 'bg-gray-50' : 'bg-white'}`}
                >
                  <span className={`flex-1 text-sm font-medium ${mow.status === 'Completed' ? 'text-gray-400' : 'text-gray-800'}`}>
                    {mow.status === 'Completed' ? '✓ ' : ''}{mow.clientName}
                    {mow.notes ? <span className="text-xs text-gray-400 ml-1">({mow.notes})</span> : null}
                  </span>
                  <select
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                    value={mow.status}
                    onChange={e => handleStatusChange(mow, e.target.value)}
                  >
                    {Object.keys(MOW_STATUS).map(s => <option key={s}>{s}</option>)}
                  </select>
                  <button
                    onClick={() => onOpenJob(mow)}
                    className="text-xs font-medium text-green-600 px-2 min-h-[32px]"
                  >
                    Open →
                  </button>
                </div>
              ))
            )}
          </div>
        )
      })}

      {addOpen && (
        <AddMowModal
          contacts={Object.values(contactsById)}
          onClose={() => setAddOpen(false)}
          onSave={() => { setAddOpen(false); onRefresh() }}
        />
      )}
    </div>
  )
}

// ─── RevenueTab ───────────────────────────────────────────────────────────────
const INV_CYCLE = ['Not Sent', 'Sent', 'Paid', 'Waived']

function RevenueTab({ schedules, contactsById, onOpenJob, onRefresh }) {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const completed = schedules.filter(m => m.status === 'Completed')
  const monthTotal = completed.filter(m => m.date?.startsWith(thisMonth)).reduce((s, m) => s + (safeNum(m.amount) || 0), 0)
  const allTotal = completed.reduce((s, m) => s + (safeNum(m.amount) || 0), 0)
  const cashCount = schedules.filter(m => safeStr(m.payMethod).toLowerCase() === 'cash').length
  const stripeCount = schedules.filter(m => safeStr(m.payMethod).toLowerCase() === 'stripe').length

  const sorted = [...schedules].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const total = sorted.length
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  async function cycleInvStatus(mow) {
    const cur = mow.invStatus || 'Not Sent'
    const idx = INV_CYCLE.indexOf(cur)
    const next = INV_CYCLE[(idx + 1) % INV_CYCLE.length]
    try {
      await atPatch(SCHEDULE_TABLE, mow.id, { [SF.invStatus]: next })
      toast.success(`Invoice: ${next}`)
      onRefresh()
    } catch {
      toast.error('Failed to update')
    }
  }

  return (
    <div className="px-4 py-4">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">This Month</p>
          <p className="text-lg font-bold text-green-600">{fmtCurrency(monthTotal)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">All Time</p>
          <p className="text-lg font-bold text-gray-800">{fmtCurrency(allTotal)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">Cash / Stripe</p>
          <p className="text-lg font-bold text-gray-800">{cashCount}/{stripeCount}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="text-left py-2 pr-3">Date</th>
              <th className="text-left py-2 pr-3">Client</th>
              <th className="text-left py-2 pr-3">Type</th>
              <th className="text-right py-2 pr-3">Amt</th>
              <th className="text-left py-2 pr-3">Pay</th>
              <th className="text-left py-2">Inv</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(mow => (
              <tr
                key={mow.id}
                className="border-b border-gray-50 cursor-pointer hover:bg-gray-50"
                onClick={() => onOpenJob(mow)}
              >
                <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">{fmtDateShort(mow.date)}</td>
                <td className="py-2.5 pr-3 font-medium text-gray-800">{mow.clientName}</td>
                <td className="py-2.5 pr-3 text-gray-500">{mow.type}</td>
                <td className="py-2.5 pr-3 text-right font-medium text-gray-800">{fmtCurrency(mow.amount)}</td>
                <td className="py-2.5 pr-3 text-gray-500">{mow.payMethod}</td>
                <td className="py-2.5" onClick={e => { e.stopPropagation(); cycleInvStatus(mow) }}>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold cursor-pointer ${INV_STATUS[mow.invStatus] || 'bg-gray-100 text-gray-500'}`}>
                    {mow.invStatus || 'Not Sent'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 text-sm font-medium text-gray-600 disabled:opacity-30 flex items-center gap-1"
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span className="text-sm text-gray-400">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={(page + 1) * PAGE_SIZE >= total}
            className="px-4 py-2 text-sm font-medium text-gray-600 disabled:opacity-30 flex items-center gap-1"
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HappyCuts() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  if (profile?.role !== 'admin') return null

  const [contacts, setContacts] = useState([])
  const [schedules, setSchedules] = useState([])
  const [contactsById, setContactsById] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('today')
  const [jobDetail, setJobDetail] = useState(null)
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [weather, setWeather] = useState(null)
  const [nudges, setNudges] = useState([])
  const [nudgesFetched, setNudgesFetched] = useState(false)

  const load = useCallback(async () => {
    if (!HC_BASE) {
      toast.error('VITE_AIRTABLE_HAPPY_CUTS_BASE_ID is not set')
      return
    }
    setLoading(true)
    try {
      const [rawContacts, rawSchedules] = await Promise.all([
        fetchAll(CONTACTS_TABLE),
        fetchAll(SCHEDULE_TABLE),
      ])
      const parsedContacts = rawContacts
        .filter(r => !safeStr(r.fields[CF.name]).startsWith('DELETED'))
        .map(parseContact)
      const parsedSchedules = rawSchedules
        .filter(r => !safeStr(r.fields[SF.mowId]).startsWith('DELETED'))
        .map(parseMow)
      setContacts(parsedContacts)
      setSchedules(parsedSchedules)
      setContactsById(Object.fromEntries(parsedContacts.map(c => [c.id, c])))
    } catch (e) {
      console.error('Happy Cuts load error:', e)
      toast.error('Failed to load data: ' + (e.message || 'unknown'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Weather fetch (fail silently)
  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=36.1628&longitude=-85.5016&daily=precipitation_probability_max,temperature_2m_max,weathercode&timezone=America/Chicago&forecast_days=7')
        const data = await r.json()
        if (data?.daily) setWeather(data)
      } catch {
        // fail silently
      }
    })()
  }, [])

  const TABS = [
    { id: 'today', label: 'Today', icon: Scissors },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'revenue', label: 'Revenue', icon: BarChart2 },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-green-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <Scissors size={24} className="text-green-600" />
          <h1 className="text-xl font-bold text-gray-800">Happy Cuts</h1>
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-0 bg-white border-b border-gray-100 z-30">
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-xs font-semibold flex flex-col items-center gap-1 transition-colors ${
                activeTab === tab.id
                  ? 'text-green-600 border-b-2 border-green-600'
                  : 'text-gray-400'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'today' && (
        <TodayTab
          schedules={schedules}
          contactsById={contactsById}
          weather={weather}
          onOpenJob={setJobDetail}
          onRefresh={load}
          nudges={nudges}
          nudgesFetched={nudgesFetched}
          setNudges={setNudges}
          setNudgesFetched={setNudgesFetched}
          contacts={contacts}
        />
      )}
      {activeTab === 'clients' && (
        <ClientsTab contacts={contacts} onRefresh={load} />
      )}
      {activeTab === 'schedule' && (
        <ScheduleTab
          schedules={schedules}
          contactsById={contactsById}
          weekStart={weekStart}
          setWeekStart={setWeekStart}
          onOpenJob={setJobDetail}
          onRefresh={load}
          contacts={contacts}
        />
      )}
      {activeTab === 'revenue' && (
        <RevenueTab
          schedules={schedules}
          contactsById={contactsById}
          onOpenJob={setJobDetail}
          onRefresh={load}
        />
      )}

      {/* Job Detail overlay */}
      {jobDetail && (
        <JobDetail
          mow={jobDetail}
          contact={contactsById[jobDetail.contactIds?.[0]]}
          onBack={() => setJobDetail(null)}
          onRefresh={() => { load(); setJobDetail(null) }}
        />
      )}
    </div>
  )
}
