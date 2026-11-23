import { ExternalLink, Plus } from 'lucide-react'

export default function OutliersView({ outliers, onUse, busy }) {
  const sorted = outliers.slice().sort((a, b) => b.multiple - a.multiple)

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Videos from small channels that did far better than their size. The multiple is views divided by subscribers.
      </p>
      {sorted.length === 0 && (
        <p className="text-sm text-gray-500">Nothing logged yet. Add rows in Airtable as you find them.</p>
      )}
      <ul className="space-y-2">
        {sorted.map(o => (
          <li key={o.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900 min-w-0">{o.title}</p>
              {o.multiple > 0 && (
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded flex-shrink-0 tabular-nums">
                  {o.multiple.toFixed(1)}x
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {[o.channel, o.subs ? `${o.subs.toLocaleString()} subs` : '', o.views ? `${o.views.toLocaleString()} views` : '', o.length]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {o.takeaway && <p className="text-sm text-gray-700">{o.takeaway}</p>}
            <div className="flex items-center gap-3">
              {o.url && (
                <a
                  href={o.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Watch it <ExternalLink size={11} />
                </a>
              )}
              <button
                onClick={() => onUse(o)}
                disabled={busy}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <Plus size={13} /> Make it an idea
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
