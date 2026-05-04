import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAccessLog } from '../hooks/useAccessLog'
import BacklogKanban from '../components/BacklogKanban'
import BacklogModal from '../components/BacklogModal'

const BASE_ID = 'appp0qWrN24f8wqho'
const TABLE_ID = 'tblHUG1CGxrirONPB'
const AIRTABLE_PAT = import.meta.env.VITE_AIRTABLE_PAT

async function fetchRecords() {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?sort[0][field]=Status&sort[0][direction]=asc`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } })
  if (!res.ok) throw new Error(`Airtable error: ${res.status}`)
  return res.json()
}

async function saveRecord(record) {
  const fields = {
    Feature: record.name,
    Status: record.status,
    Effort: record.effort,
    Value: record.value,
    Category: record.category,
    Description: record.description,
    'Build Prompt': record.buildPrompt,
  }
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields }] }),
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
  }
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) throw new Error('Failed to update record')
  return res.json()
}

export default function Backlog() {
  const { log } = useAccessLog()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingFeature, setEditingFeature] = useState(null)

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
        setRecords(records.map(r => r.id === editingFeature.id ? { ...r, fields: { ...r.fields, ...formData } } : r))
        toast.success('✓ Feature updated')
      } else {
        const result = await saveRecord(formData)
        setRecords([...records, result.records[0]])
        toast.success('✓ Feature added')
      }
      setShowModal(false)
      setEditingFeature(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const stats = {
    active: records.filter(r => ['Idea', 'Design'].includes(r.fields['Status'])).length,
    design: records.filter(r => r.fields['Status'] === 'Design').length,
  }

  if (loading) return <div className="max-w-7xl mx-auto px-6 py-8 text-gray-500">Loading backlog...</div>
  if (error) return <div className="max-w-7xl mx-auto px-6 py-8 text-red-500">{error}</div>

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Backlog</h1>
          <div className="flex gap-6 mt-2 text-sm text-gray-600">
            <div>Active Features: <span className="font-semibold text-gray-900">{stats.active}</span></div>
            <div>In Design: <span className="font-semibold text-gray-900">{stats.design}</span></div>
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

      {/* Kanban board */}
      <BacklogKanban records={records} onCardClick={handleEditFeature} stats={stats} />

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
    </div>
  )
}
