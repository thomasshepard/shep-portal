import { useState, useEffect, useCallback } from 'react'
import { Save, SkipForward, RefreshCw, ChevronDown } from 'lucide-react'
import { fetchAllRecords, updateRecord, PM_BASE_ID, CHICKENS_BASE_ID } from '../lib/airtable'
import toast from 'react-hot-toast'

const safeStr    = (v, fb = '') => (v == null ? fb : String(v))
const safeNum    = v => (v == null ? 0 : Number(v) || 0)

const LLC_BASE_ID    = import.meta.env.VITE_AIRTABLE_BASE_ID
const SETUP_FILTER   = "OR({Triage Status}='Off-Triage',{Triage Status}='')"

const SOURCES = [
  { key: 'Property',    table: 'Property',            baseId: PM_BASE_ID       },
  { key: 'Lease',       table: 'Lease Agreements',     baseId: PM_BASE_ID       },
  { key: 'Maintenance', table: 'Maintenance Requests', baseId: PM_BASE_ID       },
  { key: 'Flock',       table: 'Flock',                baseId: CHICKENS_BASE_ID },
  { key: 'LLC',         table: 'LLCs',                 baseId: LLC_BASE_ID      },
]

const TRIAGE_STATUS_OPTIONS = ['', 'Initiative', 'Rhythm', 'Watch', 'Done', 'Off-Triage']
const HANDLER_OPTIONS       = ['', 'Thomas', 'Janine', 'Gabrielle', 'Anthony', 'Subcontractor', 'Decide']

function getLabel(sourceKey, fields) {
  const f = fields || {}
  switch (sourceKey) {
    case 'Property':    return safeStr(f['Property Name'] || f['Address'] || f['Name'])
    case 'Lease':       return safeStr(f['Name'] || f['Lease ID'])
    case 'Maintenance': return safeStr(f['Summary'] || f['Description'] || f['Issue'] || f['Name'])
    case 'Flock':       return safeStr(f['Name'])
    case 'LLC':         return safeStr(f['LLC Name'] || f['Name'])
    default:            return ''
  }
}

function makeRow(sourceKey, record, baseId, table) {
  const f = record.fields || {}
  return {
    id:              record.id,
    baseId,
    table,
    label:           getLabel(sourceKey, f) || record.id,
    triageStatus:    safeStr(f['Triage Status']),
    expectedDate:    safeStr(f['Expected Next Checkpoint']),
    whatShouldBeTrue:safeStr(f['What Should Be True']),
    lastObserved:    safeStr(f['Last Observed']),
    lastObservedDate:safeStr(f['Last Observed Date']),
    stalenessDays:   safeNum(f['Staleness Days']),
    handler:         safeStr(f['Default Handler']),
    consequence:     safeStr(f['Consequence']),
    dirty:           false,
    saving:          false,
    saved:           false,
  }
}

const inp  = 'w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
const sel  = inp + ' bg-white'

export default function TriageSetup() {
  const [activeTab, setActiveTab] = useState(0)
  const [tabData, setTabData]     = useState(SOURCES.map(() => ({ loading: false, rows: [] })))
  const [savingAll, setSavingAll] = useState(false)
  const [skippingAll, setSkippingAll] = useState(false)

  const loadTab = useCallback(async (idx) => {
    const src = SOURCES[idx]
    setTabData(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], loading: true }
      return next
    })
    try {
      const { data, error } = await fetchAllRecords(src.table, { filterByFormula: SETUP_FILTER }, src.baseId)
      if (error) throw new Error(error)
      const rows = (data || []).map(r => makeRow(src.key, r, src.baseId, src.table))
      setTabData(prev => {
        const next = [...prev]
        next[idx] = { loading: false, rows }
        return next
      })
    } catch (err) {
      toast.error(`Failed to load ${src.key}: ${err.message}`)
      setTabData(prev => {
        const next = [...prev]
        next[idx] = { loading: false, rows: [] }
        return next
      })
    }
  }, [])

  useEffect(() => { loadTab(activeTab) }, [activeTab, loadTab])

  function updateRow(idx, rowId, patch) {
    setTabData(prev => {
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        rows: next[idx].rows.map(r => r.id === rowId ? { ...r, ...patch, dirty: true } : r),
      }
      return next
    })
  }

  async function saveRow(idx, rowId) {
    const row = tabData[idx].rows.find(r => r.id === rowId)
    if (!row) return
    setTabData(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], rows: next[idx].rows.map(r => r.id === rowId ? { ...r, saving: true } : r) }
      return next
    })
    try {
      const fields = buildFields(row)
      const { error } = await updateRecord(row.table, rowId, fields, row.baseId)
      if (error) throw new Error(error)
      setTabData(prev => {
        const next = [...prev]
        next[idx] = { ...next[idx], rows: next[idx].rows.map(r => r.id === rowId ? { ...r, saving: false, dirty: false, saved: true } : r) }
        return next
      })
      toast.success(`Saved: ${row.label}`)
    } catch (err) {
      toast.error(`Save failed: ${err.message}`)
      setTabData(prev => {
        const next = [...prev]
        next[idx] = { ...next[idx], rows: next[idx].rows.map(r => r.id === rowId ? { ...r, saving: false } : r) }
        return next
      })
    }
  }

  async function saveAll(idx) {
    const dirty = tabData[idx].rows.filter(r => r.dirty)
    if (!dirty.length) return toast('No changes to save.', { icon: 'ℹ️' })
    setSavingAll(true)
    let saved = 0, failed = 0
    for (const row of dirty) {
      try {
        const { error: e } = await updateRecord(row.table, row.id, buildFields(row), row.baseId)
        if (e) throw new Error(e)
        setTabData(prev => {
          const next = [...prev]
          next[idx] = { ...next[idx], rows: next[idx].rows.map(r => r.id === row.id ? { ...r, dirty: false, saved: true } : r) }
          return next
        })
        saved++
      } catch { failed++ }
    }
    setSavingAll(false)
    if (failed) toast.error(`${saved} saved, ${failed} failed`)
    else toast.success(`${saved} records saved`)
  }

  async function skipAll(idx) {
    const rows = tabData[idx].rows
    if (!rows.length) return
    if (!confirm(`Mark all ${rows.length} records as Off-Triage?`)) return
    setSkippingAll(true)
    let skipped = 0, failed = 0
    for (const row of rows) {
      try {
        const { error: e } = await updateRecord(row.table, row.id, { 'Triage Status': 'Off-Triage' }, row.baseId)
        if (e) throw new Error(e)
        skipped++
      } catch { failed++ }
    }
    setSkippingAll(false)
    if (failed) toast.error(`${skipped} skipped, ${failed} failed`)
    else toast.success(`${skipped} records marked Off-Triage`)
    loadTab(idx)
  }

  const tab = tabData[activeTab]

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Triage Setup</h1>
        <p className="text-sm text-gray-500 mt-1">Tag all un-triaged records. Records with a Triage Status will not appear here.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {SOURCES.map((src, i) => (
          <button
            key={src.key}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === i
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {src.key}
            {tabData[i].rows.length > 0 && (
              <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5">
                {tabData[i].rows.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => saveAll(activeTab)}
          disabled={savingAll || !tab.rows.some(r => r.dirty)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={14} />
          {savingAll ? 'Saving…' : 'Save All'}
        </button>
        <button
          onClick={() => skipAll(activeTab)}
          disabled={skippingAll || tab.loading || !tab.rows.length}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 disabled:opacity-50"
        >
          <SkipForward size={14} />
          {skippingAll ? 'Skipping…' : 'Skip All (Off-Triage)'}
        </button>
        <button
          onClick={() => loadTab(activeTab)}
          disabled={tab.loading}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 ml-auto"
        >
          <RefreshCw size={14} className={tab.loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Table */}
      {tab.loading ? (
        <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
      ) : tab.rows.length === 0 ? (
        <div className="text-sm text-green-600 py-8 text-center font-medium">All records in this table have been triaged.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600 min-w-[160px]">Record</th>
                  <th className="px-3 py-3 font-medium text-gray-600 min-w-[130px]">Triage Status</th>
                  <th className="px-3 py-3 font-medium text-gray-600 min-w-[140px]">Expected Date</th>
                  <th className="px-3 py-3 font-medium text-gray-600 min-w-[200px]">What Should Be True</th>
                  <th className="px-3 py-3 font-medium text-gray-600 min-w-[160px]">Last Observed</th>
                  <th className="px-3 py-3 font-medium text-gray-600 min-w-[140px]">Last Obs Date</th>
                  <th className="px-3 py-3 font-medium text-gray-600 min-w-[80px]">Staleness Days</th>
                  <th className="px-3 py-3 font-medium text-gray-600 min-w-[130px]">Handler</th>
                  <th className="px-3 py-3 font-medium text-gray-600 min-w-[160px]">Consequence</th>
                  <th className="px-3 py-3 font-medium text-gray-600 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tab.rows.map(row => (
                  <SetupRow
                    key={row.id}
                    row={row}
                    onChange={patch => updateRow(activeTab, row.id, patch)}
                    onSave={() => saveRow(activeTab, row.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function SetupRow({ row, onChange, onSave }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr className={`hover:bg-gray-50 ${row.dirty ? 'bg-amber-50' : row.saved ? 'bg-green-50' : ''}`}>
        <td className="px-4 py-2">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600">
              <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            <span className="font-medium text-gray-800 text-xs leading-snug">{row.label || row.id}</span>
          </div>
        </td>
        <td className="px-3 py-2">
          <select value={row.triageStatus} onChange={e => onChange({ triageStatus: e.target.value })} className={sel}>
            {TRIAGE_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o || '(none)'}</option>)}
          </select>
        </td>
        <td className="px-3 py-2">
          <input
            type="date"
            value={row.expectedDate}
            onChange={e => onChange({ expectedDate: e.target.value })}
            className={inp}
          />
        </td>
        <td className="px-3 py-2">
          <textarea
            value={row.whatShouldBeTrue}
            onChange={e => onChange({ whatShouldBeTrue: e.target.value })}
            rows={2}
            className={inp + ' resize-none'}
          />
        </td>
        <td className="px-3 py-2">
          <textarea
            value={row.lastObserved}
            onChange={e => onChange({ lastObserved: e.target.value })}
            rows={2}
            className={inp + ' resize-none'}
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="date"
            value={row.lastObservedDate}
            onChange={e => onChange({ lastObservedDate: e.target.value })}
            className={inp}
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            min={0}
            value={row.stalenessDays}
            onChange={e => onChange({ stalenessDays: parseInt(e.target.value, 10) || 0 })}
            className={inp}
          />
        </td>
        <td className="px-3 py-2">
          <select value={row.handler} onChange={e => onChange({ handler: e.target.value })} className={sel}>
            {HANDLER_OPTIONS.map(o => <option key={o} value={o}>{o || '(none)'}</option>)}
          </select>
        </td>
        <td className="px-3 py-2">
          <input
            value={row.consequence}
            onChange={e => onChange({ consequence: e.target.value })}
            className={inp}
          />
        </td>
        <td className="px-3 py-2 text-right">
          <button
            onClick={onSave}
            disabled={row.saving || !row.dirty}
            className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
          >
            <Save size={11} />
            {row.saving ? '…' : 'Save'}
          </button>
        </td>
      </tr>
    </>
  )
}

function buildFields(row) {
  const fields = {}
  if (row.triageStatus)     fields['Triage Status']             = row.triageStatus
  if (row.expectedDate)     fields['Expected Next Checkpoint']  = row.expectedDate
  if (row.whatShouldBeTrue !== undefined) fields['What Should Be True']       = row.whatShouldBeTrue
  if (row.lastObserved !== undefined)     fields['Last Observed']             = row.lastObserved
  if (row.lastObservedDate) fields['Last Observed Date']        = row.lastObservedDate
  fields['Staleness Days']  = row.stalenessDays || 0
  if (row.handler)          fields['Default Handler']           = row.handler
  if (row.consequence !== undefined) fields['Consequence']      = row.consequence
  return fields
}
