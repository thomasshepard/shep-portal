import { useState, useEffect, useRef } from 'react'
import { ChefHat, ArrowLeft, Plus, Minus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react'
import {
  fetchRecipes,
  fetchIngredients,
  fetchSteps,
  createRecipe,
  RECIPE_FIELDS,
  ING_FIELDS,
  STEP_FIELDS,
} from '../lib/recipes'

const safeStr = (v) => (v == null ? '' : String(v))
const safeNum = (v) => (isNaN(Number(v)) ? 0 : Number(v))
const arr = (v) => (Array.isArray(v) ? v : [])

const CATEGORY_EMOJI = {
  Dinner: '🍽️',
  Breakfast: '🍳',
  Lunch: '🥗',
  Snack: '🥨',
  Dessert: '🍰',
  Sides: '🥦',
}

const CATEGORIES = ['All', 'Dinner', 'Breakfast', 'Lunch', 'Snack', 'Dessert', 'Sides']
const TAGS = ['Quick', 'Slow Cook', "Gabrielle's", "Thomas's", 'Kid Friendly', 'Grill', 'Favorite']
const FILTER_CHIPS = ['All', 'Dinner', 'Breakfast', 'Lunch', 'Snack', 'Dessert', 'Sides', 'Quick', 'Favorite', "Gabrielle's"]
const UNITS = ['cup', 'tbsp', 'tsp', 'oz', 'lb', 'g', 'whole', 'pinch', 'to taste', 'slice']

function scaleQty(base, servingsBase, servings) {
  const sb = safeNum(servingsBase) || 4
  const scaled = (safeNum(base) / sb) * safeNum(servings)
  if (!scaled) return ''
  const rounded = Math.round(scaled * 100) / 100
  return String(rounded).replace(/\.?0+$/, '')
}

function fmtTime(min) {
  if (!min) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function fmtSeconds(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

// ── Add sheet defaults ──────────────────────────────────────────────────────

function defaultBasics() {
  return { name: '', category: '', addedBy: '', servingsBase: 4, prepTime: '', cookTime: '', tags: [], notes: '' }
}
function defaultIng() {
  return { name: '', quantity: '', unit: '', notes: '' }
}
function defaultStep() {
  return { instruction: '', timerMinutes: '', timerLabel: '', keyValue: '' }
}

// ── Main component ──────────────────────────────────────────────────────────

export default function Recipes() {
  // Browse state
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filterChip, setFilterChip] = useState('All')

  // Cook mode state
  const [cookingRecipe, setCookingRecipe] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [steps, setSteps] = useState([])
  const [cookLoading, setCookLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [activeTab, setActiveTab] = useState('steps')
  const [servings, setServings] = useState(4)
  const [checkedIngs, setCheckedIngs] = useState(new Set())
  const [timers, setTimers] = useState({})

  // Add sheet state
  const [showAdd, setShowAdd] = useState(false)
  const [addWizardStep, setAddWizardStep] = useState(1)
  const [basics, setBasics] = useState(defaultBasics())
  const [ingRows, setIngRows] = useState([defaultIng()])
  const [stepRows, setStepRows] = useState([defaultStep()])
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)

  // Toast
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  function showToast(msg, duration = 2500) {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), duration)
  }

  // Timer intervals ref (survives re-renders)
  const timerRefs = useRef({})

  useEffect(() => {
    loadRecipes()
    return () => {
      // Cleanup all timers on unmount
      Object.values(timerRefs.current).forEach(id => clearInterval(id))
    }
  }, [])

  async function loadRecipes() {
    setLoading(true)
    setError(null)
    try {
      const recs = await fetchRecipes()
      setRecipes(recs)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Cook mode ─────────────────────────────────────────────────────────────

  async function enterCookMode(recipe) {
    setCookingRecipe(recipe)
    setCurrentStep(0)
    setActiveTab('steps')
    setCheckedIngs(new Set())
    stopAllTimers()
    setTimers({})
    setServings(safeNum(recipe.fields?.[RECIPE_FIELDS.SERVINGS_BASE]) || 4)
    setCookLoading(true)
    try {
      const [ings, stps] = await Promise.all([
        fetchIngredients(recipe.id),
        fetchSteps(recipe.id),
      ])
      setIngredients(ings)
      setSteps(stps.sort((a, b) => safeNum(a.fields?.[STEP_FIELDS.STEP_NUMBER]) - safeNum(b.fields?.[STEP_FIELDS.STEP_NUMBER])))
    } finally {
      setCookLoading(false)
    }
  }

  function exitCookMode() {
    if (Object.values(timers).some(t => t.running)) {
      if (!window.confirm('A timer is still running. Exit anyway?')) return
    }
    stopAllTimers()
    setTimers({})
    setCookingRecipe(null)
    setCurrentStep(0)
  }

  function stopAllTimers() {
    Object.values(timerRefs.current).forEach(id => clearInterval(id))
    timerRefs.current = {}
  }

  function startTimer(stepId, totalSeconds) {
    // Stop any running timers first
    stopAllTimers()
    setTimers(prev => {
      const next = {}
      Object.keys(prev).forEach(k => { next[k] = { ...prev[k], running: false } })
      next[stepId] = { running: true, secondsLeft: totalSeconds, done: false }
      return next
    })
    timerRefs.current[stepId] = setInterval(() => {
      setTimers(prev => {
        const t = prev[stepId]
        if (!t) return prev
        if (t.secondsLeft <= 1) {
          clearInterval(timerRefs.current[stepId])
          delete timerRefs.current[stepId]
          return { ...prev, [stepId]: { ...t, running: false, secondsLeft: 0, done: true } }
        }
        return { ...prev, [stepId]: { ...t, secondsLeft: t.secondsLeft - 1 } }
      })
    }, 1000)
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filteredRecipes = recipes.filter(r => {
    const name = safeStr(r.fields?.[RECIPE_FIELDS.NAME]).toLowerCase()
    const notes = safeStr(r.fields?.[RECIPE_FIELDS.NOTES]).toLowerCase()
    const category = safeStr(r.fields?.[RECIPE_FIELDS.CATEGORY])
    const tags = arr(r.fields?.[RECIPE_FIELDS.TAGS])
    const q = search.toLowerCase()

    const matchSearch = !q || name.includes(q) || notes.includes(q) || category.toLowerCase().includes(q)
    const matchChip = filterChip === 'All' || category === filterChip || tags.includes(filterChip)
    return matchSearch && matchChip
  })

  // ── Add wizard ───────────────────────────────────────────────────────────

  function resetAdd() {
    setAddWizardStep(1)
    setBasics(defaultBasics())
    setIngRows([defaultIng()])
    setStepRows([defaultStep()])
    setAddError('')
  }

  function openAdd() {
    resetAdd()
    setShowAdd(true)
  }

  function closeAdd() {
    setShowAdd(false)
    resetAdd()
  }

  function wizardNext() {
    if (addWizardStep === 1) {
      if (!basics.name.trim()) { setAddError('Recipe name is required'); return }
      setAddError('')
      setAddWizardStep(2)
    } else if (addWizardStep === 2) {
      if (ingRows.filter(r => r.name.trim()).length === 0) {
        setAddError('Add at least one ingredient')
        return
      }
      setAddError('')
      setAddWizardStep(3)
    }
  }

  async function saveRecipe() {
    if (stepRows.filter(r => r.instruction.trim()).length === 0) {
      setAddError('Add at least one step')
      return
    }
    setAddError('')
    setSaving(true)
    try {
      const filteredIngs = ingRows
        .filter(r => r.name.trim())
        .map((r, i) => ({ ...r, displayOrder: i + 1, quantity: r.quantity ? Number(r.quantity) : null }))
      const filteredSteps = stepRows
        .filter(r => r.instruction.trim())
        .map((r, i) => ({
          ...r,
          stepNumber: i + 1,
          timerMinutes: r.timerMinutes ? Number(r.timerMinutes) : null,
        }))

      await createRecipe(
        {
          ...basics,
          servingsBase: Number(basics.servingsBase) || 4,
          prepTime: basics.prepTime ? Number(basics.prepTime) : null,
          cookTime: basics.cookTime ? Number(basics.cookTime) : null,
        },
        filteredIngs,
        filteredSteps
      )
      closeAdd()
      showToast('Recipe saved!')
      await loadRecipes()
    } catch (e) {
      setAddError(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Render: Cook mode ─────────────────────────────────────────────────────

  if (cookingRecipe) {
    const recFields = cookingRecipe.fields || {}
    const recipeName = safeStr(recFields[RECIPE_FIELDS.NAME])
    const servingsBase = safeNum(recFields[RECIPE_FIELDS.SERVINGS_BASE]) || 4
    const totalSteps = steps.length

    return (
      <div className="flex flex-col h-full max-w-lg mx-auto bg-white relative">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
          <div className="flex items-center px-4 py-3">
            <button onClick={exitCookMode} className="mr-3 p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
              <ArrowLeft size={20} />
            </button>
            <h1 className="flex-1 font-semibold text-gray-900 truncate text-center pr-1">{recipeName}</h1>
            {activeTab === 'steps' && totalSteps > 0 && (
              <span className="text-sm text-gray-500 whitespace-nowrap">{currentStep + 1} / {totalSteps}</span>
            )}
          </div>

          {/* Progress bar */}
          {totalSteps > 0 && (
            <div className="h-1 bg-gray-100 mx-4 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-300"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              />
            </div>
          )}

          {/* Servings scaler */}
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-sm text-gray-600 font-medium">Servings</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setServings(s => Math.max(1, s - 1))}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                <Minus size={14} />
              </button>
              <span className="text-sm font-semibold w-6 text-center">{servings}</span>
              <button
                onClick={() => setServings(s => Math.min(24, s + 1))}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                <Plus size={14} />
              </button>
            </div>
            <span className="text-xs text-gray-400">· amounts scale automatically</span>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100 px-4">
            {['steps', 'ingredients'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2.5 px-4 text-sm font-medium capitalize border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-amber-400 text-amber-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-24">
          {cookLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading…</div>
          ) : activeTab === 'steps' ? (
            <StepsTab
              steps={steps}
              currentStep={currentStep}
              timers={timers}
              onStartTimer={startTimer}
            />
          ) : (
            <IngredientsTab
              ingredients={ingredients}
              servings={servings}
              servingsBase={servingsBase}
              checkedIngs={checkedIngs}
              onToggle={id => setCheckedIngs(prev => {
                const next = new Set(prev)
                next.has(id) ? next.delete(id) : next.add(id)
                return next
              })}
              onReset={() => setCheckedIngs(new Set())}
            />
          )}
        </div>

        {/* Sticky bottom nav */}
        {activeTab === 'steps' && totalSteps > 0 && (
          <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-100 px-4 py-3 flex gap-3">
            <button
              disabled={currentStep === 0}
              onClick={() => setCurrentStep(s => s - 1)}
              className="flex-1 py-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 disabled:opacity-30 hover:bg-gray-50"
            >
              ← Back
            </button>
            {currentStep < totalSteps - 1 ? (
              <button
                onClick={() => setCurrentStep(s => s + 1)}
                className="flex-2 flex-grow-[2] py-4 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={() => { exitCookMode(); showToast('Great cooking! 🎉') }}
                className="flex-2 flex-grow-[2] py-4 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
              >
                Done ✓
              </button>
            )}
          </div>
        )}

        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-2.5 rounded-full text-sm font-medium z-50 whitespace-nowrap">
            {toast}
          </div>
        )}
      </div>
    )
  }

  // ── Render: Browse mode ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full max-w-lg mx-auto bg-white relative">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">Recipes</h1>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-gray-900 text-white text-sm font-medium px-3 py-2 rounded-full hover:bg-gray-800"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="px-4 pb-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipes..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-400 bg-gray-50"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {FILTER_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => setFilterChip(chip)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterChip === chip
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-200 text-gray-500 hover:border-gray-400'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Recipe list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading…</div>
        )}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>
        )}
        {!loading && !error && filteredRecipes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <ChefHat size={48} className="text-gray-200 mb-4" />
            <p className="text-gray-500 text-sm mb-4">
              {search || filterChip !== 'All' ? 'No recipes match your filter.' : 'No recipes yet — add your first one!'}
            </p>
            {!search && filterChip === 'All' && (
              <button
                onClick={openAdd}
                className="bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-full hover:bg-gray-800"
              >
                + Add Recipe
              </button>
            )}
          </div>
        )}
        {!loading && filteredRecipes.map(recipe => (
          <RecipeCard key={recipe.id} recipe={recipe} onTap={() => enterCookMode(recipe)} />
        ))}
      </div>

      {/* Add sheet */}
      {showAdd && (
        <AddSheet
          step={addWizardStep}
          basics={basics}
          setBasics={setBasics}
          ingRows={ingRows}
          setIngRows={setIngRows}
          stepRows={stepRows}
          setStepRows={setStepRows}
          addError={addError}
          saving={saving}
          onNext={wizardNext}
          onBack={() => addWizardStep > 1 ? setAddWizardStep(s => s - 1) : closeAdd()}
          onSave={saveRecipe}
          onClose={closeAdd}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-2.5 rounded-full text-sm font-medium z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function RecipeCard({ recipe, onTap }) {
  const f = recipe.fields || {}
  const name = safeStr(f[RECIPE_FIELDS.NAME])
  const category = safeStr(f[RECIPE_FIELDS.CATEGORY])
  const tags = arr(f[RECIPE_FIELDS.TAGS])
  const servings = safeNum(f[RECIPE_FIELDS.SERVINGS_BASE]) || 4
  const prepTime = safeNum(f[RECIPE_FIELDS.PREP_TIME])
  const cookTime = safeNum(f[RECIPE_FIELDS.COOK_TIME])
  const totalMin = prepTime + cookTime
  const emoji = CATEGORY_EMOJI[category] || '🍴'

  return (
    <button
      onClick={onTap}
      className="w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 hover:bg-amber-50 transition-colors"
    >
      <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-2xl flex-shrink-0">
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium text-gray-900 text-[15px] leading-snug">{name}</span>
          {totalMin > 0 && (
            <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5">{fmtTime(totalMin)}</span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {category && <span>{category}</span>}
          <span className="text-gray-300"> · </span>
          <span>{servings} servings</span>
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {tags.slice(0, 4).map(t => (
              <span key={t} className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">{t}</span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

function StepsTab({ steps, currentStep, timers, onStartTimer }) {
  return (
    <div className="px-4 py-4 space-y-3">
      {steps.map((step, idx) => {
        const f = step.fields || {}
        const instruction = safeStr(f[STEP_FIELDS.INSTRUCTION])
        const timerMin = safeNum(f[STEP_FIELDS.TIMER_MINUTES])
        const timerLabel = safeStr(f[STEP_FIELDS.TIMER_LABEL])
        const keyValue = safeStr(f[STEP_FIELDS.KEY_VALUE])
        const stepNum = safeNum(f[STEP_FIELDS.STEP_NUMBER])
        const timer = timers[step.id]

        const isDone = idx < currentStep
        const isCurrent = idx === currentStep
        const isUpcoming = idx > currentStep

        // Highlight keyValue in instruction text
        let instructionContent = instruction
        if (isCurrent && keyValue && instruction.includes(keyValue)) {
          const parts = instruction.split(keyValue)
          instructionContent = parts.reduce((acc, part, i) => {
            if (i < parts.length - 1) {
              return [...acc, part, <span key={i} className="text-amber-600 font-semibold">{keyValue}</span>]
            }
            return [...acc, part]
          }, [])
        }

        return (
          <div
            key={step.id}
            className={`rounded-xl p-4 transition-opacity duration-200 ${
              isCurrent
                ? 'bg-white border border-gray-100 shadow-sm border-l-4 border-l-amber-400'
                : isDone
                ? 'opacity-40'
                : 'opacity-60 bg-gray-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                isDone ? 'bg-gray-200 text-gray-500' : isCurrent ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                {isDone ? '✓' : stepNum || idx + 1}
              </span>
              <p className={`flex-1 leading-relaxed ${isCurrent ? 'text-base text-gray-900' : 'text-sm text-gray-600'}`}>
                {instructionContent}
              </p>
            </div>

            {isCurrent && timerMin > 0 && !isDone && (
              <div className="mt-3 ml-9">
                {!timer || (!timer.running && !timer.done) ? (
                  <button
                    onClick={() => onStartTimer(step.id, timerMin * 60)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-lg hover:bg-amber-100"
                  >
                    ⏱ Start {timerLabel || `${timerMin} min`} timer
                  </button>
                ) : timer.running ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-lg">
                    ⏱ {fmtSeconds(timer.secondsLeft)} remaining
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg">
                    ✓ Timer done!
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function IngredientsTab({ ingredients, servings, servingsBase, checkedIngs, onToggle, onReset }) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">{ingredients.length} ingredients</span>
        {checkedIngs.size > 0 && (
          <button onClick={onReset} className="text-xs text-amber-600 hover:underline">Reset</button>
        )}
      </div>
      <div className="space-y-1">
        {ingredients.map(ing => {
          const f = ing.fields || {}
          const name = safeStr(f[ING_FIELDS.NAME])
          const qty = scaleQty(f[ING_FIELDS.QUANTITY], servingsBase, servings)
          const unit = safeStr(f[ING_FIELDS.UNIT])
          const notes = safeStr(f[ING_FIELDS.NOTES])
          const checked = checkedIngs.has(ing.id)

          return (
            <button
              key={ing.id}
              onClick={() => onToggle(ing.id)}
              className={`w-full text-left flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors hover:bg-gray-50 ${
                checked ? 'opacity-40' : ''
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                checked ? 'border-green-400 bg-green-400' : 'border-gray-300'
              }`}>
                {checked && <span className="text-white text-xs">✓</span>}
              </div>
              <span className={`flex-1 text-sm text-gray-800 ${checked ? 'line-through' : ''}`}>
                {qty && unit ? `${qty} ${unit} ` : qty ? `${qty} ` : ''}{name}
                {notes && <span className="text-gray-400 ml-1">({notes})</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AddSheet({ step, basics, setBasics, ingRows, setIngRows, stepRows, setStepRows, addError, saving, onNext, onBack, onSave, onClose }) {
  const titles = ['', 'Basics', 'Ingredients', 'Steps']

  function updateBasics(key, val) {
    setBasics(prev => ({ ...prev, [key]: val }))
  }

  function toggleTag(tag) {
    setBasics(prev => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag],
    }))
  }

  function updateIng(i, key, val) {
    setIngRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  }

  function removeIng(i) {
    setIngRows(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateStep(i, key, val) {
    setStepRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  }

  function removeStep(i) {
    setStepRows(prev => prev.filter((_, idx) => idx !== i))
  }

  function moveStep(i, dir) {
    setStepRows(prev => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto z-50 bg-white rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Sheet header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Step {step} of 3</span>
            <span className="font-semibold text-gray-900">{titles[step]}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Sheet body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Recipe name *</label>
                <input
                  autoFocus
                  type="text"
                  value={basics.name}
                  onChange={e => updateBasics('name', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400"
                  placeholder="e.g. Chicken Alfredo"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select
                    value={basics.category}
                    onChange={e => updateBasics('category', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    <option value="">Select…</option>
                    {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Added By</label>
                  <select
                    value={basics.addedBy}
                    onChange={e => updateBasics('addedBy', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 bg-white"
                  >
                    <option value="">Select…</option>
                    <option>Thomas</option>
                    <option>Gabrielle</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Servings</label>
                  <input type="number" min={1} value={basics.servingsBase} onChange={e => updateBasics('servingsBase', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Prep (min)</label>
                  <input type="number" min={0} value={basics.prepTime} onChange={e => updateBasics('prepTime', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cook (min)</label>
                  <input type="number" min={0} value={basics.cookTime} onChange={e => updateBasics('cookTime', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {TAGS.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        basics.tags.includes(tag)
                          ? 'bg-amber-400 text-white'
                          : 'border border-gray-200 text-gray-500 hover:border-gray-400'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  value={basics.notes}
                  onChange={e => updateBasics('notes', e.target.value)}
                  rows={2}
                  placeholder="Optional notes…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-400 resize-none"
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {ingRows.map((row, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={row.name}
                      onChange={e => updateIng(i, 'name', e.target.value)}
                      placeholder="Ingredient name"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
                    />
                    <div className="flex gap-2">
                      <input type="number" min={0} value={row.quantity} onChange={e => updateIng(i, 'quantity', e.target.value)}
                        placeholder="Qty" className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                      <select value={row.unit} onChange={e => updateIng(i, 'unit', e.target.value)}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white">
                        <option value="">Unit</option>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <input type="text" value={row.notes} onChange={e => updateIng(i, 'notes', e.target.value)}
                      placeholder="e.g. room temp, finely minced"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                  </div>
                  {ingRows.length > 1 && (
                    <button onClick={() => removeIng(i)} className="mt-1 p-1.5 text-gray-400 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setIngRows(prev => [...prev, defaultIng()])}
                className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-amber-300 hover:text-amber-600">
                + Add ingredient
              </button>
            </>
          )}

          {step === 3 && (
            <>
              {stepRows.map((row, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Step {i + 1}</span>
                    <div className="flex gap-1">
                      <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                        <ChevronUp size={14} />
                      </button>
                      <button onClick={() => moveStep(i, 1)} disabled={i === stepRows.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                        <ChevronDown size={14} />
                      </button>
                      {stepRows.length > 1 && (
                        <button onClick={() => removeStep(i)} className="p-1 text-gray-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={row.instruction}
                    onChange={e => updateStep(i, 'instruction', e.target.value)}
                    rows={3}
                    placeholder="Instruction (required)"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <input type="number" min={0} value={row.timerMinutes} onChange={e => updateStep(i, 'timerMinutes', e.target.value)}
                        placeholder="Timer (min)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                    </div>
                    <div className="flex-1">
                      <input type="text" value={row.timerLabel} onChange={e => updateStep(i, 'timerLabel', e.target.value)}
                        placeholder="Timer name e.g. 'Simmer'"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                    </div>
                  </div>
                  <input type="text" value={row.keyValue} onChange={e => updateStep(i, 'keyValue', e.target.value)}
                    placeholder="Key value to highlight e.g. '400°F'"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400" />
                </div>
              ))}
              <button onClick={() => setStepRows(prev => [...prev, defaultStep()])}
                className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-amber-300 hover:text-amber-600">
                + Add step
              </button>
            </>
          )}

          {addError && (
            <p className="text-sm text-red-600">{addError}</p>
          )}
        </div>

        {/* Sheet footer */}
        <div className="px-4 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            ← Back
          </button>
          {step < 3 ? (
            <button
              onClick={onNext}
              className="flex-2 flex-grow-[2] py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800"
            >
              Next: {step === 1 ? 'Ingredients' : 'Steps'} →
            </button>
          ) : (
            <button
              onClick={onSave}
              disabled={saving}
              className="flex-2 flex-grow-[2] py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Recipe'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
