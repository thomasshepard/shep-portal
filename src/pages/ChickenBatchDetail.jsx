import { useState, useRef } from 'react'
import { ChevronLeft, X, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { CHICKENS_BASE_ID } from '../lib/airtable'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────

const PAT = import.meta.env.VITE_AIRTABLE_PAT
const BATCHES_TABLE = 'tblKomWeHkj9aGFDC'
const BASE_URL = `https://api.airtable.com/v0/${CHICKENS_BASE_ID}`

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
  return safeNum(f['Brown Eggs']) + safeNum(f['Blue/Green Eggs']) + safeNum(f['White Eggs']) + safeNum(f['Tan/Pink Eggs'])
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
    const path = `incubator/${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage.from('chicken-photos').upload(path, file, { upsert: false })
    if (error) throw error
    const { data: urlData } = supabase.storage.from('chicken-photos').getPublicUrl(data.path)
    return urlData.publicUrl
  } catch (e) {
    console.error('Photo upload failed:', e)
    toast.error('Photo upload failed')
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

export default function ChickenBatchDetail({ batch, onClose, onSaved, onDeleted }) {
  const { isAdmin, permissions } = useAuth()
  const canEdit = isAdmin || permissions?.chickens
  const f = batch.fields

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  // Edit form state
  const [editForm, setEditForm] = useState({
    rooster: safeStr(f['Rooster']),
    setDate: safeStr(f['Set Date']),
    status: safeStr(f['Status'], 'Active'),
    brown: String(safeNum(f['Brown Eggs']) || ''),
    blue: String(safeNum(f['Blue/Green Eggs']) || ''),
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
  const editTotal = (Number(editForm.brown)||0) + (Number(editForm.blue)||0) + (Number(editForm.white)||0) + (Number(editForm.tan)||0)
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

    const fields = {
      'Rooster': editForm.rooster.trim() || null,
      'Set Date': editForm.setDate || null,
      'Status': editForm.status,
      'Brown Eggs': Number(editForm.brown) || 0,
      'Blue/Green Eggs': Number(editForm.blue) || 0,
      'White Eggs': Number(editForm.white) || 0,
      'Tan/Pink Eggs': Number(editForm.tan) || 0,
      'Photo URLs': finalPhotoUrls.length > 0 ? JSON.stringify(finalPhotoUrls) : null,
      'Day 7 Notes': editForm.d7notes.trim() || null,
      'Day 14 Notes': editForm.d14notes.trim() || null,
      'Hatch Notes': editForm.hatchNotes.trim() || null,
      'Batch Notes': editForm.batchNotes.trim() || null,
    }

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

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {!editing ? (
          /* ══════════ VIEW MODE ══════════ */
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
                  {f['Rooster'] && <p className="text-sm text-gray-700">🐓 {safeStr(f['Rooster'])}</p>}
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
                  {safeNum(f['Brown Eggs']) > 0 && (
                    <span className="text-sm bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-lg">🟤 {safeNum(f['Brown Eggs'])}</span>
                  )}
                  {safeNum(f['Blue/Green Eggs']) > 0 && (
                    <span className="text-sm bg-green-50 border border-green-100 px-2.5 py-1 rounded-lg">🟢 {safeNum(f['Blue/Green Eggs'])}</span>
                  )}
                  {safeNum(f['White Eggs']) > 0 && (
                    <span className="text-sm bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg">⬜ {safeNum(f['White Eggs'])}</span>
                  )}
                  {safeNum(f['Tan/Pink Eggs']) > 0 && (
                    <span className="text-sm bg-pink-50 border border-pink-100 px-2.5 py-1 rounded-lg">🩷 {safeNum(f['Tan/Pink Eggs'])}</span>
                  )}
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

              {/* MeeF settings (Active only) */}
              {isActive && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-3">MeeF Settings</p>
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <span className="text-base leading-none mt-0.5">🌡️</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">Days 1–18</p>
                        <p className="text-sm text-gray-600">99–99.5°F · 45–55% RH · Flip ON</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="text-base leading-none mt-0.5">🔒</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">Day 18+ (Lockdown)</p>
                        <p className="text-sm text-gray-600">98.5–99°F · 65–70% RH · Flip OFF</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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

            </div>
          </div>

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

            {/* Rooster */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rooster</label>
              <input value={editForm.rooster} onChange={e => setEF('rooster', e.target.value)} className={inp} placeholder="e.g. Big Red" />
            </div>

            {/* Set Date */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Set Date</label>
              <input type="date" value={editForm.setDate} onChange={e => setEF('setDate', e.target.value)} className={inp} />
              {editForm.setDate && (
                <p className="text-xs text-gray-400 mt-1">Expected hatch: {fmtDate(expectedHatchDate(editForm.setDate))}</p>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select value={editForm.status} onChange={e => setEF('status', e.target.value)} className={inp}>
                <option>Active</option>
                <option>Hatched</option>
                <option>Failed</option>
              </select>
            </div>

            {/* Egg counts */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Egg Counts</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">🟤 Brown</label>
                  <input type="number" min={0} value={editForm.brown} onChange={e => setEF('brown', e.target.value)} className={inp + ' text-center'} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">🟢 Blue/Green</label>
                  <input type="number" min={0} value={editForm.blue} onChange={e => setEF('blue', e.target.value)} className={inp + ' text-center'} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">⬜ White</label>
                  <input type="number" min={0} value={editForm.white} onChange={e => setEF('white', e.target.value)} className={inp + ' text-center'} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">🩷 Tan/Pink</label>
                  <input type="number" min={0} value={editForm.tan} onChange={e => setEF('tan', e.target.value)} className={inp + ' text-center'} placeholder="0" />
                </div>
              </div>
              {editTotal > 0 && (
                <p className="text-sm text-gray-600 mt-2 text-center">{editTotal} eggs total</p>
              )}
            </div>

            {/* Day 7 Candle */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Day 7 Candle</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Developing</label>
                  <input type="number" min={0} value={editForm.d7dev} onChange={e => setEF('d7dev', e.target.value)} className={inp} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Removed</label>
                  <input type="number" min={0} value={editForm.d7rem} onChange={e => setEF('d7rem', e.target.value)} className={inp} placeholder="0" />
                </div>
              </div>
              <div className="mt-2">
                <label className="text-xs text-gray-400 mb-1 block">Notes</label>
                <input value={editForm.d7notes} onChange={e => setEF('d7notes', e.target.value)} className={inp} placeholder="Optional notes" />
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5 mt-2">
                💡 Remove quitters and clears — they'll rot and contaminate the incubator.
              </p>
            </div>

            {/* Day 14 Candle */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Day 14 Candle</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Developing</label>
                  <input type="number" min={0} value={editForm.d14dev} onChange={e => setEF('d14dev', e.target.value)} className={inp} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Removed</label>
                  <input type="number" min={0} value={editForm.d14rem} onChange={e => setEF('d14rem', e.target.value)} className={inp} placeholder="0" />
                </div>
              </div>
              <div className="mt-2">
                <label className="text-xs text-gray-400 mb-1 block">Notes</label>
                <input value={editForm.d14notes} onChange={e => setEF('d14notes', e.target.value)} className={inp} placeholder="Optional notes" />
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5 mt-2">
                💡 Remove quitters and clears — they'll rot and contaminate the incubator.
              </p>
            </div>

            {/* Hatch Results */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Hatch Results</label>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Chicks Hatched</label>
                <input type="number" min={0} value={editForm.chicksHatched} onChange={e => setEF('chicksHatched', e.target.value)} className={inp} placeholder="0" />
              </div>
              {editBm && editForm.chicksHatched !== '' && (
                <p className="text-sm text-gray-600 mt-1">
                  Hatch rate: {editPct}% <span className={`font-medium ${editBm.color}`}>{editBm.label}</span>
                </p>
              )}
              <div className="mt-2">
                <label className="text-xs text-gray-400 mb-1 block">Hatch Notes</label>
                <textarea rows={2} value={editForm.hatchNotes} onChange={e => setEF('hatchNotes', e.target.value)} className={inp + ' resize-none'} placeholder="Optional notes" />
              </div>
            </div>

            {/* Batch Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Batch Notes</label>
              <textarea rows={3} value={editForm.batchNotes} onChange={e => setEF('batchNotes', e.target.value)} className={inp + ' resize-none'} placeholder="Power outages, humidity issues, anything notable..." />
            </div>

            {/* Delete */}
            {canEdit && (
              <div className="pt-4 border-t border-gray-100">
                {!confirmDelete ? (
                  <button type="button" onClick={() => setConfirmDelete(true)}
                    className="text-sm text-red-500 hover:text-red-700 w-full text-center py-2">
                    Delete Batch
                  </button>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-medium text-red-800">Delete this batch?</p>
                    <p className="text-xs text-red-600">
                      This will permanently remove &ldquo;{formatBatchName(safeStr(f['Batch Name']))}&rdquo; and cannot be undone.
                    </p>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setConfirmDelete(false)}
                        className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                        Cancel
                      </button>
                      <button type="button" onClick={handleDelete} disabled={deleting}
                        className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
                        {deleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
