import { useState } from 'react'
import {
  X, AlertTriangle, CheckCircle2, Circle, Loader2, ExternalLink, RotateCcw, Rocket, Mic, Upload, Check,
} from 'lucide-react'
import { F, STEPS, STAGES, stageLabel, stageIndex, DECISIONS, fmtMoney, VA_RATE } from '../../lib/youtube'

/** What this video is waiting on, in one line. */
function waitingOn(v) {
  if (v.runnerStatus === 'Failed') return { who: 'you', text: `The PC stopped at ${v.runnerStep || 'a step'}. Retry it or fix the cause first.` }
  if (v.openClaims > 0) return { who: 'you', text: `${v.openClaims} flagged claim${v.openClaims === 1 ? '' : 's'} to decide.` }
  if (v.photosToCheck > 0) return { who: 'you', text: `${v.photosToCheck} photo${v.photosToCheck === 1 ? '' : 's'} to approve or drop.` }
  if (v.stage === 'Ready to Approve' && !v.approved) return { who: 'you', text: 'Watch it through, then approve it to publish.' }
  if (v.stage === 'Idea') return { who: 'you', text: 'Start research when you are happy with the subject.' }
  if (v.stage === 'Scheduled' && v.privacy !== 'public') return { who: 'you', text: 'Uploaded as private. Make it public in YouTube Studio when you are ready.' }
  if (v.stage === 'Published' && v.ctr == null) return { who: 'you', text: 'Add the CTR from Studio. Views and average view come in on their own.' }
  if (v.runnerStatus === 'Running') return { who: 'pc', text: `The PC is on ${v.runnerStep || 'a step'}.` }
  if (v.runnerStatus === 'Queued') return { who: 'pc', text: 'Queued. The PC will pick it up next.' }
  return { who: 'none', text: 'Nothing is waiting. This one is done.' }
}

function Row({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-right min-w-0 break-words">{value}</span>
    </div>
  )
}

export default function VideoSheet({
  video: v, series, claims, photos, costs, helperView, busy, onClose,
  onWriteVideo, onDecideClaim, onDecidePhoto,
}) {
  const [goLive, setGoLive] = useState(v.goLiveAt ? v.goLiveAt.slice(0, 16) : '')
  const [ctr, setCtr] = useState(v.ctr == null ? '' : String(v.ctr))
  const [watched, setWatched] = useState(false)
  const [titleChecked, setTitleChecked] = useState(false)

  const wait = waitingOn(v)
  const who = helperView ? 'the VA' : 'you'
  const idx = stageIndex(v.stage)
  const openClaims = claims.filter(c => !c.decision)
  const openPhotos = photos.filter(p => !p.approved && !p.removed)
  const timeCost = ((v.reviewMinutes + v.renderMinutes) / 60) * VA_RATE

  const approve = async () => {
    const fields = {
      [F.videos.approved]: true,
      [F.videos.approvedAt]: new Date().toISOString(),
    }
    if (goLive) fields[F.videos.goLiveAt] = new Date(goLive).toISOString()
    const ok = await onWriteVideo(fields, 'Approved. The PC uploads it next.')
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg max-h-[92vh] rounded-t-2xl sm:rounded-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-gray-900 break-words">{v.title || v.subject}</h2>
            <p className="text-xs text-gray-500">
              {stageLabel(v.stage)}
              {v.series ? ` · ${v.series.name}` : ''}
              {v.daysInStage ? ` · ${v.daysInStage} day${v.daysInStage === 1 ? '' : 's'} here` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Waiting on */}
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              wait.who === 'you' ? 'bg-amber-50 text-amber-900' : wait.who === 'pc' ? 'bg-blue-50 text-blue-900' : 'bg-gray-50 text-gray-600'
            }`}
          >
            <span className="font-bold">
              {wait.who === 'you' ? `Waiting on ${who}. ` : wait.who === 'pc' ? 'Waiting on the PC. ' : ''}
            </span>
            {wait.text}
          </div>

          {/* The run */}
          {v.runnerStatus === 'Failed' && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-2">
              <p className="text-sm font-bold text-red-900 flex items-center gap-2">
                <AlertTriangle size={15} /> Stopped at {v.runnerStep || 'a step'}
              </p>
              {v.lastError && <p className="text-xs text-red-800 break-words">{v.lastError}</p>}
              <button
                onClick={() => onWriteVideo({ [F.videos.retry]: true }, 'Retry asked for')}
                disabled={busy || v.retry}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                <RotateCcw size={13} /> {v.retry ? 'Retry asked for' : 'Retry this step'}
              </button>
            </div>
          )}
          {v.runnerStatus === 'Running' && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-2">
              <p className="text-sm font-bold text-blue-900 flex items-center gap-2">
                <Loader2 size={15} className="animate-spin" /> {v.runnerStep || 'Working'}
              </p>
              <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.round((v.runnerProgress || 0) * 100)}%` }} />
              </div>
            </div>
          )}

          {/* Approve to publish */}
          {v.stage === 'Ready to Approve' && !v.approved && (
            <div className="rounded-xl border-2 border-blue-600 p-4 space-y-3">
              <h3 className="text-base font-bold text-gray-900">Approve to publish</h3>
              {v.thumbnail && (
                <img src={v.thumbnail} alt="" className="w-full rounded-lg bg-gray-100" />
              )}
              {v.videoFile && (
                <a href={v.videoFile} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
                  Watch the render <ExternalLink size={12} />
                </a>
              )}
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  {openClaims.length === 0 ? <CheckCircle2 size={16} className="text-green-600" /> : <AlertTriangle size={16} className="text-red-600" />}
                  {openClaims.length === 0 ? 'Every flagged claim decided' : `${openClaims.length} claim still waiting`}
                </li>
                <li className="flex items-center gap-2">
                  {openPhotos.length === 0 ? <CheckCircle2 size={16} className="text-green-600" /> : <AlertTriangle size={16} className="text-red-600" />}
                  {openPhotos.length === 0 ? 'Every photo checked and cleared for rights' : `${openPhotos.length} photo still waiting`}
                </li>
                <li>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={watched} onChange={e => setWatched(e.target.checked)} className="rounded" />
                    I watched the first minute and the end
                  </label>
                </li>
                <li>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={titleChecked} onChange={e => setTitleChecked(e.target.checked)} className="rounded" />
                    Title and thumbnail are the ones I want
                  </label>
                </li>
              </ul>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-gray-500">Go public at (leave blank to decide later)</span>
                <input
                  type="datetime-local"
                  value={goLive}
                  onChange={e => setGoLive(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                />
              </label>
              <p className="text-xs text-gray-500">
                It uploads as private either way. YouTube keeps new API uploads private until the channel passes its audit, so you flip it to public in Studio.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onWriteVideo({ [F.videos.stage]: 'VA Review' }, 'Sent back for another look')}
                  disabled={busy}
                  className="flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Send it back
                </button>
                <button
                  onClick={approve}
                  disabled={busy || !watched || !titleChecked || openClaims.length > 0 || openPhotos.length > 0}
                  className="flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  Approve
                </button>
              </div>
            </div>
          )}
          {v.approved && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-900">
              <span className="font-bold">Approved{v.approvedAt ? ` ${new Date(v.approvedAt).toLocaleDateString()}` : ''}.</span>{' '}
              {v.youtubeUrl ? 'It is up on YouTube.' : 'The PC uploads it on its next pass.'}
            </div>
          )}

          {/* Claims to decide, right here */}
          {openClaims.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-900">Claims to decide</h3>
              {openClaims.map(c => (
                <div key={c.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
                  <p className="text-sm text-gray-900">{c.claim}</p>
                  {c.why && <p className="text-xs text-gray-500">{c.why}</p>}
                  {c.fix && (
                    <p className="text-xs text-gray-700 bg-gray-50 rounded-lg px-2.5 py-2">
                      <span className="font-semibold">Suggested: </span>{c.fix}
                    </p>
                  )}
                  <div className="flex gap-2">
                    {DECISIONS.map(d => (
                      <button
                        key={d}
                        onClick={() => onDecideClaim(c.id, d)}
                        disabled={busy}
                        className={`flex-1 px-2 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                          d === 'Use fix' ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Photos to check, right here */}
          {openPhotos.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-900">Photos to check</h3>
              {openPhotos.map(p => (
                <div key={p.id} className="rounded-xl border border-gray-200 p-3 flex items-start gap-3">
                  {p.image && <img src={p.image} alt="" className="w-20 h-14 object-cover rounded-lg bg-gray-100 flex-shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 break-words">{p.item}</p>
                    <p className="text-xs text-gray-500">{[p.archive, p.rights].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => onDecidePhoto(p.id, { [F.sources.approved]: true, [F.sources.removed]: false })}
                      disabled={busy}
                      className="p-2 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => onDecidePhoto(p.id, { [F.sources.removed]: true, [F.sources.approved]: false })}
                      disabled={busy}
                      className="p-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stage actions */}
          <div className="flex gap-2 flex-wrap">
            {v.stage === 'Idea' && (
              <button
                onClick={() => onWriteVideo({ [F.videos.stage]: 'Researching', [F.videos.runnerStatus]: 'Queued' }, 'Queued for research')}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Rocket size={14} /> Start research
              </button>
            )}
            {v.stage === 'VA Review' && openClaims.length === 0 && openPhotos.length === 0 && (
              <button
                onClick={() => onWriteVideo({ [F.videos.stage]: 'Voiced', [F.videos.runnerStatus]: 'Queued' }, 'Sent to voice')}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Mic size={14} /> Send to voice
              </button>
            )}
            {v.stage === 'Scheduled' && v.youtubeUrl && (
              <a
                href={v.youtubeUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Upload size={14} /> Open it in Studio
              </a>
            )}
          </div>

          {/* CTR, the one number YouTube's API does not hand over */}
          {v.stage === 'Published' && (
            <div className="rounded-xl border border-gray-200 p-4 space-y-2">
              <h3 className="text-sm font-bold text-gray-900">Add the CTR</h3>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={ctr}
                  onChange={e => setCtr(e.target.value)}
                  placeholder="4.8"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                />
                <button
                  onClick={() => onWriteVideo({ [F.videos.ctr]: Number(ctr) }, 'CTR saved')}
                  disabled={busy || ctr === ''}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Views {v.views7 == null ? 'not in yet' : v.views7.toLocaleString()} · average view {v.avd == null ? '—' : `${Math.round(v.avd / 60)} min`}
              </p>
            </div>
          )}

          {/* Steps */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">The 15 steps</h3>
            </div>
            <ul className="divide-y divide-gray-50">
              {STEPS.map(s => {
                const sIdx = stageIndex(s.stage)
                const done = sIdx < idx
                const now = sIdx === idx
                return (
                  <li key={s.n} className="px-4 py-2 flex items-center gap-2.5 text-sm">
                    {done ? (
                      <CheckCircle2 size={15} className="text-green-600 flex-shrink-0" />
                    ) : now ? (
                      <Loader2 size={15} className="text-blue-600 flex-shrink-0" />
                    ) : (
                      <Circle size={15} className="text-gray-300 flex-shrink-0" />
                    )}
                    <span className={done ? 'text-gray-400 line-through' : now ? 'text-gray-900 font-medium' : 'text-gray-500'}>
                      {s.label}
                    </span>
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-gray-400 flex-shrink-0">
                      {s.who === 'ai' ? 'PC' : helperView ? 'VA' : 'You'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Research and titles */}
          {(v.briefWinner || v.judgeNotes || v.titleOptions || v.hook) && (
            <div className="rounded-xl border border-gray-200 p-4 space-y-1">
              <h3 className="text-sm font-bold text-gray-900 mb-1">Research and titles</h3>
              <Row label="Better brief" value={v.briefWinner ? `${v.briefWinner}${v.hasBriefClaude && v.hasBriefNeon ? ' (both written)' : ''}` : null} />
              <Row label="Why" value={v.judgeNotes} />
              <Row label="Titles tried" value={v.titleOptions} />
              <Row label="Hook" value={v.hook} />
            </div>
          )}

          {/* Cost */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-1">
            <h3 className="text-sm font-bold text-gray-900 mb-1">What it cost</h3>
            {costs.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing logged yet.</p>
            ) : (
              costs.map(c => <Row key={c.id} label={`${c.step}${c.model ? ` · ${c.model}` : ''}`} value={fmtMoney(c.cost)} />)
            )}
            <div className="border-t border-gray-100 mt-2 pt-2">
              <Row label="AI total" value={fmtMoney(v.aiCost)} />
              <Row label={`Time at ${fmtMoney(VA_RATE)}/hr`} value={timeCost > 0 ? fmtMoney(timeCost) : '—'} />
              <Row label="All in" value={fmtMoney(v.aiCost + timeCost)} />
            </div>
          </div>

          {/* Links and the facts */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-1">
            <h3 className="text-sm font-bold text-gray-900 mb-1">Details</h3>
            <Row label="Subject" value={v.subject} />
            <Row label="Angle" value={v.angle || v.company} />
            <Row label="Where" value={v.state} />
            <Row label="Series" value={v.series?.name} />
            <Row label="Privacy" value={v.privacy} />
            <Row label="Published" value={v.publishDate} />
            <Row label="Run folder" value={v.runFolder} />
            {v.scriptLink && (
              <a href={v.scriptLink} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 pt-1">
                The script <ExternalLink size={12} />
              </a>
            )}
            {v.youtubeUrl && (
              <a href={v.youtubeUrl} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 hover:underline pt-1">
                On YouTube
              </a>
            )}
            {v.runnerLog && (
              <details className="pt-2">
                <summary className="text-xs font-semibold text-gray-500 cursor-pointer">Run log</summary>
                <pre className="mt-1 text-[11px] text-gray-600 whitespace-pre-wrap break-words">{v.runnerLog}</pre>
              </details>
            )}
          </div>

          {/* Move it by hand, as a way out of any corner */}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-500">Move it by hand</span>
            <select
              value={v.stage}
              onChange={e => onWriteVideo({ [F.videos.stage]: e.target.value }, `Moved to ${stageLabel(e.target.value)}`)}
              disabled={busy}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
            >
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          {series.length > 1 && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-gray-500">Series</span>
              <select
                value={v.seriesId || ''}
                onChange={e => onWriteVideo({ [F.videos.series]: e.target.value ? [e.target.value] : [] }, 'Series changed')}
                disabled={busy}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="">None</option>
                {series.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
