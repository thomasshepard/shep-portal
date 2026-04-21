import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { ArrowLeft, Plus, X, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  fetchAllRecords, createRecord, updateRecord, CHICKENS_BASE_ID, fmtDate, fmtCurrency,
} from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const WEBHOOK_URL = import.meta.env.VITE_N8N_CHICKENS_WEBHOOK_URL

const CORNISH_CROSS_SCHEDULE = [
  { week: 1, oz_per_bird: 0.66 },
  { week: 2, oz_per_bird: 0.97 },
  { week: 3, oz_per_bird: 1.48 },
  { week: 4, oz_per_bird: 2.07 },
  { week: 5, oz_per_bird: 2.79 },
  { week: 6, oz_per_bird: 3.11 },
  { week: 7, oz_per_bird: 2.73 },
  { week: 8, oz_per_bird: 2.30 },
]

const WEEK_OZ_FIELDS = [
  'Week 1 oz/bird', 'Week 2 oz/bird', 'Week 3 oz/bird', 'Week 4 oz/bird',
  'Week 5 oz/bird', 'Week 6 oz/bird', 'Week 7 oz/bird', 'Week 8 oz/bird',
]

const arr = v => Array.isArray(v) ? v : []

function safeStr(val, fallback = '—') {
  if (val == null || val === '') return fallback
  if (typeof val === 'object') return fallback
  return String(val)
}

function safeNum(val) {
  if (val == null || typeof val === 'object') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function fmtAge(hatchDate) {
  if (!hatchDate) return '—'
  const hatch = new Date(hatchDate + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  if (hatch > today) return 'Not hatched yet'
  const totalDays = Math.floor((today - hatch) / 86400000)
  const weeks = Math.floor(totalDays / 7)
  const days = totalDays % 7
  if (weeks === 0) return `${days}d`
  if (days === 0) return `${weeks}w`
  return `${weeks}w ${days}d`
}

const STATUS_COLORS = {
  Growing: 'bg-green-100 text-green-700',
  Processing: 'bg-orange-100 text-orange-700',
  Processed: 'bg-gray-100 text-gray-500',
  Lost: 'bg-red-100 text-red-700',
}

async function fireWebhook(payload) {
  if (!WEBHOOK_URL) { console.warn('VITE_N8N_CHICKENS_WEBHOOK_URL not configured'); return }
  try {
    // Use text/plain to avoid CORS preflight — n8n receives the JSON body regardless
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    console.warn('Webhook call failed:', e.message)
  }
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

// ── MortalityInlineForm ───────────────────────────────────────────────────────

function MortalityInlineForm({ flock, onSaved, onClose }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    count: '1',
    cause: 'Unknown',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    const count = Number(form.count)
    if (count < 1) return toast.error('Count must be at least 1')
    setSaving(true)

    const { error: logErr } = await createRecord('Mortality Log', {
      'Flocks': [{ id: flock.id }],
      'Date': form.date,
      'Count': count,
      'Cause': form.cause,
      'Notes': form.notes || undefined,
    }, CHICKENS_BASE_ID)

    if (logErr) { toast.error('Failed to record: ' + logErr); setSaving(false); return }

    const newCount = Math.max(0, (safeNum(flock.fields['Current Count']) ?? 0) - count)
    await updateRecord('Flock', flock.id, { 'Current Count': newCount }, CHICKENS_BASE_ID)
    toast.success(`Loss recorded — count updated to ${newCount}`)
    setSaving(false)
    onSaved(count, newCount)
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <p className="text-sm font-medium text-gray-700 mb-3">Record Mortality</p>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} className={inp} required />
        </Field>
        <Field label="Count">
          <input type="number" min={1} value={form.count} onChange={e => setF('count', e.target.value)} className={inp} />
        </Field>
        <Field label="Cause">
          <select value={form.cause} onChange={e => setF('cause', e.target.value)} className={inp}>
            {['Unknown', 'Leg Issues', 'Heart Failure', 'Predator', 'Smothering', 'Illness', 'Other'].map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <input value={form.notes} onChange={e => setF('notes', e.target.value)} className={inp} placeholder="Optional" />
        </Field>
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Record Loss'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── ExpenseInlineForm ─────────────────────────────────────────────────────────

function ExpenseInlineForm({ flockId, onSaved, onClose }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: 'Feed',
    description: '',
    amount: '',
    quantity: '',
    vendor: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.description.trim()) return toast.error('Description is required')
    if (!form.amount) return toast.error('Amount is required')
    setSaving(true)

    const fields = {
      'Date': form.date,
      'Category': form.category,
      'Description': form.description.trim(),
      'Amount': Number(form.amount),
      'Flock': [{ id: flockId }],
    }
    if (form.quantity) fields['Quantity'] = Number(form.quantity)
    if (form.vendor) fields['Vendor'] = form.vendor.trim()
    if (form.notes) fields['Notes'] = form.notes.trim()

    const { error } = await createRecord('Chicken Expenses', fields, CHICKENS_BASE_ID)
    if (error) { toast.error('Failed to add expense: ' + error); setSaving(false); return }
    toast.success('Expense added')
    setSaving(false)
    onSaved()
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <p className="text-sm font-medium text-gray-700 mb-3">Add Expense</p>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} className={inp} required />
        </Field>
        <Field label="Category">
          <select value={form.category} onChange={e => setF('category', e.target.value)} className={inp}>
            {['Chicks', 'Feed', 'Equipment', 'Bedding', 'Supplements/Medication', 'Processing', 'Utilities', 'Other'].map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <div className="col-span-2">
          <Field label="Description *">
            <input required value={form.description} onChange={e => setF('description', e.target.value)} className={inp} placeholder="e.g. 50-lb Purina Start & Grow" />
          </Field>
        </div>
        <Field label="Amount ($) *">
          <input type="number" min={0} step="0.01" required value={form.amount} onChange={e => setF('amount', e.target.value)} className={inp} placeholder="0.00" />
        </Field>
        <Field label="Quantity">
          <input type="number" min={0} step="any" value={form.quantity} onChange={e => setF('quantity', e.target.value)} className={inp} placeholder="optional" />
        </Field>
        <Field label="Vendor">
          <input value={form.vendor} onChange={e => setF('vendor', e.target.value)} className={inp} placeholder="Tractor Supply" />
        </Field>
        <Field label="Notes">
          <input value={form.notes} onChange={e => setF('notes', e.target.value)} className={inp} placeholder="optional" />
        </Field>
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Add Expense'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── ProcessingModal ───────────────────────────────────────────────────────────

function ProcessingModal({ flock, onClose, onProcessed }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [birdsProcessed, setBirdsProcessed] = useState('')
  const [processingDate, setProcessingDate] = useState(todayStr)
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    const fields = { 'Status': 'Processed', 'Archived': true }
    if (birdsProcessed) fields['Birds Processed'] = Number(birdsProcessed)
    if (processingDate) fields['Processing Date'] = processingDate
    const { error } = await updateRecord('Flock', flock.id, fields, CHICKENS_BASE_ID)
    if (error) { toast.error('Failed: ' + error); setSaving(false); return }
    toast.success('Flock marked as processed')
    onProcessed()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Mark as Processed</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">This will archive the flock and set status to Processed.</p>
          <Field label="Birds Processed">
            <input type="number" min={0} step="1" value={birdsProcessed} onChange={e => setBirdsProcessed(e.target.value)} className={inp} placeholder="e.g. 25" />
          </Field>
          <Field label="Processing Date">
            <input type="date" value={processingDate} onChange={e => setProcessingDate(e.target.value)} className={inp} />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button onClick={handleConfirm} disabled={saving}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg font-medium hover:bg-green-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Confirm Processing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── FlockDetail ───────────────────────────────────────────────────────────────

export default function FlockDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const [flock, setFlock] = useState(null)
  const [scheduleRows, setScheduleRows] = useState([])
  const [mortalityRows, setMortalityRows] = useState([])
  const [expenseRows, setExpenseRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [showMortalityForm, setShowMortalityForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showProcessingModal, setShowProcessingModal] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [sizeChangeBanner, setSizeChangeBanner] = useState(false)

  useEffect(() => { loadAll() }, [id])

  async function loadAll() {
    setLoading(true)
    const [allFlocks, allSchedules, allMortality, allExpenses] = await Promise.all([
      fetchAllRecords('Flock', {}, CHICKENS_BASE_ID),
      fetchAllRecords('Feeding Schedule', {}, CHICKENS_BASE_ID),
      fetchAllRecords('Mortality Log', { sort: { field: 'Date', direction: 'desc' } }, CHICKENS_BASE_ID),
      fetchAllRecords('Chicken Expenses', { sort: { field: 'Date', direction: 'desc' } }, CHICKENS_BASE_ID),
    ])

    const flockRecord = (allFlocks.data || []).find(f => f.id === id)
    if (!flockRecord) { setNotFound(true); setLoading(false); return }

    setFlock(flockRecord)
    setScheduleRows(
      (allSchedules.data || [])
        .filter(s => arr(s.fields['Flock']).includes(id) && s.fields['Is Current Version'] === true)
        .sort((a, b) => (a.fields['Week'] || 0) - (b.fields['Week'] || 0))
    )
    setMortalityRows((allMortality.data || []).filter(m => arr(m.fields['Flocks']).includes(id)))
    setExpenseRows((allExpenses.data || []).filter(e => arr(e.fields['Flock']).includes(id)))
    setLoading(false)
  }

  async function loadScheduleOnly() {
    const res = await fetchAllRecords('Feeding Schedule', {}, CHICKENS_BASE_ID)
    setScheduleRows(
      (res.data || [])
        .filter(s => arr(s.fields['Flock']).includes(id) && s.fields['Is Current Version'] === true)
        .sort((a, b) => (a.fields['Week'] || 0) - (b.fields['Week'] || 0))
    )
  }

  async function handleRecalculate() {
    setRecalculating(true)
    const f = flock.fields
    const currentVersion = scheduleRows.length > 0 ? (safeNum(scheduleRows[0].fields['Version']) ?? 1) : 1
    const tw = safeNum(f['Target Weeks']) ?? 8
    const breedName = safeStr(f['Breed'], '')

    // 1. Deactivate all current version rows so n8n doesn't create duplicates
    if (scheduleRows.length > 0) {
      await Promise.all(
        scheduleRows.map(s =>
          updateRecord('Feeding Schedule', s.id, { 'fldy2kQTxvHAifAM5': false }, CHICKENS_BASE_ID)
        )
      )
    }

    // 2. Build schedule from breed profile; fall back to Cornish Cross defaults
    let schedule = CORNISH_CROSS_SCHEDULE.slice(0, tw)
    if (breedName) {
      const res = await fetchAllRecords('Breed Profiles', {
        filterByFormula: `{Breed Name} = '${breedName}'`,
      }, CHICKENS_BASE_ID)
      const profile = (res.data || [])[0]
      if (profile) {
        const built = WEEK_OZ_FIELDS
          .slice(0, tw)
          .map((fn, i) => ({ week: i + 1, oz_per_bird: safeNum(profile.fields[fn]) || 0 }))
          .filter(w => w.oz_per_bird > 0)
        if (built.length > 0) schedule = built
      }
    }

    // 3. Fire webhook with full payload
    await fireWebhook({
      action: 'recalculate_schedule',
      flockId: id,
      flockName: safeStr(f['Name']),
      hatchDate: f['Hatch Date'] || '',
      newBirdCount: safeNum(f['Current Count']) ?? 0,
      targetWeeks: tw,
      breed: breedName,
      previousVersion: currentVersion,
      version: currentVersion + 1,
      baseId: CHICKENS_BASE_ID,
      tableId: 'tbl55s9JUg6g38w3g',
      schedule,
    })
    toast.success('Recalculation triggered — reloading schedule in 3s…')
    setTimeout(async () => {
      await loadScheduleOnly()
      setRecalculating(false)
      setSizeChangeBanner(false)
    }, 3000)
  }

  function handleMortalitySaved(deathCount, newCount) {
    setShowMortalityForm(false)
    setFlock(prev => ({ ...prev, fields: { ...prev.fields, 'Current Count': newCount } }))
    const scheduledSize = scheduleRows.length > 0 ? safeNum(scheduleRows[0].fields['Flock Size at Version']) : null
    if (scheduledSize !== null && newCount !== scheduledSize) setSizeChangeBanner(true)
    loadAll()
  }

  if (loading) return <LoadingSpinner />

  if (notFound) return (
    <div className="text-center py-16">
      <p className="text-gray-500">Flock not found.</p>
      <Link to="/chickens" className="text-blue-600 hover:underline text-sm mt-2 block">← Back to Chickens</Link>
    </div>
  )

  const f = flock.fields
  const currentCount = safeNum(f['Current Count']) ?? 0
  const startingCount = safeNum(f['Starting Count']) ?? 0
  const status = safeStr(f['Status'])

  // Current week from schedule
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const currentScheduleRow = scheduleRows.find(s => {
    const start = s.fields['Week Start Date'] ? new Date(s.fields['Week Start Date'] + 'T12:00:00') : null
    const end = s.fields['Week End Date'] ? new Date(s.fields['Week End Date'] + 'T12:00:00') : null
    return start && end && today >= start && today <= end
  })

  // Chart data
  const chartData = scheduleRows.map(s => ({
    week: s.fields['Week'],
    quarts: safeNum(s.fields['Quarts Per Day']),
  }))

  // Version info
  const versionNum = scheduleRows.length > 0 ? safeNum(scheduleRows[0].fields['Version']) : null
  const versionDate = scheduleRows.length > 0 ? fmtDate(scheduleRows[0].fields['Version Date']) : null
  const flockSizeAtVersion = scheduleRows.length > 0 ? safeNum(scheduleRows[0].fields['Flock Size at Version']) : null
  const shouldShowRecalculate = isAdmin && flockSizeAtVersion !== null && currentCount !== flockSizeAtVersion

  // Expense summary
  const totalSpent = expenseRows.reduce((s, e) => s + (safeNum(e.fields['Amount']) ?? 0), 0)
  const totalMortality = mortalityRows.reduce((s, m) => s + (safeNum(m.fields['Count']) ?? 1), 0)

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <button
        onClick={() => navigate('/chickens')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft size={15} /> Back to Chickens
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{safeStr(f['Name'])}</h1>
              {f['Breed'] && (
                <span className="text-sm bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full">{f['Breed']}</span>
              )}
              <span className={`text-sm px-2.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                {status}
              </span>
            </div>
            {f['Notes'] && (
              <p className="text-sm text-gray-500 mt-2">{f['Notes']}</p>
            )}
          </div>
          {isAdmin && status !== 'Processed' && (
            <button
              onClick={() => setShowProcessingModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              <CheckCircle2 size={15} /> Mark as Processed
            </button>
          )}
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 mt-5">
          {[
            { label: 'Hatch Date', value: fmtDate(f['Hatch Date']) },
            { label: 'Processing Date', value: fmtDate(f['Processing Date']) },
            { label: 'Age', value: fmtAge(f['Hatch Date']) },
            { label: 'Birds', value: `${currentCount} / ${startingCount}` },
            { label: 'Feed Type', value: safeStr(f['Feed Type']) },
            { label: 'Supplier', value: safeStr(f['Supplier']) },
            { label: 'Vaccinated', value: f['Vaccinated'] ? 'Yes' : 'No' },
            { label: 'Target Weeks', value: safeStr(f['Target Weeks']) },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-400 font-medium">{label}</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Feeding Schedule */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
          <h2 className="font-semibold text-gray-900">Feeding Schedule</h2>
          <div className="flex items-center gap-3 flex-wrap">
            {versionNum !== null && (
              <span className="text-xs text-gray-400">
                Version {versionNum}
                {versionDate ? ` · Generated ${versionDate}` : ''}
                {flockSizeAtVersion !== null ? ` for ${flockSizeAtVersion} birds` : ''}
              </span>
            )}
            {shouldShowRecalculate && (
              <button
                onClick={handleRecalculate}
                disabled={recalculating}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                <RefreshCw size={13} className={recalculating ? 'animate-spin' : ''} />
                {recalculating ? 'Recalculating…' : 'Recalculate Feed'}
              </button>
            )}
          </div>
        </div>

        {scheduleRows.length === 0 ? (
          <p className="px-5 py-10 text-center text-gray-400 text-sm">
            No feeding schedule yet. n8n generates it automatically after flock creation.
          </p>
        ) : (
          <>
            {/* Bell curve chart */}
            <div className="px-5 pt-5 pb-2">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="week" tickFormatter={w => `W${w}`} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} unit=" qt" />
                  <Tooltip
                    formatter={v => [`${v} qts`, 'Quarts/Day']}
                    labelFormatter={w => `Week ${w}`}
                  />
                  {currentScheduleRow && (
                    <ReferenceLine
                      x={currentScheduleRow.fields['Week']}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      label={{ value: 'Now', fill: '#f59e0b', fontSize: 11, position: 'top' }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="quarts"
                    stroke="#3b82f6"
                    fill="#eff6ff"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#3b82f6' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Week table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Week</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Date Range</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Quarts/Day</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">oz/Bird</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {scheduleRows.map(s => {
                    const isCurrent = currentScheduleRow?.id === s.id
                    const startDate = s.fields['Week Start Date']
                      ? new Date(s.fields['Week Start Date'] + 'T12:00:00')
                      : null
                    const isPast = startDate && startDate < today && !isCurrent
                    return (
                      <tr key={s.id} className={isCurrent ? 'bg-amber-50' : isPast ? 'opacity-50' : ''}>
                        <td className={`px-5 py-3 font-medium ${isCurrent ? 'text-amber-700' : 'text-gray-700'}`}>
                          {isCurrent ? `► W${s.fields['Week']}` : `W${s.fields['Week']}`}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {s.fields['Week Start Date'] && s.fields['Week End Date']
                            ? `${fmtDate(s.fields['Week Start Date'])} – ${fmtDate(s.fields['Week End Date'])}`
                            : '—'}
                        </td>
                        <td className={`px-4 py-3 font-semibold ${isCurrent ? 'text-amber-700' : 'text-gray-700'}`}>
                          {safeNum(s.fields['Quarts Per Day']) ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {safeNum(s.fields['Daily Feed Per Bird (oz)']) ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{safeStr(s.fields['Notes'], '')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Size change banner */}
      {sizeChangeBanner && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-500 flex-shrink-0" />
            <p className="text-sm text-yellow-800">Flock size has changed — recalculate feeding schedule?</p>
          </div>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-1.5 text-sm text-yellow-700 hover:text-yellow-900 border border-yellow-300 rounded-lg px-3 py-1.5 whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw size={13} className={recalculating ? 'animate-spin' : ''} />
            Recalculate
          </button>
        </div>
      )}

      {/* Mortality Log */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Mortality Log</h2>
            {totalMortality > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {totalMortality} total · {startingCount > 0
                  ? ((totalMortality / startingCount) * 100).toFixed(1)
                  : 0}% mortality rate
              </p>
            )}
          </div>
          {isAdmin && !showMortalityForm && (
            <button
              onClick={() => setShowMortalityForm(true)}
              className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 border border-red-200 rounded-lg px-3 py-1.5"
            >
              <Plus size={13} /> Record Loss
            </button>
          )}
        </div>

        {showMortalityForm && (
          <div className="px-5 py-4 border-b border-gray-100">
            <MortalityInlineForm
              flock={flock}
              onSaved={handleMortalitySaved}
              onClose={() => setShowMortalityForm(false)}
            />
          </div>
        )}

        {mortalityRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-gray-400 text-sm">No mortality events recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Count</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Cause</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {mortalityRows.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-600">{fmtDate(m.fields['Date'])}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{safeNum(m.fields['Count']) ?? 1}</td>
                    <td className="px-4 py-3 text-gray-600">{safeStr(m.fields['Cause'])}</td>
                    <td className="px-4 py-3 text-gray-500">{safeStr(m.fields['Notes'], '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expenses */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Expenses</h2>
            {totalSpent > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {fmtCurrency(totalSpent)} total
                {startingCount > 0 ? ` · ${fmtCurrency(totalSpent / startingCount)}/bird` : ''}
                {currentCount > 0 ? ` · ${fmtCurrency(totalSpent / currentCount)}/surviving bird` : ''}
              </p>
            )}
          </div>
          {isAdmin && !showExpenseForm && (
            <button
              onClick={() => setShowExpenseForm(true)}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-3 py-1.5"
            >
              <Plus size={13} /> Add Expense
            </button>
          )}
        </div>

        {showExpenseForm && (
          <div className="px-5 py-4 border-b border-gray-100">
            <ExpenseInlineForm
              flockId={id}
              onSaved={() => { setShowExpenseForm(false); loadAll() }}
              onClose={() => setShowExpenseForm(false)}
            />
          </div>
        )}

        {expenseRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-gray-400 text-sm">No expenses recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Category</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Description</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Amount</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Vendor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenseRows.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-500">{fmtDate(e.fields['Date'])}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {safeStr(e.fields['Category'])}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{safeStr(e.fields['Description'])}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      {fmtCurrency(e.fields['Amount'])}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{safeStr(e.fields['Vendor'], '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Processing Modal */}
      {showProcessingModal && (
        <ProcessingModal
          flock={flock}
          onClose={() => setShowProcessingModal(false)}
          onProcessed={() => navigate('/chickens')}
        />
      )}
    </div>
  )
}
