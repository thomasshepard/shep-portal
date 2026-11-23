import { STAGES, stageLabel } from '../../lib/youtube'

const DOT = {
  Running: 'bg-blue-500',
  Queued: 'bg-purple-400',
  Failed: 'bg-red-500',
  Done: 'bg-green-500',
  Idle: 'bg-gray-300',
}

export default function BoardView({ videos, onOpen }) {
  const byStage = STAGES.map(s => ({ ...s, items: videos.filter(v => v.stage === s.key) }))

  return (
    <div className="space-y-2">
      {byStage.map(col => (
        <div key={col.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">{col.label}</h2>
            <span className="text-xs font-semibold text-gray-400 tabular-nums">{col.items.length}</span>
          </div>
          {col.items.length === 0 ? (
            <p className="px-4 py-2.5 text-xs text-gray-400">Empty</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {col.items.map(v => (
                <li key={v.id}>
                  <button
                    onClick={() => onOpen(v.id)}
                    className="w-full px-4 py-2.5 flex items-center gap-2.5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[v.runnerStatus] || DOT.Idle}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 truncate">
                        {v.title || v.subject}
                      </span>
                      {(v.openClaims > 0 || v.photosToCheck > 0 || v.runnerStatus === 'Failed') && (
                        <span className="block text-xs text-gray-500 truncate">
                          {v.runnerStatus === 'Failed' ? `Stopped at ${v.runnerStep || 'a step'}` : ''}
                          {v.openClaims > 0 ? `${v.runnerStatus === 'Failed' ? ' · ' : ''}${v.openClaims} claims` : ''}
                          {v.photosToCheck > 0 ? `${v.openClaims > 0 || v.runnerStatus === 'Failed' ? ' · ' : ''}${v.photosToCheck} photos` : ''}
                        </span>
                      )}
                    </span>
                    {v.aiCost > 0 && (
                      <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">${v.aiCost.toFixed(2)}</span>
                    )}
                    {v.series && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: v.series.color }} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {videos.length === 0 && (
        <p className="text-sm text-gray-500">
          No videos in this series yet. Tap Video at the top to add the first {stageLabel('Idea').toLowerCase()}.
        </p>
      )}
    </div>
  )
}
