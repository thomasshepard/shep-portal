import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAccessLog } from '../hooks/useAccessLog'
import { useAuth } from '../hooks/useAuth'
import { createTask, taskExistsForSourceKey } from '../lib/tasks'
import BacklogKanban from '../components/BacklogKanban'
import BacklogModal from '../components/BacklogModal'
import BacklogComposer from '../components/BacklogComposer'
import BacklogGroomView from '../components/BacklogGroomView'
import BacklogFilterBar from '../components/BacklogFilterBar'

const BASE_ID = 'appp0qWrN24f8wqho'
const TABLE_ID = 'tblHUG1CGxrirONPB'
const AIRTABLE_PAT = import.meta.env.VITE_AIRTABLE_PAT

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

async function fetchRecords() {
  const all = []
  let offset = null

  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`)
    url.searchParams.set('sort[0][field]', 'Status')
    url.searchParams.set('sort[0][direction]', 'asc')
    if (offset) url.searchParams.set('offset', offset)

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } })
    if (!res.ok) throw new Error(`Airtable error: ${res.status}`)

    const data = await res.json()
    all.push(...(data.records || []))
    offset = data.offset
  } while (offset)

  return { records: all }
}

// Classic manual-entry flow (BacklogModal, "+ Add Feature"). Always tags
// Kind='Build' so these never get mistaken for ungroomed Inbox captures.
async function saveRecord(record) {
  const fields = {
    Feature: record.name,
    Status: record.status,
    Effort: record.effort,
    Value: record.value,
    Category: record.category,
    Description: record.description,
    'Build Prompt': record.buildPrompt,
    Kind: 'Build',
  }
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  })
  if (!res.ok) throw new Error('Failed to create record')
  return res.json()
}

async function updateRecord(recordId, record) {
  const fields = {
    Feature: record.name,
    Status: record.status,
    Effort: record.effort,
    Value: record.value,
    Category: record.category,
    Description: record.description,
    'Build Prompt': record.buildPrompt,
    Kind: 'Build',
  }
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true }),
  })
  if (!res.ok) throw new Error('Failed to update record')
  return res.json()
}

// Bare capture: only Feature + Status set. Lands in the Inbox lane (Kind
// stays empty) via BacklogKanban's grouping.
async function createInboxRecords(featureNames) {
  const records = featureNames.map(name => ({ fields: { Feature: name, Status: 'Idea' } }))
  const chunks = []
  for (let i = 0; i < records.length; i += 10) chunks.push(records.slice(i, i + 10))

  const created = []
  for (const chunk of chunks) {
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: chunk, typecast: true }),
    })
    if (!res.ok) throw new Error('Failed to create record')
    const json = await res.json()
    created.push(...json.records)
  }
  return created
}

// Generic field patch, used by the groom Accept/Discard flow.
async function patchFields(recordId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true }),
  })
  if (!res.ok) throw new Error('Failed to update record')
  return res.json()
}

export default function Backlog() {
  const { log } = useAccessLog()
  const { session } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingFeature, setEditingFeature] = useState(null)
  const [groomingRecord, setGroomingRecord] = useState(null)
  const [groomBusy, setGroomBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(() => localStorage.getItem('backlog:category') || 'All')
  const [sort, setSort] = useState(() => localStorage.getItem('backlog:sort') || 'default')

  useEffect(() => { localStorage.setItem('backlog:category', category) }, [category])
  useEffect(() => { localStorage.setItem('backlog:sort', sort) }, [sort])

  useEffect(() => {
    log('backlog', 'view')
    loadRecords()
  }, [])

  async function loadRecords() {
    try {
      const data = await fetchRecords()
      setRecords(data.records || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function upsertLocal(id, fields) {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, fields: { ...r.fields, ...fields } } : r))
  }

  const handleAddFeature = () => {
    setEditingFeature(null)
    setShowModal(true)
  }

  const handleEditFeature = (record) => {
    setEditingFeature(record)
    setShowModal(true)
  }

  const handleSaveFeature = async (formData) => {
    try {
      if (editingFeature) {
        await updateRecord(editingFeature.id, formData)
        upsertLocal(editingFeature.id, {
          Feature: formData.name, Status: formData.status, Effort: formData.effort,
          Value: formData.value, Category: formData.category, Description: formData.description,
          'Build Prompt': formData.buildPrompt, Kind: 'Build',
        })
        toast.success('✓ Feature updated')
      } else {
        const result = await saveRecord(formData)
        setRecords(prev => [...prev, result.records[0]])
        toast.success('✓ Feature added')
      }
      setShowModal(false)
      setEditingFeature(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Capture ──────────────────────────────────────────────────────────────
  const handleCapture = async (text) => {
    try {
      const [created] = await createInboxRecords([text])
      setRecords(prev => [...prev, created])
      toast.success('Added to Inbox')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleCaptureMany = async (lines) => {
    try {
      const created = await createInboxRecords(lines)
      setRecords(prev => [...prev, ...created])
      toast.success(`Added ${created.length} to Inbox`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Groom ────────────────────────────────────────────────────────────────
  const handleGroomOpen = (record) => setGroomingRecord(record)
  const handleGroomCancel = () => setGroomingRecord(null)

  const handleGroomDiscard = async () => {
    if (!groomingRecord) return
    setGroomBusy(true)
    try {
      const fields = { Status: 'Archived', 'Groomed At': todayISO() }
      await patchFields(groomingRecord.id, fields)
      upsertLocal(groomingRecord.id, fields)
      toast.success('Discarded')
      setGroomingRecord(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGroomBusy(false)
    }
  }

  const handleGroomAccept = async (form) => {
    if (!groomingRecord) return
    setGroomBusy(true)
    try {
      const baseFields = {
        Kind: form.kind,
        Category: form.category || null,
        Effort: form.effort || null,
        Value: form.value || null,
        Description: form.description || '',
        'Groomed At': todayISO(),
      }

      if (form.kind === 'Build') {
        const fields = { ...baseFields, 'Build Prompt': form.buildPrompt || '' }
        await patchFields(groomingRecord.id, fields)
        upsertLocal(groomingRecord.id, fields)
        toast.success('Groomed — now on the Build board')
      } else if (form.kind === 'Do') {
        const sourceKey = `backlog:${groomingRecord.id}`
        if (!(await taskExistsForSourceKey(sourceKey))) {
          await createTask({
            title: groomingRecord.fields['Feature'],
            module: 'Backlog',
            dueDate: form.dueDate || null,
            body: form.description || '',
            sourceKey,
            actionUrl: '/#/backlog',
            userId: session?.user?.id,
          })
        }
        const fields = { ...baseFields, Status: 'Archived' }
        await patchFields(groomingRecord.id, fields)
        upsertLocal(groomingRecord.id, fields)
        toast.success('Routed to Tasks')
      } else if (form.kind === 'Decide / Research') {
        const fields = { ...baseFields, Status: 'Archived', 'Check-in Date': form.checkInDate }
        await patchFields(groomingRecord.id, fields)
        upsertLocal(groomingRecord.id, fields)
        toast.success(`Will check back on ${form.checkInDate}`)
      }

      setGroomingRecord(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGroomBusy(false)
    }
  }

  const stats = {
    active: records.filter(r => !['Done', 'Archived'].includes(r.fields['Status'])).length,
    inProgress: records.filter(r => r.fields['Status'] === 'In Progress').length,
  }

  // Filtering/sorting applies to the whole record set before BacklogKanban
  // groups it by Status/Kind -- so filters shrink every column consistently,
  // and sort order carries through into each column's card list. Header
  // stats above stay unfiltered (they describe the whole board, not the view).
  const filteredRecords = records.filter(r => {
    const f = r.fields
    if (category !== 'All' && f['Category'] !== category) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const hay = (String(f['Feature'] || '') + ' ' + String(f['Description'] || '')).toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const EFFORT_RANK = { S: 0, M: 1, L: 2, XL: 3 }
  const visibleRecords = [...filteredRecords]
  if (sort === 'value') {
    visibleRecords.sort((a, b) => (b.fields['Value'] || 0) - (a.fields['Value'] || 0))
  } else if (sort === 'effort') {
    visibleRecords.sort((a, b) => (EFFORT_RANK[a.fields['Effort']] ?? 9) - (EFFORT_RANK[b.fields['Effort']] ?? 9))
  } else if (sort === 'az') {
    visibleRecords.sort((a, b) => (a.fields['Feature'] || '').localeCompare(b.fields['Feature'] || ''))
  }

  if (loading) return <div className="max-w-7xl mx-auto px-6 py-8 text-gray-500">Loading backlog...</div>
  if (error) return <div className="max-w-7xl mx-auto px-6 py-8 text-red-500">{error}</div>

  if (groomingRecord) {
    return (
      <BacklogGroomView
        record={groomingRecord}
        onAccept={handleGroomAccept}
        onDiscard={handleGroomDiscard}
        onCancel={handleGroomCancel}
        busy={groomBusy}
      />
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Backlog</h1>
          <div className="flex gap-6 mt-2 text-sm text-gray-600">
            <div>Active Features: <span className="font-semibold text-gray-900">{stats.active}</span></div>
            <div>In Progress: <span className="font-semibold text-gray-900">{stats.inProgress}</span></div>
          </div>
        </div>
        <button
          onClick={handleAddFeature}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
        >
          <Plus size={18} />
          Add Feature
        </button>
      </div>

      {/* Filter + sort */}
      <BacklogFilterBar
        search={search} onSearch={setSearch}
        category={category} onCategory={setCategory}
        sort={sort} onSort={setSort}
        resultCount={visibleRecords.length}
      />

      {/* Kanban board */}
      <BacklogKanban records={visibleRecords} onCardClick={handleEditFeature} onGroomClick={handleGroomOpen} />

      {/* Modal */}
      <BacklogModal
        isOpen={showModal}
        feature={editingFeature}
        onClose={() => {
          setShowModal(false)
          setEditingFeature(null)
        }}
        onSave={handleSaveFeature}
      />

      {/* Persistent capture bar */}
      <BacklogComposer onCapture={handleCapture} onCaptureMany={handleCaptureMany} />
    </div>
  )
}
