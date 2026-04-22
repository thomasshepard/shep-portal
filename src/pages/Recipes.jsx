import { useState, useEffect } from 'react'
import { ArrowLeft, Search, X, Plus, Pencil, Trash2, Check } from 'lucide-react'
import { RECIPE_FIELDS as RF, fetchRecipes, createRecipe, updateRecipe, deleteRecipe } from '../lib/recipes'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

// ─── Field ID shortcuts ───────────────────────────────────────────────────────
const F = {
  NAME:         RF.NAME,
  CATEGORY:     RF.CATEGORY,
  TAGS:         RF.TAGS,
  SERVINGS:     RF.SERVINGS_BASE,
  PREP:         RF.PREP_TIME,
  COOK:         RF.COOK_TIME,
  INGREDIENTS:  RF.INGREDIENTS_TEXT,
  INSTRUCTIONS: RF.INSTRUCTIONS_TEXT,
  NOTES:        RF.NOTES,
  ADDED_BY:     RF.ADDED_BY,
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES   = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert', 'Sides']
const CAT_EMOJI    = { Breakfast:'🍳', Lunch:'🥗', Dinner:'🍽️', Snack:'🥨', Dessert:'🍰', Sides:'🥦' }
const QUICK_TAGS   = ['Quick', 'Favorite', "Gabrielle's"]
const FILTER_CHIPS = ['All', ...CATEGORIES, ...QUICK_TAGS]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const s  = v => (v == null ? '' : String(v))
const n  = v => (isNaN(Number(v)) ? 0 : Number(v))
const ar = v => (Array.isArray(v) ? v : [])
const fv = (rec, id) => rec?.fields?.[id] ?? null

// ─── Styles ───────────────────────────────────────────────────────────────────
const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white'
const lbl = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5'

// ─── RecipeForm ───────────────────────────────────────────────────────────────
function RecipeForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => ({
    name:         initial ? s(fv(initial, F.NAME))         : '',
    category:     initial ? s(fv(initial, F.CATEGORY))     : '',
    tags:         initial ? ar(fv(initial, F.TAGS))        : [],
    servings:     initial ? (n(fv(initial, F.SERVINGS)) || '') : '',
    prepTime:     initial ? (n(fv(initial, F.PREP))    || '') : '',
    cookTime:     initial ? (n(fv(initial, F.COOK))    || '') : '',
    ingredients:  initial ? s(fv(initial, F.INGREDIENTS))  : '',
    instructions: initial ? s(fv(initial, F.INSTRUCTIONS)) : '',
    notes:        initial ? s(fv(initial, F.NOTES))        : '',
    addedBy:      initial ? s(fv(initial, F.ADDED_BY))     : '',
  }))
  const [tagInput, setTagInput] = useState('')

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function toggleTag(tag) {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }))
  }

  function removeTag(tag) { setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) })) }

  function handleTagKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const t = tagInput.trim()
      if (t && !form.tags.includes(t)) toggleTag(t)
      setTagInput('')
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Recipe name is required'); return }
    onSave(form)
  }

  const customTags = form.tags.filter(t => !QUICK_TAGS.includes(t))

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button type="button" onClick={onCancel}
          className="flex items-center gap-1.5 text-gray-500 text-sm font-medium hover:text-gray-800">
          <X size={16} /> Cancel
        </button>
        <span className="text-sm font-semibold text-gray-900">{initial ? 'Edit Recipe' : 'New Recipe'}</span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-1.5 rounded-full disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : <><Check size={14} /> Save</>}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-5 space-y-5 pb-16">
        {/* Name */}
        <div>
          <label className={lbl}>Recipe Name <span className="text-red-400 normal-case font-normal">*</span></label>
          <input
            autoFocus
            value={form.name}
            onChange={e => set('name', e.target.value)}
            className={inp}
            placeholder="e.g. Chicken Alfredo"
          />
        </div>

        {/* Category */}
        <div>
          <label className={lbl}>Category</label>
          <select value={form.category} onChange={e => set('category', e.target.value)} className={inp}>
            <option value="">— none —</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>)}
          </select>
        </div>

        {/* Tags */}
        <div>
          <label className={lbl}>Tags</label>
          <div className="flex flex-wrap gap-2 mb-2.5">
            {QUICK_TAGS.map(tag => (
              <button
                key={tag} type="button" onClick={() => toggleTag(tag)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  form.tags.includes(tag)
                    ? 'bg-amber-400 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >{tag}</button>
            ))}
          </div>
          {customTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {customTags.map(tag => (
                <span key={tag} className="flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="text-amber-500 hover:text-amber-700 leading-none">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={handleTagKey}
            className={inp}
            placeholder="Custom tag — press Enter to add"
          />
        </div>

        {/* Timing + servings */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={lbl}>Prep (min)</label>
            <input type="number" min={0} value={form.prepTime} onChange={e => set('prepTime', e.target.value)} className={inp} placeholder="0" />
          </div>
          <div>
            <label className={lbl}>Cook (min)</label>
            <input type="number" min={0} value={form.cookTime} onChange={e => set('cookTime', e.target.value)} className={inp} placeholder="0" />
          </div>
          <div>
            <label className={lbl}>Servings</label>
            <input type="number" min={1} value={form.servings} onChange={e => set('servings', e.target.value)} className={inp} placeholder="4" />
          </div>
        </div>

        {/* Ingredients */}
        <div>
          <label className={lbl}>Ingredients</label>
          <p className="text-xs text-gray-400 mb-1.5">One per line. Use ALL CAPS for section headers.</p>
          <textarea
            rows={7}
            value={form.ingredients}
            onChange={e => set('ingredients', e.target.value)}
            className={inp + ' resize-none'}
            placeholder={"2 cups flour\n1 tsp salt\n3 eggs\n\nSAUCE\n1 cup heavy cream\n2 tbsp butter"}
          />
        </div>

        {/* Instructions */}
        <div>
          <label className={lbl}>Instructions</label>
          <p className="text-xs text-gray-400 mb-1.5">Number each step for best display.</p>
          <textarea
            rows={8}
            value={form.instructions}
            onChange={e => set('instructions', e.target.value)}
            className={inp + ' resize-none'}
            placeholder={"1. Preheat oven to 375°F\n2. Mix dry ingredients in a large bowl\n3. Add wet ingredients and stir until just combined\n4. Bake 25–30 min until golden"}
          />
        </div>

        {/* Notes */}
        <div>
          <label className={lbl}>Notes</label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            className={inp + ' resize-none'}
            placeholder="Tips, substitutions, variations…"
          />
        </div>

        {/* Added By */}
        <div>
          <label className={lbl}>Added By</label>
          <input
            value={form.addedBy}
            onChange={e => set('addedBy', e.target.value)}
            className={inp}
            placeholder="e.g. Gabrielle"
          />
        </div>
      </form>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Recipes() {
  const { isAdmin } = useAuth()
  const [recipes,    setRecipes]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [search,     setSearch]     = useState('')
  const [chip,       setChip]       = useState('All')
  const [view,       setView]       = useState('list') // 'list' | 'detail' | 'form'
  const [selected,   setSelected]   = useState(null)
  const [formMode,   setFormMode]   = useState('add')  // 'add' | 'edit'
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  async function load() {
    setLoading(true); setError(null)
    try { setRecipes(await fetchRecipes()) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // ── CRUD ──
  async function handleSave(form) {
    setSaving(true)
    try {
      if (formMode === 'add') {
        await createRecipe(
          {
            name:         form.name.trim(),
            category:     form.category || null,
            tags:         form.tags,
            servingsBase: form.servings ? Number(form.servings) : null,
            prepTime:     form.prepTime ? Number(form.prepTime) : null,
            cookTime:     form.cookTime ? Number(form.cookTime) : null,
            notes:        form.notes.trim(),
            addedBy:      form.addedBy.trim(),
          },
          form.ingredients,
          form.instructions,
        )
        toast.success('Recipe added!')
        await load()
        setView('list')
      } else {
        const fields = {
          [RF.NAME]:              form.name.trim(),
          [RF.CATEGORY]:          form.category || null,
          [RF.TAGS]:              form.tags,
          [RF.SERVINGS_BASE]:     form.servings  ? Number(form.servings)  : null,
          [RF.PREP_TIME]:         form.prepTime  ? Number(form.prepTime)  : null,
          [RF.COOK_TIME]:         form.cookTime  ? Number(form.cookTime)  : null,
          [RF.NOTES]:             form.notes.trim(),
          [RF.ADDED_BY]:          form.addedBy.trim(),
          [RF.INGREDIENTS_TEXT]:  form.ingredients,
          [RF.INSTRUCTIONS_TEXT]: form.instructions,
        }
        const updated = await updateRecipe(selected.id, fields)
        toast.success('Recipe saved!')
        setRecipes(rs => rs.map(r => r.id === selected.id ? updated : r))
        setSelected(updated)
        setView('detail')
      }
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteRecipe(selected.id, [], [])
      toast.success('Recipe deleted')
      setRecipes(rs => rs.filter(r => r.id !== selected.id))
      setSelected(null)
      setView('list')
      setConfirmDel(false)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ── Filter ──
  const visible = recipes.filter(r => {
    const name     = s(fv(r, F.NAME)).toLowerCase()
    const category = s(fv(r, F.CATEGORY))
    const tags     = ar(fv(r, F.TAGS))
    const notes    = s(fv(r, F.NOTES)).toLowerCase()
    const matchSearch = !search ||
      name.includes(search.toLowerCase()) ||
      notes.includes(search.toLowerCase()) ||
      category.toLowerCase().includes(search.toLowerCase())
    const matchChip = chip === 'All' || category === chip || tags.includes(chip)
    return matchSearch && matchChip
  })

  // ── Form view ──
  if (view === 'form') {
    return (
      <RecipeForm
        initial={formMode === 'edit' ? selected : null}
        onSave={handleSave}
        onCancel={() => setView(formMode === 'edit' ? 'detail' : 'list')}
        saving={saving}
      />
    )
  }

  // ── Detail view ──
  if (view === 'detail' && selected) {
    const name         = s(fv(selected, F.NAME))
    const category     = s(fv(selected, F.CATEGORY))
    const tags         = ar(fv(selected, F.TAGS))
    const servings     = n(fv(selected, F.SERVINGS))
    const prepTime     = n(fv(selected, F.PREP))
    const cookTime     = n(fv(selected, F.COOK))
    const ingredients  = s(fv(selected, F.INGREDIENTS))
    const instructions = s(fv(selected, F.INSTRUCTIONS))
    const notes        = s(fv(selected, F.NOTES))
    const addedBy      = s(fv(selected, F.ADDED_BY))
    const totalTime    = prepTime + cookTime
    const emoji        = CAT_EMOJI[category] || '🍴'

    return (
      <div className="min-h-screen bg-amber-50">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-amber-100 px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => { setSelected(null); setView('list'); setConfirmDel(false) }}
            className="flex items-center gap-1.5 text-amber-600 font-medium text-sm"
          >
            <ArrowLeft size={16} /> Recipes
          </button>
          {isAdmin && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setFormMode('edit'); setView('form') }}
                className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Pencil size={14} /> Edit
              </button>
              <button
                onClick={() => setConfirmDel(v => !v)}
                className={`p-1.5 rounded-lg transition-colors ${
                  confirmDel
                    ? 'bg-red-100 text-red-600'
                    : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                }`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Delete confirm banner */}
        {confirmDel && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-red-700 font-medium">Delete "{name}"? This cannot be undone.</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setConfirmDel(false)}
                className="text-xs text-gray-500 px-2 py-1 rounded hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}

        <div className="max-w-lg mx-auto px-4 py-6">
          {/* Title block */}
          <div className="mb-6">
            <div className="text-4xl mb-3">{emoji}</div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-2">{name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mb-3">
              {category  && <span>{category}</span>}
              {servings > 0 && <span>{servings} servings</span>}
              {totalTime > 0 && <span>{totalTime} min total</span>}
              {prepTime > 0  && <span>{prepTime} min prep</span>}
              {cookTime > 0  && <span>{cookTime} min cook</span>}
              {addedBy   && <span>by {addedBy}</span>}
            </div>
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
              <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-amber-200">Ingredients</h2>
              <div className="space-y-0.5">
                {ingredients.split('\n').map((line, i) => {
                  const trimmed = line.trim()
                  if (!trimmed) return <div key={i} className="h-2" />
                  if (/^[A-Z][A-Z\s/]+$/.test(trimmed) && trimmed.length < 25) {
                    return <p key={i} className="text-xs font-bold text-amber-600 uppercase tracking-wider mt-3 mb-1">{trimmed}</p>
                  }
                  return <p key={i} className="text-sm text-gray-700 py-0.5">{trimmed}</p>
                })}
              </div>
            </div>
          )}

          {/* Instructions */}
          {instructions && (
            <div className="mb-6">
              <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-amber-200">Instructions</h2>
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
            <div className="bg-white border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1.5">Notes</p>
              <p className="text-sm text-gray-700 leading-relaxed">{notes}</p>
            </div>
          )}

          <div className="h-12" />
        </div>
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-bold text-gray-900">Recipes</h1>
            {isAdmin && (
              <button
                onClick={() => { setFormMode('add'); setView('form') }}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors"
              >
                <Plus size={15} /> Add Recipe
              </button>
            )}
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
                  chip === c ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
            <button onClick={load} className="mt-1 text-xs font-bold px-4 py-2 rounded-full bg-gray-900 text-white">Retry</button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-center">
            <p className="text-4xl">🍴</p>
            <p className="text-sm font-semibold text-gray-500">No recipes found</p>
            {search
              ? <p className="text-xs text-gray-400">Try a different search</p>
              : isAdmin && chip === 'All' && (
                <button
                  onClick={() => { setFormMode('add'); setView('form') }}
                  className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium"
                >
                  Add your first recipe →
                </button>
              )
            }
          </div>
        )}

        {/* Recipe list */}
        {!loading && !error && visible.length > 0 && (
          <div className="divide-y divide-gray-100">
            {visible.map(r => {
              const name      = s(fv(r, F.NAME))
              const category  = s(fv(r, F.CATEGORY))
              const tags      = ar(fv(r, F.TAGS))
              const servings  = n(fv(r, F.SERVINGS))
              const prepTime  = n(fv(r, F.PREP))
              const cookTime  = n(fv(r, F.COOK))
              const totalTime = prepTime + cookTime
              const emoji     = CAT_EMOJI[category] || '🍴'

              return (
                <button
                  key={r.id}
                  onClick={() => { setSelected(r); setView('detail'); setConfirmDel(false) }}
                  className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-xl">
                    {emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[
                        category,
                        servings > 0  ? `${servings} servings` : null,
                        totalTime > 0 ? `${totalTime} min`     : null,
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
