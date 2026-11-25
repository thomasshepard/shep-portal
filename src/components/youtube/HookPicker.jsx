import { useState } from 'react'
import {
  CheckCircle2, AlertTriangle, HelpCircle, Sparkles, Rocket, ExternalLink
} from 'lucide-react'
import { F, HOOK_REVIEW, RESEARCH_READY } from '../../lib/youtube'

export default function HookPicker({ video, busy, onWriteVideo }) {
  const [changeNote, setChangeNote] = useState('')
  const [customText, setCustomText] = useState('')

  const hooks = video?.hookOptions?.hooks
  if (!hooks?.length) return null

  const status = video?.runnerStatus
  const isHookReview = status === HOOK_REVIEW
  const isResearchReady = status === RESEARCH_READY
  const canInteract = isHookReview || isResearchReady
  const choice = video?.hookChoice

  const handlePick = async (i) => {
    const ok = await onWriteVideo({
      [F.videos.hookChoice]: JSON.stringify({
        action: 'pick',
        index: i,
        at: new Date().toISOString(),
      }),
    }, 'Hook picked')
    return ok
  }

  const handleChanges = async () => {
    const note = changeNote.trim()
    if (!note) return
    const fields = {
      [F.videos.hookChoice]: JSON.stringify({
        action: 'changes',
        note,
        at: new Date().toISOString(),
      }),
    }
    if (isResearchReady) {
      fields[F.videos.runnerStatus] = HOOK_REVIEW
    }
    const ok = await onWriteVideo(fields, 'Changes requested')
    if (ok) setChangeNote('')
    return ok
  }

  const handleCustom = async () => {
    const text = customText.trim()
    if (!text) return
    const ok = await onWriteVideo({
      [F.videos.hookChoice]: JSON.stringify({
        action: 'custom',
        text,
        at: new Date().toISOString(),
      }),
    }, 'Custom hook saved')
    if (ok) setCustomText('')
    return ok
  }

  const handleGo = async () => {
    await onWriteVideo(
      { [F.videos.runnerStatus]: HOOK_REVIEW },
      'Go. The PC writes the script on its next pass.'
    )
  }

  const isPicked = (i) =>
    choice?.action === 'pick' && choice.index === i

  const checkStatus = (check) => {
    if (!check) return { color: 'gray', text: 'Grok: not checked', icon: HelpCircle }
    if (check.ok) return { color: 'green', text: 'Grok: checks out', icon: CheckCircle2 }
    if (check.missing) return { color: 'gray', text: 'Grok: not checked', icon: HelpCircle }
    const n = check.problems?.length || 0
    let text = `Grok flagged ${n}`
    if (check.overpromises) text += ' and it overpromises'
    return { color: 'amber', text, icon: AlertTriangle }
  }

  const checkColorClass = (color) =>
    color === 'green' ? 'text-green-700 bg-green-50 border-green-200'
    : color === 'amber' ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-gray-600 bg-gray-50 border-gray-200'

  const badgeColor = (kind) =>
    kind === 'mystery' ? 'bg-purple-100 text-purple-800'
    : kind === 'betrayal' ? 'bg-red-100 text-red-800'
    : 'bg-gray-100 text-gray-800'

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
        <h3 className="text-sm font-bold text-gray-900">Pick the opening hook</h3>
        <p className="text-xs text-gray-600">
          {isResearchReady
            ? 'Research is done and parked. Pick a hook, then tap Go when you want the script written.'
            : isHookReview
            ? 'The PC writes the script from the hook you pick.'
            : 'The PC is working on this one.'}
        </p>
        {video?.hookOptions?.note && (
          <p className="text-xs text-gray-600">
            <span className="font-semibold">Rewritten after your note:</span> {video.hookOptions.note}
          </p>
        )}
      </div>

      {/* Current choice banner */}
      {choice && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-2">
          {choice.action === 'pick' ? (
            <p className="text-sm text-blue-900">You picked hook {choice.index + 1}.</p>
          ) : choice.action === 'custom' ? (
            <p className="text-sm text-blue-900">You wrote your own hook.</p>
          ) : choice.action === 'changes' && (
            <p className="text-sm text-blue-900">
              You asked for changes: {choice.note}. The PC writes a new set on its next pass.
            </p>
          )}
          {isHookReview && (
            <p className="text-xs text-blue-700">The PC picks this up on its next pass.</p>
          )}
          {isResearchReady && (choice.action === 'pick' || choice.action === 'custom') && (
            <button
              onClick={handleGo}
              disabled={busy}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Rocket size={13} /> Go: write the script
            </button>
          )}
        </div>
      )}

      {/* Hook cards */}
      <div className="space-y-3">
        {hooks.map((h, i) => {
          const check = checkStatus(h.check)
          const CheckIcon = check.icon
          const isCurrentPick = isPicked(i)

          return (
            <div key={i} className="rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badgeColor(h.kind)}`}>
                  {h.kind === 'betrayal' ? 'Betrayal' : 'Mystery'}
                </span>
                <span className="text-xs text-gray-500">Hook {i + 1}</span>
              </div>

              <p className="text-sm text-gray-900 whitespace-pre-line">{h.hook}</p>

              {h.question && (
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Question:</span> {h.question}
                </p>
              )}
              {h.payoff && (
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Pays off:</span> {h.payoff}
                </p>
              )}

              {/* Thumbnail mock */}
              <div className="aspect-video relative overflow-hidden rounded-lg bg-gray-900">
                {h.thumbnail?.image ? (
                  <>
                    <img
                      src={h.thumbnail.image}
                      alt={h.thumbnail.item || 'Archive photo'}
                      loading="lazy"
                      className="object-cover w-full h-full"
                    />
                    {h.thumbnail.words && (
                      <div
                        className="absolute bottom-2 left-2 text-white text-sm font-bold uppercase"
                        style={{ textShadow: '0 2px 6px rgba(0,0,0,.8)' }}
                      >
                        {h.thumbnail.words}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                    {h.thumbnail?.photoIdea && (
                      <p className="text-sm font-medium">Photo idea: {h.thumbnail.photoIdea}</p>
                    )}
                    {h.thumbnail?.words && (
                      <p className="text-sm font-bold uppercase mt-1">{h.thumbnail.words}</p>
                    )}
                  </div>
                )}
              </div>
              {h.thumbnail?.item && (
                <p className="text-[11px] text-gray-500">{h.thumbnail.item}</p>
              )}

              {/* Check line */}
              <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${checkColorClass(check.color)} flex items-center gap-2`}>
                <CheckIcon size={12} />
                <span>{check.text}</span>
              </div>

              {/* Flagged details */}
              {h.check?.problems?.length > 0 && (
                <details className="text-xs text-gray-600">
                  <summary className="font-semibold text-gray-500 cursor-pointer mb-1">Show what was flagged</summary>
                  <div className="space-y-2 mt-1 pl-2 border-l border-gray-200">
                    {h.check.problems.map((p, pi) => (
                      <div key={pi} className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            p.severity === 'High' ? 'bg-red-100 text-red-800'
                            : p.severity === 'Medium' ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-800'
                          }`}>
                            {p.severity}
                          </span>
                          <span className="font-medium">{p.claim}</span>
                        </div>
                        {p.why && <p className="text-gray-600 ml-5">Why: {p.why}</p>}
                        {p.fix && <p className="text-gray-600 ml-5">Fix: {p.fix}</p>}
                        {p.source && p.source.startsWith('http') && (
                          <a href={p.source} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1 ml-5">
                            <ExternalLink size={10} /> Source
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Use this hook button */}
              <button
                onClick={() => handlePick(i)}
                disabled={busy || !canInteract || isCurrentPick}
                className={`w-full min-h-[44px] sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  isCurrentPick
                    ? 'bg-green-600 text-white cursor-default'
                    : canInteract
                    ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isCurrentPick ? (
                  <>
                    <CheckCircle2 size={13} /> Picked
                  </>
                ) : (
                  'Use this hook'
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Ask for changes card */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Sparkles size={15} className="text-amber-600" /> Ask for changes
        </h4>
        <textarea
          value={changeNote}
          onChange={e => setChangeNote(e.target.value)}
          rows={3}
          placeholder="What should change? e.g. shorter, lead with the 1983 shutdown, less about the company"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base resize-y"
          disabled={busy || !canInteract}
        />
        <button
          onClick={handleChanges}
          disabled={busy || !canInteract || !changeNote.trim()}
          className="w-full min-h-[44px] sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          Ask for new hooks
        </button>
        {isResearchReady && (
          <p className="text-xs text-gray-500">
            This takes it off Research ready so the PC can rewrite the hooks. It still waits for your pick before any script.
          </p>
        )}
      </div>

      {/* Write your own card */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Sparkles size={15} className="text-purple-600" /> Write your own
        </h4>
        <textarea
          value={customText}
          onChange={e => setCustomText(e.target.value)}
          rows={4}
          placeholder="Your own opening, about 50 to 80 words"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base resize-y"
          disabled={busy || !canInteract}
        />
        <button
          onClick={handleCustom}
          disabled={busy || !canInteract || !customText.trim()}
          className="w-full min-h-[44px] sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          Use my hook
        </button>
        <p className="text-xs text-gray-500">The fact check still runs on the full script.</p>
      </div>
    </div>
  )
}