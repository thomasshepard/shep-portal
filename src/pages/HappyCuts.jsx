import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'
import {
  Leaf, MapPin, ChevronLeft, ChevronRight, ChevronDown, X, Plus,
  CheckCircle, Calendar, DollarSign, Users, BarChart2, Loader2, BookOpen,
} from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────────────────
const HC_BASE = import.meta.env.VITE_AIRTABLE_HAPPY_CUTS_BASE_ID
const HC_PAT  = import.meta.env.VITE_AIRTABLE_PAT
const AT_BASE = `https://api.airtable.com/v0/${HC_BASE}`
const ANTH_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const CONTACTS_TABLE = 'tbl1Y1siC5qV2fX8J'
const SCHEDULE_TABLE = 'tbli7OArESf2SHL10'

// Contacts field IDs
const CF = {
  name: 'fldGL097AcMkuoEOV', phone: 'fld8Pvw9PVZ2NbFAK',
  address: 'fldKeMIk04Z0jDLGB', city: 'fldrU58CIWkwZSXdq',
  status: 'fldIYOLDa7aoEzYtf', // Status v2: Lead/Recurring/One-Time/Cold/Lost
  source: 'fldo96pa3p3atK1II',
  lotSize: 'fldVU5PtL0plCLwNT', introMow: 'fldISodjHRyqQjxrW',
  rate: 'fldyMY0Ol45rigJB3', frequency: 'fldFhIhpjT7ZQ3uUR',
  specInstr: 'fldj6kBhVPzCMaodF', lastContact: 'fldL0kROy9gmqGn6n',
  notes: 'fldnB5pgFTZCrtnKp', mows: 'fldZEPF6RRobDt68t',
  intLog: 'fldjvR4YIoKITpbbn',
  email: 'fldQyQqbLZFDYvNzL', stripeCustomerId: 'fld01FQpuNajt1eB3',
}

// Schedule field IDs
const SF = {
  mowId: 'fldSrspOHhEOnQOxY', clientName: 'fldjSJ0x5rJ3S0FYm',
  date: 'fldcu9rgNI8REbrE0', type: 'fldBt3Ewb6EGd3a4S',
  status: 'fldzyHzszEVZGhs6U', amount: 'fldJoKhtQX4MujAOi',
  payMethod: 'fldZx0GDaJkLML2ID', stripeId: 'fldC06DE4htmBScNM',
  invStatus: 'fldhiIRXuRlvp3QXO', duration: 'fldsVZmdyFnXAIszv',
  notes: 'fldos2p3iwvUCKlH6', contacts: 'fldemlueed8aZMi7J',
  timePreference: 'fldAc9skq3oOTrjiE', // singleSelect: Specific Time/Morning/Afternoon/Anytime
  scheduledTime: 'fldtwRBQ5DcQ2UQCF',  // singleLineText: "8:00 AM", "Morning", etc.
  visitNotes: 'fldGQgvRXisiOTYyF',      // multilineText
  photos: 'fldEGXwnsm0xbBmrg',          // multipleAttachments
  stripeInvoiceUrl: 'fldoHweTNKKE7hjyy', // url
  sortOrder: 'fldkJxYo2JQZ25lLi',          // number — drag order within day
  appointmentDateTime: 'fldyXThNomMSb9joa', // dateTime — kept for compat
  scheduleDateTime: 'fldcfkVEvuLciPD8z',    // dateTime — PRIMARY schedule field
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
    fields: f, // preserve raw fields for invoice access
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
    email: safeStr(f[CF.email]),
    stripeCustomerId: safeStr(f[CF.stripeCustomerId]),
    mowIds: arr(f[CF.mows]),
    intLogIds: arr(f[CF.intLog]),
  }
}

function parseMow(r) {
  const f = r.fields || {}
  return {
    id: r.id,
    fields: f, // preserve raw fields for invoice access
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
    scheduledTime: safeStr(f[SF.scheduledTime]),
    timePreference: safeStr(f[SF.timePreference]),
    visitNotes: safeStr(f[SF.visitNotes]),
    photos: arr(f[SF.photos]),
    sortOrder: safeNum(f[SF.sortOrder]),
    appointmentDateTime: safeStr(f[SF.appointmentDateTime]),
    scheduleDateTime: safeStr(f[SF.scheduleDateTime]),
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
function buildScheduleDateTime(date, timeType, specificTime) {
  let timeStr = '12:00'
  if (timeType === 'Specific Time' && specificTime) timeStr = specificTime
  else if (timeType === 'Morning') timeStr = '08:00'
  else if (timeType === 'Afternoon') timeStr = '12:00'
  return new Date(`${date}T${timeStr}:00`).toISOString()
}
function buildTimeDisplayString(timeType, specificTime) {
  if (timeType === 'Specific Time' && specificTime) {
    const [h, m] = specificTime.split(':')
    const hour = parseInt(h)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    return `${hour % 12 || 12}:${m} ${ampm}`
  }
  return timeType
}
function buildGoogleCalendarUrl(mow, contact) {
  const title = encodeURIComponent(`Happy Cuts — ${mow.clientName}`)
  const location = encodeURIComponent(`${contact?.address || ''}, ${contact?.city || ''}, TN`)
  const details = encodeURIComponent([
    `${mow.type} mow · $${mow.amount ?? ''}`,
    contact?.specInstr ? `Notes: ${contact.specInstr}` : '',
    'Happy Cuts — (931) 284-3503',
  ].filter(Boolean).join('\n'))
  const fmt = d => d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'
  const tp = mow.timePreference
  const schedDT = mow.scheduleDateTime
  let dates = ''
  if (schedDT) {
    const start = new Date(schedDT)
    if (tp === 'Specific Time') {
      dates = `${fmt(start)}/${fmt(new Date(start.getTime() + 60 * 60 * 1000))}`
    } else if (tp === 'Morning') {
      dates = `${fmt(start)}/${fmt(new Date(start.getTime() + 4 * 60 * 60 * 1000))}`
    } else if (tp === 'Afternoon') {
      dates = `${fmt(start)}/${fmt(new Date(start.getTime() + 5 * 60 * 60 * 1000))}`
    } else {
      const ds = (mow.date || '').replace(/-/g, '')
      const next = new Date((mow.date || '') + 'T12:00:00'); next.setDate(next.getDate() + 1)
      dates = `${ds}/${next.toLocaleDateString('en-CA').replace(/-/g, '')}`
    }
  } else if (mow.date) {
    const ds = mow.date.replace(/-/g, '')
    const next = new Date(mow.date + 'T12:00:00'); next.setDate(next.getDate() + 1)
    dates = `${ds}/${next.toLocaleDateString('en-CA').replace(/-/g, '')}`
  }
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`
}
function getMonday(date) { const d = new Date(date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); d.setDate(diff); d.setHours(0,0,0,0); return d }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d }
function dateToStr(d) { return d.toLocaleDateString('en-CA') }

// ─── Status colors ────────────────────────────────────────────────────────────
const CONTACT_STATUS = {
  'Lead':      'bg-yellow-100 text-yellow-800',
  'Recurring': 'bg-green-100 text-green-800',
  'One-Time':  'bg-blue-100 text-blue-800',
  'Cold':      'bg-gray-100 text-gray-600',
  'Lost':      'bg-red-100 text-red-700',
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

// ─── Recurring scheduling helpers ────────────────────────────────────────────
function calcNextDateStr(mow, contact) {
  const frequencyDays = { 'Weekly': 7, 'Bi-weekly': 14, 'Monthly': 30 }
  const intervalDays = frequencyDays[contact.frequency]
  if (!intervalDays || !mow.date) return null
  const baseDate = new Date(mow.date + 'T12:00:00')
  const baseDow = baseDate.getDay()
  const rawNext = new Date(baseDate)
  rawNext.setDate(rawNext.getDate() + intervalDays)
  const dowDiff = (baseDow - rawNext.getDay() + 7) % 7
  rawNext.setDate(rawNext.getDate() + dowDiff)
  return rawNext.toLocaleDateString('en-CA')
}

async function createNextRecurringMow(completedMow, contact) {
  if (!contact || contact.status !== 'Recurring') return null
  if (!contact.frequency) return null
  if (!contact.rate) return null
  const nextDateStr = calcNextDateStr(completedMow, contact)
  if (!nextDateStr) return null
  // Duplicate check
  const dupFilter = encodeURIComponent(
    `AND({${SF.date}}='${nextDateStr}', {${SF.status}}='Scheduled', FIND('${contact.id}', ARRAYJOIN({${SF.contacts}})))`
  )
  const dupJson = await atGet(SCHEDULE_TABLE, `?returnFieldsByFieldId=true&filterByFormula=${dupFilter}`)
  if (dupJson.records?.length > 0) return null
  const contactName = contact.name
  const scheduleDateTime = new Date(`${nextDateStr}T08:00:00`).toISOString()
  const result = await atPost(SCHEDULE_TABLE, {
    records: [{
      fields: {
        [SF.mowId]: `${contactName} – ${nextDateStr}`,
        [SF.clientName]: contactName,
        [SF.date]: nextDateStr,
        [SF.scheduleDateTime]: scheduleDateTime,
        [SF.type]: 'Recurring',
        [SF.status]: 'Scheduled',
        [SF.amount]: contact.rate,
        [SF.timePreference]: 'Morning',
        [SF.scheduledTime]: 'Morning',
        [SF.invStatus]: 'Not Sent',
        [SF.contacts]: [contact.id],
      },
    }],
    typecast: true,
  })
  if (result.error) throw new Error(result.error.message || 'Create failed')
  return result.records?.[0] || null
}

// ─── CancelMowModal ───────────────────────────────────────────────────────────
function CancelMowModal({ mow, contact, onClose, onCancelled }) {
  const [step, setStep] = useState('confirm')
  const [loading, setLoading] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const name = contact?.name || mow.clientName
  const isRecurring = contact?.status === 'Recurring'
  const nextDateStr = isRecurring ? calcNextDateStr(mow, contact) : null
  const nextDateFormatted = nextDateStr
    ? new Date(nextDateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null

  async function handleCancel() {
    setLoading(true)
    try {
      await atPatch(SCHEDULE_TABLE, mow.id, { [SF.status]: 'Cancelled' })
      toast.success('Mow cancelled')
      if (isRecurring && nextDateStr) {
        setStep('skip')
      } else {
        onCancelled()
      }
    } catch {
      toast.error('Failed to cancel')
    } finally {
      setLoading(false)
    }
  }

  async function handleScheduleNext() {
    setScheduling(true)
    try {
      await createNextRecurringMow(mow, contact)
      toast.success(`Next mow scheduled for ${nextDateFormatted}`)
    } catch (err) {
      console.error('Skip-schedule failed:', err)
      toast.error('Could not schedule next mow')
    } finally {
      setScheduling(false)
      onCancelled()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={step === 'confirm' ? onClose : undefined}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        {step === 'confirm' && (
          <>
            <h3 className="font-semibold text-gray-800 text-lg mb-2">Cancel this mow?</h3>
            <p className="text-gray-600 text-sm mb-1"><strong>{name}</strong> · {fmtDateShort(mow.date)}</p>
            <p className="text-gray-400 text-xs mb-6">This will mark it cancelled. It won't be deleted.</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm">Keep It</button>
              <button onClick={handleCancel} disabled={loading} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {loading && <Loader2 size={14} className="animate-spin" />} Yes, Cancel
              </button>
            </div>
          </>
        )}
        {step === 'skip' && (
          <>
            <h3 className="font-semibold text-gray-800 text-lg mb-2">Skip this mow?</h3>
            <p className="text-gray-500 text-sm mb-5">The mow was cancelled. Keep the recurring chain going?</p>
            <div className="flex flex-col gap-2">
              <button onClick={handleScheduleNext} disabled={scheduling} className="w-full py-3 rounded-xl bg-green-600 text-white font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {scheduling && <Loader2 size={14} className="animate-spin" />}
                Schedule next mow for {nextDateFormatted}
              </button>
              <button onClick={onCancelled} className="w-full py-3 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm">Just cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── InvoiceModal ─────────────────────────────────────────────────────────────
function InvoiceModal({ mow, contact: initialContact, onClose, onConfirm }) {
  const [step, setStep] = useState('preview') // preview | loading | success | error
  const [contact, setContact] = useState(initialContact)
  const [emailInput, setEmailInput] = useState(initialContact?.email || '')
  const [invoiceUrl, setInvoiceUrl] = useState('')
  const [copied, setCopied] = useState(false)

  // Bug 3 fix: Use mow.contactIds (already parsed from mow.fields[SF.contacts])
  const mowContactId = mow.contactIds?.[0] || null

  useEffect(() => {
    if (!mowContactId) return
    if (contact?.id === mowContactId) return // already correct
    console.warn('[Invoice] Contact mismatch — re-fetching correct contact for mow', mow.id, 'expected:', mowContactId, 'got:', contact?.id)
    ;(async () => {
      try {
        const res = await fetch(
          `${AT_BASE}/${CONTACTS_TABLE}/${mowContactId}?returnFieldsByFieldId=true`,
          { headers: { Authorization: `Bearer ${HC_PAT}` } }
        )
        const data = await res.json()
        if (data.id) {
          const parsed = parseContact(data)
          setContact(parsed)
          setEmailInput(parsed.email || '')
        }
      } catch (err) {
        console.error('[Invoice] Failed to fetch correct contact:', err)
      }
    })()
  }, [mowContactId, contact?.id])

  const clientName = contact?.name || mow.clientName
  const firstName = clientName.split(' ')[0]
  const phone = contact?.phone || ''
  const amountNum = mow.amount != null ? Number(mow.amount).toFixed(2) : '0.00'
  const dateDisplay = fmtDateShort(mow.date)

  const message = `Hey ${firstName}! Your lawn looks great 🌿 Here's your invoice for $${amountNum} — pay online by card or bank transfer:\n${invoiceUrl}\n\nThanks! – Thomas, Happy Cuts\n(931) 284-3503`
  const smsLink = phone ? `sms:${phone.replace(/\D/g, '')}&body=${encodeURIComponent(message)}` : ''

  async function sendInvoice() {
    // Guard: verify env vars are present before attempting
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('[Invoice] Missing Supabase env vars:', { SUPABASE_URL, SUPABASE_ANON_KEY })
      toast.error('Configuration error — missing Supabase credentials')
      setStep('error')
      return
    }
    console.log('[Invoice] Using Supabase URL:', SUPABASE_URL)
    // Debug: Log invoice payload before sending
    console.log('[Invoice] mow object:', mow)
    console.log('[Invoice] contact object:', contact)
    console.log('[Invoice] amount being sent:', mow.amount)
    console.log('[Invoice] Sending invoice with:', {
      mowId: mow.id,
      contactId: mowContactId,
      clientName,
      email: emailInput.trim() || null,
      amount: mow.amount,
    })

    setStep('loading')
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-stripe-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          mowRecordId: mow.id,
          contactRecordId: mowContactId,
          clientName,
          clientEmail: emailInput.trim() || null,
          // Only pass stripeCustomerId if the contact in state matches the mow's contact
          stripeCustomerId: contact?.id === mowContactId
            ? (contact?.stripeCustomerId || null)
            : null,
          amount: mow.amount,
          description: `Happy Cuts – Lawn Mow – ${dateDisplay}`,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success && data.invoiceUrl) {
        setInvoiceUrl(data.invoiceUrl)
        setStep('success')
      } else {
        console.error('Invoice error:', data.error || 'Unknown error')
        setStep('error')
      }
    } catch (err) {
      console.error('Invoice fetch error:', err)
      setStep('error')
    }
  }

  async function handleDone() {
    try {
      await atPatch(SCHEDULE_TABLE, mow.id, { [SF.status]: 'Completed' })
      if (mowContactId) {
        const newStatus = mow.type === 'Recurring' ? 'Recurring' : 'One-Time'
        await atPatch(CONTACTS_TABLE, mowContactId, { [CF.status]: newStatus })
      }
    } catch {
      toast.error('Failed to update mow status')
    }
    onConfirm()
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      toast.success('Copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={step === 'preview' ? onClose : undefined}>
      <div className="bg-white rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>

        {/* Preview */}
        {step === 'preview' && (
          <>
            <div className="px-5 pt-5 pb-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">📋 Invoice Preview</h3>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <div className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Happy Cuts Lawn Care · (931) 284-3503</div>
              <div className="space-y-1">
                <div><span className="text-gray-500">Bill to:</span> <span className="font-medium text-gray-800">{clientName}</span></div>
                <div><span className="text-gray-500">For:</span> <span className="text-gray-800">Lawn Mow – {dateDisplay}</span></div>
                <div><span className="text-gray-500">Amount:</span> <span className="font-semibold text-gray-800">{fmtCurrency(mow.amount)}</span></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Client email</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="client@email.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                {!emailInput.trim() && (
                  <p className="text-xs text-gray-400 mt-1">No email — invoice link will be texted manually</p>
                )}
              </div>
              <div className="text-xs text-gray-400">You'll be CC'd at: thomas@eastmeadowproperties.com</div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm">Cancel</button>
              <button onClick={sendInvoice} className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm">Send Invoice →</button>
            </div>
          </>
        )}

        {/* Loading */}
        {step === 'loading' && (
          <div className="px-5 py-10 flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-green-600" />
            <p className="text-gray-600 text-sm font-medium">Sending invoice…</p>
          </div>
        )}

        {/* Success */}
        {step === 'success' && (
          <>
            <div className="px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">
                {emailInput.trim() ? '✅ Invoice Sent!' : '✅ Invoice Created'}
              </h3>
              {!emailInput.trim() && <p className="text-xs text-gray-400 mt-0.5">No email — send link below</p>}
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <p className="text-gray-700 font-medium">{clientName} · {fmtCurrency(mow.amount)}</p>
              <p className="text-gray-500">Lawn Mow – {dateDisplay}</p>
              <a href={invoiceUrl} target="_blank" rel="noreferrer" className="block w-full text-center py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700">
                📋 View Invoice
              </a>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Text payment link</p>
                <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-wrap break-words leading-relaxed">{message}</div>
                <div className="flex gap-2 mt-2">
                  <button onClick={copyText} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700">
                    {copied ? 'Copied!' : '📋 Copy Text'}
                  </button>
                  {smsLink && (
                    <a href={smsLink} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium text-center">
                      💬 Open SMS
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button onClick={handleDone} className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm">Done</button>
            </div>
          </>
        )}

        {/* Error */}
        {step === 'error' && (
          <>
            <div className="px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">❌ Something went wrong</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-gray-600 text-sm">Invoice not sent. Please try again or contact support.</p>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm">Cancel</button>
              <button onClick={() => setStep('preview')} className="flex-1 py-3 rounded-xl bg-green-600 text-white font-medium text-sm">Try Again</button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ─── EditMowModal ─────────────────────────────────────────────────────────────
function EditMowModal({ mow, onClose, onSave }) {
  const initTimeType = () => {
    const tp = mow.timePreference
    if (tp === 'Specific Time' || tp === 'Morning' || tp === 'Afternoon') return tp
    return 'Anytime'
  }
  const initSpecificTime = () => {
    if (mow.timePreference === 'Specific Time' && mow.scheduleDateTime) {
      const d = new Date(mow.scheduleDateTime)
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    }
    return '08:00'
  }
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
  const [timeType, setTimeType] = useState(initTimeType)
  const [specificTime, setSpecificTime] = useState(initSpecificTime)
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)
    try {
      const scheduleDateTime = form.date ? buildScheduleDateTime(form.date, timeType, specificTime) : undefined
      const scheduledTime = buildTimeDisplayString(timeType, specificTime)
      await atPatch(SCHEDULE_TABLE, mow.id, {
        [SF.date]: form.date || undefined,
        [SF.notes]: form.notes || undefined,
        [SF.type]: form.type || undefined,
        [SF.status]: form.status || undefined,
        [SF.amount]: form.amount ? parseFloat(form.amount) : undefined,
        [SF.payMethod]: form.payMethod || undefined,
        [SF.invStatus]: form.invStatus || undefined,
        [SF.duration]: form.duration ? parseFloat(form.duration) : undefined,
        [SF.timePreference]: timeType,
        [SF.scheduledTime]: scheduledTime,
        [SF.scheduleDateTime]: scheduleDateTime,
        [SF.appointmentDateTime]: timeType === 'Specific Time' ? scheduleDateTime : null,
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
        <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}>
          {opts.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
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
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Time</label>
            <div className="space-y-2.5">
              {[
                { value: 'Anytime', label: 'Anytime' },
                { value: 'Morning', label: 'Morning (8am – 12pm)' },
                { value: 'Afternoon', label: 'Afternoon (12pm – 5pm)' },
                { value: 'Specific Time', label: 'Specific Time' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name="editTimeType" value={opt.value} checked={timeType === opt.value} onChange={() => setTimeType(opt.value)} className="w-4 h-4 accent-green-600" />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                  {opt.value === 'Specific Time' && timeType === 'Specific Time' && (
                    <input type="time" value={specificTime} onChange={e => setSpecificTime(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
                  )}
                </label>
              ))}
            </div>
          </div>
          {field('Type', 'type', 'text', ['Intro', 'One-time', 'Recurring'])}
          {field('Status', 'status', 'text', ['Scheduled', 'Completed', 'Cancelled', 'No-show'])}
          {field('Amount ($)', 'amount', 'number')}
          {field('Pay Method', 'payMethod', 'text', ['Cash', 'Stripe', 'Venmo', 'Zelle', 'Other'])}
          {field('Invoice Status', 'invStatus', 'text', ['Not Sent', 'Sent', 'Paid', 'Waived'])}
          {field('Duration (min)', 'duration', 'number')}
          {field('Notes', 'notes')}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── JobDetail ────────────────────────────────────────────────────────────────
function JobDetail({ mow, contact, onBack, onRefresh }) {
  const navigate = useNavigate()
  const contactRecordId = contact?.id || mow.contactIds?.[0] || null
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [visitNotes, setVisitNotes] = useState(mow.visitNotes || '')
  const [visitNotesDirty, setVisitNotesDirty] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null)
  const [localPhotos, setLocalPhotos] = useState(mow.photos || [])
  const [cancelOpen, setCancelOpen] = useState(false)
  const [isCompleted, setIsCompleted] = useState(mow.status === 'Completed')
  const [markCompleteOpen, setMarkCompleteOpen] = useState(false)
  const [markCompleting, setMarkCompleting] = useState(false)
  const fileInputRef = useRef(null)

  function handleComplete() {
    setConfirmOpen(false)
    onRefresh()
    onBack()
  }

  async function markComplete() {
    setMarkCompleting(true)
    // Step 1: Mark completion (must succeed)
    try {
      await atPatch(SCHEDULE_TABLE, mow.id, { [SF.status]: 'Completed' })
      const contactId = mow.contactIds?.[0]
      if (contactId) {
        const newStatus = mow.type === 'Recurring' ? 'Recurring' : 'One-Time'
        await atPatch(CONTACTS_TABLE, contactId, { [CF.status]: newStatus })
      }
      setIsCompleted(true)
      setMarkCompleteOpen(false)
    } catch {
      toast.error('Failed to mark complete')
      setMarkCompleting(false)
      return
    }
    // Step 2: Auto-schedule next mow (failure is non-fatal)
    try {
      const nextMow = await createNextRecurringMow(mow, contact)
      if (nextMow) {
        const nextDate = nextMow.fields?.[SF.date]
        const formatted = nextDate
          ? new Date(nextDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          : ''
        toast.success(`✓ Complete! Next mow scheduled for ${formatted}`)
      } else {
        toast.success('Mow marked complete ✓')
      }
    } catch (err) {
      console.error('Auto-schedule failed:', err)
      toast.error("Mow marked complete, but next mow couldn't be scheduled. Open the Schedule tab to add it manually.")
    }
    setMarkCompleting(false)
  }

  async function saveNotes() {
    try {
      await atPatch(SCHEDULE_TABLE, mow.id, { [SF.visitNotes]: visitNotes })
      setVisitNotesDirty(false)
      toast.success('Notes saved ✓')
    } catch {
      toast.error('Failed to save notes')
    }
  }

  async function handlePhotoSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const existing = localPhotos.map(p => ({ url: p.url }))
      const newAttachment = {
        url: `data:${file.type};base64,${base64}`,
        filename: file.name || `photo-${Date.now()}.jpg`,
      }
      const res = await fetch(`${AT_BASE}/${SCHEDULE_TABLE}/${mow.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${HC_PAT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { [SF.photos]: [...existing, newAttachment] }, typecast: true }),
      })
      if (!res.ok) throw new Error('Upload failed')
      const updated = await res.json()
      setLocalPhotos(arr(updated.fields?.[SF.photos]))
      toast.success('Photo added ✓')
    } catch {
      toast.error('Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
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
        {contactRecordId && (
          <button
            onClick={() => navigate(`/happy-cuts/client/${contactRecordId}`)}
            className="text-sm text-green-600 font-medium shrink-0"
          >
            Contact →
          </button>
        )}
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
          {(() => { const t = mow.scheduledTime && mow.scheduledTime !== 'Anytime' ? mow.scheduledTime : mow.timePreference && mow.timePreference !== 'Anytime' ? mow.timePreference : ''; return t ? <><span className="text-gray-400">·</span><span>{t}</span></> : null })()}
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

        {/* Google Calendar */}
        <a
          href={buildGoogleCalendarUrl(mow, contact)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-blue-600 font-medium text-sm min-h-[48px]"
        >
          📅 Add to Google Calendar
        </a>

        {/* Visit Notes */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">📝 Visit Notes</p>
          <textarea
            value={visitNotes}
            onChange={e => { setVisitNotes(e.target.value); setVisitNotesDirty(e.target.value !== (mow.visitNotes || '')) }}
            placeholder="Notes about this visit..."
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-400"
            style={{ minHeight: '80px' }}
          />
          {visitNotesDirty && (
            <button
              onClick={saveNotes}
              className="mt-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg"
            >
              Save Notes
            </button>
          )}
        </div>

        {/* Photos */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">📷 Photos</p>
          {localPhotos.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {localPhotos.map((photo, i) => (
                <img
                  key={i}
                  src={photo.thumbnails?.large?.url || photo.url}
                  alt={`Visit photo ${i + 1}`}
                  className="w-full aspect-square object-cover rounded-lg cursor-pointer"
                  onClick={() => setFullscreenPhoto(photo.url)}
                />
              ))}
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handlePhotoSelect}
            className="hidden"
            ref={fileInputRef}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            {uploadingPhoto ? 'Uploading…' : '📷 Add Photo'}
          </button>
        </div>

        {/* Edit button */}
        <button
          onClick={() => setEditOpen(true)}
          className="w-full py-3 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm"
        >
          ✏️ Edit This Mow
        </button>

        {/* Cancel link */}
        {mow.status === 'Scheduled' && (
          <button
            onClick={() => setCancelOpen(true)}
            className="w-full text-red-500 text-sm py-2 text-center"
          >
            🚫 Cancel This Mow
          </button>
        )}
      </div>

      {/* Action buttons pinned to bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
        <div className="flex gap-2">
          <button
            onClick={() => setMarkCompleteOpen(true)}
            disabled={isCompleted}
            className={`flex-1 h-[52px] font-semibold rounded-xl text-sm flex items-center justify-center gap-1.5 ${
              isCompleted ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-green-600 text-white'
            }`}
          >
            <CheckCircle size={17} />
            {isCompleted ? 'Completed ✅' : 'Mark Complete'}
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            className={`flex-1 h-[52px] font-semibold rounded-xl text-sm flex items-center justify-center gap-1.5 ${
              mow.invStatus === 'Sent' || mow.invStatus === 'Paid'
                ? 'bg-blue-100 text-blue-400'
                : 'bg-blue-600 text-white'
            }`}
          >
            {mow.invStatus === 'Sent' || mow.invStatus === 'Paid' ? 'Invoice Sent ✅' : 'Send Invoice'}
          </button>
        </div>
      </div>

      {/* Mark Complete confirm modal */}
      {markCompleteOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setMarkCompleteOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 text-lg mb-3">Mark this mow as complete?</h3>
            <div className="flex gap-3">
              <button onClick={() => setMarkCompleteOpen(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm">Cancel</button>
              <button onClick={markComplete} disabled={markCompleting} className="flex-1 py-3 rounded-xl bg-green-600 text-white font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {markCompleting && <Loader2 size={14} className="animate-spin" />} Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen photo modal */}
      {fullscreenPhoto && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center"
          onClick={() => setFullscreenPhoto(null)}
        >
          <img src={fullscreenPhoto} className="max-w-full max-h-full object-contain" alt="Full size" />
          <button className="absolute top-4 right-4 text-white text-3xl leading-none">×</button>
        </div>
      )}

      {editOpen && (
        <EditMowModal
          mow={mow}
          onClose={() => setEditOpen(false)}
          onSave={() => { setEditOpen(false); onRefresh() }}
        />
      )}
      {confirmOpen && (
        <InvoiceModal
          mow={mow}
          contact={contact}
          onClose={() => setConfirmOpen(false)}
          onConfirm={handleComplete}
        />
      )}
      {cancelOpen && (
        <CancelMowModal
          mow={mow}
          contact={contact}
          onClose={() => setCancelOpen(false)}
          onCancelled={() => { setCancelOpen(false); onRefresh(); onBack() }}
        />
      )}
    </div>
  )
}

// ─── MowCard ──────────────────────────────────────────────────────────────────
function MowCard({ mow, contact, onOpenJob, onCancel, dragHandleProps, isDragging, isDragOver }) {
  const navigate = useNavigate()
  const contactRecordId = contact?.id || mow.contactIds?.[0] || null
  const isScheduled = mow.status === 'Scheduled'
  const todayLocal = new Date().toLocaleDateString('en-CA')
  const isOverdue = isScheduled && mow.date < todayLocal
  return (
    <div className={`relative bg-white border rounded-2xl p-4 mb-3 shadow-sm transition-all ${isOverdue ? 'border-amber-300' : isDragOver ? 'border-2 border-green-400' : 'border-gray-200'} ${isDragging ? 'opacity-50' : ''}`}>
      {/* Drag handle */}
      {isScheduled && dragHandleProps && (
        <div {...dragHandleProps} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 cursor-grab active:cursor-grabbing select-none text-xl px-1">
          ⠿
        </div>
      )}
      {/* Cancel × */}
      {isScheduled && onCancel && (
        <button
          onClick={e => { e.stopPropagation(); onCancel(mow) }}
          className="absolute top-2 right-2 text-gray-300 hover:text-red-500 text-xl leading-none w-8 h-8 flex items-center justify-center"
        >
          ×
        </button>
      )}
      <div className={`flex items-center justify-between mb-2 ${isScheduled && dragHandleProps ? 'pl-6' : ''}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-gray-800 truncate">{contact?.name || mow.clientName}</span>
          {contactRecordId && (
            <button
              onClick={e => { e.stopPropagation(); navigate(`/happy-cuts/client/${contactRecordId}`) }}
              className="text-xs text-green-600 border border-green-200 rounded-full px-2 py-0.5 shrink-0"
            >
              Contact →
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {isOverdue && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
              Overdue
            </span>
          )}
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isScheduled && onCancel ? 'mr-6' : ''} ${MOW_STATUS[mow.status] || 'bg-gray-100 text-gray-500'}`}>
            {mow.status}
          </span>
        </div>
      </div>
      {contact && (
        <p className={`text-sm text-gray-500 mb-1 ${isScheduled && dragHandleProps ? 'pl-6' : ''}`}>{contact.address}{contact.city ? `, ${contact.city}` : ''}</p>
      )}
      <p className="text-sm text-gray-600 mb-1">
        {mow.type}{mow.type && mow.amount != null ? ' · ' : ''}{mow.amount != null ? fmtCurrency(mow.amount) : ''}
      </p>
      {(() => { const t = mow.scheduledTime && mow.scheduledTime !== 'Anytime' ? mow.scheduledTime : mow.timePreference && mow.timePreference !== 'Anytime' ? mow.timePreference : ''; return t ? <p className="text-xs text-gray-400 mb-3">🕐 {t}</p> : null })()}
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
        <a
          href={buildGoogleCalendarUrl(mow, contact)}
          target="_blank"
          rel="noreferrer"
          className="flex-1 min-h-[48px] flex items-center justify-center rounded-xl bg-gray-50 text-gray-700 font-medium text-sm"
        >
          📅 Cal
        </a>
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
  const [timeType, setTimeType] = useState('Anytime')
  const [specificTime, setSpecificTime] = useState('08:00')
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
      const scheduleDateTime = buildScheduleDateTime(date, timeType, specificTime)
      const scheduledTime = buildTimeDisplayString(timeType, specificTime)
      await atPost(SCHEDULE_TABLE, {
        records: [{
          fields: {
            [SF.mowId]: mowId,
            [SF.clientName]: clientName,
            [SF.date]: date,
            [SF.type]: type,
            [SF.amount]: parseFloat(amount) || 0,
            [SF.notes]: notes || undefined,
            [SF.status]: 'Scheduled',
            [SF.contacts]: [contactId],
            [SF.invStatus]: 'Not Sent',
            [SF.timePreference]: timeType,
            [SF.scheduledTime]: scheduledTime,
            [SF.scheduleDateTime]: scheduleDateTime,
            [SF.appointmentDateTime]: timeType === 'Specific Time' ? scheduleDateTime : null,
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
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={contactId} onChange={e => setContactId(e.target.value)}>
              {sorted.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Time</label>
            <div className="space-y-2.5">
              {[
                { value: 'Anytime', label: 'Anytime' },
                { value: 'Morning', label: 'Morning (8am – 12pm)' },
                { value: 'Afternoon', label: 'Afternoon (12pm – 5pm)' },
                { value: 'Specific Time', label: 'Specific Time' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name="addTimeType" value={opt.value} checked={timeType === opt.value} onChange={() => setTimeType(opt.value)} className="w-4 h-4 accent-green-600" />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                  {opt.value === 'Specific Time' && timeType === 'Specific Time' && (
                    <input type="time" value={specificTime} onChange={e => setSpecificTime(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
                  )}
                </label>
              ))}
            </div>
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
          <button onClick={handleSave} disabled={loading} className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />} Add Mow
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TodayTab ─────────────────────────────────────────────────────────────────
function TodayTab({ schedules, contactsById, weather, onOpenJob, onRefresh, nudges, nudgesFetched, setNudges, setNudgesFetched, contacts }) {
  const [addOpen, setAddOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [localGroups, setLocalGroups] = useState({})
  const [showNextWeek, setShowNextWeek] = useState(false)
  const [nextWeekMows, setNextWeekMows] = useState(null) // null = not yet fetched
  const [nextWeekLoading, setNextWeekLoading] = useState(false)
  const today = todayStr()

  const endOfWeek = (() => {
    const d = new Date()
    const daysUntilSunday = d.getDay() === 0 ? 0 : 7 - d.getDay()
    d.setDate(d.getDate() + daysUntilSunday)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  // Sync localGroups from schedules prop — include past 7 days for overdue detection
  useEffect(() => {
    const sevenDaysAgo = dateToStr(addDays(new Date(), -7))
    const filtered = schedules
      .filter(m => m.date >= sevenDaysAgo && m.date <= endOfWeek && m.status === 'Scheduled')
      .sort((a, b) => {
        if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '')
        return (a.sortOrder ?? 999) - (b.sortOrder ?? 999)
      })
    const g = filtered.reduce((acc, mow) => {
      if (!acc[mow.date]) acc[mow.date] = []
      acc[mow.date].push(mow)
      return acc
    }, {})
    setLocalGroups(g)
  }, [schedules])

  const totalMows = Object.values(localGroups).reduce((s, arr) => s + arr.length, 0)

  const nextWeekRange = (() => {
    const thisMon = getMonday(new Date())
    const nextMon = addDays(thisMon, 7)
    const nextSun = addDays(nextMon, 6)
    return {
      start: dateToStr(nextMon),
      end: dateToStr(nextSun),
      label: `Next Week — ${nextMon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${nextSun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    }
  })()

  async function handleNextWeekToggle() {
    const next = !showNextWeek
    setShowNextWeek(next)
    if (next && nextWeekMows === null) {
      setNextWeekLoading(true)
      try {
        const { start, end } = nextWeekRange
        const filter = encodeURIComponent(`AND({${SF.status}}='Scheduled', {${SF.date}}>='${start}', {${SF.date}}<='${end}')`)
        const records = []
        let offset = null
        do {
          let qs = `?returnFieldsByFieldId=true&filterByFormula=${filter}`
          if (offset) qs += `&offset=${offset}`
          const json = await atGet(SCHEDULE_TABLE, qs)
          if (!json.records) throw new Error(json.error?.message || 'Fetch failed')
          records.push(...json.records)
          offset = json.offset || null
        } while (offset)
        setNextWeekMows(records.map(parseMow))
      } catch {
        toast.error('Failed to load next week')
        setNextWeekMows([])
      } finally {
        setNextWeekLoading(false)
      }
    }
  }

  async function handleDrop(date, fromId, toId) {
    if (fromId === toId) return
    const dayMows = localGroups[date] || []
    const fromIndex = dayMows.findIndex(m => m.id === fromId)
    const toIndex = dayMows.findIndex(m => m.id === toId)
    if (fromIndex === -1 || toIndex === -1) return
    const reordered = [...dayMows]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    setLocalGroups(prev => ({ ...prev, [date]: reordered }))
    const updates = reordered.map((mow, i) => ({ id: mow.id, fields: { [SF.sortOrder]: i + 1 } }))
    for (let i = 0; i < updates.length; i += 10) {
      await fetch(`${AT_BASE}/${SCHEDULE_TABLE}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${HC_PAT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: updates.slice(i, i + 10), typecast: true }),
      })
    }
  }

  return (
    <div className="px-4 py-4 pb-28">
      <WeatherBanner weather={weather} />

      {/* Next week toggle */}
      <button
        onClick={handleNextWeekToggle}
        className="w-full mt-1 mb-4 flex items-center justify-between px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium"
      >
        <span>{showNextWeek ? 'Hide Next Week' : 'Show Next Week'}</span>
        <ChevronDown size={15} className={`transition-transform duration-200 ${showNextWeek ? 'rotate-180' : ''}`} />
      </button>

      <h2 className="text-lg font-bold text-gray-800 mb-3">This Week's Mows</h2>

      {totalMows === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Leaf size={40} className="mb-3 opacity-40" />
          <p className="text-base font-medium">No mows scheduled this week</p>
          <p className="text-sm mt-1">Tap + Add Mow to schedule one</p>
        </div>
      ) : (
        Object.entries(localGroups).sort().map(([date, mows]) => {
          const isToday = date === today
          const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          })
          return (
            <div key={date} className="mb-5">
              <p className={`text-sm font-semibold mb-2 ${isToday ? 'text-green-600' : 'text-gray-500'}`}>
                {isToday ? `Today — ${label}` : label}
              </p>
              {mows.map(mow => (
                <MowCard
                  key={mow.id}
                  mow={mow}
                  contact={contactsById[mow.contactIds[0]]}
                  onOpenJob={() => onOpenJob(mow)}
                  onCancel={m => setCancelTarget(m)}
                  isDragging={draggedId === mow.id}
                  isDragOver={dragOverId === mow.id}
                  dragHandleProps={{
                    draggable: true,
                    onDragStart: () => setDraggedId(mow.id),
                    onDragOver: e => { e.preventDefault(); setDragOverId(mow.id) },
                    onDrop: () => { handleDrop(date, draggedId, mow.id); setDraggedId(null); setDragOverId(null) },
                    onDragEnd: () => { setDraggedId(null); setDragOverId(null) },
                  }}
                />
              ))}
            </div>
          )
        })
      )}

      {/* Next week section */}
      {showNextWeek && (
        <div className="mt-2">
          <h3 className="text-base font-bold text-gray-700 mb-3">{nextWeekRange.label}</h3>
          {nextWeekLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-green-600" />
            </div>
          ) : arr(nextWeekMows).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No scheduled mows next week</p>
          ) : (
            Object.entries(
              arr(nextWeekMows).reduce((acc, mow) => {
                const d = mow.date || ''
                if (!acc[d]) acc[d] = []
                acc[d].push(mow)
                return acc
              }, {})
            ).sort().map(([date, mows]) => {
              const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              return (
                <div key={date} className="mb-5">
                  <p className="text-sm font-semibold mb-2 text-gray-500">{label}</p>
                  {mows.map(mow => (
                    <MowCard
                      key={mow.id}
                      mow={mow}
                      contact={contactsById[mow.contactIds[0]]}
                      onOpenJob={() => onOpenJob(mow)}
                      onCancel={m => setCancelTarget(m)}
                      isDragging={false}
                      isDragOver={false}
                      dragHandleProps={null}
                    />
                  ))}
                </div>
              )
            })
          )}
        </div>
      )}

      {cancelTarget && (
        <CancelMowModal
          mow={cancelTarget}
          contact={contactsById[cancelTarget.contactIds?.[0]]}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => { setCancelTarget(null); onRefresh() }}
        />
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
  const statuses = ['All', 'Lead', 'Recurring', 'One-Time', 'Cold', 'Lost']

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
  const [cancelTarget, setCancelTarget] = useState(null)

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
          .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
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
                  {mow.status === 'Scheduled' && (
                    <button
                      onClick={() => setCancelTarget(mow)}
                      className="text-gray-300 hover:text-red-500 text-xl leading-none w-7 h-7 flex items-center justify-center"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )
      })}

      {cancelTarget && (
        <CancelMowModal
          mow={cancelTarget}
          contact={contactsById[cancelTarget.contactIds?.[0]]}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => { setCancelTarget(null); onRefresh() }}
        />
      )}

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
function RevenueTab({ onOpenJob }) {
  const now = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [selectedYM, setSelectedYM] = useState(currentYM)
  const [cache, setCache] = useState({})          // YYYY-MM → mow[]
  const [revLoading, setRevLoading] = useState(false)
  const [filterChip, setFilterChip] = useState('Completed')
  const [allFuture, setAllFuture] = useState(null) // total $ of all future Scheduled mows
  const [allFutureLoading, setAllFutureLoading] = useState(false)

  useEffect(() => {
    if (!cache[selectedYM]) fetchMonthData(selectedYM)
  }, [selectedYM])

  useEffect(() => {
    fetchAllFuture()
  }, [])

  async function fetchAllFuture() {
    setAllFutureLoading(true)
    try {
      const todayLocal = new Date().toLocaleDateString('en-CA')
      const filter = encodeURIComponent(`AND({${SF.status}}='Scheduled', {${SF.date}}>='${todayLocal}')`)
      const records = []
      let offset = null
      do {
        let qs = `?returnFieldsByFieldId=true&filterByFormula=${filter}`
        if (offset) qs += `&offset=${offset}`
        const json = await atGet(SCHEDULE_TABLE, qs)
        if (!json.records) throw new Error(json.error?.message || 'Fetch failed')
        records.push(...json.records)
        offset = json.offset || null
      } while (offset)
      const total = records.reduce((s, r) => s + (safeNum(r.fields?.[SF.amount]) || 0), 0)
      setAllFuture(total)
    } catch {
      setAllFuture(0)
    } finally {
      setAllFutureLoading(false)
    }
  }

  async function fetchMonthData(ym) {
    setRevLoading(true)
    try {
      const [year, month] = ym.split('-').map(Number)
      const start = `${ym}-01`
      const nextM = new Date(year, month, 1) // month is 1-indexed; Date uses 0-indexed, so this gives 1st of next month
      const end = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}-01`
      const filter = encodeURIComponent(`AND({${SF.date}}>='${start}', {${SF.date}}<'${end}')`)
      const records = []
      let offset = null
      do {
        let qs = `?returnFieldsByFieldId=true&filterByFormula=${filter}`
        if (offset) qs += `&offset=${offset}`
        const json = await atGet(SCHEDULE_TABLE, qs)
        if (!json.records) throw new Error(json.error?.message || 'Fetch failed')
        records.push(...json.records)
        offset = json.offset || null
      } while (offset)
      setCache(prev => ({ ...prev, [ym]: records.map(parseMow) }))
    } catch (e) {
      toast.error('Failed to load month')
      setCache(prev => ({ ...prev, [ym]: [] }))
    } finally {
      setRevLoading(false)
    }
  }

  function prevMonth() {
    const [y, m] = selectedYM.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setSelectedYM(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    setFilterChip('Completed')
  }
  function nextMonth() {
    const [y, m] = selectedYM.split('-').map(Number)
    const d = new Date(y, m, 1)
    setSelectedYM(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    setFilterChip('Completed')
  }

  const mows = arr(cache[selectedYM])
  const completedMows = mows.filter(m => m.status === 'Completed')
  const scheduledMows = mows.filter(m => m.status === 'Scheduled')
  const revenueCollected = completedMows.reduce((s, m) => s + (safeNum(m.amount) || 0), 0)
  const forecasted      = scheduledMows.reduce((s, m) => s + (safeNum(m.amount) || 0), 0)

  const listMows = (filterChip === 'Completed' ? completedMows : scheduledMows)
    .slice()
    .sort((a, b) => filterChip === 'Scheduled'
      ? (a.date || '').localeCompare(b.date || '')
      : (b.date || '').localeCompare(a.date || ''))

  const monthLabel = new Date(selectedYM + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const isCurrentMonth = selectedYM === currentYM

  return (
    <div className="px-4 py-4 pb-8">
      {/* Month navigator */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={prevMonth} className="min-h-[44px] px-3 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600">
          <ChevronLeft size={20} />
        </button>
        <span className="font-semibold text-gray-800">{monthLabel}</span>
        <button onClick={nextMonth} disabled={isCurrentMonth} className="min-h-[44px] px-3 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 disabled:opacity-30">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* KPI cards 2×2 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">Revenue Collected</p>
          <p className="text-lg font-bold text-green-600">{fmtCurrency(revenueCollected)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">Forecasted</p>
          <p className="text-lg font-bold text-blue-500">{fmtCurrency(forecasted)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">Mows Done</p>
          <p className="text-lg font-bold text-gray-800">{completedMows.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">Mows Booked</p>
          <p className="text-lg font-bold text-gray-800">{scheduledMows.length}</p>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 mb-4">
        {['Completed', 'Scheduled'].map(chip => (
          <button
            key={chip}
            onClick={() => setFilterChip(chip)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filterChip === chip ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Mow list */}
      {revLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-green-600" />
        </div>
      ) : listMows.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <p className="text-sm">No {filterChip.toLowerCase()} mows in {monthLabel}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {listMows.map(mow => {
            const dateStr = mow.scheduleDateTime
              ? new Date(mow.scheduleDateTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              : fmtDateShort(mow.date)
            return (
              <div
                key={mow.id}
                className="bg-white border border-gray-100 rounded-xl px-4 py-3 cursor-pointer active:bg-gray-50 transition-colors"
                onClick={() => onOpenJob(mow)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm text-gray-500 flex-shrink-0 w-20">{dateStr}</span>
                    <span className="font-medium text-gray-800 truncate">{safeStr(mow.clientName, '—')}</span>
                    {mow.type && <span className="text-xs text-gray-400 flex-shrink-0">{mow.type}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="font-semibold text-gray-800 text-sm">{fmtCurrency(mow.amount)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${MOW_STATUS[mow.status] || 'bg-gray-100 text-gray-500'}`}>
                      {safeStr(mow.status, '—')}
                    </span>
                  </div>
                </div>
                {mow.invStatus && mow.invStatus !== 'Not Sent' && (
                  <p className="text-xs text-gray-400 mt-0.5 pl-20">{safeStr(mow.invStatus)}</p>
                )}
              </div>
            )
          })}
          {filterChip === 'Scheduled' && (
            <div className="pt-4 border-t border-gray-100 text-sm text-gray-500 text-center">
              <span className="font-semibold text-gray-700">Forecasted this month: {fmtCurrency(forecasted)}</span>
              {' · '}
              {allFutureLoading ? (
                <span>Loading…</span>
              ) : allFuture != null ? (
                <span>All future booked: {fmtCurrency(allFuture)}</span>
              ) : null}
            </div>
          )}
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
    { id: 'today', label: 'Today', icon: Leaf },
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
          <Leaf size={24} className="text-green-600" />
          <h1 className="text-xl font-bold text-gray-800 flex-1">Happy Cuts</h1>
          <button
            onClick={() => navigate('/happy-cuts/guide')}
            className="flex items-center gap-1 text-sm text-green-700 hover:text-green-900 font-medium"
          >
            <BookOpen size={15} />
            Guide
          </button>
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
          onOpenJob={setJobDetail}
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
