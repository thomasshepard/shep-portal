import { useState, useEffect } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'

// ─── Airtable field IDs ──────────────────────────────────────────────────────
const F = {
  NAME:         'fldK4smwr4v8CB6A3',
  CATEGORY:     'fldxgSdjiBQsFD28i',
  TAGS:         'fldhqrXWH0r3IGEWZ',
  SERVINGS:     'fld2TswdlRXDM3bS0',
  PREP_TIME:    'fldcp2o347nljS8Gq',
  COOK_TIME:    'fldEGAbQimzx6dFJs',
  INGREDIENTS:  'fldLX9vLJgoGQK9RL',
  INSTRUCTIONS: 'fldAssIxhtJzLTwn7',
  NOTES:        'fldUFm3Izvw5scihV',
  ADDED_BY:     'fldtlH1lCV7FT2u8Y',
}

const BASE_URL = 'https://api.airtable.com/v0/appPKrIVr569rWySg/tblLhmJgQFRnUKi9n'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const s  = (v) => (v == null ? '' : String(v))
const n  = (v) => (isNaN(Number(v)) ? 0 : Number(v))
const ar = (v) => (Array.isArray(v) ? v : [])

function f(record, fieldId) {
  return record?.fields?.[fieldId] ?? null
}

const CATEGORY_EMOJI = {
  Breakfast: '🍳', Dinner: '🍽️', Lunch: '🥗',
  Snack: '🥨', Dessert: '🍰', Sides: '🥦',
}

const FILTER_CHIPS = ['All', 'Breakfast', 'Dinner', 'Lunch', 'Snack', 'Dessert', 'Sides', 'Quick', 'Favorite', "Gabrielle's"]

// ─── Main component ───────────────────────────────────────────────────────────
export default function Recipes() {
  const [recipes,  setRecipes]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [search,   setSearch]   = useState('')
  const [chip,     setChip]     = useState('All')
  const [selected, setSelected] = useState(null)  // full record or null

  const pat = import.meta.env.VITE_AIRTABLE_PAT

  // ── Fetch ──
  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${BASE_URL}?sort[0][field]=${F.NAME}&sort[0][direction]=asc`,
        { headers: { Authorization: `Bearer ${pat}` } }
      )
      if (!res.ok) throw new Error(`Airtable ${res.status}`)
      const data = await res.json()
      setRecipes(data.records || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Filter ──
  const visible = recipes.filter(r => {
    const name     = s(f(r, F.NAME)).toLowerCase()
    const category = s(f(r, F.CATEGORY))
    const tags     = ar(f(r, F.TAGS))
    const notes    = s(f(r, F.NOTES)).toLowerCase()

    const matchSearch = !search ||
      name.includes(search.toLowerCase()) ||
      notes.includes(search.toLowerCase()) ||
      category.toLowerCase().includes(search.toLowerCase())

    const matchChip = chip === 'All' ||
      category === chip ||
      tags.includes(chip)

    return matchSearch && matchChip
  })

  // ─── Detail view ─────────────────────────────────────────────────────────
  if (selected) {
    const name         = s(f(selected, F.NAME))
    const category     = s(f(selected, F.CATEGORY))
    const tags         = ar(f(selected, F.TAGS))
    const servings     = n(f(selected, F.SERVINGS))
    const prepTime     = n(f(selected, F.PREP_TIME))
    const cookTime     = n(f(selected, F.COOK_TIME))
    const ingredients  = s(f(selected, F.INGREDIENTS))
    const instructions = s(f(selected, F.INSTRUCTIONS))
    const notes        = s(f(selected, F.NOTES))
    const addedBy      = s(f(selected, F.ADDED_BY))
    const totalTime    = prepTime + cookTime
    const emoji        = CATEGORY_EMOJI[category] || '🍴'

    return (
      <div className="min-h-screen bg-amber-50">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-amber-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1.5 text-amber-600 font-medium text-sm"
          >
            <ArrowLeft size={16} />
            Recipes
          </button>
        </div>

        <div className="max-w-lg mx-auto px-4 py-6">
          {/* Title block */}
          <div className="mb-6">
            <div className="text-4xl mb-3">{emoji}</div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-2">{name}</h1>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mb-3">
              {category && <span>{category}</span>}
              {servings > 0 && <span>{servings} servings</span>}
              {totalTime > 0 && <span>{totalTime} min total</span>}
              {prepTime > 0 && <span>{prepTime} min prep</span>}
              {cookTime > 0 && <span>{cookTime} min cook</span>}
              {addedBy && <span>by {addedBy}</span>}
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <span key={tag} className="text-xs bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-medium">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Ingredients */}
          {ingredients && (
            <div className="mb-6">
              <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-amber-200">
                Ingredients
              </h2>
              <div className="space-y-0.5">
                {ingredients.split('\n').map((line, i) => {
                  const trimmed = line.trim()
                  if (!trimmed) return <div key={i} className="h-2" />
                  const isHeader = /^[A-Z][A-Z\s/]+$/.test(trimmed) && trimmed.length < 25
                  if (isHeader) {
                    return (
                      <p key={i} className="text-xs font-bold text-amber-600 uppercase tracking-wider mt-3 mb-1">
                        {trimmed}
                      </p>
                    )
                  }
                  return (
                    <p key={i} className="text-sm text-gray-700 py-0.5">
                      {trimmed}
                    </p>
                  )
                })}
              </div>
            </div>
          )}

          {/* Instructions */}
          {instructions && (
            <div className="mb-6">
              <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-amber-200">
                Instructions
              </h2>
              <div className="space-y-3">
                {instructions.split('\n').map((line, i) => {
                  const trimmed = line.trim()
                  if (!trimmed) return null
                  const match = trimmed.match(/^(\d+)\.\s*(.*)/)
                  if (match) {
                    return (
                      <div key={i} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-400 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                          {match[1]}
                        </span>
                        <p className="text-sm text-gray-700 leading-relaxed pt-0.5">{match[2]}</p>
                      </div>
                    )
                  }
                  return <p key={i} className="text-sm text-gray-700">{trimmed}</p>
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1.5">Notes</p>
              <p className="text-sm text-gray-700 leading-relaxed">{notes}</p>
            </div>
          )}

          <div className="h-12" />
        </div>
      </div>
    )
  }

  // ─── List view ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-bold text-gray-900">Recipes</h1>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search recipes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-amber-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {FILTER_CHIPS.map(c => (
              <button
                key={c}
                onClick={() => setChip(c)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  chip === c
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-3">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Loading recipes...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <p className="text-3xl">⚠️</p>
            <p className="text-sm font-semibold text-red-500">Could not load recipes</p>
            <p className="text-xs text-gray-400 max-w-xs font-mono">{error}</p>
            <button
              onClick={load}
              className="mt-1 text-xs font-bold px-4 py-2 rounded-full bg-gray-900 text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-center">
            <p className="text-4xl">🍴</p>
            <p className="text-sm font-semibold text-gray-500">No recipes found</p>
            {search && <p className="text-xs text-gray-400">Try a different search</p>}
          </div>
        )}

        {/* Recipe list */}
        {!loading && !error && visible.length > 0 && (
          <div className="divide-y divide-gray-100">
            {visible.map(r => {
              const name      = s(f(r, F.NAME))
              const category  = s(f(r, F.CATEGORY))
              const tags      = ar(f(r, F.TAGS))
              const servings  = n(f(r, F.SERVINGS))
              const prepTime  = n(f(r, F.PREP_TIME))
              const cookTime  = n(f(r, F.COOK_TIME))
              const totalTime = prepTime + cookTime
              const emoji     = CATEGORY_EMOJI[category] || '🍴'

              return (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-gray-50 transition-colors"
                >
                  {/* Emoji thumb */}
                  <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-xl">
                    {emoji}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[
                        category,
                        servings > 0 ? `${servings} servings` : null,
                        totalTime > 0 ? `${totalTime} min` : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    {tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Chevron */}
                  <span className="text-gray-300 text-lg flex-shrink-0">›</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}