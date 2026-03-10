import { useState, useEffect } from 'react'
import { X, CalendarDays } from 'lucide-react'
import { createRecord, updateRecord, deleteRecord, fetchAllRecords, CHICKENS_BASE_ID } from '../lib/airtable'
import toast from 'react-hot-toast'

const inp = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDateRange(start, end) {
  const fmt = (d) => {
    const [y, m, day] = d.split('-')
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${months[parseInt(m)-1]} ${parseInt(day)}`
  }
  return `${fmt(start)} - ${fmt(end)}`
}

export default function FeedingScheduleForm({ flock, existingSchedule, onClose, onSaved }) {
  const hatchDate = flock.fields['Hatch Date']

  function buildInitialRows() {
    const rows = []
    for (let w = 1; w <= 8; w++) {
      const existing = existingSchedule.find(r => r.fields.Week === w)
      let dateRange = ''
      if (hatchDate) {
        const start = addDays(hatchDate, (w - 1) * 7)
        const end = addDays(hatchDate, w * 7 - 1)
        dateRange = formatDateRange(start, end)
      }
      rows.push({
        id: existing?.id || null,
        week: w,
        dateRange: existing?.fields['Date Range'] ?? dateRange,
        quartsPerDay: existing?.fields['Quarts Per Day'] ?? '',
        notes: existing?.fields.Notes ?? '',
      })
    }
    return rows
  }

  const [rows, setRows] = useState(buildInitialRows)
  const [saving, setSaving] = useState(false)

  function setRow(week, key, val) {
    setRows(prev => prev.map(r => r.week === week ? { ...r, [key]: val } : r))
  }

  function autofillDates() {
    if (!hatchDate) return toast.error('No hatch date set for this flock')
    setRows(prev => prev.map(r => {
      const start = addDays(hatchDate, (r.week - 1) * 7)
      const end = addDays(hatchDate, r.week * 7 - 1)
      return { ...r, dateRange: formatDateRange(start, end) }
    }))
  }

  async function handleSave() {
    setSaving(true)
    let errorCount = 0

    for (const row of rows) {
      const fields = {
        Flock: [{ id: flock.id }],
        Week: row.week,
        'Date Range': row.dateRange || '',
        'Quarts Per Day': row.quartsPerDay !== '' ? parseFloat(row.quartsPerDay) : null,
        Notes: row.notes || undefined,
      }
      // Remove null fields
      if (fields['Quarts Per Day'] === null) delete fields['Quarts Per Day']

      let result
      if (row.id) {
        result = await updateRecord('Feeding schedule', row.id, fields, CHICKENS_BASE_ID)
      } else {
        result = await createRecord('Feeding schedule', fields, CHICKENS_BASE_ID)
      }
      if (result.error) errorCount++
    }

    if (errorCount > 0) {
      toast.error(`${errorCount} row(s) failed to save`)
    } else {
      toast.success('Feeding schedule saved')
      onSaved()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm('Delete the entire feeding schedule for this flock?')) return
    setSaving(true)
    for (const row of rows.filter(r => r.id)) {
      await deleteRecord('Feeding schedule', row.id, CHICKENS_BASE_ID)
    }
    toast.success('Schedule cleared')
    onSaved()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">Edit Feeding schedule</h2>
            <p className="text-xs text-gray-500">{flock.fields.Name}</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={autofillDates}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2.5 py-1">
              <CalendarDays size={12} /> Auto-fill dates
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-2 text-xs text-gray-500 font-medium w-12">Week</th>
                <th className="text-left pb-2 text-xs text-gray-500 font-medium w-40">Date Range</th>
                <th className="text-left pb-2 text-xs text-gray-500 font-medium w-28">Quarts/Day</th>
                <th className="text-left pb-2 text-xs text-gray-500 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(row => (
                <tr key={row.week}>
                  <td className="py-2 pr-3">
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded px-2 py-0.5">W{row.week}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <input value={row.dateRange} onChange={e => setRow(row.week, 'dateRange', e.target.value)} className={inp} placeholder="Mar 2 - Mar 8" />
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" step="0.1" min="0" value={row.quartsPerDay}
                      onChange={e => setRow(row.week, 'quartsPerDay', e.target.value)}
                      className={inp} placeholder="0.0" />
                  </td>
                  <td className="py-2">
                    <input value={row.notes} onChange={e => setRow(row.week, 'notes', e.target.value)} className={inp} placeholder="Optional" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button type="button" onClick={handleDelete} disabled={saving}
            className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50">
            Clear Schedule
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
