import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { DECISIONS } from '../../lib/youtube'

const SEV_TONE = {
  High: 'bg-red-50 text-red-700',
  Medium: 'bg-amber-50 text-amber-700',
  Low: 'bg-gray-100 text-gray-600',
}

export default function ClaimsView({ videos, claims, onDecide, busy }) {
  const [onlyOpen, setOnlyOpen] = useState(true)
  const ids = new Set(videos.map(v => v.id))
  const titleOf = id => videos.find(v => v.id === id)?.subject || 'Unassigned'

  const list = claims
    .filter(c => !c.videoId || ids.has(c.videoId))
    .filter(c => (onlyOpen ? !c.decision : true))

  const groups = {}
  list.forEach(c => {
    const k = c.videoId || 'none'
    groups[k] = groups[k] || []
    groups[k].push(c)
  })

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} className="rounded" />
        Only ones still to decide
      </label>

      {Object.keys(groups).length === 0 && (
        <p className="text-sm text-gray-500">
          {onlyOpen ? 'No claims waiting. The fact check flags only the lines it cannot source.' : 'Nothing has been flagged yet.'}
        </p>
      )}

      {Object.entries(groups).map(([vid, items]) => (
        <div key={vid} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 truncate">{vid === 'none' ? 'Not linked to a video' : titleOf(vid)}</h2>
            <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">{items.length}</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {items.map(c => (
              <li key={c.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${SEV_TONE[c.severity] || SEV_TONE.Low}`}>
                    {c.severity}
                  </span>
                  <p className="text-sm text-gray-900 min-w-0">{c.claim}</p>
                </div>
                {c.why && <p className="text-xs text-gray-500">{c.why}</p>}
                {c.fix && (
                  <p className="text-xs text-gray-700 bg-gray-50 rounded-lg px-2.5 py-2">
                    <span className="font-semibold">Suggested: </span>{c.fix}
                  </p>
                )}
                {c.sourceUrl && (
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    What the checker found <ExternalLink size={10} />
                  </a>
                )}
                {c.decision ? (
                  <p className="text-xs font-semibold text-gray-600">
                    You chose {c.decision}{c.applied ? ', and the script was updated' : ', waiting for the script to update'}
                  </p>
                ) : (
                  <div className="flex gap-2">
                    {DECISIONS.map(d => (
                      <button
                        key={d}
                        onClick={() => onDecide(c.id, d)}
                        disabled={busy}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                          d === 'Use fix'
                            ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
