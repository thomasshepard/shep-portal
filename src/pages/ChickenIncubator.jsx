import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Trash2, Pencil, Check, BookOpen } from 'lucide-react'
import { CHICKENS_BASE_ID } from '../lib/airtable'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

// ── Constants ────────────────────────────────────────────────────────────────

const PAT = import.meta.env.VITE_AIRTABLE_PAT
const BASE_URL = `https://api.airtable.com/v0/${CHICKENS_BASE_ID}`
const BATCHES_TABLE = 'tblKomWeHkj9aGFDC'

const headers = () => ({
  Authorization: `Bearer ${PAT}`,
  'Content-Type': 'application/json',
})

// ── Helpers ──────────────────────────────────────────────────────────────────

const safeStr = (v, fb = '') => (v == null || v === '' ? fb : typeof v === 'object' ? fb : String(v))
const safeNum = (v) => (v == null || v === '' || typeof v === 'object' ? 0 : Number(v) || 0)

function fmtDate(str) {
  if (!str) return ''
  const d = new Date(str + 'T12:00:00')
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatBatchName(name) {
  if (!name) return 'Untitled'
  return name.replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, m, d) => {
    const date = new Date(`${y}-${m}-${d}T12:00:00`)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  })
}

function shortDate(str) {
  if (!str) return ''
  const d = new Date(str + 'T12:00:00')
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function totalEggs(f) {
  return safeNum(f['Brown Eggs']) + safeNum(f['Blue/Green Eggs']) + safeNum(f['White Eggs']) + safeNum(f['Tan/Pink Eggs'])
}

function expectedHatchDate(setDate) {
  if (!setDate) return ''
  const d = new Date(setDate + 'T12:00:00')
  d.setDate(d.getDate() + 21)
  return d.toISOString().split('T')[0]
}

// ── Phase Engine ─────────────────────────────────────────────────────────────

function getBatchPhase(batch) {
  const setDate = new Date(safeStr(batch.fields['Set Date']) + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const day = Math.floor((today - setDate) / 86400000) + 1

  const hatched = safeNum(batch.fields['Chicks Hatched'])
  const d7done = safeNum(batch.fields['Day 7 Developing']) > 0 || safeNum(batch.fields['Day 7 Removed']) > 0
  const d14done = safeNum(batch.fields['Day 14 Developing']) > 0 || safeNum(batch.fields['Day 14 Removed']) > 0

  if (day < 7) return { day, phase: 'early', label: 'Early Development', nextAction: null }
  if (day === 7 && !d7done) return { day, phase: 'candle7', label: 'Day 7 — Candle Now', nextAction: 'candle7' }
  if (day >= 7 && day < 14) return { day, phase: 'mid', label: 'Growing', nextAction: null }
  if (day === 14 && !d14done) return { day, phase: 'candle14', label: 'Day 14 — Candle Now', nextAction: 'candle14' }
  if (day >= 14 && day < 18) return { day, phase: 'prelockdown', label: 'Pre-Lockdown', nextAction: null }
  if (day === 18) return { day, phase: 'lockdown', label: 'LOCKDOWN TODAY', nextAction: 'lockdown' }
  if (day >= 19 && day <= 21) return { day, phase: 'hatch', label: 'Watch for Pip', nextAction: null }
  if (day > 21 && hatched === 0) return { day, phase: 'recordhatch', label: 'Record Hatch Results', nextAction: 'recordhatch' }
  return { day, phase: 'done', label: 'Complete', nextAction: null }
}

// ── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ day }) {
  const capped = Math.min(Math.max(day, 0), 21)
  const pct = (capped / 21) * 100

  function segmentColor(d) {
    if (d <= 6) return 'bg-yellow-400'
    if (d <= 13) return 'bg-orange-400'
    if (d <= 17) return 'bg-amber-500'
    if (d <= 20) return 'bg-red-500'
    return 'bg-green-500'
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
        <span>Day {capped}</span>
        <span>Day 21</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${segmentColor(capped)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Egg Count Display ────────────────────────────────────────────────────────

function EggCounts({ fields, className = '' }) {
  const brown = safeNum(fields['Brown Eggs'])
  const blue = safeNum(fields['Blue/Green Eggs'])
  const white = safeNum(fields['White Eggs'])
  const tan = safeNum(fields['Tan/Pink Eggs'])
  const total = brown + blue + white + tan
  const items = [
    brown > 0 && { emoji: '\uD83D\uDFE4', count: brown },
    blue > 0 && { emoji: '\uD83D\uDFE2', count: blue },
    white > 0 && { emoji: '\u2B1C', count: white },
    tan > 0 && { emoji: '\uD83E\uDE77', count: tan },
  ].filter(Boolean)

  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      {items.map((it, i) => (
        <span key={i}>{it.emoji}{it.count}</span>
      ))}
      <span className="text-gray-400 ml-1">{total} eggs</span>
    </div>
  )
}

// ── Airtable API ─────────────────────────────────────────────────────────────

async function fetchBatches() {
  try {
    const records = []
    let offset
    do {
      const query = new URLSearchParams()
      query.set('sort[0][field]', 'Set Date')
      query.set('sort[0][direction]', 'desc')
      if (offset) query.set('offset', offset)
      const res = await fetch(`${BASE_URL}/${BATCHES_TABLE}?${query}`, { headers: headers() })
      if (!res.ok) { const e = await res.json().catch(() => ({})); return { data: null, error: e?.error?.message || `HTTP ${res.status}` } }
      const json = await res.json()
      records.push(...(json.records || []))
      offset = json.offset
    } while (offset)
    return { data: records, error: null }
  } catch (e) { return { data: null, error: e.message } }
}

async function createBatch(fields) {
  try {
    const res = await fetch(`${BASE_URL}/${BATCHES_TABLE}`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ fields, typecast: true }),
    })
    const json = await res.json()
    if (!res.ok) return { data: null, error: json?.error?.message || `HTTP ${res.status}` }
    return { data: json, error: null }
  } catch (e) { return { data: null, error: e.message } }
}

async function updateBatch(recordId, fields) {
  try {
    const res = await fetch(`${BASE_URL}/${BATCHES_TABLE}/${recordId}`, {
      method: 'PATCH', headers: headers(),
      body: JSON.stringify({ fields, typecast: true }),
    })
    const json = await res.json()
    if (!res.ok) return { data: null, error: json?.error?.message || `HTTP ${res.status}` }
    return { data: json, error: null }
  } catch (e) { return { data: null, error: e.message } }
}

async function deleteBatch(recordId) {
  try {
    const res = await fetch(`${BASE_URL}/${BATCHES_TABLE}/${recordId}`, {
      method: 'DELETE', headers: headers(),
    })
    const json = await res.json()
    if (!res.ok) return { data: null, error: json?.error?.message || `HTTP ${res.status}` }
    return { data: json, error: null }
  } catch (e) { return { data: null, error: e.message } }
}

// ── Photo Upload ─────────────────────────────────────────────────────────────

async function uploadPhoto(file) {
  try {
    const path = `incubator/${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage.from('chicken-photos').upload(path, file, { upsert: false })
    if (error) throw error
    const { data: urlData } = supabase.storage.from('chicken-photos').getPublicUrl(data.path)
    return urlData.publicUrl
  } catch (e) {
    console.error('Photo upload failed:', e)
    toast.error('Photo upload failed — saving batch without photo')
    return null
  }
}

// ── Next Action Card ─────────────────────────────────────────────────────────

function NextActionCard({ phase, onAction }) {
  const config = {
    candle7: { bg: 'bg-amber-50 border-amber-300', label: 'Day 7 — Candle Today', btn: 'Log Results' },
    candle14: { bg: 'bg-amber-50 border-amber-300', label: 'Day 14 — Candle Today', btn: 'Log Results' },
    lockdown: { bg: 'bg-orange-50 border-orange-300', label: 'Day 18 — Lockdown', btn: 'Start Lockdown' },
    recordhatch: { bg: 'bg-green-50 border-green-300', label: 'Record Hatch Results', btn: 'Log Results' },
  }
  const c = config[phase.nextAction]
  if (!c) return null

  return (
    <div className={`rounded-lg border p-3 ${c.bg}`}>
      <p className="text-sm font-medium text-gray-800 mb-2">{c.label}</p>
      <button
        onClick={() => onAction(phase.nextAction)}
        className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {c.btn}
      </button>
    </div>
  )
}

// ── Active Batch Card ────────────────────────────────────────────────────────

function ActiveBatchCard({ batch, onAction }) {
  const f = batch.fields
  const phase = getBatchPhase(batch)
  const photoUrl = safeStr(f['Batch Photo URL'])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {photoUrl ? (
        <img src={photoUrl} alt="Batch" className="w-full h-48 object-cover" />
      ) : (
        <div className="w-full h-32 bg-gradient-to-br from-amber-100 to-orange-50" />
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">{formatBatchName(safeStr(f['Batch Name'], 'Untitled'))}</h3>
            {f['Rooster'] && <p className="text-sm text-gray-500 mt-0.5">{'\uD83D\uDC13'} {safeStr(f['Rooster'])}</p>}
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Active</span>
        </div>
        <EggCounts fields={f} />
        <ProgressBar day={phase.day} />
        <p className="text-xs text-gray-500">
          Set {shortDate(f['Set Date'])} &middot; Expected hatch {shortDate(expectedHatchDate(f['Set Date']))}
        </p>
        {phase.nextAction && <NextActionCard phase={phase} onAction={onAction} />}
      </div>
    </div>
  )
}

// ── Completed Batch Card ─────────────────────────────────────────────────────

function CompletedBatchCard({ batch, onClick }) {
  const f = batch.fields
  const status = safeStr(f['Status'], 'Hatched')
  const total = totalEggs(f)
  const hatched = safeNum(f['Chicks Hatched'])
  const pct = total > 0 ? Math.round((hatched / total) * 100) : 0
  const isHatched = status === 'Hatched'

  return (
    <button onClick={onClick} className="bg-white rounded-xl border border-gray-200 p-4 text-left w-full hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-700">{formatBatchName(safeStr(f['Batch Name'], 'Untitled'))}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {f['Rooster'] && <>{'\uD83D\uDC13'} {safeStr(f['Rooster'])} &middot; </>}
            {isHatched ? `${hatched} of ${total} hatched (${pct}%)` : 'Failed'}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isHatched ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
          {isHatched ? 'Hatched' : 'Failed'}
        </span>
      </div>
    </button>
  )
}

// ── New Batch Sheet ──────────────────────────────────────────────────────────

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

function NewBatchSheet({ onClose, onSaved }) {
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [rooster, setRooster] = useState('')
  const [setDate, setSetDate] = useState(todayStr())
  const [brown, setBrown] = useState('')
  const [blue, setBlue] = useState('')
  const [white, setWhite] = useState('')
  const [tan, setTan] = useState('')
  const [saving, setSaving] = useState(false)

  const total = (Number(brown) || 0) + (Number(blue) || 0) + (Number(white) || 0) + (Number(tan) || 0)

  function onFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setPhoto(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (total === 0) return toast.error('Add at least one egg')
    setSaving(true)

    let photoUrl = null
    if (photo) photoUrl = await uploadPhoto(photo)

    const friendly = new Date(setDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const fields = {
      'Batch Name': `Batch – ${friendly}`,
      'Set Date': setDate,
      'Status': 'Active',
    }
    if (rooster.trim()) fields['Rooster'] = rooster.trim()
    if (Number(brown) > 0) fields['Brown Eggs'] = Number(brown)
    if (Number(blue) > 0) fields['Blue/Green Eggs'] = Number(blue)
    if (Number(white) > 0) fields['White Eggs'] = Number(white)
    if (Number(tan) > 0) fields['Tan/Pink Eggs'] = Number(tan)
    if (photoUrl) fields['Batch Photo URL'] = photoUrl

    const { error } = await createBatch(fields)
    if (error) { toast.error('Failed to create batch: ' + error); setSaving(false); return }

    toast.success('Batch added!')
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-md shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">New Batch</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Photo */}
          <div>
            {preview ? (
              <div className="relative">
                <img src={preview} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                <button type="button" onClick={() => { setPhoto(null); setPreview(null) }}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"><X size={16} /></button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-amber-400 transition-colors">
                <span className="text-gray-400 text-sm">Tap to add a photo</span>
                <input type="file" accept="image/*" className="hidden" onChange={onFileChange} />
              </label>
            )}
          </div>

          {/* Rooster */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rooster</label>
            <input value={rooster} onChange={e => setRooster(e.target.value)} className={inp} placeholder="e.g. Big Red" />
          </div>

          {/* Set Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Set Date</label>
            <input type="date" value={setDate} onChange={e => setSetDate(e.target.value)} className={inp} />
          </div>

          {/* Egg Counts */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Egg Counts</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{'\uD83D\uDFE4'} Brown</label>
                <input type="number" min={0} value={brown} onChange={e => setBrown(e.target.value)}
                  className={inp + ' text-center text-lg font-semibold'} placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{'\uD83D\uDFE2'} Blue/Green</label>
                <input type="number" min={0} value={blue} onChange={e => setBlue(e.target.value)}
                  className={inp + ' text-center text-lg font-semibold'} placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{'\u2B1C'} White</label>
                <input type="number" min={0} value={white} onChange={e => setWhite(e.target.value)}
                  className={inp + ' text-center text-lg font-semibold'} placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{'\uD83E\uDE77'} Tan/Pink</label>
                <input type="number" min={0} value={tan} onChange={e => setTan(e.target.value)}
                  className={inp + ' text-center text-lg font-semibold'} placeholder="0" />
              </div>
            </div>
            <p className={`text-sm mt-2 ${total > 0 ? 'text-gray-600' : 'text-gray-400'}`}>
              {total} egg{total !== 1 ? 's' : ''}
            </p>
            {total > 28 && (
              <p className="text-xs text-amber-600 mt-1">Over MeeF capacity (28 max)</p>
            )}
          </div>

          {/* Submit */}
          <button type="submit" disabled={saving}
            className="w-full bg-amber-500 text-white py-3 rounded-lg font-medium hover:bg-amber-600 disabled:opacity-60 transition-colors">
            {saving ? 'Adding...' : 'Add Batch'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Candle Sheet ─────────────────────────────────────────────────────────────

function CandleSheet({ batch, candleDay, onClose, onSaved }) {
  const f = batch.fields
  const total = totalEggs(f)
  const [developing, setDeveloping] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const devNum = Number(developing) || 0
  const removed = developing !== '' ? Math.max(0, total - devNum) : null

  async function handleSave(e) {
    e.preventDefault()
    if (developing === '') return toast.error('Enter number developing')
    if (devNum > total) return toast.error(`Can't exceed ${total} eggs`)
    setSaving(true)

    const fields = candleDay === 7
      ? { 'Day 7 Developing': devNum, 'Day 7 Removed': total - devNum, ...(notes.trim() && { 'Day 7 Notes': notes.trim() }) }
      : { 'Day 14 Developing': devNum, 'Day 14 Removed': total - devNum, ...(notes.trim() && { 'Day 14 Notes': notes.trim() }) }

    const { error } = await updateBatch(batch.id, fields)
    if (error) { toast.error('Failed to save: ' + error); setSaving(false); return }
    toast.success(`Day ${candleDay} candle logged`)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Day {candleDay} Candle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={handleSave} className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">You set <strong>{total}</strong> eggs on <strong>{fmtDate(f['Set Date'])}</strong>.</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">How many are developing?</label>
            <input type="number" min={0} max={total} value={developing} onChange={e => setDeveloping(e.target.value)}
              className={inp + ' text-center text-lg font-semibold'} autoFocus />
            {removed !== null && (
              <p className="text-sm text-gray-500 mt-1">{removed} will be logged as removed.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={inp + ' resize-none'} />
          </div>

          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5">
            Remove quitters and clears — they'll rot and contaminate the incubator.
          </p>

          <button type="submit" disabled={saving}
            className="w-full bg-amber-500 text-white py-3 rounded-lg font-medium hover:bg-amber-600 disabled:opacity-60 transition-colors">
            {saving ? 'Saving...' : 'Save Candle Results'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Lockdown Sheet ───────────────────────────────────────────────────────────

const LOCKDOWN_STEPS = [
  'Move eggs to flat hatch tray (lay on side)',
  'Turn OFF the auto-flip',
  'Bump humidity to 65-70% RH',
  'Fill water reservoir fully',
  "Close the lid — don't open it again until chicks are dry",
]

function LockdownSheet({ onClose }) {
  const [checked, setChecked] = useState(LOCKDOWN_STEPS.map(() => false))

  function toggle(i) {
    setChecked(prev => prev.map((v, j) => j === i ? !v : v))
  }

  const allDone = checked.every(Boolean)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Day 18 — Lockdown</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">Time to lock down! Work through these steps:</p>
          <div className="space-y-2">
            {LOCKDOWN_STEPS.map((step, i) => (
              <button key={i} onClick={() => toggle(i)}
                className={`flex items-start gap-3 w-full text-left p-3 rounded-lg border transition-colors ${
                  checked[i] ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}>
                <div className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border ${
                  checked[i] ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
                }`}>
                  {checked[i] && <Check size={14} />}
                </div>
                <span className={`text-sm ${checked[i] ? 'text-gray-500 line-through' : 'text-gray-700'}`}>{step}</span>
              </button>
            ))}
          </div>
          <button onClick={onClose} disabled={!allDone}
            className="w-full bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors">
            {allDone ? "Done — I'm locked down" : 'Complete all steps first'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hatch Results Sheet ──────────────────────────────────────────────────────

function hatchBenchmark(pct) {
  if (pct >= 85) return { color: 'text-green-600', label: 'Excellent' }
  if (pct >= 70) return { color: 'text-blue-600', label: 'Good' }
  if (pct >= 50) return { color: 'text-yellow-600', label: 'Investigate' }
  return { color: 'text-red-600', label: 'Problem' }
}

function HatchSheet({ batch, onClose, onSaved }) {
  const f = batch.fields
  const d14 = safeNum(f['Day 14 Developing'])
  const eggsAtLockdown = d14 > 0 ? d14 : totalEggs(f)
  const [count, setCount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const countNum = Number(count) || 0
  const pct = eggsAtLockdown > 0 ? Math.round((countNum / eggsAtLockdown) * 100) : 0
  const bm = count !== '' ? hatchBenchmark(pct) : null

  async function handleMark(status) {
    if (status === 'Hatched' && count === '') return toast.error('Enter hatch count')
    setSaving(true)
    const fields = { 'Status': status }
    if (count !== '') fields['Chicks Hatched'] = countNum
    if (notes.trim()) fields['Hatch Notes'] = notes.trim()
    const { error } = await updateBatch(batch.id, fields)
    if (error) { toast.error('Failed: ' + error); setSaving(false); return }
    toast.success(status === 'Hatched' ? 'Hatch recorded!' : 'Batch marked as failed')
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Record Hatch Results</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">How many chicks hatched?</label>
            <input type="number" min={0} max={eggsAtLockdown} value={count} onChange={e => setCount(e.target.value)}
              className={inp + ' text-center text-lg font-semibold'} autoFocus />
            <p className="text-sm text-gray-500 mt-1">Out of {eggsAtLockdown} eggs in lockdown.</p>
          </div>

          {bm && (
            <p className="text-sm">
              Hatch rate: <strong>{pct}%</strong> <span className={`font-medium ${bm.color}`}>{bm.label}</span>
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={inp + ' resize-none'} />
          </div>

          <div className="flex gap-3">
            <button onClick={() => handleMark('Hatched')} disabled={saving}
              className="flex-1 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-60 transition-colors">
              Mark Hatched
            </button>
            <button onClick={() => handleMark('Failed')} disabled={saving}
              className="flex-1 bg-red-500 text-white py-3 rounded-lg font-medium hover:bg-red-600 disabled:opacity-60 transition-colors">
              Mark Failed
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Batch Detail View ────────────────────────────────────────────────────────

function BatchDetail({ batch, onClose, onSaved, onDeleted }) {
  const { isAdmin, permissions } = useAuth()
  const canEdit = isAdmin || permissions?.chickens
  const f = batch.fields
  const total = totalEggs(f)
  const hatched = safeNum(f['Chicks Hatched'])
  const pct = total > 0 ? Math.round((hatched / total) * 100) : 0
  const bm = hatched > 0 ? hatchBenchmark(pct) : null
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Edit state
  const [editForm, setEditForm] = useState({
    rooster: safeStr(f['Rooster']),
    setDate: safeStr(f['Set Date']),
    brown: String(safeNum(f['Brown Eggs']) || ''),
    blue: String(safeNum(f['Blue/Green Eggs']) || ''),
    white: String(safeNum(f['White Eggs']) || ''),
    tan: String(safeNum(f['Tan/Pink Eggs']) || ''),
    d7dev: String(safeNum(f['Day 7 Developing']) || ''),
    d7notes: safeStr(f['Day 7 Notes']),
    d14dev: String(safeNum(f['Day 14 Developing']) || ''),
    d14notes: safeStr(f['Day 14 Notes']),
    chicksHatched: String(hatched || ''),
    hatchNotes: safeStr(f['Hatch Notes']),
  })
  const [saving, setSaving] = useState(false)

  function setEF(key, val) { setEditForm(prev => ({ ...prev, [key]: val })) }

  async function handleSaveEdit(e) {
    e.preventDefault()
    setSaving(true)
    const totalEdit = (Number(editForm.brown) || 0) + (Number(editForm.blue) || 0) + (Number(editForm.white) || 0) + (Number(editForm.tan) || 0)
    const fields = {
      'Rooster': editForm.rooster.trim() || null,
      'Set Date': editForm.setDate || null,
      'Brown Eggs': Number(editForm.brown) || 0,
      'Blue/Green Eggs': Number(editForm.blue) || 0,
      'White Eggs': Number(editForm.white) || 0,
      'Tan/Pink Eggs': Number(editForm.tan) || 0,
    }
    if (editForm.d7dev !== '') {
      fields['Day 7 Developing'] = Number(editForm.d7dev) || 0
      fields['Day 7 Removed'] = Math.max(0, totalEdit - (Number(editForm.d7dev) || 0))
    }
    if (editForm.d7notes.trim()) fields['Day 7 Notes'] = editForm.d7notes.trim()
    if (editForm.d14dev !== '') {
      fields['Day 14 Developing'] = Number(editForm.d14dev) || 0
      fields['Day 14 Removed'] = Math.max(0, (Number(editForm.d7dev) || totalEdit) - (Number(editForm.d14dev) || 0))
    }
    if (editForm.d14notes.trim()) fields['Day 14 Notes'] = editForm.d14notes.trim()
    if (editForm.chicksHatched !== '') fields['Chicks Hatched'] = Number(editForm.chicksHatched) || 0
    if (editForm.hatchNotes.trim()) fields['Hatch Notes'] = editForm.hatchNotes.trim()

    const { error } = await updateBatch(batch.id, fields)
    if (error) { toast.error('Failed: ' + error); setSaving(false); return }
    toast.success('Batch updated')
    setSaving(false)
    setEditing(false)
    onSaved()
  }

  async function handleDelete() {
    setDeleting(true)
    const { error } = await deleteBatch(batch.id)
    if (error) { toast.error('Delete failed: ' + error); setDeleting(false); return }
    toast.success('Batch deleted')
    onDeleted()
  }

  const photoUrl = safeStr(f['Batch Photo URL'])
  const d7dev = safeNum(f['Day 7 Developing'])
  const d7rem = safeNum(f['Day 7 Removed'])
  const d14dev = safeNum(f['Day 14 Developing'])
  const d14rem = safeNum(f['Day 14 Removed'])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-md shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">{formatBatchName(safeStr(f['Batch Name'], 'Batch'))}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!editing ? (
            <div className="px-5 py-4 space-y-4">
              {photoUrl && <img src={photoUrl} alt="Batch" className="w-full h-48 object-cover rounded-lg" />}

              <div className="text-sm text-gray-600">
                {f['Rooster'] && <p>{'\uD83D\uDC13'} {safeStr(f['Rooster'])}</p>}
                <p>Set {fmtDate(f['Set Date'])} &middot; Hatch {fmtDate(expectedHatchDate(f['Set Date']))}</p>
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Eggs Set</p>
                <EggCounts fields={f} />
              </div>

              {(d7dev > 0 || d7rem > 0) && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Day 7 Candle</p>
                  <p className="text-sm text-gray-700">{d7dev} developing / {d7rem} removed</p>
                  {f['Day 7 Notes'] && <p className="text-xs text-gray-500 mt-0.5">{safeStr(f['Day 7 Notes'])}</p>}
                </div>
              )}

              {(d14dev > 0 || d14rem > 0) && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Day 14 Candle</p>
                  <p className="text-sm text-gray-700">{d14dev} developing / {d14rem} removed</p>
                  {f['Day 14 Notes'] && <p className="text-xs text-gray-500 mt-0.5">{safeStr(f['Day 14 Notes'])}</p>}
                </div>
              )}

              {hatched > 0 && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Chicks Hatched</p>
                  <p className="text-sm text-gray-700">
                    {hatched} / {total} = {pct}%{' '}
                    {bm && <span className={`font-medium ${bm.color}`}>{bm.label}</span>}
                  </p>
                </div>
              )}

              {f['Hatch Notes'] && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-gray-600">{safeStr(f['Hatch Notes'])}</p>
                </div>
              )}

              {canEdit && (
                <div className="flex gap-3 pt-3 border-t border-gray-100">
                  <button onClick={() => setEditing(true)}
                    className="flex-1 flex items-center justify-center gap-2 border border-gray-200 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <Pencil size={14} /> Edit
                  </button>
                  {isAdmin && (!confirmDelete ? (
                    <button onClick={() => setConfirmDelete(true)}
                      className="flex-1 flex items-center justify-center gap-2 border border-red-200 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50">
                      <Trash2 size={14} /> Delete Batch
                    </button>
                  ) : (
                    <button onClick={handleDelete} disabled={deleting}
                      className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
                      {deleting ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveEdit} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Rooster</label>
                <input value={editForm.rooster} onChange={e => setEF('rooster', e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Set Date</label>
                <input type="date" value={editForm.setDate} onChange={e => setEF('setDate', e.target.value)} className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-xs text-gray-500 mb-1">{'\uD83D\uDFE4'} Brown</label><input type="number" min={0} value={editForm.brown} onChange={e => setEF('brown', e.target.value)} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">{'\uD83D\uDFE2'} Blue/Green</label><input type="number" min={0} value={editForm.blue} onChange={e => setEF('blue', e.target.value)} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">{'\u2B1C'} White</label><input type="number" min={0} value={editForm.white} onChange={e => setEF('white', e.target.value)} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">{'\uD83E\uDE77'} Tan/Pink</label><input type="number" min={0} value={editForm.tan} onChange={e => setEF('tan', e.target.value)} className={inp} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-xs text-gray-500 mb-1">Day 7 Developing</label><input type="number" min={0} value={editForm.d7dev} onChange={e => setEF('d7dev', e.target.value)} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Day 7 Notes</label><input value={editForm.d7notes} onChange={e => setEF('d7notes', e.target.value)} className={inp} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-xs text-gray-500 mb-1">Day 14 Developing</label><input type="number" min={0} value={editForm.d14dev} onChange={e => setEF('d14dev', e.target.value)} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Day 14 Notes</label><input value={editForm.d14notes} onChange={e => setEF('d14notes', e.target.value)} className={inp} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-xs text-gray-500 mb-1">Chicks Hatched</label><input type="number" min={0} value={editForm.chicksHatched} onChange={e => setEF('chicksHatched', e.target.value)} className={inp} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Hatch Notes</label><input value={editForm.hatchNotes} onChange={e => setEF('hatchNotes', e.target.value)} className={inp} /></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditing(false)} className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-amber-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ChickenIncubator() {
  const { isAdmin, permissions } = useAuth()
  const navigate = useNavigate()
  const canEdit = isAdmin || permissions?.chickens
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  // Sheet state: { type: 'candle7'|'candle14'|'lockdown'|'recordhatch'|'detail', batch }
  const [sheet, setSheet] = useState(null)

  async function loadBatches() {
    setLoading(true)
    const { data, error } = await fetchBatches()
    if (error) toast.error('Failed to load batches: ' + error)
    setBatches(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadBatches()
  }, [])

  function handleAction(batch, action) {
    setSheet({ type: action, batch })
  }

  function handleSheetSaved() {
    setSheet(null)
    loadBatches()
  }

  const activeBatches = batches.filter(b => safeStr(b.fields['Status']) === 'Active')
  const completedBatches = batches.filter(b => {
    const s = safeStr(b.fields['Status'])
    return s === 'Hatched' || s === 'Failed'
  })

  if (loading) return <LoadingSpinner />

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-800">Incubator</h2>
          <button onClick={() => navigate('/chickens/incubator-guide')}
            className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-800">
            <BookOpen size={15} /> Guide
          </button>
        </div>
        {canEdit && (
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> New Batch
          </button>
        )}
      </div>

      {/* Empty state */}
      {batches.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <span className="text-5xl block mb-3">{'\uD83E\uDD5A'}</span>
          <p className="text-gray-500 font-medium">No batches yet</p>
          {canEdit && (
            <button onClick={() => setShowNew(true)} className="mt-4 text-sm text-amber-600 hover:text-amber-700 font-medium">
              + New Batch
            </button>
          )}
        </div>
      )}

      {/* Active */}
      {activeBatches.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {activeBatches.map(b => (
            <ActiveBatchCard key={b.id} batch={b} onAction={action => handleAction(b, action)} />
          ))}
        </div>
      )}

      {/* Completed */}
      {completedBatches.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Completed</h3>
          {completedBatches.map(b => (
            <CompletedBatchCard key={b.id} batch={b} onClick={() => setSheet({ type: 'detail', batch: b })} />
          ))}
        </div>
      )}

      {/* Sheets */}
      {showNew && <NewBatchSheet onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); loadBatches() }} />}
      {sheet?.type === 'candle7' && <CandleSheet batch={sheet.batch} candleDay={7} onClose={() => setSheet(null)} onSaved={handleSheetSaved} />}
      {sheet?.type === 'candle14' && <CandleSheet batch={sheet.batch} candleDay={14} onClose={() => setSheet(null)} onSaved={handleSheetSaved} />}
      {sheet?.type === 'lockdown' && <LockdownSheet onClose={() => setSheet(null)} />}
      {sheet?.type === 'recordhatch' && <HatchSheet batch={sheet.batch} onClose={() => setSheet(null)} onSaved={handleSheetSaved} />}
      {sheet?.type === 'detail' && <BatchDetail batch={sheet.batch} onClose={() => setSheet(null)} onSaved={handleSheetSaved} onDeleted={() => { setSheet(null); loadBatches() }} />}
    </>
  )
}
