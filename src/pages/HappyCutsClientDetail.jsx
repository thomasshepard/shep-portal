import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ChevronLeft, MapPin, X, Loader2, CheckCircle, Trash2,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────
const HC_BASE = import.meta.env.VITE_AIRTABLE_HAPPY_CUTS_BASE_ID
const HC_PAT  = import.meta.env.VITE_AIRTABLE_PAT
const AT_BASE = `https://api.airtable.com/v0/${HC_BASE}`
const N8N_HC_WEBHOOK = import.meta.env.VITE_N8N_HAPPY_CUTS_WEBHOOK_URL

const CONTACTS_TABLE = 'tbl1Y1siC5qV2fX8J'
const SCHEDULE_TABLE = 'tbli7OArESf2SHL10'
const INTLOG_TABLE   = 'tblTnQsV4POQ5da1X'

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
  timePreference: 'fldAc9skq3oOTrjiE',
  scheduledTime: 'fldtwRBQ5DcQ2UQCF',
  visitNotes: 'fldGQgvRXisiOTYyF',
  photos: 'fldEGXwnsm0xbBmrg',
  stripeInvoiceUrl: 'fldoHweTNKKE7hjyy',
  sortOrder: 'fldkJxYo2JQZ25lLi',
  appointmentDateTime: 'fldyXThNomMSb9joa',
  scheduleDateTime: 'fldcfkVEvuLciPD8z',
}

// Interaction Log field IDs
const LF = {
  logEntry: 'fldYI3AqHlpYzIHUZ', contactName: 'fldr8KC0ugTEjbBs3',
  timestamp: 'fldl57n8DJcvcuK0B', direction: 'fld0gEfG3SX5d7JS3',
  type: 'fldsS5GRzqbq5Ie8X', summary: 'fldSDBKJuMBwtM6Cv',
  tagUsed: 'fldvg4usOIZH0AjSY', contacts: 'fldvX8uLHa9yRJJCp',
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
    if (!json.records) throw new Error(json.error?.message || 'Fetch failed')
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
    scheduleDateTime: safeStr(f[SF.scheduleDateTime]),
    contactIds: arr(f[SF.contacts]),
  }
}

function parseLog(r) {
  const f = r.fields || {}
  return {
    id: r.id,
    logEntry: safeStr(f[LF.logEntry]),
    contactName: safeStr(f[LF.contactName]),
    timestamp: safeStr(f[LF.timestamp]),
    direction: safeStr(f[LF.direction]),
    type: safeStr(f[LF.type]),
    summary: safeStr(f[LF.summary]),
    tagUsed: safeStr(f[LF.tagUsed]),
    contactIds: arr(f[LF.contacts]),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
function fmtTimestamp(str) {
  if (!str) return ''
  try {
    const d = new Date(str)
    return isNaN(d) ? str : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return str }
}

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

// ─── InvoiceModal ─────────────────────────────────────────────────────────────
function InvoiceModal({ mow, contact, onClose, onConfirm }) {
  const [step, setStep] = useState('preview') // preview | loading | success | error
  const [emailInput, setEmailInput] = useState(contact?.email || '')
  const [invoiceUrl, setInvoiceUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const clientName = contact?.name || mow.clientName
  const firstName = clientName.split(' ')[0]
  const phone = contact?.phone || ''
  const amountNum = mow.amount != null ? Number(mow.amount).toFixed(2) : '0.00'
  const dateDisplay = fmtDateShort(mow.date)
  const contactId = mow.contactIds?.[0]

  const message = `Hey ${firstName}! Your lawn looks great 🌿 Here's your invoice for $${amountNum} — pay online by card or bank transfer:\n${invoiceUrl}\n\nThanks! – Thomas, Happy Cuts\n(931) 284-3503`
  const smsLink = phone ? `sms:${phone.replace(/\D/g, '')}&body=${encodeURIComponent(message)}` : ''

  async function sendInvoice() {
    setStep('loading')
    try {
      const payload = {
        mowRecordId: mow.id,
        contactRecordId: contactId,
        clientName,
        clientEmail: emailInput.trim() || null,
        clientPhone: phone,
        stripeCustomerId: contact?.stripeCustomerId || null,
        amount: mow.amount,
        description: `Happy Cuts – Lawn Mow – ${dateDisplay}`,
        productId: 'prod_UDsZmMCKFg8SoC',
        ccEmail: 'thomas@eastmeadowproperties.com',
        hasEmail: !!emailInput.trim(),
        airtableBaseId: HC_BASE,
        scheduleTableId: SCHEDULE_TABLE,
        contactsTableId: CONTACTS_TABLE,
        stripeInvoiceUrlFieldId: SF.stripeInvoiceUrl,
        stripeInvoiceIdFieldId: SF.stripeId,
        stripeCustomerIdFieldId: CF.stripeCustomerId,
        invoiceStatusFieldId: SF.invStatus,
      }
      const res = await fetch(N8N_HC_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success && data.invoiceUrl) {
        setInvoiceUrl(data.invoiceUrl)
        setStep('success')
      } else {
        setStep('error')
      }
    } catch {
      setStep('error')
    }
  }

  async function handleDone() {
    try {
      await atPatch(SCHEDULE_TABLE, mow.id, { [SF.status]: 'Completed' })
      if (contactId) {
        const newStatus = mow.type === 'Recurring' ? 'Recurring' : 'One-Time'
        await atPatch(CONTACTS_TABLE, contactId, { [CF.status]: newStatus })
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

        {step === 'loading' && (
          <div className="px-5 py-10 flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-green-600" />
            <p className="text-gray-600 text-sm font-medium">Sending invoice…</p>
          </div>
        )}

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

        {step === 'error' && (
          <>
            <div className="px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">❌ Something went wrong</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-gray-600 text-sm">Invoice not sent. Check your n8n workflow.</p>
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
    <div key={key}>
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
          <button onClick={handleSave} disabled={loading} className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── JobDetail overlay (inlined) ──────────────────────────────────────────────
function JobDetail({ mow, contact, onBack, onRefresh }) {
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [visitNotes, setVisitNotes] = useState(mow.visitNotes || '')
  const [visitNotesDirty, setVisitNotesDirty] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null)
  const [localPhotos, setLocalPhotos] = useState(mow.photos || [])
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
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 z-10">
        <button onClick={onBack} className="text-green-600 font-medium flex items-center gap-1 min-h-[48px] px-2">
          <ChevronLeft size={20} /> Back
        </button>
        <h2 className="text-lg font-bold text-gray-800 flex-1">{contact?.name || mow.clientName}</h2>
      </div>
      <div className="px-4 py-5 space-y-4 pb-32">
        {contact && (
          <a href={mapsUrl(contact.address, contact.city)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-green-600 font-medium text-sm">
            <MapPin size={16} />
            {contact.address}{contact.city ? `, ${contact.city}` : ''}
          </a>
        )}
        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
          <span>{fmtDateShort(mow.date)}</span>
          {mow.type && <><span className="text-gray-400">·</span><span>{mow.type}</span></>}
          {mow.amount != null && <><span className="text-gray-400">·</span><span className="font-semibold text-gray-800">{fmtCurrency(mow.amount)}</span></>}
        </div>
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${MOW_STATUS[mow.status] || 'bg-gray-100 text-gray-500'}`}>
          {mow.status || 'Unknown'}
        </span>
        {contact?.specInstr && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-700 mb-1">⚠️ YARD NOTES</p>
            <p className="text-sm text-amber-800">{contact.specInstr}</p>
          </div>
        )}
        {contact?.phone && (
          <a href={`sms:${contact.phone}`} className="flex items-center gap-2 text-blue-600 font-medium text-sm min-h-[48px]">
            💬 Text {contact.name}
          </a>
        )}

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
            <button onClick={saveNotes} className="mt-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg">
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
          <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" ref={fileInputRef} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            {uploadingPhoto ? 'Uploading…' : '📷 Add Photo'}
          </button>
        </div>

        <button onClick={() => setEditOpen(true)} className="w-full py-3 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm">
          ✏️ Edit This Mow
        </button>
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
        <EditMowModal mow={mow} onClose={() => setEditOpen(false)} onSave={() => { setEditOpen(false); onRefresh() }} />
      )}
      {confirmOpen && (
        <InvoiceModal mow={mow} contact={contact} onClose={() => setConfirmOpen(false)} onConfirm={handleComplete} />
      )}
    </div>
  )
}

// ─── Schedule Mow Modal ───────────────────────────────────────────────────────
function ScheduleMowModal({ contact, onClose, onSave }) {
  const tomorrow = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const [form, setForm] = useState({
    date: tomorrow,
    timePreference: 'Anytime',
    specificTime: '',
    type: 'One-Time',
    amount: contact.rate ? String(contact.rate) : '20',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  function getScheduledTime() {
    if (form.timePreference === 'Specific Time' && form.specificTime) {
      // Convert 24h time input to "8:00 AM" format
      const [h, m] = form.specificTime.split(':').map(Number)
      const ampm = h >= 12 ? 'PM' : 'AM'
      const hr = h % 12 || 12
      return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
    }
    return form.timePreference
  }

  async function handleSave() {
    if (!form.date) { toast.error('Date required'); return }
    setLoading(true)
    try {
      const mowId = `${contact.name} – ${form.date}`
      const scheduledTime = getScheduledTime()
      const scheduleDateTime = buildScheduleDateTime(form.date, form.timePreference, form.specificTime)
      const appointmentDateTime = form.timePreference === 'Specific Time' ? scheduleDateTime : null
      await atPost(SCHEDULE_TABLE, {
        records: [{
          fields: {
            [SF.mowId]: mowId,
            [SF.clientName]: contact.name,
            [SF.date]: form.date,
            [SF.type]: form.type,
            [SF.status]: 'Scheduled',
            [SF.amount]: parseFloat(form.amount) || 0,
            [SF.invStatus]: 'Not Sent',
            [SF.timePreference]: form.timePreference,
            [SF.scheduledTime]: scheduledTime,
            [SF.scheduleDateTime]: scheduleDateTime,
            ...(appointmentDateTime ? { [SF.appointmentDateTime]: appointmentDateTime } : {}),
            [SF.notes]: form.notes || null,
            [SF.contacts]: [contact.id],
          },
        }],
        typecast: true,
      })
      toast.success('Mow scheduled ✓')
      onSave()
    } catch {
      toast.error('Failed to schedule mow')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Schedule Mow — {contact.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date *</label>
            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Time Preference *</label>
            <div className="grid grid-cols-2 gap-2">
              {['Specific Time', 'Morning', 'Afternoon', 'Anytime'].map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => set('timePreference', opt)}
                  className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.timePreference === opt
                      ? 'bg-green-600 text-white border-green-600'
                      : 'border-gray-200 text-gray-600 hover:border-green-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          {form.timePreference === 'Specific Time' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Time</label>
              <input type="time" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={form.specificTime} onChange={e => set('specificTime', e.target.value)} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={form.type} onChange={e => set('type', e.target.value)}>
              <option>Intro</option>
              <option>One-Time</option>
              <option>Recurring</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Amount ($) *</label>
            <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />} Schedule
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Contact Modal ───────────────────────────────────────────────────────
function EditContactModal({ contact, onClose, onSave }) {
  const [form, setForm] = useState({
    name: contact.name || '',
    phone: contact.phone || '',
    email: contact.email || '',
    address: contact.address || '',
    city: contact.city || '',
    status: contact.status || 'Lead',
    source: contact.source || '',
    lotSize: contact.lotSize || '',
    rate: contact.rate != null ? String(contact.rate) : '',
    frequency: contact.frequency || '',
    specInstr: contact.specInstr || '',
    notes: contact.notes || '',
    lastContact: contact.lastContact || '',
  })
  const [loading, setLoading] = useState(false)

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSave() {
    if (!form.name) { toast.error('Name required'); return }
    setLoading(true)
    try {
      await atPatch(CONTACTS_TABLE, contact.id, {
        [CF.name]: form.name,
        [CF.phone]: form.phone || undefined,
        [CF.email]: form.email || undefined,
        [CF.address]: form.address || undefined,
        [CF.city]: form.city || undefined,
        [CF.status]: form.status,
        [CF.source]: form.source || undefined,
        [CF.lotSize]: form.lotSize || undefined,
        [CF.rate]: form.rate ? parseFloat(form.rate) : undefined,
        [CF.frequency]: form.frequency || undefined,
        [CF.specInstr]: form.specInstr || undefined,
        [CF.notes]: form.notes || undefined,
        [CF.lastContact]: form.lastContact || undefined,
      })
      toast.success('Contact updated!')
      onSave()
    } catch {
      toast.error('Failed to save')
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
          <h3 className="font-semibold text-gray-800">Edit Contact</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          {inp('Name *', 'name')}
          {inp('Phone', 'phone', 'tel')}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input type="email" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={form.email} onChange={e => set('email', e.target.value)} placeholder="client@email.com" />
            <p className="text-xs text-gray-400 mt-1">Used for Stripe invoice delivery</p>
          </div>
          {inp('Address', 'address')}
          {inp('City', 'city')}
          {inp('Status', 'status', 'text', ['Lead', 'Recurring', 'One-Time', 'Cold', 'Lost'])}
          {inp('Source', 'source')}
          {inp('Lot Size', 'lotSize')}
          {inp('Recurring Rate ($)', 'rate', 'number')}
          {inp('Recurring Frequency', 'frequency', 'text', ['Weekly', 'Bi-weekly', 'Monthly', 'One-time'])}
          {inp('Last Contact Date', 'lastContact', 'date')}
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
          <button onClick={handleSave} disabled={loading} className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Log Modal ────────────────────────────────────────────────────────────
function AddLogModal({ contact, onClose, onSave }) {
  const nowIso = new Date().toISOString()
  const [form, setForm] = useState({
    timestamp: nowIso.slice(0, 16),
    direction: 'Outbound',
    type: 'Text',
    summary: '',
  })
  const [loading, setLoading] = useState(false)

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSave() {
    if (!form.summary) { toast.error('Summary required'); return }
    setLoading(true)
    try {
      const direction = form.direction
      const summary = form.summary
      await atPost(INTLOG_TABLE, {
        records: [{
          fields: {
            [LF.logEntry]: `${direction} – ${summary.slice(0, 40)}`,
            [LF.contactName]: contact.name,
            [LF.timestamp]: new Date(form.timestamp).toISOString(),
            [LF.direction]: direction,
            [LF.type]: form.type,
            [LF.summary]: summary,
            [LF.contacts]: [contact.id],
          },
        }],
        typecast: true,
      })
      toast.success('Log added!')
      onSave()
    } catch {
      toast.error('Failed to add log')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Log Interaction</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Timestamp</label>
            <input type="datetime-local" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={form.timestamp} onChange={e => set('timestamp', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Direction</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={form.direction} onChange={e => set('direction', e.target.value)}>
              <option>Outbound</option>
              <option>Inbound</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" value={form.type} onChange={e => set('type', e.target.value)}>
              <option>Text</option>
              <option>Call</option>
              <option>In-person</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Summary *</label>
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" rows={3} value={form.summary} onChange={e => set('summary', e.target.value)} placeholder="What happened?" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />} Log It
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HappyCutsClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [contact, setContact] = useState(null)
  const [mows, setMows] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [jobDetail, setJobDetail] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [addLogOpen, setAddLogOpen] = useState(false)
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch contact directly
      const r = await fetch(`${AT_BASE}/${CONTACTS_TABLE}/${id}?returnFieldsByFieldId=true`, { headers: { Authorization: `Bearer ${HC_PAT}` } })
      const contactData = await r.json()
      if (!contactData.fields) throw new Error('Contact not found')
      const parsed = parseContact(contactData)
      setContact(parsed)
      setNotes(parsed.notes)

      // Fetch all schedules, filter to this contact
      const rawSchedules = await fetchAll(SCHEDULE_TABLE)
      const contactMows = rawSchedules
        .filter(r => !safeStr(r.fields[SF.mowId]).startsWith('DELETED'))
        .map(parseMow)
        .filter(m => m.contactIds.includes(id))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setMows(contactMows)

      // Fetch interaction logs filtered to this contact
      const rawLogs = await fetchAll(INTLOG_TABLE)
      const contactLogs = rawLogs
        .map(parseLog)
        .filter(l => l.contactIds.includes(id))
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      setLogs(contactLogs)
    } catch (e) {
      toast.error('Failed to load client')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleNotesBlur() {
    if (!contact || notes === contact.notes) return
    try {
      await atPatch(CONTACTS_TABLE, id, { [CF.notes]: notes })
      toast.success('Notes saved')
    } catch {
      toast.error('Failed to save notes')
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${contact?.name}? This cannot be undone.`)) return
    try {
      await fetch(`${AT_BASE}/${CONTACTS_TABLE}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${HC_PAT}` },
      })
      toast.success('Contact deleted')
      navigate('/happy-cuts', { state: { tab: 'clients' } })
    } catch {
      toast.error('Failed to delete')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-green-600" />
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <p>Contact not found</p>
        <button onClick={() => navigate('/happy-cuts')} className="mt-3 text-green-600 font-medium text-sm">← Back</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 z-20">
        <button
          onClick={() => navigate('/happy-cuts', { state: { tab: 'clients' } })}
          className="text-green-600 font-medium flex items-center gap-1 min-h-[48px] px-2"
        >
          <ChevronLeft size={20} /> Clients
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-800">{contact.name}</h1>
        </div>
        <button onClick={() => setEditOpen(true)} className="text-sm font-medium text-green-600 px-2 min-h-[48px]">Edit</button>
      </div>

      <div className="px-4 py-4 space-y-5 pb-12">
        {/* Status + Contact */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${CONTACT_STATUS[contact.status] || 'bg-gray-100 text-gray-500'}`}>
            {contact.status || 'Unknown'}
          </span>
          {contact.phone && (
            <a href={`sms:${contact.phone}`} className="text-blue-600 font-medium text-sm min-h-[44px] flex items-center gap-1">
              💬 {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="text-blue-600 font-medium text-sm min-h-[44px] flex items-center gap-1">
              ✉️ {contact.email}
            </a>
          )}
          {contact.address && (
            <a href={mapsUrl(contact.address, contact.city)} target="_blank" rel="noreferrer" className="text-green-600 font-medium text-sm flex items-center gap-1 min-h-[44px]">
              <MapPin size={14} />
              {contact.address}{contact.city ? `, ${contact.city}` : ''}
            </a>
          )}
        </div>

        {/* Schedule Mow button */}
        <button
          onClick={() => setScheduleOpen(true)}
          className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold text-base flex items-center justify-center gap-2"
        >
          📅 Schedule Mow
        </button>

        {/* Details grid */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Details</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">Lot Size</p>
              <p className="font-medium text-gray-700">{contact.lotSize || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Rate / Frequency</p>
              <p className="font-medium text-gray-700">{contact.rate ? `$${contact.rate}` : '—'}{contact.frequency ? ` / ${contact.frequency}` : ''}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Intro Mow Done</p>
              <p className="font-medium text-gray-700">{contact.introMow ? '✅ Yes' : '✗ No'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Source</p>
              <p className="font-medium text-gray-700">{contact.source || '—'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-400">Last Contact</p>
              <p className="font-medium text-gray-700">{fmtDateShort(contact.lastContact) || '—'}</p>
            </div>
          </div>
        </div>

        {/* Special Instructions */}
        {contact.specInstr && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-700 mb-1">⚠️ YARD NOTES</p>
            <p className="text-sm text-amber-800">{contact.specInstr}</p>
          </div>
        )}

        {/* Notes */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</h2>
          <textarea
            className="w-full text-sm text-gray-700 border border-gray-100 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:border-green-400"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder="Add notes…"
          />
        </div>

        {/* Mow History */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Mow History ({mows.length})</h2>
          {mows.length === 0 ? (
            <p className="text-sm text-gray-400">No mows yet</p>
          ) : (
            <div className="space-y-2">
              {mows.map(mow => (
                <button
                  key={mow.id}
                  onClick={() => setJobDetail(mow)}
                  className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl border border-gray-100 hover:border-green-200 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{fmtDateShort(mow.date)}</p>
                      <p className="text-xs text-gray-400">{mow.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${MOW_STATUS[mow.status] || 'bg-gray-100 text-gray-500'}`}>
                      {mow.status}
                    </span>
                    <span className="text-sm font-semibold text-gray-700">{fmtCurrency(mow.amount)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Interaction Log */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Interaction Log ({logs.length})</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-400">No interactions logged yet</p>
          ) : (
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="py-2.5 px-3 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400">{fmtTimestamp(log.timestamp)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${log.direction === 'Inbound' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {log.direction}
                    </span>
                    <span className="text-xs text-gray-400">{log.type}</span>
                  </div>
                  <p className="text-sm text-gray-700">{log.summary}</p>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setAddLogOpen(true)}
            className="mt-3 w-full py-3 rounded-xl border border-gray-200 text-green-600 font-medium text-sm"
          >
            + Log Interaction
          </button>
        </div>

        {/* Delete */}
        <div className="flex justify-center pt-2 pb-4">
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 text-red-400 text-sm font-medium min-h-[44px] px-4"
          >
            <Trash2 size={14} /> Delete Contact
          </button>
        </div>
      </div>

      {/* JobDetail overlay */}
      {jobDetail && (
        <JobDetail
          mow={jobDetail}
          contact={contact}
          onBack={() => setJobDetail(null)}
          onRefresh={() => { setJobDetail(null); load() }}
        />
      )}

      {/* Schedule Mow Modal */}
      {scheduleOpen && (
        <ScheduleMowModal
          contact={contact}
          onClose={() => setScheduleOpen(false)}
          onSave={() => { setScheduleOpen(false); load() }}
        />
      )}

      {/* Edit Contact Modal */}
      {editOpen && (
        <EditContactModal
          contact={contact}
          onClose={() => setEditOpen(false)}
          onSave={() => { setEditOpen(false); load() }}
        />
      )}

      {/* Add Log Modal */}
      {addLogOpen && (
        <AddLogModal
          contact={contact}
          onClose={() => setAddLogOpen(false)}
          onSave={() => { setAddLogOpen(false); load() }}
        />
      )}
    </div>
  )
}
