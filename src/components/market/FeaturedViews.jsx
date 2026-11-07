import { ExternalLink } from 'lucide-react'
import { FEATURED, X_POSTS, resolveStat } from './presets'

/**
 * Preset cards. Clicking one replaces the explorer's URL state with the card's params
 * (mode, measures, range, toggles); the page then scrolls to the chart.
 * Phones: one horizontally scrolling row (inside the card, so the page never scrolls sideways).
 * Wider screens: a grid.
 */
export default function FeaturedViews({ onPick, activeId }) {
  return (
    <section aria-labelledby="featured-title" className="min-w-0">
      <h2 id="featured-title" className="text-base font-semibold text-gray-900">Featured views</h2>
      <p className="text-xs text-gray-500 mt-0.5">One click sets the measures, range and toggles below. Takes are short paraphrases; numbers come from the data.</p>

      <ul className="mt-3 flex gap-3 overflow-x-auto snap-x scroll-pl-4 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 xl:grid-cols-3 sm:overflow-visible">
        {FEATURED.map(card => {
          const stats = card.stats.map(resolveStat).filter(Boolean)
          const on = activeId === card.id
          return (
            <li key={card.id} className="snap-start shrink-0 w-[17rem] sm:w-auto min-w-0">
              <button
                type="button" onClick={() => onPick(card)} aria-pressed={on}
                className={`h-full w-full text-left rounded-xl border p-3 transition-colors flex flex-col gap-2 ${
                  on ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <span className="text-sm font-semibold text-gray-900">{card.title}</span>
                <span className="text-xs text-gray-600">{card.take}</span>
                {stats.length > 0 && (
                  <span className="mt-auto pt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {stats.map(s => (
                      <span key={s.label} className="block">
                        <span className="block text-[11px] text-gray-500">{s.label}</span>
                        <span className="block text-sm font-semibold text-gray-900 tabular-nums">{s.value}</span>
                        <span className="block text-[11px] text-gray-500">{s.when}</span>
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <p className="text-xs text-gray-500 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Where these ideas come from:</span>
        {X_POSTS.map(p => (
          <a key={p.href} href={p.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
            {p.label} on X <ExternalLink size={11} aria-hidden="true" />
          </a>
        ))}
      </p>
    </section>
  )
}
