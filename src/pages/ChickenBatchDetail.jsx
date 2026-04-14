import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, X, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { CHICKENS_BASE_ID } from '../lib/airtable'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────

const PAT = import.meta.env.VITE_AIRTABLE_PAT
const BATCHES_TABLE = 'tblKomWeHkj9aGFDC'
const ROOSTERS_TABLE = 'tblhZ5Mzr2aNh02Fm'
const BASE_URL = `https://api.airtable.com/v0/${CHICKENS_BASE_ID}`

const EGG_COLORS = [
  { key: 'brownEggs',     field: 'Brown Eggs',      label: 'Brown',      emoji: '🟤', formKey: 'brown'     },
  { key: 'darkBrownEggs', field: 'Dark Brown Eggs',  label: 'Dark Brown', emoji: '🟫', formKey: 'darkBrown' },
  { key: 'blueEggs',      field: 'Blue Eggs',        label: 'Blue',       emoji: '🔵', formKey: 'blue'      },
  { key: 'greenEggs',     field: 'Green Eggs',       label: 'Green',      emoji: '🟢', formKey: 'green'     },
  { key: 'whiteEggs',     field: 'White Eggs',       label: 'White',      emoji: '⬜', formKey: 'white'     },
  { key: 'tanPinkEggs',   field: 'Tan/Pink Eggs',    label: 'Tan/Pink',   emoji: '🩷', formKey: 'tan'       },
]

const hdrs = () => ({
  Authorization: `Bearer ${PAT}`,
  'Content-Type': 'application/json',
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const safeStr = (v, fb = '') => (v == null || v === '' ? fb : typeof v === 'object' ? fb : String(v))
const safeNum = (v) => (v == null || v === '' || typeof v === 'object' ? 0 : Number(v) || 0)

function fmtDate(str) {
  if (!str) return ''
  const d = new Date(str + 'T12:00:00')
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function shortDate(str) {
  if (!str) return ''
  const d = new Date(str + 'T12:00:00')
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatBatchName(name) {
  if (!name) return 'Untitled'
  return name.replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, m, d) => {
    const date = new Date(`${y}-${m}-${d}T12:00:00`)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  })
}

function expectedHatchDate(setDate) {
  if (!setDate) return ''
  const d = new Date(setDate + 'T12:00:00')
  d.setDate(d.getDate() + 21)
  return d.toISOString().split('T')[0]
}

function addDays(setDate, n) {
  if (!setDate) return ''
  const d = new Date(setDate + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function totalEggs(f) {
  return EGG_COLORS.reduce((sum, { field }) => sum + safeNum(f[field]), 0)
}

function getBatchDay(setDate) {
  if (!setDate) return 0
  const set = new Date(setDate + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return Math.max(1, Math.floor((today - set) / 86400000) + 1)
}

function getPhaseName(day) {
  if (day <= 6) return 'Early Development'
  if (day <= 13) return 'Growing'
  if (day <= 17) return 'Pre-Lockdown'
  if (day === 18) return 'LOCKDOWN TODAY'
  if (day <= 21) return 'Watch for Pip'
  return 'Complete'
}

function hatchBenchmark(pct) {
  if (pct >= 85) return { color: 'text-green-600', label: 'Excellent' }
  if (pct >= 70) return { color: 'text-blue-600', label: 'Good' }
  if (pct >= 50) return { color: 'text-yellow-600', label: 'Investigate' }
  return { color: 'text-red-600', label: 'Problem' }
}

function getTargetsForDay(day) {
  if (day <= 7)  return { temp: '100.0–100.5°F', humidity: '50–60%', turn: true }
  if (day <= 14) return { temp: '100.0–100.5°F', humidity: '45–55%', turn: true }
  if (day <= 17) return { temp: '100.0°F',        humidity: '45–55%', turn: true }
  return           { temp: '99.5–100°F',          humidity: '65–75%', turn: false }
}

// ── Log Helpers ───────────────────────────────────────────────────────────────

function parseLog(batch) {
  try { return JSON.parse(safeStr(batch.fields['Incubation Log'])) || [] } catch { return [] }
}

function fmtLogDate(isoString) {
  const d = new Date(isoString)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function entrySubtitle(entry) {
  const parts = []
  if (entry.temp != null) parts.push(`${entry.temp}°F`)
  if (entry.humidity != null) parts.push(`${entry.humidity}% RH`)
  return parts.join('  ·  ')
}

function logEntryDay(setDateStr, entryTimestamp) {
  const set = new Date(setDateStr + 'T12:00:00')
  const entry = new Date(entryTimestamp)
  return Math.floor((entry - set) / 86400000) + 1
}

const ENTRY_TYPES = [
  { id: 'temp', icon: '🌡️', label: 'Temp' },
  { id: 'humidity', icon: '💧', label: 'Humidity' },
  { id: 'adjustment', icon: '🔧', label: 'Adjustment' },
  { id: 'incident', icon: '⚠️', label: 'Incident' },
  { id: 'observation', icon: '👁️', label: 'Observation' },
]

function entryIcon(type) {
  return ENTRY_TYPES.find(t => t.id === type)?.icon || '📋'
}

function showTemp(type) { return type === 'temp' || type === 'adjustment' }
function showHumidity(type) { return type === 'humidity' || type === 'adjustment' }

// ── Add Entry Sheet ───────────────────────────────────────────────────────────

function AddEntrySheet({ batchDay, onClose, onSave }) {
  const [entryType, setEntryType] = useState('temp')
  const [tempInput, setTempInput] = useState('')
  const [humidityInput, setHumidityInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if ((entryType === 'incident') && !noteInput.trim()) {
      return toast.error('Note is required for incidents')
    }
    setSaving(true)
    const newEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      day: batchDay,
      type: entryType,
      temp: showTemp(entryType) && tempInput !== '' ? Number(tempInput) || null : null,
      humidity: showHumidity(entryType) && humidityInput !== '' ? Number(humidityInput) || null : null,
      note: noteInput.trim(),
    }
    await onSave(newEntry)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-md shadow-xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">Add Log Entry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Type selector */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Entry Type</label>
            <div className="flex flex-wrap gap-2">
              {ENTRY_TYPES.map(t => (
                <button key={t.id} type="button" onClick={() => setEntryType(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    entryType === t.id
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-amber-300'
                  }`}>
                  <span>{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Temp */}
          {showTemp(entryType) && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Temperature (°F)</label>
              <input type="number" step="0.1" value={tempInput} onChange={e => setTempInput(e.target.value)}
                className={inp} placeholder="99.5" />
            </div>
          )}

          {/* Humidity */}
          {showHumidity(entryType) && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Humidity (% RH)</label>
              <input type="number" step="1" value={humidityInput} onChange={e => setHumidityInput(e.target.value)}
                className={inp} placeholder="50" />
            </div>
          )}

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Note {entryType === 'incident' ? '(required)' : '(optional)'}
            </label>
            <textarea rows={3} value={noteInput} onChange={e => setNoteInput(e.target.value)}
              className={inp + ' resize-none'} placeholder="What happened or what you observed..." />
          </div>

          {/* Day indicator */}
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
            This will be logged as <strong>Day {batchDay}</strong> of your batch.
          </p>

          <button type="button" onClick={handleSave} disabled={saving}
            className="w-full bg-amber-500 text-white py-3 rounded-lg font-medium hover:bg-amber-600 disabled:opacity-60 transition-colors">
            {saving ? 'Saving...' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  )
}

function parsePhotoUrls(batch) {
  const jsonField = safeStr(batch.fields['Photo URLs'])
  if (jsonField) {
    try { return JSON.parse(jsonField) } catch {}
  }
  const single = safeStr(batch.fields['Batch Photo URL'])
  if (single) return [single]
  return []
}

async function uploadPhoto(file) {
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `incubator/${Date.now()}_${safeName}`
    const { data, error } = await supabase.storage.from('chicken-photos').upload(path, file, {
      upsert: false,
      contentType: file.type,
    })
    if (error) throw error
    const { data: urlData } = supabase.storage.from('chicken-photos').getPublicUrl(data.path)
    return urlData.publicUrl
  } catch (e) {
    console.error('Photo upload failed:', e)
    toast.error('Photo upload failed: ' + (e?.message || JSON.stringify(e)))
    return null
  }
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

function statusBadgeClass(s) {
  if (s === 'Active') return 'bg-green-100 text-green-700'
  if (s === 'Hatched') return 'bg-blue-100 text-blue-700'
  return 'bg-red-100 text-red-700'
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ day }) {
  const capped = Math.min(Math.max(day, 0), 21)
  const pct = (capped / 21) * 100
  function segColor(d) {
    if (d <= 6) return 'bg-yellow-400'
    if (d <= 13) return 'bg-orange-400'
    if (d <= 17) return 'bg-amber-500'
    if (d <= 20) return 'bg-red-500'
    return 'bg-green-500'
  }
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${segColor(capped)}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Inline Candle Form ────────────────────────────────────────────────────────

function InlineCandleForm({ total, setDate, candleDay, devVal, setDev, notesVal, setNotes, saving, onSave, onCancel }) {
  const devNum = Number(devVal) || 0
  const removed = devVal !== '' ? Math.max(0, total - devNum) : null

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      <p className="text-sm text-gray-600">
        You set <strong>{total}</strong> eggs on <strong>{fmtDate(setDate)}</strong>.
      </p>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">How many are still developing?</label>
        <input
          type="number" min={0} max={total} value={devVal}
          onChange={e => setDev(e.target.value)}
          className={inp + ' text-center text-lg font-semibold'}
          autoFocus
        />
        {removed !== null && (
          <p className="text-xs text-gray-500 mt-1">{removed} will be logged as removed.</p>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
        <textarea rows={2} value={notesVal} onChange={e => setNotes(e.target.value)} className={inp + ' resize-none'} />
      </div>
      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5">
        💡 Remove quitters and clears now — they'll rot and contaminate the incubator.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel}
          className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-white">
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={saving}
          className="flex-1 bg-amber-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-60">
          {saving ? 'Saving...' : `Save Day ${candleDay} Results`}
        </button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ChickenBatchDetail({ batch, roosters = [], onRoosterAdded, onClose, onSaved, onDeleted }) {
  const { isAdmin, permissions, session } = useAuth()
  const canEdit = isAdmin || permissions?.chickens
  const f = batch.fields

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Tab state
  const [activeTab, setActiveTab] = useState('details') // 'details' | 'log'
  const [logEntries, setLogEntries] = useState(() => parseLog(batch))
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deletingLogId, setDeletingLogId] = useState(null)

  // Inline candle form state (view mode)
  const [inlineCandle, setInlineCandle] = useState(null) // 7 | 14 | null
  const [inlineDev7, setInlineDev7] = useState('')
  const [inlineNotes7, setInlineNotes7] = useState('')
  const [inlineDev14, setInlineDev14] = useState('')
  const [inlineNotes14, setInlineNotes14] = useState('')
  const [savingCandle, setSavingCandle] = useState(false)

  // Photo state (edit mode)
  const [photoUrls, setPhotoUrls] = useState(() => parsePhotoUrls(batch))
  const [newPhotos, setNewPhotos] = useState([])
  const [newPreviews, setNewPreviews] = useState([])
  const fileInputRef = useRef(null)

  // Rooster selector state
  const matchByName = roosters.find(r => safeStr(r.fields['Name']) === safeStr(f['Rooster']))
  const [selectedRoosterId, setSelectedRoosterId] = useState(
    safeStr(f['Rooster ID']) || matchByName?.id || ''
  )
  const [showAddRooster, setShowAddRooster] = useState(false)
  const [newRoosterName, setNewRoosterName] = useState('')
  const [newRoosterBreed, setNewRoosterBreed] = useState('')
  const [newRoosterDesc, setNewRoosterDesc] = useState('')
  const [newRoosterNotes, setNewRoosterNotes] = useState('')

  // Readings (daily log via Supabase incubator_logs)
  const [readings, setReadings] = useState([])
  const [readingsLoading, setReadingsLoading] = useState(true)
  const [showAllReadings, setShowAllReadings] = useState(false)
  const [showReadingForm, setShowReadingForm] = useState(false)
  const [readingForm, setReadingForm] = useState({
    log_date: new Date().toISOString().split('T')[0],
    temp_f: '',
    humidity_pct: '',
    eggs_turned: getBatchDay(safeStr(batch.fields['Set Date'])) < 18,
    notes: '',
  })
  const [readingSaving, setReadingSaving] = useState(false)

  // Edit form state
  const [editForm, setEditForm] = useState({
    setDate: safeStr(f['Set Date']),
    status: safeStr(f['Status'], 'Active'),
    brown: String(safeNum(f['Brown Eggs']) || ''),
    darkBrown: String(safeNum(f['Dark Brown Eggs']) || ''),
    blue: String(safeNum(f['Blue Eggs']) || ''),
    green: String(safeNum(f['Green Eggs']) || ''),
    white: String(safeNum(f['White Eggs']) || ''),
    tan: String(safeNum(f['Tan/Pink Eggs']) || ''),
    d7dev: String(safeNum(f['Day 7 Developing']) || ''),
    d7rem: String(safeNum(f['Day 7 Removed']) || ''),
    d7notes: safeStr(f['Day 7 Notes']),
    d14dev: String(safeNum(f['Day 14 Developing']) || ''),
    d14rem: String(safeNum(f['Day 14 Removed']) || ''),
    d14notes: safeStr(f['Day 14 Notes']),
    chicksHatched: String(safeNum(f['Chicks Hatched']) || ''),
    hatchNotes: safeStr(f['Hatch Notes']),
    batchNotes: safeStr(f['Batch Notes']),
  })

  function setEF(key, val) { setEditForm(prev => ({ ...prev, [key]: val })) }

  // ── Readings (Supabase incubator_logs) ──────────────────────────────────────

  async function fetchReadings() {
    setReadingsLoading(true)
    const { data } = await supabase
      .from('incubator_logs')
      .select('*')
      .eq('batch_id', batch.id)
      .order('log_date', { ascending: false })
      .limit(30)
    setReadings(data || [])
    setReadingsLoading(false)
  }

  useEffect(() => { fetchReadings() }, [batch.id])

  async function saveReading() {
    setReadingSaving(true)
    const { error } = await supabase.from('incubator_logs').upsert({
      batch_id: batch.id,
      log_date: readingForm.log_date,
      day_number: readingForm.log_date === new Date().toISOString().split('T')[0]
        ? day
        : null,
      temp_f: readingForm.temp_f !== '' ? Number(readingForm.temp_f) : null,
      humidity_pct: readingForm.humidity_pct !== '' ? Number(readingForm.humidity_pct) : null,
      eggs_turned: readingForm.eggs_turned,
      notes: readingForm.notes.trim() || null,
      created_by: session?.user?.id ?? null,
    }, { onConflict: 'batch_id,log_date' })
    if (error) { toast.error('Save failed: ' + error.message); setReadingSaving(false); return }
    toast.success('Reading saved ✓')
    setReadingSaving(false)
    setShowReadingForm(false)
    setReadingForm({
      log_date: new Date().toISOString().split('T')[0],
      temp_f: '',
      humidity_pct: '',
      eggs_turned: day < 18,
      notes: '',
    })
    fetchReadings()
  }

  // View mode computed values
  const setDate = safeStr(f['Set Date'])
  const status = safeStr(f['Status'], 'Active')
  const isActive = status === 'Active'
  const total = totalEggs(f)
  const hatchDate = expectedHatchDate(setDate)
  const day = getBatchDay(setDate)
  const phaseName = getPhaseName(day)

  const d7dev = safeNum(f['Day 7 Developing'])
  const d7rem = safeNum(f['Day 7 Removed'])
  const d7done = d7dev > 0 || d7rem > 0
  const d7TargetDate = addDays(setDate, 7)

  const d14dev = safeNum(f['Day 14 Developing'])
  const d14rem = safeNum(f['Day 14 Removed'])
  const d14done = d14dev > 0 || d14rem > 0
  const d14TargetDate = addDays(setDate, 14)

  const hatched = safeNum(f['Chicks Hatched'])
  const hatchPct = total > 0 && hatched > 0 ? Math.round((hatched / total) * 100) : 0
  const hatchBm = hatched > 0 ? hatchBenchmark(hatchPct) : null

  // Edit mode computed values
  const editTotal = EGG_COLORS.reduce((sum, { formKey }) => sum + (Number(editForm[formKey]) || 0), 0)
  const editHatchNum = Number(editForm.chicksHatched) || 0
  const editPct = editTotal > 0 && editForm.chicksHatched !== '' ? Math.round((editHatchNum / editTotal) * 100) : 0
  const editBm = editForm.chicksHatched !== '' ? hatchBenchmark(editPct) : null

  // ── Photo handlers ──────────────────────────────────────────────────────────

  function handleFileChange(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setNewPhotos(prev => [...prev, ...files])
    setNewPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removeExistingPhoto(idx) {
    setPhotoUrls(prev => prev.filter((_, i) => i !== idx))
  }

  function removeNewPhoto(idx) {
    setNewPhotos(prev => prev.filter((_, i) => i !== idx))
    setNewPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Rooster save ────────────────────────────────────────────────────────────

  async function handleSaveNewRooster() {
    if (!newRoosterName.trim()) return toast.error('Name is required')
    const fields = { 'Name': newRoosterName.trim(), 'Active': true }
    if (newRoosterBreed.trim()) fields['Breed'] = newRoosterBreed.trim()
    if (newRoosterDesc.trim()) fields['Color/Description'] = newRoosterDesc.trim()
    if (newRoosterNotes.trim()) fields['Notes'] = newRoosterNotes.trim()
    try {
      const res = await fetch(`${BASE_URL}/${ROOSTERS_TABLE}`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ records: [{ fields }], typecast: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`)
      const newRooster = json.records[0]
      if (onRoosterAdded) onRoosterAdded(newRooster)
      setSelectedRoosterId(newRooster.id)
      setShowAddRooster(false)
      setNewRoosterName(''); setNewRoosterBreed(''); setNewRoosterDesc(''); setNewRoosterNotes('')
      toast.success(`${safeStr(newRooster.fields['Name'])} added`)
    } catch (e) {
      toast.error('Failed to save rooster: ' + e.message)
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)

    // Upload any new photos
    const uploadedUrls = []
    for (const file of newPhotos) {
      const url = await uploadPhoto(file)
      if (url) uploadedUrls.push(url)
    }
    const finalPhotoUrls = [...photoUrls, ...uploadedUrls]

    const selectedRooster = roosters.find(r => r.id === selectedRoosterId)
    const fields = {
      'Rooster': selectedRooster ? safeStr(selectedRooster.fields['Name']) : null,
      'Rooster ID': selectedRoosterId || null,
      'Set Date': editForm.setDate || null,
      'Status': editForm.status,
      'Photo URLs': finalPhotoUrls.length > 0 ? JSON.stringify(finalPhotoUrls) : null,
      'Day 7 Notes': editForm.d7notes.trim() || null,
      'Day 14 Notes': editForm.d14notes.trim() || null,
      'Hatch Notes': editForm.hatchNotes.trim() || null,
      'Batch Notes': editForm.batchNotes.trim() || null,
    }

    EGG_COLORS.forEach(({ field, formKey }) => {
      fields[field] = Number(editForm[formKey]) || 0
    })

    if (editForm.d7dev !== '') {
      fields['Day 7 Developing'] = Number(editForm.d7dev) || 0
    }
    if (editForm.d7rem !== '') {
      fields['Day 7 Removed'] = Number(editForm.d7rem) || 0
    }
    if (editForm.d14dev !== '') {
      fields['Day 14 Developing'] = Number(editForm.d14dev) || 0
    }
    if (editForm.d14rem !== '') {
      fields['Day 14 Removed'] = Number(editForm.d14rem) || 0
    }
    if (editForm.chicksHatched !== '') {
      fields['Chicks Hatched'] = Number(editForm.chicksHatched) || 0
    }

    // Strip null fields so we don't accidentally blank things out
    Object.keys(fields).forEach(k => { if (fields[k] === null) delete fields[k] })

    try {
      const res = await fetch(`${BASE_URL}/${BATCHES_TABLE}/${batch.id}`, {
        method: 'PATCH',
        headers: hdrs(),
        body: JSON.stringify({ fields, typecast: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`)

      toast.success('Saved ✓')
      setSaving(false)
      setEditing(false)
      setNewPhotos([])
      setNewPreviews([])
      const updatedBatch = { ...batch, fields: { ...batch.fields, ...fields } }
      onSaved(updatedBatch)
    } catch (e) {
      toast.error('Save failed: ' + e.message)
      setSaving(false)
    }
  }

  // ── Inline candle save ──────────────────────────────────────────────────────

  async function saveInlineCandle(candleDay) {
    const devStr = candleDay === 7 ? inlineDev7 : inlineDev14
    const notes = candleDay === 7 ? inlineNotes7 : inlineNotes14
    if (devStr === '') return toast.error('Enter number developing')
    const devNum = Number(devStr) || 0
    const prevTotal = candleDay === 14 && d7dev > 0 ? d7dev : total
    if (devNum > prevTotal) return toast.error(`Can't exceed ${prevTotal} eggs`)
    setSavingCandle(true)

    const fields = candleDay === 7
      ? { 'Day 7 Developing': devNum, 'Day 7 Removed': Math.max(0, total - devNum), ...(notes.trim() && { 'Day 7 Notes': notes.trim() }) }
      : { 'Day 14 Developing': devNum, 'Day 14 Removed': Math.max(0, prevTotal - devNum), ...(notes.trim() && { 'Day 14 Notes': notes.trim() }) }

    try {
      const res = await fetch(`${BASE_URL}/${BATCHES_TABLE}/${batch.id}`, {
        method: 'PATCH',
        headers: hdrs(),
        body: JSON.stringify({ fields, typecast: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`)
      toast.success(`Day ${candleDay} candle logged`)
      setSavingCandle(false)
      setInlineCandle(null)
      const updatedBatch = { ...batch, fields: { ...batch.fields, ...fields } }
      onSaved(updatedBatch)
    } catch (e) {
      toast.error('Save failed: ' + e.message)
      setSavingCandle(false)
    }
  }

  // ── Log entry save ──────────────────────────────────────────────────────────

  async function handleAddEntry(newEntry) {
    const updatedLog = [newEntry, ...logEntries]
    try {
      const res = await fetch(`${BASE_URL}/${BATCHES_TABLE}/${batch.id}`, {
        method: 'PATCH',
        headers: hdrs(),
        body: JSON.stringify({ fields: { 'Incubation Log': JSON.stringify(updatedLog) }, typecast: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`)
      setLogEntries(updatedLog)
      setShowAddEntry(false)
      toast.success('Logged ✓')
      const updatedBatch = { ...batch, fields: { ...batch.fields, 'Incubation Log': JSON.stringify(updatedLog) } }
      onSaved(updatedBatch)
    } catch (e) {
      toast.error('Failed to save: ' + e.message)
    }
  }

  async function handleDeleteEntry(entryId) {
    setDeletingLogId(entryId)
    const updatedLog = logEntries.filter(e => e.id !== entryId)
    try {
      const res = await fetch(`${BASE_URL}/${BATCHES_TABLE}/${batch.id}`, {
        method: 'PATCH',
        headers: hdrs(),
        body: JSON.stringify({ fields: { 'Incubation Log': JSON.stringify(updatedLog) }, typecast: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`)
      setLogEntries(updatedLog)
      setDeleteConfirmId(null)
      const updatedBatch = { ...batch, fields: { ...batch.fields, 'Incubation Log': JSON.stringify(updatedLog) } }
      onSaved(updatedBatch)
    } catch (e) {
      toast.error('Failed to delete: ' + e.message)
    }
    setDeletingLogId(null)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`${BASE_URL}/${BATCHES_TABLE}/${batch.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${PAT}` },
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error?.message || `HTTP ${res.status}`) }
      toast.success('Batch deleted')
      onDeleted()
    } catch (e) {
      toast.error('Delete failed: ' + e.message)
      setDeleting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const viewPhotos = parsePhotoUrls(batch)

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0 bg-white">
        <button onClick={onClose} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 -ml-1 min-w-[60px]">
          <ChevronLeft size={20} />
          <span className="text-sm">Back</span>
        </button>
        <h1 className="text-base font-semibold text-gray-900 truncate mx-3 text-center flex-1">
          {formatBatchName(safeStr(f['Batch Name'], 'Batch'))}
        </h1>
        <div className="min-w-[60px] flex justify-end">
          {canEdit && (
            editing ? (
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-medium text-amber-600 hover:text-amber-800 disabled:opacity-50">
                {saving ? '...' : 'Save'}
              </button>
            ) : (
              <button onClick={() => setEditing(true)}
                className="text-sm font-medium text-amber-600 hover:text-amber-800">
                Edit
              </button>
            )
          )}
        </div>
      </div>

      {/* Tab bar (view mode only) */}
      {!editing && (
        <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
          {['details', 'log'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-amber-500 text-amber-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab === 'log' ? `Log${logEntries.length > 0 ? ` (${logEntries.length})` : ''}` : 'Details'}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {!editing ? (
          /* ══════════ VIEW MODE ══════════ */
          activeTab === 'log' ? (

            /* ─── LOG TAB ─── */
            <div className="max-w-lg mx-auto px-5 py-4 pb-12">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-gray-700">Incubation Log</p>
                {canEdit && (
                  <button onClick={() => setShowAddEntry(true)}
                    className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-800">
                    <Plus size={15} /> Add Entry
                  </button>
                )}
              </div>

              {logEntries.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-3xl mb-3">📋</p>
                  <p className="text-gray-500 text-sm">No log entries yet.</p>
                  {canEdit && (
                    <p className="text-gray-400 text-sm mt-1">Tap + Add Entry to start tracking.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {logEntries.map(entry => {
                    const subtitle = entrySubtitle(entry)
                    const isConfirming = deleteConfirmId === entry.id
                    return (
                      <div key={entry.id} className="bg-white border border-gray-200 rounded-xl p-3.5 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800">
                            {entryIcon(entry.type)} Day {entry.day} · {fmtLogDate(entry.timestamp)}
                          </p>
                          {canEdit && !isConfirming && (
                            <button onClick={() => setDeleteConfirmId(entry.id)}
                              className="text-gray-300 hover:text-red-400 flex-shrink-0 mt-0.5">
                              <X size={16} />
                            </button>
                          )}
                        </div>
                        {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
                        {entry.note && <p className="text-sm text-gray-500">{entry.note}</p>}
                        {isConfirming && (
                          <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-2">
                            <p className="text-xs text-gray-500 flex-1">Remove this entry?</p>
                            <button onClick={() => setDeleteConfirmId(null)}
                              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
                            <button onClick={() => handleDeleteEntry(entry.id)} disabled={deletingLogId === entry.id}
                              className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 disabled:opacity-50">
                              {deletingLogId === entry.id ? '...' : 'Remove'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          ) : (

            /* ─── DETAILS TAB ─── */
            <div className="max-w-lg mx-auto pb-12">

            {/* Photos */}
            {viewPhotos.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto px-4 py-4 snap-x">
                {viewPhotos.map((url, i) => (
                  <img key={i} src={url} alt="Batch photo"
                    className="h-56 w-auto rounded-xl flex-shrink-0 object-cover snap-start" />
                ))}
              </div>
            ) : (
              <div className="w-full h-36 bg-gradient-to-br from-amber-100 to-orange-50 flex items-center justify-center">
                <span className="text-5xl">🥚</span>
              </div>
            )}

            <div className="px-5 py-4 space-y-6">

              {/* Batch info */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  {f['Rooster'] && (() => {
                    const rooster = roosters.find(r => r.id === safeStr(f['Rooster ID']))
                    return (
                      <div>
                        <p className="text-sm text-gray-700">
                          🐓 {safeStr(f['Rooster'])}
                          {rooster?.fields['Breed'] && <span className="text-gray-400"> · {safeStr(rooster.fields['Breed'])}</span>}
                        </p>
                        {rooster?.fields['Color/Description'] && (
                          <p className="text-xs text-gray-400">{safeStr(rooster.fields['Color/Description'])}</p>
                        )}
                      </div>
                    )
                  })()}
                  <p className="text-sm text-gray-500">Set {fmtDate(setDate)} · Hatch {fmtDate(hatchDate)}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusBadgeClass(status)}`}>
                  {status}
                </span>
              </div>

              {/* Egg counts */}
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Eggs Set</p>
                <div className="flex flex-wrap items-center gap-2">
                  {EGG_COLORS.filter(({ field }) => safeNum(f[field]) > 0).map(({ field, label, emoji }) => (
                    <span key={field} className="text-sm bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg">
                      {emoji} {label}: {safeNum(f[field])}
                    </span>
                  ))}
                  <span className="text-sm font-medium text-gray-600">· {total} eggs</span>
                </div>
              </div>

              {/* 21-day progress (Active batches) */}
              {isActive && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800">Day {day} of 21</span>
                    <span className="text-sm text-gray-500">{phaseName}</span>
                  </div>
                  <ProgressBar day={day} />
                  <div className="flex justify-between text-xs text-gray-400 pt-0.5">
                    <span>Set {shortDate(setDate)}</span>
                    <span>Hatch {shortDate(hatchDate)}</span>
                  </div>
                </div>
              )}

              {/* Incubator settings (Active only) */}
              {isActive && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-3">Incubator Settings</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Days 1–7',   detail: '100.0–100.5°F · 50–60% RH · Flip ON',  active: day <= 7 },
                      { label: 'Days 8–14',  detail: '100.0–100.5°F · 45–55% RH · Flip ON',  active: day >= 8 && day <= 14 },
                      { label: 'Days 15–17', detail: '100.0°F · 45–55% RH · Flip ON',         active: day >= 15 && day <= 17 },
                      { label: 'Day 18+ (Lockdown)', detail: '99.5–100°F · 65–75% RH · STOP turning', active: day >= 18 },
                    ].map(({ label, detail, active }) => (
                      <div key={label} className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${active ? 'bg-amber-100/70' : ''}`}>
                        <span className="text-base leading-none mt-0.5">{label.startsWith('Day 18') ? '🔒' : '🌡️'}</span>
                        <div>
                          <p className={`text-sm font-medium ${active ? 'text-amber-900' : 'text-gray-700'}`}>
                            {label}{active ? ' ← today' : ''}
                          </p>
                          <p className={`text-sm ${active ? 'text-amber-800' : 'text-gray-500'}`}>{detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Readings (daily log) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Readings</p>
                  {canEdit && !showReadingForm && (
                    <button
                      onClick={() => setShowReadingForm(true)}
                      className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                    >
                      + Add Reading
                    </button>
                  )}
                </div>

                {/* Today's targets (passive reference, active batches only) */}
                {isActive && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-2">
                    {(() => {
                      const t = getTargetsForDay(day)
                      return (
                        <>
                          <span className="font-medium text-gray-600">Day {day} targets: </span>
                          {t.temp} &middot; {t.humidity} &middot; {t.turn ? 'Turn ✓' : 'STOP turning'}
                        </>
                      )
                    })()}
                  </div>
                )}

                {/* Inline form */}
                {showReadingForm && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Date</label>
                        <input
                          type="date"
                          value={readingForm.log_date}
                          onChange={e => setReadingForm(p => ({ ...p, log_date: e.target.value }))}
                          className={inp}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Temp (°F)</label>
                        <input
                          type="number" step="0.1"
                          value={readingForm.temp_f}
                          onChange={e => setReadingForm(p => ({ ...p, temp_f: e.target.value }))}
                          className={inp} placeholder="100.4"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Humidity (%)</label>
                        <input
                          type="number"
                          value={readingForm.humidity_pct}
                          onChange={e => setReadingForm(p => ({ ...p, humidity_pct: e.target.value }))}
                          className={inp} placeholder="55"
                        />
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={readingForm.eggs_turned}
                            onChange={e => setReadingForm(p => ({ ...p, eggs_turned: e.target.checked }))}
                            className="rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                          />
                          Eggs turned
                        </label>
                      </div>
                    </div>
                    <input
                      value={readingForm.notes}
                      onChange={e => setReadingForm(p => ({ ...p, notes: e.target.value }))}
                      className={inp} placeholder="Notes (optional)"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowReadingForm(false)}
                        className="flex-1 border border-gray-200 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-white">
                        Cancel
                      </button>
                      <button type="button" onClick={saveReading} disabled={readingSaving}
                        className="flex-1 bg-amber-500 text-white py-1.5 rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-60">
                        {readingSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}

                {/* History table */}
                {readingsLoading ? (
                  <p className="text-xs text-gray-400 py-1">Loading...</p>
                ) : readings.length > 0 ? (
                  <div>
                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50">
                            {['Date', 'Day', 'Temp', 'Humidity', 'Turned', 'Notes'].map(h => (
                              <th key={h} className="text-left px-2.5 py-2 text-gray-400 font-medium border-b border-gray-100">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(showAllReadings ? readings : readings.slice(0, 14)).map((r, i) => (
                            <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                              <td className="px-2.5 py-1.5 text-gray-600 border-b border-gray-50">{shortDate(r.log_date)}</td>
                              <td className="px-2.5 py-1.5 text-gray-500 border-b border-gray-50">{r.day_number ?? '—'}</td>
                              <td className="px-2.5 py-1.5 text-gray-600 border-b border-gray-50">{r.temp_f != null ? `${r.temp_f}°F` : '—'}</td>
                              <td className="px-2.5 py-1.5 text-gray-600 border-b border-gray-50">{r.humidity_pct != null ? `${r.humidity_pct}%` : '—'}</td>
                              <td className="px-2.5 py-1.5 text-gray-500 border-b border-gray-50">{r.eggs_turned ? '✓' : '—'}</td>
                              <td className="px-2.5 py-1.5 text-gray-400 border-b border-gray-50 max-w-[90px] truncate">{r.notes || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {readings.length > 14 && !showAllReadings && (
                      <button onClick={() => setShowAllReadings(true)}
                        className="text-xs text-amber-600 hover:text-amber-800 mt-2 font-medium">
                        Load more ({readings.length - 14} more)
                      </button>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Candling — Day 7 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Day 7 Candle</p>
                  <p className="text-xs text-gray-400">{fmtDate(d7TargetDate)}</p>
                </div>
                {d7done ? (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-sm text-gray-700">{d7dev} developing · {d7rem} removed</p>
                    {f['Day 7 Notes'] && <p className="text-xs text-gray-500 mt-1">{safeStr(f['Day 7 Notes'])}</p>}
                  </div>
                ) : day >= 7 ? (
                  inlineCandle === 7 ? (
                    <InlineCandleForm
                      total={total}
                      setDate={setDate}
                      candleDay={7}
                      devVal={inlineDev7}
                      setDev={setInlineDev7}
                      notesVal={inlineNotes7}
                      setNotes={setInlineNotes7}
                      saving={savingCandle}
                      onSave={() => saveInlineCandle(7)}
                      onCancel={() => setInlineCandle(null)}
                    />
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3">
                      <p className="text-sm text-amber-800">🕯️ Candle results not logged yet</p>
                      {canEdit && (
                        <button onClick={() => setInlineCandle(7)}
                          className="text-sm font-medium text-amber-700 hover:text-amber-900 flex-shrink-0">
                          Log Results
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  <p className="text-sm text-gray-400">Coming up {fmtDate(d7TargetDate)}</p>
                )}
              </div>

              {/* Candling — Day 14 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Day 14 Candle</p>
                  <p className="text-xs text-gray-400">{fmtDate(d14TargetDate)}</p>
                </div>
                {d14done ? (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-sm text-gray-700">{d14dev} developing · {d14rem} removed</p>
                    {f['Day 14 Notes'] && <p className="text-xs text-gray-500 mt-1">{safeStr(f['Day 14 Notes'])}</p>}
                  </div>
                ) : day >= 14 ? (
                  inlineCandle === 14 ? (
                    <InlineCandleForm
                      total={d7dev > 0 ? d7dev : total}
                      setDate={setDate}
                      candleDay={14}
                      devVal={inlineDev14}
                      setDev={setInlineDev14}
                      notesVal={inlineNotes14}
                      setNotes={setInlineNotes14}
                      saving={savingCandle}
                      onSave={() => saveInlineCandle(14)}
                      onCancel={() => setInlineCandle(null)}
                    />
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3">
                      <p className="text-sm text-amber-800">🕯️ Candle results not logged yet</p>
                      {canEdit && (
                        <button onClick={() => setInlineCandle(14)}
                          className="text-sm font-medium text-amber-700 hover:text-amber-900 flex-shrink-0">
                          Log Results
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  <p className="text-sm text-gray-400">Coming up {fmtDate(d14TargetDate)}</p>
                )}
              </div>

              {/* Hatch Results */}
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Hatch Results</p>
                {hatched > 0 ? (
                  <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                    <p className="text-sm text-gray-700">
                      {hatched} of {total} chicks hatched — {hatchPct}%{' '}
                      {hatchBm && <span className={`font-medium ${hatchBm.color}`}>{hatchBm.label}</span>}
                    </p>
                    {f['Hatch Notes'] && <p className="text-xs text-gray-500">{safeStr(f['Hatch Notes'])}</p>}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Not yet recorded</p>
                )}
              </div>

              {/* Batch Notes */}
              {f['Batch Notes'] && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Batch Notes</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3 whitespace-pre-wrap">{safeStr(f['Batch Notes'])}</p>
                </div>
              )}

              {/* Recent Log preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Recent Log</p>
                  {logEntries.length > 0 && (
                    <button onClick={() => setActiveTab('log')}
                      className="text-xs text-amber-600 hover:text-amber-800 font-medium">
                      View All →
                    </button>
                  )}
                </div>
                {logEntries.length === 0 ? (
                  <p className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
                    💡 Track adjustments and readings in the Log tab.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {logEntries.slice(0, 3).map(entry => {
                      const subtitle = entrySubtitle(entry)
                      return (
                        <div key={entry.id} className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs font-medium text-gray-700">
                            {entryIcon(entry.type)} Day {entry.day} · {fmtLogDate(entry.timestamp)}
                          </p>
                          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
                          {entry.note && <p className="text-xs text-gray-400 mt-0.5 truncate">{entry.note}</p>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
          ) /* end details tab */

        ) : (

          /* ══════════ EDIT MODE ══════════ */
          <div className="max-w-lg mx-auto px-5 py-5 pb-16 space-y-5">

            {/* Photos */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Photos</p>
              {(photoUrls.length > 0 || newPreviews.length > 0) && (
                <div className="flex gap-2 overflow-x-auto mb-3 pb-1">
                  {photoUrls.map((url, i) => (
                    <div key={i} className="relative flex-shrink-0">
                      <img src={url} alt="Batch" className="h-24 w-24 object-cover rounded-lg" />
                      <button type="button" onClick={() => removeExistingPhoto(i)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {newPreviews.map((url, i) => (
                    <div key={`new-${i}`} className="relative flex-shrink-0">
                      <img src={url} alt="New" className="h-24 w-24 object-cover rounded-lg ring-2 ring-amber-300" />
                      <button type="button" onClick={() => removeNewPhoto(i)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-800 border border-dashed border-amber-300 rounded-lg px-3 py-2.5 w-full justify-center">
                <Plus size={15} /> Add Photos
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
            </div>

            {/* Set Date & Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">Set Date</label>
                <input type="date" value={editForm.setDate} onChange={e => setEF('setDate', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">Status</label>
                <select value={editForm.status} onChange={e => setEF('status', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white">
                  <option value="Active">Active</option>
                  <option value="Hatched">Hatched</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>
            </div>

            {/* Rooster */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">Rooster</label>
              <select value={selectedRoosterId} onChange={e => setSelectedRoosterId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white">
                <option value="">— None —</option>
                {roosters.map(r => (
                  <option key={r.id} value={r.id}>{safeStr(r.fields['Name'])}</option>
                ))}
              </select>
              <button type="button" onClick={() => setShowAddRooster(v => !v)}
                className="text-xs text-amber-600 hover:text-amber-800 mt-1.5">
                + Add new rooster
              </button>
              {showAddRooster && (
                <div className="mt-2 space-y-2 border border-gray-200 rounded-lg p-3">
                  <input placeholder="Name *" value={newRoosterName} onChange={e => setNewRoosterName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  <input placeholder="Breed" value={newRoosterBreed} onChange={e => setNewRoosterBreed(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  <input placeholder="Color/Description" value={newRoosterDesc} onChange={e => setNewRoosterDesc(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  <input placeholder="Notes" value={newRoosterNotes} onChange={e => setNewRoosterNotes(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  <button type="button" onClick={handleSaveNewRooster}
                    className="text-sm font-medium text-amber-600 hover:text-amber-800">Save Rooster</button>
                </div>
              )}
            </div>

            {/* Egg Counts */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">Egg Counts</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'brown',     label: 'Brown',      emoji: '🟤' },
                  { key: 'darkBrown', label: 'Dark Brown', emoji: '🟫' },
                  { key: 'blue',      label: 'Blue',       emoji: '🔵' },
                  { key: 'green',     label: 'Green',      emoji: '🟢' },
                  { key: 'white',     label: 'White',      emoji: '⬜' },
                  { key: 'tan',       label: 'Tan/Pink',   emoji: '🩷' },
                ].map(({ key, label, emoji }) => (
                  <div key={key}>
                    <label className="text-xs text-gray-500 block mb-1">{emoji} {label}</label>
                    <input type="number" min="0" value={editForm[key] ?? ''} onChange={e => setEF(key, e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                ))}
              </div>
            </div>

            {/* Day 7 Candle */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">Day 7 Candle</label>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Developing</label>
                  <input type="number" min="0" value={editForm.d7dev} onChange={e => setEF('d7dev', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Removed</label>
                  <input type="number" min="0" value={editForm.d7rem} onChange={e => setEF('d7rem', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
              </div>
              <input placeholder="Day 7 notes" value={editForm.d7notes} onChange={e => setEF('d7notes', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>

            {/* Day 14 Candle */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">Day 14 Candle</label>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Developing</label>
                  <input type="number" min="0" value={editForm.d14dev} onChange={e => setEF('d14dev', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Removed</label>
                  <input type="number" min="0" value={editForm.d14rem} onChange={e => setEF('d14rem', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
              </div>
              <input placeholder="Day 14 notes" value={editForm.d14notes} onChange={e => setEF('d14notes', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>

            {/* Hatch Results */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">Hatch Results</label>
              <div className="mb-2">
                <label className="text-xs text-gray-500 block mb-1">Chicks Hatched</label>
                <input type="number" min="0" value={editForm.chicksHatched} onChange={e => setEF('chicksHatched', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
              <input placeholder="Hatch notes" value={editForm.hatchNotes} onChange={e => setEF('hatchNotes', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
            </div>

            {/* Batch Notes */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">Batch Notes</label>
              <textarea rows={3} placeholder="Notes about this batch…" value={editForm.batchNotes}
                onChange={e => setEF('batchNotes', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
            </div>

          </div>
          /* end edit mode */

        )}

      </div>
      {/* end scrollable body */}

      {/* Delete — view mode only */}
      {!editing && canEdit && (
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100">
          {confirmDelete ? (
            <div className="flex items-center gap-3 justify-center">
              <p className="text-sm text-gray-600">Delete this batch?</p>
              <button onClick={() => setConfirmDelete(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="text-sm font-medium text-red-500 hover:text-red-700 disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="w-full text-sm text-red-400 hover:text-red-600 py-1">
              Delete Batch
            </button>
          )}
        </div>
      )}

      {/* AddEntry sheet */}
      {showAddEntry && (
        <AddEntrySheet
          batchDay={getBatchDay(safeStr(batch.fields['Set Date']))}
          onClose={() => setShowAddEntry(false)}
          onSave={(entry) => {
            setLogEntries(prev => [entry, ...prev])
            setShowAddEntry(false)
          }}
        />
      )}

    </div>
  )
}