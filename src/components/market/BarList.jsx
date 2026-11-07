/**
 * Horizontal bar list (HTML/CSS so labels stay readable on phones).
 *  items: [{ label, value, valueLabel, sub?, highlight?, tip? }]
 * Each row is focusable and shows a tooltip on hover, focus or tap.
 */
export default function BarList({ items, max, ariaLabel }) {
  const top = max ?? Math.max(...items.map(i => i.value), 0)
  return (
    <ul className="space-y-4" aria-label={ariaLabel}>
      {items.map(item => {
        const pct = top > 0 ? Math.max(1.5, (item.value / top) * 100) : 0
        return (
          <li key={item.label} className="group relative outline-none rounded focus-visible:ring-2 focus-visible:ring-blue-500" tabIndex={0}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-gray-800">{item.label}</span>
              <span className="text-right">
                <span className="font-semibold text-gray-900 tabular-nums">{item.valueLabel}</span>
                {item.sub && <span className="ml-2 text-xs text-green-700 font-medium">{item.sub}</span>}
              </span>
            </div>
            <div className="mt-1 h-3 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-3 rounded-full"
                style={{
                  width: `${pct}%`,
                  background: item.highlight ? 'rgb(var(--c-blue-600))' : 'rgb(var(--c-gray-400))',
                }}
              />
            </div>
            {item.tip && (
              <div
                role="tooltip"
                className="pointer-events-none absolute right-0 -top-8 z-10 hidden group-hover:block group-focus:block rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 shadow"
              >
                {item.tip}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
