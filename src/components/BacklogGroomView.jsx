import { useEffect, useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { groomBacklogIdea, KIND_OPTIONS, CATEGORY_OPTIONS, EFFORT_OPTIONS } from '../lib/backlogGrooming'

const KIND_HINTS = {
  Build: 'A feature to add to the portal',
  Do: "A one-off task — doesn't belong on a dev backlog",
  'Decide / Research': 'Needs a decision or investigation first',
}

const VALUE_STARS = [1, 2, 3, 4, 5]

function defaultDate(daysFromNow) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

// Full-page takeover (min-h-screen + sticky header), matching Recipes.jsx's
// RecipeForm pattern -- NOT BacklogModal's fixed-overlay pattern, which breaks
// under the iOS keyboard.
export default function BacklogGroomView({ record, onAccept, onDiscard, onCancel, busy }) {
  const [loadingGroom, setLoadingGroom] = useState(true)
  const [groomFailed, setGroomFailed] = useState(false)
  const [form, setForm] = useState({
    kind: '',
    category: '',
    effort: 'M',
    value: 3,
    description: '',
    buildPrompt: '',
    dueDate: '',
    checkInDate: '',
  })

  const isRegroom = !!record.fields['Kind']

  useEffect(() => {
    let cancelled = false

    // Already been through grooming once (re-grooming to change its Kind) --
    // pre-fill from what's already there instead of re-asking the AI, which
    // would ignore any manual edits since and waste a call for no reason.
    if (isRegroom) {
      const f = record.fields
      setForm({
        kind: f['Kind'] || '',
        category: f['Category'] || '',
        effort: f['Effort'] || 'M',
        value: f['Value'] || 3,
        description: f['Description'] || '',
        buildPrompt: f['Build Prompt'] || '',
        dueDate: defaultDate(3),
        checkInDate: f['Check-in Date'] || defaultDate(7),
      })
      setLoadingGroom(false)
      return
    }

    setLoadingGroom(true)
    setGroomFailed(false)
    groomBacklogIdea(record.fields['Feature']).then(result => {
      if (cancelled) return
      setLoadingGroom(false)
      if (!result) {
        setGroomFailed(true)
        return
      }
      setForm(f => ({
        ...f,
        kind: result.kind || '',
        category: result.category || '',
        effort: result.effort || 'M',
        value: result.value || 3,
        description: result.description || '',
        buildPrompt: result.buildPrompt || '',
        checkInDate: result.checkInDate || defaultDate(7),
        dueDate: defaultDate(3),
      }))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function handleAccept() {
    if (!form.kind) { toast.error('Pick a Kind first'); return }
    if (form.kind === 'Decide / Research' && !form.checkInDate) { toast.error('Set a check-in date'); return }
    onAccept(form)
  }

  return (
    <div className="fixed inset-0 z-40 bg-white min-h-screen overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-gray-500 text-sm font-medium hover:text-gray-800">
          <X size={16} /> Cancel
        </button>
        <span className="text-sm font-semibold text-gray-900">{isRegroom ? 'Re-groom' : 'Groom idea'}</span>
        <div className="w-14" />
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5 pb-28">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{isRegroom ? 'Reclassifying' : 'Captured'}</p>
          <p className="text-base font-medium text-gray-900">{record.fields['Feature']}</p>
        </div>

        {loadingGroom && (
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2.5">
            <Sparkles size={16} className="animate-pulse" />
            Asking Claude what this is...
          </div>
        )}
        {!loadingGroom && groomFailed && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            Couldn't get an AI suggestion — fill this in by hand.
          </div>
        )}

        {/* Kind */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Kind</label>
          <div className="grid grid-cols-1 gap-2">
            {KIND_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => set('kind', opt)}
                className={`w-full text-left px-3 py-2.5 min-h-[44px] rounded-lg border transition-colors ${
                  form.kind === opt ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="font-medium text-sm">{opt}</span>
                <span className="block text-xs text-gray-500">{KIND_HINTS[opt]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            value={form.category}
            onChange={e => set('category', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">—</option>
            {CATEGORY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Effort */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Effort</label>
          <select
            value={form.effort}
            onChange={e => set('effort', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {EFFORT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Value */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Value</label>
          <div className="flex gap-2">
            {VALUE_STARS.map(stars => (
              <button
                key={stars}
                type="button"
                onClick={() => set('value', stars)}
                className={`flex-1 min-h-[44px] rounded-lg border text-sm font-medium transition-colors ${
                  form.value === stars ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {stars}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {form.kind === 'Build' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Build Prompt (optional)</label>
            <textarea
              value={form.buildPrompt}
              onChange={e => set('buildPrompt', e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {form.kind === 'Do' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => set('dueDate', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Pushes to Tasks with this due date once accepted.</p>
          </div>
        )}

        {form.kind === 'Decide / Research' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check-in date</label>
            <input
              type="date"
              value={form.checkInDate}
              onChange={e => set('checkInDate', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">If still unresolved by this date, it resurfaces in Triage.</p>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-2"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className="flex-1 min-h-[44px] px-4 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={busy || loadingGroom}
          className="flex-[2] min-h-[44px] px-4 text-sm font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Accept'}
        </button>
      </div>
    </div>
  )
}
