import { useEffect, useState, useMemo } from 'react'
import {
  Egg, Plus, AlertTriangle, Pencil, ChevronDown, Trash2,
  ClipboardList, DollarSign, Calendar,
} from 'lucide-react'
import {
  fetchAllRecords, deleteRecord, CHICKENS_BASE_ID,
  fmtCurrency, fmtDate,
} from '../lib/airtable'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import FlockForm from '../components/FlockForm'
import FeedingScheduleForm from '../components/FeedingScheduleForm'
import MortalityForm from '../components/MortalityForm'
import ExpenseForm from '../components/ExpenseForm'
import toast from 'react-hot-toast'

// ── Helpers ──────────────────────────────────────────────────────

function daysBetween(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.floor((now - d) / 86400000)
}

function getAge(hatchDate) {
  const totalDays = daysBetween(hatchDate)
  return { weeks: Math.floor(totalDays / 7), days: totalDays % 7, totalDays }
}

function currentWeekNum(hatchDate) {
  return Math.floor(daysBetween(hatchDate) / 7) + 1
}

function processingInfo(processingDate) {
  const d = new Date(processingDate)
  const now = new Date()
  const diffMs = d - now
  const diffDays = Math.ceil(diffMs / 86400000)
  return diffDays
}

function fmtAge(hatchDate) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() - 1)
  if (new Date(hatchDate) > new Date()) {
    const d = new Date(hatchDate)
    return `Arriving ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  }
  const { weeks, days } = getAge(hatchDate)
  return `${weeks}w ${days}d old`
}

const STATUS_COLORS = {
  'Brooding': 'bg-yellow-100 text-yellow-700',
  'Growing': 'bg-green-100 text-green-700',
  'Ready to Process': 'bg-orange-100 text-orange-700',
  'Processed': 'bg-gray-100 text-gray-500',
}

const CAT_COLORS = {
  'Chicks': 'bg-blue-100 text-blue-700',
  'Feed': 'bg-green-100 text-green-700',
  'Equipment': 'bg-gray-100 text-gray-600',
  'Bedding': 'bg-yellow-100 text-yellow-700',
  'Supplements/Medication': 'bg-purple-100 text-purple-700',
  'Processing': 'bg-orange-100 text-orange-700',
  'Utilities': 'bg-red-100 text-red-700',
  'Other': 'bg-gray-100 text-gray-600',
}

// ── FlockCard ─────────────────────────────────────────────────────

function FlockCard({ flock, schedules, mortality, expenses, isAdmin, onEdit, onRecordLoss, onViewSchedule }) {
  const f = flock.fields
  const hatchDate = f['Hatch Date']
  const processingDate = f['Processing Date']
  const currentCount = f['Current Count'] ?? 0
  const startingCount = f['Starting Count'] ?? 0

  // Age / arriving
  const ageLabel = hatchDate ? fmtAge(hatchDate) : '—'
  const isFuture = hatchDate && new Date(hatchDate) > new Date()

  // Today's feed
  const weekNum = hatchDate && !isFuture ? currentWeekNum(hatchDate) : null
  const scheduleEntry = weekNum
    ? schedules.find(s => s.fields.Flock?.[0] === flock.id && s.fields.Week === weekNum)
    : null
  const pastWeek8 = weekNum && weekNum > 8 && !processingDate
  const depleted = currentCount === 0

  // Mortality
  const flockMortality = mortality.filter(m => m.fields.Flock?.[0] === flock.id)
  const totalLost = flockMortality.reduce((s, m) => s + (m.fields.Count || 1), 0)
  const mortalityRate = startingCount > 0 ? ((totalLost / startingCount) * 100).toFixed(1) : 0

  // Expenses total
  const totalExpenses = expenses
    .filter(e => e.fields.Flock?.[0] === flock.id)
    .reduce((s, e) => s + (e.fields.Amount || 0), 0)

  // Processing countdown
  let countdownEl = null
  if (processingDate) {
    const daysUntil = processingInfo(processingDate)
    if (daysUntil < 0) {
      countdownEl = <span className="text-gray-500">Processing day was {fmtDate(processingDate)}</span>
    } else if (daysUntil <= 2) {
      const pullDate = new Date(processingDate)
      pullDate.setDate(pullDate.getDate() - 2)
      countdownEl = (
        <span className="text-red-600 font-semibold">
          ⚠ Processing in {daysUntil}d — PULL FEED by {pullDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      )
    } else if (daysUntil <= 7) {
      countdownEl = <span className="text-orange-600 font-semibold">Processing in {daysUntil} days</span>
    } else {
      countdownEl = <span className="text-gray-600">Processing in {daysUntil} days</span>
    }
  } else {
    countdownEl = <span className="text-gray-400">No processing date set</span>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{f.Name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{f.Breed || 'Unknown breed'}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[f.Status] || 'bg-gray-100 text-gray-600'}`}>{f.Status}</span>
              <span className="text-xs text-gray-500">{ageLabel}</span>
            </div>
          </div>
          {isAdmin && (
            <button onClick={onEdit} className="text-gray-400 hover:text-gray-700 mt-0.5">
              <Pencil size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Today's Feed — hero number */}
      <div className="px-5 pb-4 border-b border-gray-100">
        {depleted ? (
          <div className="text-gray-400 text-sm italic">Flock depleted</div>
        ) : isFuture ? (
          <div className="text-gray-400 text-sm italic">Not arrived yet</div>
        ) : pastWeek8 ? (
          <div className="text-amber-600 text-sm font-medium">Past 8-week plan — consider processing</div>
        ) : weekNum && weekNum <= 8 ? (
          scheduleEntry ? (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black text-gray-900">{scheduleEntry.fields['Quarts Per Day'] ?? '—'}</span>
                <span className="text-lg text-gray-500 font-medium">qts today</span>
              </div>
              <div className="flex gap-3 mt-1 text-xs text-gray-400">
                <span>Week {weekNum} · {scheduleEntry.fields['Date Range'] || ''}</span>
                {scheduleEntry.fields.Notes && <span className="text-amber-600">{scheduleEntry.fields.Notes}</span>}
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-sm">
              No schedule for week {weekNum} —{' '}
              {isAdmin && (
                <button onClick={onViewSchedule} className="text-blue-600 hover:underline">edit schedule</button>
              )}
            </div>
          )
        ) : null}
      </div>

      {/* Bird count + countdown */}
      <div className="px-5 py-3 space-y-2 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-700 font-medium">{currentCount} / {startingCount} birds</span>
            {totalLost > 0 && (
              <span className="text-xs text-red-500">({totalLost} lost — {mortalityRate}%)</span>
            )}
          </div>
          <button
            onClick={onRecordLoss}
            className="text-xs text-red-600 hover:text-red-800 border border-red-200 rounded px-2.5 py-1 min-h-[32px]"
          >
            Record Loss
          </button>
        </div>
        <div className="text-sm">{countdownEl}</div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 flex items-center justify-between text-xs text-gray-500">
        <div className="flex gap-4">
          {f['Feed Type'] && <span>{f['Feed Type']}</span>}
          {totalExpenses > 0 && <span>{fmtCurrency(totalExpenses)} in expenses</span>}
        </div>
        <button onClick={onViewSchedule} className="text-blue-600 hover:underline text-xs">
          View Schedule
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

export default function Chickens() {
  const { isAdmin } = useAuth()

  const [flocks, setFlocks] = useState([])
  const [schedules, setSchedules] = useState([])
  const [mortality, setMortality] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)

  const [showFlockForm, setShowFlockForm] = useState(false)
  const [editingFlock, setEditingFlock] = useState(null)
  const [showScheduleFor, setShowScheduleFor] = useState(null) // flock record
  const [showMortalityFor, setShowMortalityFor] = useState(null) // flock record
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)

  const [selectedFlockId, setSelectedFlockId] = useState('')
  const [expenseCatFilter, setExpenseCatFilter] = useState('All')
  const [expenseFlockFilter, setExpenseFlockFilter] = useState('All')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [f, s, m, e] = await Promise.all([
      fetchAllRecords('Flocks', { sort: { field: 'Hatch Date', direction: 'desc' } }, CHICKENS_BASE_ID),
      fetchAllRecords('Feeding Schedule', {}, CHICKENS_BASE_ID),
      fetchAllRecords('Mortality Log', { sort: { field: 'Date', direction: 'desc' } }, CHICKENS_BASE_ID),
      fetchAllRecords('Chicken Expenses', { sort: { field: 'Date', direction: 'desc' } }, CHICKENS_BASE_ID),
    ])
    const flockData = f.data || []
    setFlocks(flockData)
    setSchedules(s.data || [])
    setMortality(m.data || [])
    setExpenses(e.data || [])

    // Default selected flock to first active flock
    const active = flockData.filter(fl => fl.fields.Status !== 'Processed')
    if (active.length > 0 && !selectedFlockId) setSelectedFlockId(active[0].id)

    setLoading(false)
  }

  const activeFlocks = useMemo(() => flocks.filter(f => f.fields.Status !== 'Processed'), [flocks])
  const allFlocks = flocks

  const selectedFlock = flocks.find(f => f.id === selectedFlockId)
  const selectedSchedule = schedules.filter(s => s.fields.Flock?.[0] === selectedFlockId)
  const selectedMortality = mortality.filter(m => m.fields.Flock?.[0] === selectedFlockId).sort(
    (a, b) => new Date(b.fields.Date) - new Date(a.fields.Date)
  )

  // Expense summary
  const totalSpent = expenses.reduce((s, e) => s + (e.fields.Amount || 0), 0)
  const feedCosts = expenses.filter(e => e.fields.Category === 'Feed').reduce((s, e) => s + (e.fields.Amount || 0), 0)
  const chickCosts = expenses.filter(e => e.fields.Category === 'Chicks').reduce((s, e) => s + (e.fields.Amount || 0), 0)
  const otherCosts = totalSpent - feedCosts - chickCosts

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (expenseCatFilter !== 'All' && e.fields.Category !== expenseCatFilter) return false
      if (expenseFlockFilter === 'General' && e.fields.Flock?.length > 0) return false
      if (expenseFlockFilter !== 'All' && expenseFlockFilter !== 'General' && e.fields.Flock?.[0] !== expenseFlockFilter) return false
      return true
    })
  }, [expenses, expenseCatFilter, expenseFlockFilter])

  async function handleDeleteMortality(record) {
    if (!confirm('Delete this mortality record?')) return
    const { error } = await deleteRecord('Mortality Log', record.id, CHICKENS_BASE_ID)
    if (error) toast.error(error)
    else { toast.success('Record deleted'); loadAll() }
  }

  async function handleDeleteExpense(record) {
    if (!confirm('Delete this expense?')) return
    const { error } = await deleteRecord('Chicken Expenses', record.id, CHICKENS_BASE_ID)
    if (error) toast.error(error)
    else { toast.success('Expense deleted'); loadAll() }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Egg className="text-amber-500" size={24} />
            <h1 className="text-2xl font-bold text-gray-900">Chicken Farming</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Active flock management, feeding schedules, and expense tracking.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setEditingFlock(null); setShowFlockForm(true) }}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Add Flock
          </button>
        )}
      </div>

      {/* ── Active Flock Cards ── */}
      {activeFlocks.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <Egg size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No active flocks</p>
          {isAdmin && (
            <button onClick={() => { setEditingFlock(null); setShowFlockForm(true) }}
              className="mt-4 text-sm text-amber-600 hover:text-amber-700 font-medium">
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
              mortality={mortality}
              expenses={expenses}
              isAdmin={isAdmin}
              onEdit={() => { setEditingFlock(flock); setShowFlockForm(true) }}
              onRecordLoss={() => setShowMortalityFor(flock)}
              onViewSchedule={() => {
                setSelectedFlockId(flock.id)
                document.getElementById('schedule-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
            />
          ))}
        </div>
      )}

      {/* ── Flock selector for lower sections ── */}
      {allFlocks.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Viewing flock:</label>
          <select
            value={selectedFlockId}
            onChange={e => setSelectedFlockId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {allFlocks.map(f => (
              <option key={f.id} value={f.id}>{f.fields.Name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Feeding Schedule ── */}
      <section id="schedule-section" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900">Feeding Schedule</h2>
          </div>
          {isAdmin && selectedFlock && (
            <button
              onClick={() => setShowScheduleFor(selectedFlock)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Edit Schedule
            </button>
          )}
        </div>

        {!selectedFlock ? (
          <p className="px-5 py-8 text-center text-gray-400 text-sm">No flock selected</p>
        ) : selectedSchedule.length === 0 ? (
          <p className="px-5 py-8 text-center text-gray-400 text-sm">
            No feeding schedule entered.{isAdmin && <> <button onClick={() => setShowScheduleFor(selectedFlock)} className="text-blue-600 hover:underline">Click Edit Schedule</button> to enter weekly quarts.</>}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs">Week</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Date Range</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Quarts/Day</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Bar</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(() => {
                  const hatchDate = selectedFlock?.fields['Hatch Date']
                  const weekNow = hatchDate ? currentWeekNum(hatchDate) : null
                  const maxQuarts = Math.max(...selectedSchedule.map(s => s.fields['Quarts Per Day'] || 0), 1)
                  const sorted = [...selectedSchedule].sort((a, b) => a.fields.Week - b.fields.Week)
                  return sorted.map(s => {
                    const w = s.fields.Week
                    const isCurrent = w === weekNow
                    const isPast = weekNow !== null && w < weekNow
                    const quarts = s.fields['Quarts Per Day']
                    return (
                      <tr key={s.id} className={isCurrent ? 'bg-amber-50' : isPast ? 'bg-gray-50/50' : ''}>
                        <td className={`px-5 py-3 font-medium ${isCurrent ? 'text-amber-700' : isPast ? 'text-gray-400' : 'text-gray-700'}`}>
                          {isCurrent ? `► W${w}` : `W${w}`}
                        </td>
                        <td className={`px-4 py-3 ${isPast ? 'text-gray-400' : 'text-gray-600'}`}>{s.fields['Date Range'] || '—'}</td>
                        <td className={`px-4 py-3 font-semibold ${isCurrent ? 'text-amber-700 text-base' : isPast ? 'text-gray-400' : 'text-gray-700'}`}>
                          {quarts ?? '—'}
                        </td>
                        <td className="px-4 py-3 w-32">
                          {quarts != null && (
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isCurrent ? 'bg-amber-400' : isPast ? 'bg-gray-300' : 'bg-blue-400'}`}
                                style={{ width: `${(quarts / maxQuarts) * 100}%` }}
                              />
                            </div>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-xs ${isPast ? 'text-gray-400' : 'text-gray-500'}`}>{s.fields.Notes || ''}</td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Mortality Log ── */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">Mortality Log</h2>
            {selectedFlock && <span className="text-xs text-gray-400">{selectedFlock.fields.Name}</span>}
          </div>
          {selectedFlock && (
            <button
              onClick={() => setShowMortalityFor(selectedFlock)}
              className="text-sm text-red-600 hover:text-red-800 border border-red-200 rounded px-3 py-1"
            >
              Record Loss
            </button>
          )}
        </div>

        {selectedMortality.length === 0 ? (
          <p className="px-5 py-8 text-center text-gray-400 text-sm">No mortality events recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Count</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Cause</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Notes</th>
                  {isAdmin && <th className="px-4 py-3 w-8" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {selectedMortality.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-600">{fmtDate(m.fields.Date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{m.fields.Count || 1}</td>
                    <td className="px-4 py-3 text-gray-600">{m.fields.Cause || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{m.fields.Notes || ''}</td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <button onClick={() => handleDeleteMortality(m)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Expenses ── */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900">Expenses</h2>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setEditingExpense(null); setShowExpenseForm(true) }}
              className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
            >
              <Plus size={14} /> Add Expense
            </button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 border-b border-gray-100">
          {[
            { label: 'Total Spent', value: fmtCurrency(totalSpent), color: 'text-gray-900' },
            { label: 'Feed', value: fmtCurrency(feedCosts), color: 'text-green-700' },
            { label: 'Chicks', value: fmtCurrency(chickCosts), color: 'text-blue-700' },
            { label: 'Other', value: fmtCurrency(otherCosts), color: 'text-gray-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <select value={expenseCatFilter} onChange={e => setExpenseCatFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="All">All Categories</option>
            {['Chicks','Feed','Equipment','Bedding','Supplements/Medication','Processing','Utilities','Other'].map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select value={expenseFlockFilter} onChange={e => setExpenseFlockFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="All">All Flocks</option>
            <option value="General">General (no flock)</option>
            {allFlocks.map(f => <option key={f.id} value={f.id}>{f.fields.Name}</option>)}
          </select>
        </div>

        {filteredExpenses.length === 0 ? (
          <p className="px-5 py-8 text-center text-gray-400 text-sm">No expenses found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Qty</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Flock</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Vendor</th>
                  {isAdmin && <th className="px-4 py-3 w-16" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredExpenses.map(e => {
                  const linkedFlock = e.fields.Flock?.[0] ? allFlocks.find(f => f.id === e.fields.Flock[0]) : null
                  return (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-500">{fmtDate(e.fields.Date)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[e.fields.Category] || 'bg-gray-100 text-gray-600'}`}>
                          {e.fields.Category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{e.fields.Description}</td>
                      <td className="px-4 py-3 text-gray-500">{e.fields.Quantity ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{fmtCurrency(e.fields.Amount)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{linkedFlock?.fields.Name || 'General'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{e.fields.Vendor || '—'}</td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => { setEditingExpense(e); setShowExpenseForm(true) }}
                              className="text-gray-300 hover:text-blue-500 transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleDeleteExpense(e)}
                              className="text-gray-300 hover:text-red-500 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Modals ── */}
      {showFlockForm && (
        <FlockForm
          flock={editingFlock}
          onClose={() => setShowFlockForm(false)}
          onSaved={() => { setShowFlockForm(false); loadAll() }}
        />
      )}
      {showScheduleFor && (
        <FeedingScheduleForm
          flock={showScheduleFor}
          existingSchedule={schedules.filter(s => s.fields.Flock?.[0] === showScheduleFor.id)}
          onClose={() => setShowScheduleFor(null)}
          onSaved={() => { setShowScheduleFor(null); loadAll() }}
        />
      )}
      {showMortalityFor && (
        <MortalityForm
          flock={showMortalityFor}
          onClose={() => setShowMortalityFor(null)}
          onSaved={() => { setShowMortalityFor(null); loadAll() }}
        />
      )}
      {showExpenseForm && (
        <ExpenseForm
          expense={editingExpense}
          flocks={allFlocks}
          onClose={() => setShowExpenseForm(false)}
          onSaved={() => { setShowExpenseForm(false); loadAll() }}
        />
      )}
    </div>
  )
}
