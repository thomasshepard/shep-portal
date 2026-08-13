import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Wrench, Pencil, Plus, X, Loader2, Camera,
  ChevronLeft, ChevronRight, Trash2, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { fetchAllRecords, createRecord, updateRecord, deleteRecord, fmtCurrency, fmtDate } from '../lib/airtable'
import {
  FLEET_BASE_ID, EQUIPMENT_TABLE, COST_TABLE, COST_CATEGORIES, VENDOR_PRESETS, STATUS_BADGE, STATUS_DOT,
  uploadFleetPhoto, uploadFleetDocument, parsePhotos, parseDocuments, daysSince, STALE_DAYS,
  MAINT_TABLE, MAINT_CATEGORIES, MAINT_PRIORITIES, MAINT_INTERVAL_TYPES,
  MAINT_CATEGORY_BADGE, MAINT_PRIORITY_BADGE, computeNextDueDate, maintenanceUrgency, todayISO,
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
const parseDate = str => {
  if (!str) return null
  const d = new Date(`${String(str).slice(0, 10)}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}
const MAINT_URGENCY_RANK = { overdue: 0, dueSoon: 1, scheduled: 2, watch: 3, done: 4 }
const READING_STALE_DAYS = 90

export default function FleetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [machine, setMachine] = useState(null)
  const [costs, setCosts] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [editing, setEditing] = useState(false)
  const [costModal, setCostModal] = useState(null) // null | 'new' | costEntryRecord
  const [maintModal, setMaintModal] = useState(null) // null | 'new' | maintenanceItemRecord
  const [showAllMaint, setShowAllMaint] = useState(false)
  const [uploadingKind, setUploadingKind] = useState(null) // 'tag' | 'machine' | null
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [lightbox, setLightbox] = useState(null) // { photos, index }
  const tagInputRef = useRef(null)
  const machineInputRef = useRef(null)
  const docInputRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Airtable formulas read a link field as its linked records' primary-field
      // values, not record IDs — filterByFormula can't match on {id} directly.
      // Cost Entries / Maintenance Items are small, so fetch whole and filter client-side.
      const [eqRes, costRes, maintRes] = await Promise.all([
        fetchAllRecords(EQUIPMENT_TABLE, { filterByFormula: `RECORD_ID()='${id}'` }, FLEET_BASE_ID),
        fetchAllRecords(COST_TABLE, {}, FLEET_BASE_ID),
        fetchAllRecords(MAINT_TABLE, {}, FLEET_BASE_ID),
      ])
      if (eqRes.error) throw new Error(eqRes.error)
      if (costRes.error) throw new Error(costRes.error)
      if (maintRes.error) throw new Error(maintRes.error)
      setMachine((eqRes.data || [])[0] || null)
      setCosts((costRes.data || []).filter(c => arr(c.fields?.Equipment).includes(id)))
      setMaintenance((maintRes.data || []).filter(m => arr(m.fields?.Equipment).includes(id)))
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
  const documents = useMemo(() => parseDocuments(machine?.fields), [machine])

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

  const sortedMaintenance = useMemo(() => {
    return maintenance
      .map(m => ({ item: m, t: maintenanceUrgency(m.fields || {}) }))
      .sort((a, b) => {
        const rankDiff = MAINT_URGENCY_RANK[a.t.state] - MAINT_URGENCY_RANK[b.t.state]
        if (rankDiff !== 0) return rankDiff
        return (a.t.days ?? 999) - (b.t.days ?? 999)
      })
  }, [maintenance])
  const urgentMaintenance = useMemo(
    () => sortedMaintenance.filter(x => x.t.state === 'overdue' || x.t.state === 'dueSoon'),
    [sortedMaintenance]
  )
  const restMaintenance = useMemo(
    () => sortedMaintenance.filter(x => x.t.state !== 'overdue' && x.t.state !== 'dueSoon'),
    [sortedMaintenance]
  )

  async function markDone(item) {
    const f2 = item.fields || {}
    const fields = { 'Last Done Date': todayISO() }
    if (f2['Interval Type'] === 'One-time') {
      fields.Status = 'Done'
      fields['Next Due Date'] = null
    } else {
      fields.Status = 'Active'
      fields['Next Due Date'] = computeNextDueDate({ ...f2, 'Last Done Date': todayISO() })
    }
    const { error } = await updateRecord(MAINT_TABLE, item.id, fields, FLEET_BASE_ID)
    if (error) return toast.error('Failed to update: ' + error)
    toast.success('Marked done')
    load()
  }

  async function flagNeeded(item) {
    const { error } = await updateRecord(MAINT_TABLE, item.id, { Status: 'Active', 'Next Due Date': todayISO() }, FLEET_BASE_ID)
    if (error) return toast.error('Failed to flag: ' + error)
    toast.success('Flagged — showing as due')
    load()
  }

  async function handlePhotoSelected(file, kind) {
    if (!file) return
    setUploadingKind(kind)
    const url = await uploadFleetPhoto(file)
    setUploadingKind(null)
    if (!url) return
    const next = [...photos, { url, kind }]
    const res = await updateRecord(EQUIPMENT_TABLE, machine.id, { 'Photo URLs': JSON.stringify(next) }, FLEET_BASE_ID)
    if (res.error) return toast.error('Saved the photo but failed to attach it: ' + res.error)
    toast.success(kind === 'tag' ? 'Tag photo added' : 'Photo added')
    load()
  }

  async function removePhoto(target) {
    const next = photos.filter(p => p.url !== target.url)
    const res = await updateRecord(EQUIPMENT_TABLE, machine.id, { 'Photo URLs': JSON.stringify(next) }, FLEET_BASE_ID)
    if (res.error) return toast.error('Failed to remove photo: ' + res.error)
    setLightbox(null)
    load()
  }

  async function handleDocumentSelected(file) {
    if (!file) return
    setUploadingDoc(true)
    const url = await uploadFleetDocument(file)
    setUploadingDoc(false)
    if (!url) return
    const next = [...documents, { url, label: file.name }]
    const res = await updateRecord(EQUIPMENT_TABLE, machine.id, { 'Document URLs': JSON.stringify(next) }, FLEET_BASE_ID)
    if (res.error) return toast.error('Saved the file but failed to attach it: ' + res.error)
    toast.success('Document added')
    load()
  }

  async function removeDocument(target) {
    const next = documents.filter(d => d.url !== target.url)
    const res = await updateRecord(EQUIPMENT_TABLE, machine.id, { 'Document URLs': JSON.stringify(next) }, FLEET_BASE_ID)
    if (res.error) return toast.error('Failed to remove document: ' + res.error)
    load()
  }

  if (loading) return <LoadingSpinner />
  if (!machine) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center text-sm text-gray-400">
        Asset not found. <Link to="/fleet" className="text-blue-600 hover:text-blue-800 font-medium">Back to fleet</Link>
      </div>
    )
  }

  const f = machine.fields || {}
  const status = safeStr(f.Status, 'Running')
  const staleDays = daysSince(f['Market Value Last Updated'])
  const isStale = f['Est. Market Value'] != null && staleDays != null && staleDays > STALE_DAYS
  const category = safeStr(f.Category)
  const isVehicleLike = category === 'Vehicle' || category === 'Trailer'
  const readingStaleDays = daysSince(f['Reading Last Updated'])
  const readingIsStale = (f['Current Mileage'] != null || f['Current Engine Hours'] != null) && readingStaleDays != null && readingStaleDays > READING_STALE_DAYS
  const regExpiry = parseDate(f['Registration Expiry'])
  const regExpired = regExpiry && regExpiry < new Date()

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
                <h1 className="text-xl font-bold text-gray-900">{safeStr(f.Name, 'Unnamed asset')}</h1>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[status] || STATUS_BADGE.Running}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] || STATUS_DOT.Running}`} />
                  {status}
                </span>
                {category && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">{category}</span>}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {[safeStr(f.Make), safeStr(f.Model)].filter(Boolean).join(' ') || 'Make/model not set'}
                {f['Serial Number'] ? ` · ${isVehicleLike ? 'VIN' : 'SN'} ${safeStr(f['Serial Number'])}` : ''}
                {f['License Plate'] ? ` · Plate ${safeStr(f['License Plate'])}` : ''}
                {f.Location ? ` · ${safeStr(f.Location)}` : ''}
              </p>
              {f.Engine && <p className="text-xs text-gray-400 mt-0.5">{safeStr(f.Engine)}{f['Deck Size'] ? ` · ${safeStr(f['Deck Size'])} deck` : ''}</p>}
              {(f['Current Mileage'] != null || f['Current Engine Hours'] != null) && (
                <p className={`text-xs mt-0.5 ${readingIsStale ? 'text-amber-600' : 'text-gray-400'}`}>
                  {f['Current Mileage'] != null && `${Number(f['Current Mileage']).toLocaleString()} mi`}
                  {f['Current Mileage'] != null && f['Current Engine Hours'] != null && ' · '}
                  {f['Current Engine Hours'] != null && `${f['Current Engine Hours']} hrs`}
                  {' — '}{f['Reading Last Updated'] ? `updated ${fmtDate(f['Reading Last Updated'])}` : 'no update date'}
                  {readingIsStale ? ` (${readingStaleDays}d ago)` : ''}
                </p>
              )}
              {f['Registration Expiry'] && (
                <p className={`text-xs mt-0.5 ${regExpired ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                  Registration {regExpired ? 'expired' : 'expires'} {fmtDate(f['Registration Expiry'])}
                  {f['Insurance Provider'] ? ` · Insured with ${safeStr(f['Insurance Provider'])}` : ''}
                </p>
              )}
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

      {/* Maintenance */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-gray-800 text-sm">Maintenance</h2>
          <button
            onClick={() => setMaintModal('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus size={13} /> Add Item
          </button>
        </div>

        {sortedMaintenance.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No maintenance tracked yet.{' '}
            <button onClick={() => setMaintModal('new')} className="text-blue-600 hover:text-blue-800 font-medium">Add the first item</button>
          </div>
        ) : (
          <>
            {urgentMaintenance.length === 0 && (
              <div className="px-4 py-3 text-sm text-green-600 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Nothing overdue or due soon
              </div>
            )}
            <div className="divide-y divide-gray-100">
              {urgentMaintenance.map(({ item, t }) => (
                <MaintenanceRow key={item.id} item={item} t={t} onOpen={() => setMaintModal(item)} onMarkDone={() => markDone(item)} />
              ))}
            </div>

            {restMaintenance.length > 0 && (
              <>
                <button
                  onClick={() => setShowAllMaint(o => !o)}
                  className="w-full px-4 py-2 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 border-t border-gray-100"
                >
                  {showAllMaint ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showAllMaint ? 'Hide' : `Show ${restMaintenance.length} more`} (scheduled / watch list / done)
                </button>
                {showAllMaint && (
                  <div className="divide-y divide-gray-100 border-t border-gray-100">
                    {restMaintenance.map(({ item, t }) => (
                      <MaintenanceRow
                        key={item.id}
                        item={item}
                        t={t}
                        onOpen={() => setMaintModal(item)}
                        onMarkDone={() => markDone(item)}
                        onFlagNeeded={t.state === 'watch' ? () => flagNeeded(item) : undefined}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

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

      {/* Documents — title/registration, mainly relevant for vehicles/trailers */}
      {(isVehicleLike || documents.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800 text-sm">Documents</h2>
            <button
              onClick={() => docInputRef.current?.click()}
              disabled={uploadingDoc}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {uploadingDoc ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
              {uploadingDoc ? 'Uploading…' : 'Add'}
            </button>
            <input ref={docInputRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => handleDocumentSelected(e.target.files?.[0])} />
          </div>
          {documents.length === 0 ? (
            <p className="text-xs text-gray-300">Title, registration, insurance card — none uploaded yet.</p>
          ) : (
            <div className="space-y-1.5">
              {documents.map(d => (
                <div key={d.url} className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2">
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:text-blue-800 truncate flex-1 min-w-0">
                    {safeStr(d.label) || 'Document'}
                  </a>
                  <button onClick={() => removeDocument(d)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Repair timeline */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-gray-800 text-sm">Repair &amp; cost history</h2>
          <button
            onClick={() => setCostModal('new')}
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
            <button onClick={() => setCostModal('new')} className="text-blue-600 hover:text-blue-800 font-medium">Log the first one</button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sortedCosts.map(c => {
              const cf = c.fields || {}
              const hasCost = cf.Cost != null
              return (
                <button
                  key={c.id}
                  onClick={() => setCostModal(c)}
                  className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
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
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <p className={`text-sm font-bold tabular-nums ${hasCost ? 'text-gray-800' : 'text-amber-600'}`}>
                      {hasCost ? fmtCurrency(cf.Cost) : 'TBD'}
                    </p>
                    <Pencil size={12} className="text-gray-300" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {editing && (
        <EquipmentModal equipment={machine} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />
      )}

      {costModal && (
        <CostEntryModal
          machineId={machine.id}
          entry={costModal === 'new' ? null : costModal}
          onClose={() => setCostModal(null)}
          onSaved={() => { setCostModal(null); load() }}
        />
      )}

      {maintModal && (
        <MaintenanceItemModal
          machineId={machine.id}
          entry={maintModal === 'new' ? null : maintModal}
          onClose={() => setMaintModal(null)}
          onSaved={() => { setMaintModal(null); load() }}
        />
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

function CostEntryModal({ machineId, entry, onClose, onSaved }) {
  const ef = entry?.fields || {}
  const [description, setDescription] = useState(safeStr(ef.Description))
  const [category, setCategory] = useState(safeStr(ef.Category, COST_CATEGORIES[0]))
  const [cost, setCost] = useState(ef.Cost != null ? String(ef.Cost) : '')
  const [tbd, setTbd] = useState(!!entry && ef.Cost == null)
  const [date, setDate] = useState(entry ? safeStr(ef.Date) : new Date().toISOString().slice(0, 10))
  const [vendor, setVendor] = useState(safeStr(ef.Vendor))
  const [vendorCustom, setVendorCustom] = useState(!!ef.Vendor && !VENDOR_PRESETS.includes(safeStr(ef.Vendor)))
  const [notes, setNotes] = useState(safeStr(ef.Notes))
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim()) return toast.error('What was it?')
    setSaving(true)
    const fields = {
      Description: description,
      Equipment: [machineId],
      Category: category,
      Cost: tbd || cost === '' ? null : Number(cost),
      Date: date || null,
      Vendor: vendor,
      Notes: notes,
    }
    const { error } = entry
      ? await updateRecord(COST_TABLE, entry.id, fields, FLEET_BASE_ID)
      : await createRecord(COST_TABLE, fields, FLEET_BASE_ID)
    setSaving(false)
    if (error) return toast.error('Failed to save: ' + error)
    toast.success(entry ? 'Saved' : 'Logged')
    onSaved()
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    const { error } = await deleteRecord(COST_TABLE, entry.id, FLEET_BASE_ID)
    setDeleting(false)
    if (error) return toast.error('Failed to delete: ' + error)
    toast.success('Deleted')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <h2 className="font-semibold text-gray-900">{entry ? 'Edit repair/cost' : 'Log a repair or cost'}</h2>
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
                {COST_CATEGORIES.map(c => <option key={c}>{c}</option>)}
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

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              {entry && (
                <>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      confirmDelete ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-red-600'
                    }`}
                  >
                    {deleting ? 'Deleting…' : confirmDelete ? 'Confirm delete' : 'Delete'}
                  </button>
                  {confirmDelete && (
                    <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-700">
                      Cancel
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />} {entry ? 'Save' : 'Log it'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const MAINT_URGENCY_TEXT = { crit: 'text-red-600', warn: 'text-amber-600', ok: 'text-gray-500', none: 'text-gray-400' }

function MaintenanceRow({ item, t, onOpen, onMarkDone, onFlagNeeded }) {
  const f = item.fields || {}
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-gray-900">{f.Name || 'Untitled'}</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${MAINT_CATEGORY_BADGE[f.Category] || MAINT_CATEGORY_BADGE.Preventative}`}>
            {f.Category || '—'}
          </span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${MAINT_PRIORITY_BADGE[f.Priority] || MAINT_PRIORITY_BADGE.Low}`}>
            {f.Priority || '—'}
          </span>
        </div>
        <p className={`text-xs mt-0.5 ${MAINT_URGENCY_TEXT[t.urgency]}`}>{t.label}</p>
      </button>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {onFlagNeeded && (
          <button
            onClick={onFlagNeeded}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100"
          >
            <AlertTriangle size={11} /> Flag
          </button>
        )}
        {t.state !== 'done' && t.state !== 'watch' && (
          <button
            onClick={onMarkDone}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-green-50 text-green-700 hover:bg-green-100"
          >
            <CheckCircle2 size={11} /> Done
          </button>
        )}
      </div>
    </div>
  )
}

function MaintenanceItemModal({ machineId, entry, onClose, onSaved }) {
  const ef = entry?.fields || {}
  const [name, setName] = useState(safeStr(ef.Name))
  const [category, setCategory] = useState(safeStr(ef.Category, 'Preventative'))
  const [priority, setPriority] = useState(safeStr(ef.Priority, 'Medium'))
  const [intervalType, setIntervalType] = useState(safeStr(ef['Interval Type'], 'Calendar Days'))
  const [intervalValue, setIntervalValue] = useState(ef['Interval Value'] != null ? String(ef['Interval Value']) : '')
  const [seasonTrigger, setSeasonTrigger] = useState(safeStr(ef['Season Trigger']))
  const [lastDoneDate, setLastDoneDate] = useState(safeStr(ef['Last Done Date']))
  const [manualNextDue, setManualNextDue] = useState(safeStr(ef['Next Due Date']))
  const [activeIssue, setActiveIssue] = useState(entry ? safeStr(ef.Status) === 'Active' : false)
  const [notes, setNotes] = useState(safeStr(ef.Notes))
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return toast.error('Name it')
    setSaving(true)

    let status = 'Active'
    let nextDue = null

    if (category === 'Reactive' && !activeIssue) {
      // Dormant — sits on the watch list until Thomas flags an actual symptom.
      status = 'Watch List'
      nextDue = null
    } else if (intervalType === 'One-time') {
      status = 'Active'
      nextDue = manualNextDue || todayISO()
    } else {
      nextDue = computeNextDueDate({
        'Interval Type': intervalType,
        'Interval Value': intervalValue,
        'Season Trigger': seasonTrigger,
        'Last Done Date': lastDoneDate,
      })
      status = 'Active'
      // Unparseable Season Trigger etc. — still surface it as due today rather
      // than silently vanishing with no due date.
      if (!nextDue) nextDue = todayISO()
    }

    const fields = {
      Name: name,
      Equipment: [machineId],
      Category: category,
      Priority: priority,
      'Interval Type': intervalType,
      'Interval Value': intervalType === 'Calendar Days' ? (Number(intervalValue) || null) : null,
      'Season Trigger': intervalType === 'Season' ? seasonTrigger : '',
      'Last Done Date': lastDoneDate || null,
      'Next Due Date': nextDue,
      Status: status,
      Notes: notes,
    }

    const { error } = entry
      ? await updateRecord(MAINT_TABLE, entry.id, fields, FLEET_BASE_ID)
      : await createRecord(MAINT_TABLE, fields, FLEET_BASE_ID)
    setSaving(false)
    if (error) return toast.error('Failed to save: ' + error)
    toast.success(entry ? 'Saved' : 'Added')
    onSaved()
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    const { error } = await deleteRecord(MAINT_TABLE, entry.id, FLEET_BASE_ID)
    setDeleting(false)
    if (error) return toast.error('Failed to delete: ' + error)
    toast.success('Deleted')
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <h2 className="font-semibold text-gray-900">{entry ? 'Edit maintenance item' : 'Add maintenance item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field label="Name">
            <input value={name} onChange={e => setName(e.target.value)} className={inp} required
              placeholder="Oil &amp; filter change" autoFocus />
          </Field>

          <Field label="Category">
            <div className="flex gap-2">
              {MAINT_CATEGORIES.map(c => (
                <button
                  key={c} type="button" onClick={() => setCategory(c)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    category === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Priority">
            <div className="flex gap-2">
              {MAINT_PRIORITIES.map(p => (
                <button
                  key={p} type="button" onClick={() => setPriority(p)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    priority === p ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Interval">
            <select value={intervalType} onChange={e => setIntervalType(e.target.value)} className={inp}>
              {MAINT_INTERVAL_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>

          {intervalType === 'Calendar Days' && (
            <Field label="Every how many days">
              <input type="number" inputMode="numeric" min="1" value={intervalValue}
                onChange={e => setIntervalValue(e.target.value)} className={inp} placeholder="50" />
            </Field>
          )}
          {intervalType === 'Season' && (
            <Field label="Month + day" hint='e.g. "March 1"'>
              <input value={seasonTrigger} onChange={e => setSeasonTrigger(e.target.value)} className={inp} placeholder="March 1" />
            </Field>
          )}
          {intervalType === 'One-time' && (
            <Field label="Due date">
              <input type="date" value={manualNextDue} onChange={e => setManualNextDue(e.target.value)} className={inp} />
            </Field>
          )}

          <Field label="Last done" hint="leave blank if never done">
            <input type="date" value={lastDoneDate} onChange={e => setLastDoneDate(e.target.value)} className={inp} />
          </Field>

          {category === 'Reactive' && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={activeIssue} onChange={e => setActiveIssue(e.target.checked)} className="rounded" />
              Active issue right now — otherwise it sits on the watch list until flagged
            </label>
          )}

          <Field label="Notes">
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={inp} />
          </Field>

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              {entry && (
                <>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      confirmDelete ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-red-600'
                    }`}
                  >
                    {deleting ? 'Deleting…' : confirmDelete ? 'Confirm delete' : 'Delete'}
                  </button>
                  {confirmDelete && (
                    <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-700">
                      Cancel
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />} {entry ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
