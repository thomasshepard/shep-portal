import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

const EFFORT_COLORS = {
  S: 'bg-green-100 text-green-700',
  M: 'bg-yellow-100 text-yellow-700',
  L: 'bg-orange-100 text-orange-700',
  XL: 'bg-red-100 text-red-700',
}

const CATEGORY_COLORS = {
  Operations: 'bg-blue-100 text-blue-700',
  'Real Estate': 'bg-teal-100 text-teal-700',
  'Happy Cuts': 'bg-green-100 text-green-700',
  Homestead: 'bg-purple-100 text-purple-700',
  Personal: 'bg-pink-100 text-pink-700',
  Technical: 'bg-indigo-100 text-indigo-700',
  Finance: 'bg-amber-100 text-amber-700',
  Infrastructure: 'bg-slate-100 text-slate-700',
}

const KIND_COLORS = {
  Build: 'bg-slate-100 text-slate-700',
  Do: 'bg-cyan-100 text-cyan-700',
  'Decide / Research': 'bg-fuchsia-100 text-fuchsia-700',
}

const STATUS_CONFIG = {
  Inbox: { icon: '📥', color: 'text-slate-600', borderColor: 'border-slate-300' },
  Idea: { icon: '💡', color: 'text-gray-600', borderColor: 'border-gray-300' },
  Planned: { icon: '📋', color: 'text-blue-600', borderColor: 'border-blue-300' },
  'In Progress': { icon: '🔨', color: 'text-orange-600', borderColor: 'border-orange-300' },
  Done: { icon: '✅', color: 'text-green-600', borderColor: 'border-green-300' },
  Archived: { icon: '🗄️', color: 'text-gray-500', borderColor: 'border-gray-300' },
}

function Column({ status, records, onCardClick, onGroomClick }) {
  const config = STATUS_CONFIG[status]
  const isInbox = status === 'Inbox'
  return (
    <div className="flex flex-col gap-3">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.borderColor}`}>
        <span className="text-lg">{config.icon}</span>
        <span className={`font-medium ${config.color}`}>{status}</span>
        <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{records.length}</span>
      </div>
      <div className="space-y-2">
        {records.map(record => (
          <div
            key={record.id}
            onClick={() => (isInbox ? onGroomClick(record) : onCardClick(record))}
            className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-md hover:border-gray-400 transition-all"
          >
            <p className="font-medium text-sm text-gray-900 mb-2">{record.fields['Feature']}</p>
            {isInbox ? (
              <span className="text-xs font-medium text-blue-600">Groom →</span>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {record.fields['Kind'] && (
                  <span className={`text-xs font-medium px-2 py-1 rounded ${KIND_COLORS[record.fields['Kind']] || 'bg-gray-100'}`}>
                    {record.fields['Kind']}
                  </span>
                )}
                {record.fields['Effort'] && (
                  <span className={`text-xs font-medium px-2 py-1 rounded ${EFFORT_COLORS[record.fields['Effort']] || 'bg-gray-100'}`}>
                    {record.fields['Effort']}
                  </span>
                )}
                {record.fields['Value'] && (
                  <span className="text-xs px-2 py-1">{'⭐'.repeat(record.fields['Value'])}</span>
                )}
                {record.fields['Category'] && (
                  <span className={`text-xs font-medium px-2 py-1 rounded ${CATEGORY_COLORS[record.fields['Category']] || 'bg-gray-100'}`}>
                    {record.fields['Category']}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BacklogKanban({ records, onCardClick, onGroomClick }) {
  const [expandedInProgress, setExpandedInProgress] = useState(true)
  const [expandedDone, setExpandedDone] = useState(false)
  const [expandedArchived, setExpandedArchived] = useState(false)

  const KNOWN_STATUSES = ['Idea', 'Planned', 'In Progress', 'Done', 'Archived']
  const grouped = { Inbox: [], Idea: [], Planned: [], 'In Progress': [], Done: [], Archived: [] }
  for (const r of records) {
    const status = r.fields['Status']
    if (status === 'Idea') {
      // Ungroomed captures (no Kind yet) live in Inbox; everything else --
      // groomed Build cards or the classic manual-entry flow -- is Idea.
      ;(r.fields['Kind'] ? grouped.Idea : grouped.Inbox).push(r)
    } else if (KNOWN_STATUSES.includes(status)) {
      grouped[status].push(r)
    } else {
      // Unknown/missing status -- surface it in Inbox instead of silently
      // vanishing from the board (this bucketing previously dropped cards
      // with no matching column at all).
      grouped.Inbox.push(r)
    }
  }

  return (
    <div className="space-y-6">
      {/* Inbox -- ungroomed captures, full width, most prominent */}
      {grouped.Inbox.length > 0 && (
        <Column status="Inbox" records={grouped.Inbox} onCardClick={onCardClick} onGroomClick={onGroomClick} />
      )}

      {/* Idea + Planned in 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Column status="Idea" records={grouped.Idea} onCardClick={onCardClick} onGroomClick={onGroomClick} />
        <Column status="Planned" records={grouped.Planned} onCardClick={onCardClick} onGroomClick={onGroomClick} />
      </div>

      {/* In Progress section (collapsible, default expanded) */}
      <div className="space-y-3">
        <button
          onClick={() => setExpandedInProgress(!expandedInProgress)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-orange-300 hover:bg-orange-50 transition-colors w-full"
        >
          {expandedInProgress ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          <span className="text-lg">🔨</span>
          <span className="font-medium text-orange-600">In Progress ({grouped['In Progress'].length})</span>
        </button>
        {expandedInProgress && (
          <div className="lg:w-full">
            <Column status="In Progress" records={grouped['In Progress']} onCardClick={onCardClick} onGroomClick={onGroomClick} />
          </div>
        )}
      </div>

      {/* Done section (collapsible, default collapsed) */}
      <div className="space-y-3">
        <button
          onClick={() => setExpandedDone(!expandedDone)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-green-300 hover:bg-green-50 transition-colors w-full"
        >
          {expandedDone ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          <span className="text-lg">✅</span>
          <span className="font-medium text-green-600">Done ({grouped.Done.length})</span>
        </button>
        {expandedDone && (
          <div className="lg:w-full">
            <Column status="Done" records={grouped.Done} onCardClick={onCardClick} onGroomClick={onGroomClick} />
          </div>
        )}
      </div>

      {/* Archived section (collapsible, default collapsed) */}
      <div className="space-y-3">
        <button
          onClick={() => setExpandedArchived(!expandedArchived)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors w-full"
        >
          {expandedArchived ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          <span className="text-lg">🗄️</span>
          <span className="font-medium text-gray-500">Archived ({grouped.Archived.length})</span>
        </button>
        {expandedArchived && (
          <div className="lg:w-full">
            <Column status="Archived" records={grouped.Archived} onCardClick={onCardClick} onGroomClick={onGroomClick} />
          </div>
        )}
      </div>
    </div>
  )
}
