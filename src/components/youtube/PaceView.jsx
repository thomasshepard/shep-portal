import { useMemo } from 'react'
import { fmtMoney, monthSpend, weekStart, VA_RATE } from '../../lib/youtube'

function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function PaceView({ videos, series, costs, runner }) {
  const weeks = useMemo(() => {
    const out = []
    for (let i = 5; i >= 0; i--) {
      const start = weekStart()
      start.setDate(start.getDate() - i * 7)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      const items = videos.filter(v => {
        if (!v.publishDate) return false
        const d = new Date(v.publishDate + 'T00:00:00')
        return d >= start && d < end
      })
      out.push({
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        count: items.length,
        items,
      })
    }
    return out
  }, [videos])

  const maxWeek = Math.max(1, ...weeks.map(w => w.count))
  const spend = monthSpend(costs)
  const cap = runner?.monthlyCap || 0

  const published = videos.filter(v => v.stage === 'Published')
  const perVideo = published.slice(-6).map(v => ({
    id: v.id,
    subject: v.subject,
    ai: v.aiCost,
    time: ((v.reviewMinutes + v.renderMinutes) / 60) * VA_RATE,
  }))
  const maxCost = Math.max(0.01, ...perVideo.map(p => p.ai + p.time))

  const wins = videos.reduce((acc, v) => {
    if (v.briefWinner === 'Claude') acc.claude += 1
    else if (v.briefWinner === 'Neon') acc.neon += 1
    else if (v.briefWinner === 'Tie') acc.tie += 1
    return acc
  }, { claude: 0, neon: 0, tie: 0 })

  const last = published
    .slice()
    .sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || ''))[0]

  return (
    <div className="space-y-3">
      {/* Published per week */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">Published per week</h2>
        <div className="space-y-2">
          {weeks.map(w => (
            <div key={w.label} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-10 tabular-nums flex-shrink-0">{w.label}</span>
              <div className="flex-1 flex gap-0.5 items-center">
                {w.count === 0 ? (
                  <span className="text-xs text-gray-300">none</span>
                ) : (
                  w.items.map(v => (
                    <span
                      key={v.id}
                      title={v.subject}
                      className="h-5 rounded"
                      style={{ width: `${100 / Math.max(maxWeek, w.count)}%`, background: v.series?.color || '#94a3b8' }}
                    />
                  ))
                )}
              </div>
              <span className="text-xs font-semibold text-gray-600 tabular-nums w-4 flex-shrink-0">{w.count}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3 flex-wrap text-xs text-gray-500">
          {series.map(s => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded" style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
      </div>

      {/* AI spend this month */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        <h2 className="text-sm font-bold text-gray-900">AI spend this month</h2>
        <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtMoney(spend)}</p>
        {cap > 0 && (
          <>
            <Bar value={spend} max={cap} color={spend > cap * 0.8 ? '#dc2626' : '#2563eb'} />
            <p className="text-xs text-gray-500">
              {spend > cap
                ? `Over the ${fmtMoney(cap)} cap. The runner stops spending until you raise it.`
                : `${fmtMoney(cap - spend)} left of the ${fmtMoney(cap)} cap.`}
            </p>
          </>
        )}
      </div>

      {/* Cost per video */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">Cost per video</h2>
        {perVideo.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing published yet, so there is no cost to compare.</p>
        ) : (
          perVideo.map(p => (
            <div key={p.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-700 truncate">{p.subject}</span>
                <span className="text-gray-500 tabular-nums flex-shrink-0 ml-2">{fmtMoney(p.ai + p.time)}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
                <span className="h-full" style={{ width: `${(p.ai / maxCost) * 100}%`, background: '#2563eb' }} />
                <span className="h-full" style={{ width: `${(p.time / maxCost) * 100}%`, background: '#cbd5e1' }} />
              </div>
            </div>
          ))
        )}
        <p className="text-xs text-gray-500">
          Blue is AI. Grey is time, counted at {fmtMoney(VA_RATE)} an hour.
        </p>
      </div>

      {/* Which researcher is winning */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        <h2 className="text-sm font-bold text-gray-900">Better research brief</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-xl font-bold tabular-nums">{wins.claude}</p><p className="text-xs text-gray-500">Claude</p></div>
          <div><p className="text-xl font-bold tabular-nums">{wins.neon}</p><p className="text-xs text-gray-500">Neon</p></div>
          <div><p className="text-xl font-bold tabular-nums">{wins.tie}</p><p className="text-xs text-gray-500">Tie</p></div>
        </div>
        <p className="text-xs text-gray-500">
          After ten videos, drop whichever keeps losing and halve that step's cost.
        </p>
      </div>

      {/* Last video's numbers */}
      {last && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <h2 className="text-sm font-bold text-gray-900">Last video out</h2>
          <p className="text-sm text-gray-700">{last.title || last.subject}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold tabular-nums">{last.views7 == null ? '—' : last.views7.toLocaleString()}</p>
              <p className="text-xs text-gray-500">views, 7 day</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">{last.ctr == null ? '—' : `${last.ctr}%`}</p>
              <p className="text-xs text-gray-500">CTR</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">{last.avd == null ? '—' : `${Math.round(last.avd / 60)}m`}</p>
              <p className="text-xs text-gray-500">avg view</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">Views and average view come from YouTube. CTR you type in yourself.</p>
        </div>
      )}
    </div>
  )
}
