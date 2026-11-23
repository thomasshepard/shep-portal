import { useState } from 'react'
import { Check, X, ExternalLink, ImageOff } from 'lucide-react'
import { F, previewUrlFor } from '../../lib/youtube'

const RIGHTS_TONE = {
  'Public domain': 'bg-green-50 text-green-700',
  'CC0': 'bg-green-50 text-green-700',
  'No known restrictions': 'bg-green-50 text-green-700',
  'Needs permission': 'bg-red-50 text-red-700',
  'Unknown': 'bg-amber-50 text-amber-700',
}

export default function PhotosView({ videos, photos, onDecide, onDecideMany, busy }) {
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [failedImages, setFailedImages] = useState(new Set())

  const ids = new Set(videos.map(v => v.id))
  const titleOf = id => videos.find(v => v.id === id)?.subject || 'Unassigned'

  const list = photos
    .filter(p => !p.videoId || ids.has(p.videoId))
    .filter(p => (onlyOpen ? !p.approved && !p.removed : true))

  const groups = {}
  list.forEach(p => {
    const k = p.videoId || 'none'
    groups[k] = groups[k] || []
    groups[k].push(p)
  })

  const handleDecideMany = async (fields) => {
    if (!onDecideMany) return
    const ok = await onDecideMany(selected, fields)
    if (ok) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selected))
    }
  }

  return (
    <div className="space-y-3 relative">
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} className="rounded" />
        Only ones still to check
      </label>

      {Object.keys(groups).length === 0 && (
        <p className="text-sm text-gray-500">
          {onlyOpen ? 'Every photo has been checked.' : 'No photos pulled yet. The PC adds them at the photo step.'}
        </p>
      )}

      {Object.entries(groups).map(([vid, items]) => (
        <div key={vid} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <input
                type="checkbox"
                className="rounded"
                checked={items.length > 0 && items.every(p => selected.has(p.id))}
                ref={el => {
                  if (el) {
                    const all = items.length > 0 && items.every(p => selected.has(p.id))
                    const some = items.some(p => selected.has(p.id))
                    el.indeterminate = !all && some
                  }
                }}
                onChange={e => {
                  const next = new Set(selected)
                  if (e.target.checked) {
                    items.forEach(p => next.add(p.id))
                  } else {
                    items.forEach(p => next.delete(p.id))
                  }
                  setSelected(next)
                }}
              />
              <h2 className="text-sm font-bold text-gray-900 truncate">{vid === 'none' ? 'Not linked to a video' : titleOf(vid)}</h2>
            </div>
            <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">{items.length}</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {items.map(p => {
              const previewUrl = previewUrlFor(p)
              const hasPreview = previewUrl && !failedImages.has(p.id)
              
              const imgContent = hasPreview ? (
                <img 
                  src={previewUrl} 
                  alt="" 
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    setFailedImages(prev => {
                      const next = new Set(prev)
                      next.add(p.id)
                      return next
                    })
                  }}
                  className="w-24 h-16 sm:w-32 sm:h-20 object-cover rounded-lg flex-shrink-0 bg-gray-100" 
                />
              ) : (
                <span className="w-24 h-16 sm:w-32 sm:h-20 rounded-lg bg-gray-100 flex flex-col items-center justify-center flex-shrink-0 text-gray-400">
                  <ImageOff size={16} />
                  <span className="text-[10px] mt-1">No preview</span>
                </span>
              )

              const thumbnailNode = previewUrl ? (
                <a href={previewUrl} target="_blank" rel="noreferrer" className="flex-shrink-0">
                  {imgContent}
                </a>
              ) : (
                imgContent
              )

              return (
                <li key={p.id} className="px-3 py-3 flex items-start gap-3">
                  <div className="flex items-center h-16 sm:h-20 flex-shrink-0">
                    <input 
                      type="checkbox" 
                      checked={selected.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(selected)
                        if (e.target.checked) next.add(p.id)
                        else next.delete(p.id)
                        setSelected(next)
                      }}
                      className="rounded"
                    />
                  </div>
                  {thumbnailNode}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium text-gray-900 break-words">{p.item}</p>
                    <p className="text-xs text-gray-500">
                      {[p.kind, p.archive].filter(Boolean).join(' · ') || 'No source noted'}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.rights && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${RIGHTS_TONE[p.rights] || 'bg-gray-100 text-gray-600'}`}>
                          {p.rights}
                        </span>
                      )}
                      {p.url && (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                        >
                          Source <ExternalLink size={10} />
                        </a>
                      )}
                      {p.approved && <span className="text-[10px] font-bold text-green-700">Approved</span>}
                      {p.removed && <span className="text-[10px] font-bold text-red-700">Removed</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => onDecide(p.id, { [F.sources.approved]: true, [F.sources.removed]: false })}
                      disabled={busy}
                      title="Use this photo"
                      className="p-2 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50 transition-colors"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      onClick={() => onDecide(p.id, { [F.sources.removed]: true, [F.sources.approved]: false })}
                      disabled={busy}
                      title="Leave it out"
                      className="p-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {selected.size > 0 && (
        <div className="sticky bottom-4 mx-auto max-w-fit bg-white rounded-xl shadow-lg border border-gray-200 p-3 flex items-center justify-between gap-4 z-10">
          <span className="text-sm font-medium text-gray-700">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDecideMany({ [F.sources.approved]: true, [F.sources.removed]: false })}
              disabled={busy}
              className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Approve selected
            </button>
            <button
              onClick={() => handleDecideMany({ [F.sources.removed]: true, [F.sources.approved]: false })}
              disabled={busy}
              className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              Reject selected
            </button>
            <button
              onClick={() => setSelected(new Set())}
              disabled={busy}
              className="px-3 py-1.5 text-gray-600 text-sm font-medium hover:bg-gray-100 rounded-lg disabled:opacity-50 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
