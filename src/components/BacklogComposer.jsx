import { useState } from 'react'
import { Plus, ClipboardList, X } from 'lucide-react'

// Persistent bottom composer -- zero required fields, fixed to the viewport
// bottom so it's reachable without scrolling. Paste-many opens as its own
// full-page view rather than an inline expansion, for the same reason the
// groom view is full-page: an overlay textarea fights the iOS keyboard.
export default function BacklogComposer({ onCapture, onCaptureMany }) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteSubmitting, setPasteSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const value = text.trim()
    if (!value || submitting) return
    setSubmitting(true)
    try {
      await onCapture(value)
      setText('')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePasteSubmit() {
    const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length || pasteSubmitting) return
    setPasteSubmitting(true)
    try {
      await onCaptureMany(lines)
      setPasteText('')
      setPasteOpen(false)
    } finally {
      setPasteSubmitting(false)
    }
  }

  if (pasteOpen) {
    return (
      <div className="fixed inset-0 z-40 bg-white min-h-screen flex flex-col">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <button type="button" onClick={() => setPasteOpen(false)} className="flex items-center gap-1.5 text-gray-500 text-sm font-medium hover:text-gray-800">
            <X size={16} /> Cancel
          </button>
          <span className="text-sm font-semibold text-gray-900">Paste many</span>
          <button
            type="button"
            onClick={handlePasteSubmit}
            disabled={pasteSubmitting || !pasteText.trim()}
            className="text-sm font-semibold text-blue-600 disabled:text-gray-300 min-h-[44px] px-2"
          >
            {pasteSubmitting ? 'Adding…' : 'Add all'}
          </button>
        </div>
        <div className="flex-1 px-4 py-4">
          <p className="text-xs text-gray-500 mb-2">One idea per line — each line becomes its own Inbox card.</p>
          <textarea
            autoFocus
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={'Simplify the sidebar\nCall the insurance agent\nCloverdale dossier'}
            className="w-full h-[60vh] border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="fixed inset-x-0 bottom-0 lg:left-64 z-10 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-2"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        onClick={() => setPasteOpen(true)}
        aria-label="Paste many ideas at once"
        className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
      >
        <ClipboardList size={20} />
      </button>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type a thought, hit Enter..."
        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
      />
      <button
        type="submit"
        disabled={submitting || !text.trim()}
        aria-label="Add"
        className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-lg bg-slate-900 text-white disabled:bg-gray-300"
      >
        <Plus size={20} />
      </button>
    </form>
  )
}
