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
}

const STATUS_CONFIG = {
  Idea: { icon: '💡', color: 'text-gray-600', borderColor: 'border-gray-300' },
  Design: { icon: '🎨', color: 'text-blue-600', borderColor: 'border-blue-300' },
  Built: { icon: '✅', color: 'text-green-600', borderColor: 'border-green-300' },
  Discard: { icon: '🗑️', color: 'text-red-600', borderColor: 'border-red-300' },
}

function Column({ status, records, onCardClick }) {
  const config = STATUS_CONFIG[status]
  return (
    <div className="flex flex-col gap-3">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.borderColor}`}>
        <span className="text-lg">{config.icon}</span>
        <span className={`font-medium ${config.color}`}>{status}</span>
        <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{records.length}</span>
      </div>
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
        {records.map(record => (
          <div
            key={record.id}
            onClick={() => onCardClick(record)}
            className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-md hover:border-gray-400 transition-all"
          >
            <p className="font-medium text-sm text-gray-900 mb-2">{record.fields['Feature']}</p>
            <div className="flex gap-2 flex-wrap">
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
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BacklogKanban({ records, onCardClick, stats }) {
  const [expandedBuilt, setExpandedBuilt] = useState(false)
  const [expandedDiscard, setExpandedDiscard] = useState(false)

  const grouped = {
    Idea: records.filter(r => r.fields['Status'] === 'Idea'),
    Design: records.filter(r => r.fields['Status'] === 'Design'),
    Built: records.filter(r => r.fields['Status'] === 'Built'),
    Discard: records.filter(r => r.fields['Status'] === 'Discard'),
  }

  return (
    <div className="space-y-6">
      {/* Idea + Design in 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Column status="Idea" records={grouped.Idea} onCardClick={onCardClick} />
        <Column status="Design" records={grouped.Design} onCardClick={onCardClick} />
      </div>

      {/* Built section (collapsible) */}
      <div className="space-y-3">
        <button
          onClick={() => setExpandedBuilt(!expandedBuilt)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-green-300 hover:bg-green-50 transition-colors w-full"
        >
          {expandedBuilt ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          <span className="text-lg">✅</span>
          <span className="font-medium text-green-600">Built ({grouped.Built.length})</span>
        </button>
        {expandedBuilt && (
          <div className="lg:w-1/2">
            <Column status="Built" records={grouped.Built} onCardClick={onCardClick} />
          </div>
        )}
      </div>

      {/* Discard section (collapsible) */}
      <div className="space-y-3">
        <button
          onClick={() => setExpandedDiscard(!expandedDiscard)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 hover:bg-red-50 transition-colors w-full"
        >
          {expandedDiscard ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          <span className="text-lg">🗑️</span>
          <span className="font-medium text-red-600">Discarded ({grouped.Discard.length})</span>
        </button>
        {expandedDiscard && (
          <div className="lg:w-1/2">
            <Column status="Discard" records={grouped.Discard} onCardClick={onCardClick} />
          </div>
        )}
      </div>
    </div>
  )
}
