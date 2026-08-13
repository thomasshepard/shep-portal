import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Wrench, Pencil, Plus, X, Loader2, Camera,
  ChevronLeft, ChevronRight, Trash2,
} from 'lucide-react'
import { fetchAllRecords, createRecord, updateRecord, fmtCurrency, fmtDate } from '../lib/airtable'
import {
  HC_BASE, EQUIPMENT_TABLE, COST_TABLE, CATEGORIES, VENDOR_PRESETS, STATUS_BADGE, STATUS_DOT,
  uploadFleetPhoto, parsePhotos, daysSince, STALE_DAYS,
} from '../lib/fleet'
import { EquipmentModal, StatTile, Field, inp } from './Fleet'
import LoadingSpinner from '../components/LoadingSpinner'

const safeStr = (v, fallback = '') => {
  if (v == null || v === '') return fallback
  if (typeof v === 'object') return v.name ? String(v.name) : fallback
  return String(v)
}
const safeNum = (v, fallback = 0) => {
  if (v == null || typeof v === 'object') return fallback
  const n = Number(v)
  return Number.isNaN(n) ? fallback : n
}
const arr = v => (Array.isArray(v) ? v : [])

export default function FleetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [machine, setMachine] = useState(null)
  const [costs, setCosts] = useState([])
  const [editing, setEditing] = useState(false)
  const [logging, setLogging] = useState(false)
  const [uploadingKind, setUploadingKind] = useState(null) // 'tag' | 'machine' | null
  const [lightbox, setLightbox] = useState(null) // { photos, index }
  const tagInputRef = useRef(null)
  const machineInputRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Airtable formulas read a link field as its linked records' primary-field
      // values, not record IDs — filterByFormula can't match on {id} directly.
      // Cost Entries is small, so fetch it whole and filter client-side instead.
      const [eqRes, costRes] = await Promise.all([
        fetchAllRecords(EQUIPMENT_TABLE, { filterByFormula: `RECORD_ID()='${id}'` }, HC_BASE),
        fetchAllRecords(COST_TABLE, {}, HC_BASE),
      ])
      if (eqRes.error) throw new Error(eqRes.error)
      if (costRes.error) throw new Error(costRes.error)
      setMachine((eqRes.data || [])[0] || null)
      setCosts((costRes.data || []).filter(c => arr(c.fields?.Equipment).includes(id)))
    } catch (e) {
      toast.error('Failed to load machine: ' + (e.message || 'unknown'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const photos = useMemo(() => parsePhotos(machine?.fields), [machine])
  const tagPhotos = useMemo(() => photos.filter(p => p.kind === 'tag'), [photos])
  const machinePhotos = useMemo(() => photos.filter(p => p.kind !== 'tag'), [photos])

  const sortedCosts = useMemo(
    () => costs.slice().sort((a, b) => safeStr(b.fields?.Date).localeCompare(safeStr(a.fields?.Date))),
    [costs]
  )

  const byCategory = useMemo(() => {
    const idx = {}
    costs.forEach(c => {
      const cat = safeStr(c.fields?.Category, 'Other')
      idx[cat] = (idx[cat] || 0) + safeNum(c.fields?.Cost)
    })
    return Object.entries(idx).sort((a, b) => b[1] - a[1])
  }, [costs])

  async function handlePhotoSelected(file, kind) {
    if (!file) return
    setUploadingKind(kind)
    const url = await uploadFleetPhoto(file)
    setUploadingKind(null)
    if (!url) return
    const next = [...photos, { url, kind }]
    const res = await updateRecord(EQUIPMENT_TABLE, machine.id, { 'Photo URLs': JSON.stringify(next) }, HC_BASE)
    if (res.error) return toast.error('Saved the photo but failed to attach it: ' + res.error)
    toast.success(kind === 'tag' ? 'Tag photo added' : 'Photo added')
    load()
  }

  async function removePhoto(target) {
    const next = photos.filter(p => p.url !== target.url)
    const res = await updateRecord(EQUIPMENT_TABLE, machine.id, { 'Photo URLs': JSON.stringify(next) }, HC_BASE)
    if (res.error) return toast.error('Failed to remove photo: ' + res.error)
    setLightbox(null)
    load()
  }

  if (loading) return <LoadingSpinner />
  if (!machine) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center text-sm text-gray-400">
        Machine not found. <Link to="/fleet" className="text-blue-600 hover:text-blue-800 font-medium">Back to fleet</Link>
      </div>
    )
  }

  const f = machine.fields || {}
  const status = safeStr(f.Status, 'Running')
  const staleDays = daysSince(f['Market Value Last Updated'])
  const isStale = f['Est. Market Value'] != null && staleDays != null && staleDays > STALE_DAYS

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <button onClick={() => navigate('/fleet')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> Back to fleet
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 grid place-items-center flex-shrink-0">
              <Wrench size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{safeStr(f.Name, 'Unnamed machine')}</h1>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[status] || STATUS_BADGE.Running}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] || STATUS_DOT.Running}`} />
                  {status}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {[safeStr(f.Make), safeStr(f.Model)].filter(Boolean).join(' ') || 'Make/model not set'}
                {f['Serial Number'] ? ` · SN ${safeStr(f['Serial Number'])}` : ''}
                {f.Location ? ` · ${safeStr(f.Location)}` : ''}
              </p>
              {f.Engine && <p className="text-xs text-gray-400 mt-0.5">{safeStr(f.Engine)}{f['Deck Size'] ? ` · ${safeStr(f['Deck Size'])} deck` : ''}</p>}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 flex-shrink-0"
          >
            <Pencil size={13} /> Edit
          </button>
        </div>

        {f.Notes && <p className="text-sm text-gray-600 mt-3 pt-3 border-t border-gray-100 whitespace-pre-wrap">{safeStr(f.Notes)}</p>}
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Purchase price" value={f['Purchase Price'] != null ? fmtCurrency(f['Purchase Price']) : '—'} sub={f['Purchase Date'] ? fmtDate(f['Purchase Date']) : 'Date unknown'} />
        <StatTile label="Total invested" value={fmtCurrency(safeNum(f['Total Invested']))} sub={`Purchase + ${costs.length} logged cost${costs.length === 1 ? '' : 's'}`} />
        <StatTile
          label="Est. market value"
          value={f['Est. Market Value'] != null ? fmtCurrency(f['Est. Market Value']) : '—'}
          sub={f['Market Value Last Updated'] ? `Updated ${fmtDate(f['Market Value Last Updated'])}` : 'Never estimated'}
          tone={isStale ? 'crit' : undefined}
        />
        <StatTile
          label="Est. equity"
          value={f['Est. Market Value'] != null ? fmtCurrency(safeNum(f['Est. Equity'])) : '—'}
          sub={f['Est. Market Value'] == null ? 'Set a market value to see this' : safeNum(f['Est. Equity']) >= 0 ? 'Worth more than invested' : 'Invested more than it’s worth'}
          tone={f['Est. Market Value'] == null ? undefined : safeNum(f['Est. Equity']) >= 0 ? 'good' : 'crit'}
        />
      </div>
      {isStale && (
        <p className="text-xs text-amber-600 -mt-2">
          Market value hasn't been touched in {staleDays} days — worth a quick check before trusting the equity number above.
        </p>
      )}

      {/* Photos */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800 text-sm">Photos</h2>
        </div>

        <PhotoSection
          label="Tag / serial photos"
          hint="for looking up part numbers fast"
          photos={tagPhotos}
          onAdd={() => tagInputRef.current?.click()}
          uploading={uploadingKind === 'tag'}
          onOpen={(p, i) => setLightbox({ photos: tagPhotos, index: i })}
        />
        <input ref={tagInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => handlePhotoSelected(e.target.files?.[0], 'tag')} />

        <div className="mt-4">
          <PhotoSection
            label="Machine photos"
            photos={machinePhotos}
            onAdd={() => machineInputRef.current?.click()}
            uploading={uploadingKind === 'machine'}
            onOpen={(p, i) => setLightbox({ photos: machinePhotos, index: i })}
          />
          <input ref={machineInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => handlePhotoSelected(e.target.files?.[0], 'machine')} />
        </div>
      </div>

      {/* Repair timeline */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-gray-800 text-sm">Repair &amp; cost history</h2>
          <button
            onClick={() => setLogging(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus size={13} /> Log Repair/Cost
          </button>
        </div>

        {byCategory.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex gap-4 flex-wrap">
            {byCategory.map(([cat, total]) => (
              <div key={cat} className="text-xs">
                <span className="text-gray-500">{cat}</span>{' '}
                <span className="font-semibold text-gray-800 tabular-nums">{fmtCurrency(total)}</span>
              </div>
            ))}
          </div>
        )}

        {sortedCosts.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No repairs logged yet.{' '}
            <button onClick={() => setLogging(true)} className="text-blue-600 hover:text-blue-800 font-medium">Log the first one</button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sortedCosts.map(c => {
              const cf = c.fields || {}
              const hasCost = cf.Cost != null
              return (
                <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{safeStr(cf.Description, 'Untitled')}</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">{safeStr(cf.Category, 'Other')}</span>
                      {!hasCost && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">TBD</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {cf.Date ? fmtDate(cf.Date) : 'No date'}
                      {cf.Vendor ? ` · ${safeStr(cf.Vendor)}` : ''}
                    </p>
                    {cf.Notes && <p className="text-xs text-gray-500 mt-1">{safeStr(cf.Notes)}</p>}
                  </div>
                  <p className={`text-sm font-bold tabular-nums flex-shrink-0 ${hasCost ? 'text-gray-800' : 'text-amber-600'}`}>
                    {hasCost ? fmtCurrency(cf.Cost) : 'TBD'}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editing && (
        <EquipmentModal equipment={machine} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />
      )}

      {logging && (
        <CostEntryModal machineId={machine.id} onClose={() => setLogging(false)} onSaved={() => { setLogging(false); load() }} />
      )}

      {lightbox && (
        <Lightbox
          photos={lightbox.photos}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndex={i => setLightbox(prev => ({ ...prev, index: i }))}
          onDelete={p => removePhoto(p)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function PhotoSection({ label, hint, photos, onAdd, uploading, onOpen }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-600">
          {label}{hint && <span className="font-normal text-gray-400"> — {hint}</span>}
        </p>
        <button
          onClick={onAdd}
          disabled={uploading}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
          {uploading ? 'Uploading…' : 'Add'}
        </button>
      </div>
      {photos.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-lg py-6 text-center text-xs text-gray-300">
          None yet
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, i) => (
            <button
              key={p.url}
              onClick={() => onOpen(p, i)}
              className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200"
            >
              <img src={p.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Lightbox({ photos, index, onClose, onIndex, onDelete }) {
  const photo = photos[index]
  if (!photo) return null
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white"><X size={24} /></button>
      <button
        onClick={() => onDelete(photo)}
        className="absolute top-4 left-4 flex items-center gap-1.5 text-white/70 hover:text-red-400 text-sm"
      >
        <Trash2 size={16} /> Remove
      </button>
      {index > 0 && (
        <button onClick={() => onIndex(index - 1)} className="absolute left-4 text-white/70 hover:text-white"><ChevronLeft size={28} /></button>
      )}
      {index < photos.length - 1 && (
        <button onClick={() => onIndex(index + 1)} className="absolute right-4 text-white/70 hover:text-white"><ChevronRight size={28} /></button>
      )}
      <img src={photo.url} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
    </div>
  )
}

function CostEntryModal({ machineId, onClose, onSaved }) {
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [cost, setCost] = useState('')
  const [tbd, setTbd] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [vendor, setVendor] = useState('')
  const [vendorCustom, setVendorCustom] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim()) return toast.error('What was it?')
    setSaving(true)
    const { error } = await createRecord(COST_TABLE, {
      Description: description,
      Equipment: [machineId],
      Category: category,
      Cost: tbd || cost === '' ? null : Number(cost),
      Date: date || null,
      Vendor: vendor,
      Notes: notes,
    }, HC_BASE)
    setSaving(false)
    if (error) return toast.error('Failed to log: ' + error)
    toast.success('Logged')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Log a repair or cost</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field label="Description">
            <input value={description} onChange={e => setDescription(e.target.value)} className={inp} required
              placeholder="Flywheel replacement" autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <select value={category} onChange={e => setCategory(e.target.value)} className={inp}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
            </Field>
          </div>

          <Field label="Cost">
            {tbd ? (
              <div className="flex items-center justify-between border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm text-amber-600 bg-amber-50">
                <span>Not known yet</span>
                <button type="button" onClick={() => setTbd(false)} className="text-xs font-medium underline">Enter amount</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="number" inputMode="decimal" step="0.01" min="0" value={cost}
                    onChange={e => setCost(e.target.value)} className={inp + ' pl-6'} />
                </div>
                <button type="button" onClick={() => setTbd(true)} className="text-xs font-medium text-gray-500 hover:text-gray-800 flex-shrink-0">
                  TBD
                </button>
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-1">Dropped it off and don't have a final bill yet? Mark it TBD and come back to add the amount later.</p>
          </Field>

          <Field label="Vendor">
            {vendorCustom ? (
              <input value={vendor} onChange={e => setVendor(e.target.value)} className={inp} placeholder="Vendor name" autoFocus />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {VENDOR_PRESETS.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVendor(v)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      vendor === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {v}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setVendorCustom(true); setVendor('') }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50"
                >
                  Other…
                </button>
              </div>
            )}
          </Field>

          <Field label="Notes">
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={inp} />
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />} Log it
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
