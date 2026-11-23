import { useState } from 'react'
import { Check, X, ExternalLink, ImageOff } from 'lucide-react'
import { F } from '../../lib/youtube'

const RIGHTS_TONE = {
  'Public domain': 'bg-green-50 text-green-700',
  'CC0': 'bg-green-50 text-green-700',
  'No known restrictions': 'bg-green-50 text-green-700',
  'Needs permission': 'bg-red-50 text-red-700',
  'Unknown': 'bg-amber-50 text-amber-700',
}

export default function PhotosView({ videos, photos, onDecide, busy }) {
  const [onlyOpen, setOnlyOpen] = useState(true)
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

  return (
    <div className="space-y-3">
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
            <h2 className="text-sm font-bold text-gray-900 truncate">{vid === 'none' ? 'Not linked to a video' : titleOf(vid)}</h2>
            <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">{items.length}</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {items.map(p => (
              <li key={p.id} className="px-3 py-3 flex items-start gap-3">
                {p.image ? (
                  <img src={p.image} alt="" className="w-20 h-14 object-cover rounded-lg flex-shrink-0 bg-gray-100" />
                ) : (
                  <span className="w-20 h-14 rounded-lg bg-gray-100 grid place-items-center flex-shrink-0">
                    <ImageOff size={16} className="text-gray-400" />
                  </span>
                )}
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
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
