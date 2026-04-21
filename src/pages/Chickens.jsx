import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Egg, Plus, X, ThermometerSun } from 'lucide-react'
import {
  fetchAllRecords, createRecord, updateRecord, CHICKENS_BASE_ID,
} from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import ChickenIncubator from './ChickenIncubator'
import toast from 'react-hot-toast'

const WEBHOOK_URL = import.meta.env.VITE_N8N_CHICKENS_WEBHOOK_URL

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

const STATUS_COLORS = {
  Growing: 'bg-green-100 text-green-700',
  Processing: 'bg-orange-100 text-orange-700',
  Processed: 'bg-gray-100 text-gray-500',
  Lost: 'bg-red-100 text-red-700',
}

function fmtAge(hatchDate) {
  if (!hatchDate) return '—'
  const hatch = new Date(hatchDate + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  if (hatch > today) {
    return `Arriving ${hatch.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  }
  const totalDays = Math.floor((today - hatch) / 86400000)
  const weeks = Math.floor(totalDays / 7)
  const days = totalDays % 7
  if (weeks === 0) return `${days}d old`
  if (days === 0) return `${weeks} week${weeks !== 1 ? 's' : ''} old`
  return `${weeks} weeks, ${days} days old`
}

function daysToProcessing(processingDate) {
  if (!processingDate) return null
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const proc = new Date(processingDate + 'T12:00:00')
  return Math.ceil((proc - today) / 86400000)
}

function getFeedForDate(flockId, schedules, targetDate) {
  const d = new Date(targetDate)
  d.setHours(12, 0, 0, 0)
  return schedules.find(s => {
    if (!arr(s.fields['Flock']).includes(flockId)) return false
    if (s.fields['Is Current Version'] !== true) return false
    const start = s.fields['Week Start Date'] ? new Date(s.fields['Week Start Date'] + 'T12:00:00') : null
    const end = s.fields['Week End Date'] ? new Date(s.fields['Week End Date'] + 'T12:00:00') : null
    if (!start || !end) return false
    return d >= start && d <= end
  }) || null
}

async function fireWebhook(payload) {
  if (!WEBHOOK_URL) {
    toast.error('Webhook URL not configured — set VITE_N8N_CHICKENS_WEBHOOK_URL in GitHub secrets and redeploy')
    return
  }
  try {
    // Use text/plain to avoid CORS preflight — n8n receives the JSON body regardless
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) toast.error(`Webhook responded with ${res.status}`)
  } catch (e) {
    toast.error('Webhook failed: ' + e.message)
  }
}

// ── FlockCard ─────────────────────────────────────────────────────────────────

function FlockCard({ flock, schedules, archived, onClick }) {
  const f = flock.fields
  const currentCount = safeNum(f['Current Count']) ?? 0
  const startingCount = safeNum(f['Starting Count']) ?? 0
  const lost = Math.max(0, startingCount - currentCount)
  const status = safeStr(f['Status'])

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  const todayFeed = archived ? null : getFeedForDate(flock.id, schedules, today)
  const tomorrowFeed = archived ? null : getFeedForDate(flock.id, schedules, tomorrow)

  const days = f['Processing Date'] ? daysToProcessing(f['Processing Date']) : null
  let countdownColor = 'text-gray-600'
  let countdownLabel = ''
  if (days !== null) {
    if (days < 0) {
      countdownColor = 'text-red-600 font-semibold'; countdownLabel = 'Overdue'
    } else if (days < 7) {
      countdownColor = 'text-red-600 font-semibold'; countdownLabel = `${days} days to processing`
    } else if (days <= 14) {
      countdownColor = 'text-yellow-600 font-semibold'; countdownLabel = `${days} days to processing`
    } else {
      countdownColor = 'text-green-600'; countdownLabel = `${days} days to processing`
    }
  }

  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 overflow-hidden text-left w-full transition-shadow hover:shadow-md cursor-pointer ${
        archived ? 'opacity-60' : ''
      }`}
    >
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900 truncate">{safeStr(f['Name'])}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {f['Breed'] && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{f['Breed']}</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                {status}
              </span>
              <span className="text-xs text-gray-400">{fmtAge(f['Hatch Date'])}</span>
            </div>
          </div>
          {!archived && (
            <div className="text-right flex-shrink-0">
              {todayFeed ? (
                <>
                  <div className="flex items-baseline gap-1 justify-end">
                    <span className="text-3xl font-black text-gray-900">
                      {safeNum(todayFeed.fields['Quarts Per Day']) ?? '—'}
                    </span>
                    <span className="text-sm text-gray-500">qts today</span>
                  </div>
                  {tomorrowFeed && tomorrowFeed.id !== todayFeed.id && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {safeNum(tomorrowFeed.fields['Quarts Per Day'])} qts tomorrow
                    </p>
                  )}
                </>
              ) : (
                <span className="text-sm text-gray-400">No schedule</span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
        <div>
          <span className="font-medium text-gray-700">{currentCount} / {startingCount} birds</span>
          {lost > 0 && <span className="text-xs text-red-400 ml-1.5">· {lost} lost</span>}
        </div>
        {!archived && countdownLabel && (
          <span className={`text-xs ${countdownColor}`}>{countdownLabel}</span>
        )}
        {archived && <span className="text-xs text-gray-400">Archived</span>}
      </div>
    </button>
  )
}

// ── Add Flock Modal ───────────────────────────────────────────────────────────

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

const emptyFlockForm = {
  name: '',
  breed: '',
  hatchDate: new Date().toISOString().split('T')[0],
  startingCount: '',
  supplier: '',
  purchasePrice: '',
  vaccinated: false,
  vaccinationNotes: '',
  feedType: '',
  targetWeeks: '',
  overrideDate: false,
  processingDate: '',
  notes: '',
}

function calcProcDate(hatchDate, targetWeeks) {
  if (!hatchDate || !targetWeeks) return ''
  const d = new Date(hatchDate + 'T12:00:00')
  d.setDate(d.getDate() + Number(targetWeeks) * 7)
  return d.toISOString().split('T')[0]
}

function AddFlockModal({ breedProfiles, onClose, onSaved }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyFlockForm)
  const [saving, setSaving] = useState(false)

  function setF(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function onBreedChange(breedName) {
    const profile = breedProfiles.find(p => p.fields['Breed Name'] === breedName)
    setForm(f => {
      const tw = profile ? (safeNum(profile.fields['Target Weeks']) ?? f.targetWeeks) : f.targetWeeks
      const ft = profile ? (safeStr(profile.fields['Default Feed Type'], '') || f.feedType) : f.feedType
      return {
        ...f,
        breed: breedName,
        feedType: ft,
        targetWeeks: String(tw),
        processingDate: f.overrideDate ? f.processingDate : calcProcDate(f.hatchDate, tw),
      }
    })
  }

  function onHatchChange(val) {
    setForm(f => ({
      ...f,
      hatchDate: val,
      processingDate: f.overrideDate ? f.processingDate : calcProcDate(val, f.targetWeeks),
    }))
  }

  function onWeeksChange(val) {
    setForm(f => ({
      ...f,
      targetWeeks: val,
      processingDate: f.overrideDate ? f.processingDate : calcProcDate(f.hatchDate, val),
    }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Name is required')
    if (!form.startingCount) return toast.error('Starting count is required')
    setSaving(true)

    const fields = {
      'Name': form.name.trim(),
      'Hatch Date': form.hatchDate,
      'Starting Count': Number(form.startingCount),
      'Current Count': Number(form.startingCount),
      'Status': 'Growing',
      'Webhook Triggered': false,
    }
    if (form.breed) fields['Breed'] = form.breed
    if (form.supplier) fields['Supplier'] = form.supplier.trim()
    if (form.purchasePrice) fields['Purchase Price'] = Number(form.purchasePrice)
    if (form.vaccinated) fields['Vaccinated'] = true
    if (form.vaccinationNotes) fields['Vaccination Notes'] = form.vaccinationNotes.trim()
    if (form.feedType) fields['Feed Type'] = form.feedType.trim()
    if (form.targetWeeks) fields['Target Weeks'] = Number(form.targetWeeks)
    if (form.processingDate) fields['Processing Date'] = form.processingDate
    if (form.notes) fields['Notes'] = form.notes.trim()

    const { data, error } = await createRecord('Flock', fields, CHICKENS_BASE_ID)
    if (error) { toast.error('Failed to create flock: ' + error); setSaving(false); return }

    const newId = data.id
    const profile = breedProfiles.find(p => p.fields['Breed Name'] === form.breed)
    const tw = Number(form.targetWeeks) || 8
    const weekFields = [
      'Week 1 oz/bird', 'Week 2 oz/bird', 'Week 3 oz/bird', 'Week 4 oz/bird',
      'Week 5 oz/bird', 'Week 6 oz/bird', 'Week 7 oz/bird', 'Week 8 oz/bird',
    ]
    const schedule = profile
      ? weekFields.slice(0, tw)
          .map((fn, i) => ({ week: i + 1, oz_per_bird: safeNum(profile.fields[fn]) || 0 }))
          .filter(w => w.oz_per_bird > 0)
      : []

    await fireWebhook({
      action: 'generate_schedule',
      flockId: newId,
      flockName: fields['Name'],
      hatchDate: form.hatchDate,
      birdCount: Number(form.startingCount),
      targetWeeks: tw,
      breed: form.breed || '',
      version: 1,
      baseId: CHICKENS_BASE_ID,
      tableId: 'tbl55s9JUg6g38w3g',
      schedule,
    })

    await updateRecord('Flock', newId, { 'Webhook Triggered': true }, CHICKENS_BASE_ID)
    toast.success('Flock created — feeding schedule is being generated')
    setSaving(false)
    onSaved()
    navigate(`/chickens/${newId}`)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">Add Flock</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Field label="Name *">
            <input required value={form.name} onChange={e => setF('name', e.target.value)} className={inp} placeholder="e.g. Spring 2026 Batch" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Breed">
              <select value={form.breed} onChange={e => onBreedChange(e.target.value)} className={inp}>
                <option value="">Select breed…</option>
                {breedProfiles.map(p => (
                  <option key={p.id} value={p.fields['Breed Name']}>{p.fields['Breed Name']}</option>
                ))}
              </select>
            </Field>
            <Field label="Hatch Date *">
              <input type="date" required value={form.hatchDate} onChange={e => onHatchChange(e.target.value)} className={inp} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starting Count *">
              <input type="number" min={1} required value={form.startingCount} onChange={e => setF('startingCount', e.target.value)} className={inp} placeholder="e.g. 50" />
            </Field>
            <Field label="Target Weeks">
              <input type="number" min={1} max={16} value={form.targetWeeks} onChange={e => onWeeksChange(e.target.value)} className={inp} placeholder="e.g. 8" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier">
              <input value={form.supplier} onChange={e => setF('supplier', e.target.value)} className={inp} placeholder="Murray McMurray" />
            </Field>
            <Field label="Purchase Price ($)">
              <input type="number" min={0} step="0.01" value={form.purchasePrice} onChange={e => setF('purchasePrice', e.target.value)} className={inp} placeholder="0.00" />
            </Field>
          </div>
          <Field label="Feed Type">
            <input value={form.feedType} onChange={e => setF('feedType', e.target.value)} className={inp} placeholder="e.g. Broiler Starter" />
          </Field>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Processing Date
              {!form.overrideDate && form.processingDate && (
                <span className="text-xs text-gray-400 font-normal ml-1">(auto-calculated)</span>
              )}
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                readOnly={!form.overrideDate}
                value={form.processingDate}
                onChange={e => setF('processingDate', e.target.value)}
                className={inp + (form.overrideDate ? '' : ' bg-gray-50 text-gray-500 cursor-default')}
              />
              <button
                type="button"
                onClick={() => setF('overrideDate', !form.overrideDate)}
                className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
              >
                {form.overrideDate ? 'Auto' : 'Override'}
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.vaccinated} onChange={e => setF('vaccinated', e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700">Vaccinated</span>
          </label>
          {form.vaccinated && (
            <Field label="Vaccination Notes">
              <input value={form.vaccinationNotes} onChange={e => setF('vaccinationNotes', e.target.value)} className={inp} placeholder="e.g. Marek's Day 1" />
            </Field>
          )}
          <Field label="Notes">
            <textarea rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} className={inp + ' resize-none'} placeholder="Internal notes…" />
          </Field>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg font-medium hover:bg-amber-600 disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create Flock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Flocks Tab Content ───────────────────────────────────────────────────────

function FlocksTab() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [flocks, setFlocks] = useState([])
  const [schedules, setSchedules] = useState([])
  const [breedProfiles, setBreedProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [f, s, b] = await Promise.all([
      fetchAllRecords('Flock', { sort: { field: 'Hatch Date', direction: 'desc' } }, CHICKENS_BASE_ID),
      fetchAllRecords('Feeding Schedule', {}, CHICKENS_BASE_ID),
      fetchAllRecords('Breed Profiles', { sort: { field: 'Breed Name', direction: 'asc' } }, CHICKENS_BASE_ID),
    ])
    setFlocks(f.data || [])
    setSchedules(s.data || [])
    setBreedProfiles(b.data || [])
    setLoading(false)
  }

  const activeFlocks = flocks.filter(f => !f.fields['Archived'])
  const archivedFlocks = flocks.filter(f => f.fields['Archived'])

  if (loading) return <LoadingSpinner />

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">
          {activeFlocks.length} active flock{activeFlocks.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          {archivedFlocks.length > 0 && (
            <button
              onClick={() => setShowArchived(v => !v)}
              className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2"
            >
              {showArchived ? 'Hide Archived' : `Show Archived (${archivedFlocks.length})`}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={16} /> Add Flock
            </button>
          )}
        </div>
      </div>

      {activeFlocks.length === 0 && !showArchived ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <Egg size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No active flocks</p>
          {isAdmin && (
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-4 text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              Add your first flock →
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {activeFlocks.map(flock => (
            <FlockCard
              key={flock.id}
              flock={flock}
              schedules={schedules}
              archived={false}
              onClick={() => navigate(`/chickens/${flock.id}`)}
            />
          ))}
          {showArchived && archivedFlocks.map(flock => (
            <FlockCard key={flock.id} flock={flock} schedules={[]} archived={true} onClick={() => navigate(`/chickens/${flock.id}`)} />
          ))}
        </div>
      )}

      {showAddForm && (
        <AddFlockModal
          breedProfiles={breedProfiles}
          onClose={() => setShowAddForm(false)}
          onSaved={() => setShowAddForm(false)}
        />
      )}
    </>
  )
}

// ── Main Page with Tabs ──────────────────────────────────────────────────────

const TABS = [
  { id: 'flocks', label: 'Flocks', icon: Egg },
  { id: 'incubator', label: 'Incubator', icon: ThermometerSun },
]

export default function Chickens() {
  const [tab, setTab] = useState('flocks')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Egg className="text-amber-500" size={22} />
        <h1 className="text-2xl font-bold text-gray-900">Chickens</h1>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-amber-500 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'flocks' && <FlocksTab />}
      {tab === 'incubator' && <ChickenIncubator />}
    </div>
  )
}
