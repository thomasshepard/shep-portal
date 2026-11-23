import { Play, Pause, AlertTriangle, CheckCircle2, Clock, Image as ImageIcon, Upload, BarChart3, Search, Rocket } from 'lucide-react'
import { paceThisWeek, stageLabel } from '../../lib/youtube'

const ICONS = {
  approve: CheckCircle2,
  retry: AlertTriangle,
  claims: AlertTriangle,
  photos: ImageIcon,
  makepublic: Upload,
  ctr: BarChart3,
  start: Rocket,
  outliers: Search,
}

function Tile({ label, value, sub, tone }) {
  const toneCls = tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums leading-tight ${toneCls}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

export default function TodayView({
  videos, series, tasks, runner, runnerState, helperView, onToggleRunner, onOpen, busy,
}) {
  const pace = paceThisWeek(videos, series)
  const failed = videos.filter(v => v.runnerStatus === 'Failed').length
  const stuck = videos.filter(v => v.daysInStage >= 7 && v.stage !== 'Published').length
  const who = helperView ? 'VA' : 'you'

  return (
    <div className="space-y-3">
      {helperView && (
        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600">
          <b className="text-gray-900">Preview.</b> This is the page as a helper would see it. You are still signed in as yourself.
        </div>
      )}

      {/* Runner card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              runnerState === 'on' ? 'bg-green-500' : runnerState === 'paused' ? 'bg-amber-500' : 'bg-red-500'
            }`}
          />
          <span className="font-bold text-sm text-gray-900">
            {runnerState === 'on' ? 'The PC is working' : runnerState === 'paused' ? 'The PC is paused' : 'The PC is not checking in'}
          </span>
          <button
            onClick={onToggleRunner}
            disabled={busy || !runner}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {runner?.paused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
          </button>
        </div>
        <p className="text-sm text-gray-700">
          {runner?.currentJob ? runner.currentJob : 'Nothing running right now.'}
        </p>
        <p className="text-xs text-gray-400">
          {runner?.lastSeen ? `Last checked in ${new Date(runner.lastSeen).toLocaleString()}` : 'It has never checked in. Start the runner on the PC.'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Out this week" value={`${pace.out}/${pace.goal || '—'}`} sub="published" />
        <Tile label="Stopped" value={failed} sub="need a retry" tone={failed ? 'bad' : undefined} />
        <Tile label="Stuck 7+" value={stuck} sub="days in a stage" tone={stuck ? 'warn' : undefined} />
      </div>

      {/* What wants a person */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">
            {tasks.length ? `${tasks.length} thing${tasks.length === 1 ? '' : 's'} for ${who}` : `Nothing needs ${who}`}
          </h2>
          <Clock size={14} className="text-gray-300" />
        </div>
        {tasks.length === 0 ? (
          <p className="px-4 py-5 text-sm text-gray-500">
            The PC has everything it can do on its own. Check back when a video reaches a review step.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tasks.map((t, i) => {
              const Icon = ICONS[t.kind] || Clock
              return (
                <li key={`${t.kind}-${t.video.id}-${i}`}>
                  <button
                    onClick={() => onOpen(t.video.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <Icon
                      size={17}
                      className={t.kind === 'retry' || t.kind === 'claims' ? 'text-red-500 flex-shrink-0' : 'text-blue-500 flex-shrink-0'}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900 truncate">{t.video.subject}</span>
                      <span className="block text-xs text-gray-500 truncate">{t.label}</span>
                    </span>
                    {t.video.series && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.video.series.color }} />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Everything in flight, newest stage first */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">In flight</h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {videos.filter(v => v.stage !== 'Published' && v.stage !== 'Dropped').map(v => (
            <li key={v.id}>
              <button
                onClick={() => onOpen(v.id)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900 truncate">{v.subject}</span>
                  <span className="block text-xs text-gray-500 truncate">
                    {stageLabel(v.stage)}
                    {v.runnerStatus === 'Running' && v.runnerStep ? ` · ${v.runnerStep} ${v.runnerProgress ? `${Math.round(v.runnerProgress * 100)}%` : ''}` : ''}
                    {v.runnerStatus === 'Failed' ? ' · stopped' : ''}
                  </span>
                </span>
                {v.daysInStage >= 7 && <span className="text-[10px] font-bold text-amber-600 flex-shrink-0">{v.daysInStage}d</span>}
                {v.series && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: v.series.color }} />}
              </button>
            </li>
          ))}
          {videos.filter(v => v.stage !== 'Published' && v.stage !== 'Dropped').length === 0 && (
            <li className="px-4 py-5 text-sm text-gray-500">Nothing in flight. Add a video to start one.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
