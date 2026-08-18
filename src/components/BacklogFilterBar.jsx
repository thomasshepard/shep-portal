import { Search, X } from 'lucide-react'
import { CATEGORY_OPTIONS } from '../lib/backlogGrooming'

const CATEGORY_CHIPS = ['All', ...CATEGORY_OPTIONS]

const SORT_OPTIONS = [
  { value: 'default', label: 'Default order' },
  { value: 'value', label: 'Value (high to low)' },
  { value: 'effort', label: 'Effort (low to high)' },
  { value: 'az', label: 'A–Z' },
]

export default function BacklogFilterBar({ search, onSearch, category, onCategory, sort, onSort, resultCount }) {
  const hasActiveFilter = search.trim() || category !== 'All'

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search backlog..."
            value={search}
            onChange={e => onSearch(e.target.value)}
            className="w-full pl-9 pr-8 h-10 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          {search && (
            <button onClick={() => onSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sort */}
        <select
          value={sort}
          onChange={e => onSort(e.target.value)}
          className="h-10 px-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Category chips -- horizontally scrollable on narrow screens */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {CATEGORY_CHIPS.map(c => (
          <button
            key={c}
            onClick={() => onCategory(c)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              category === c ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Active-filter summary + clear -- NOT inside the scrollable chip row,
          so it's always reachable without scrolling the chip carousel. */}
      {hasActiveFilter && (
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">{resultCount} matching</p>
          <button
            onClick={() => { onSearch(''); onCategory('All') }}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}
