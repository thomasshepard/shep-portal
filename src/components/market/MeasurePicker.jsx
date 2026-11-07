import { X } from 'lucide-react'

const SELECT_CLS = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-50'

function groupMeasures(measures) {
  const groups = []
  for (const m of measures) {
    let g = groups.find(x => x.name === m.group)
    if (!g) { g = { name: m.group, items: [] }; groups.push(g) }
    g.items.push(m)
  }
  return groups
}

/**
 * Grouped multi-select. Selected measures show as removable chips; a native grouped <select>
 * (best on phones) adds more, up to `max`. With `single`, it is one plain select.
 */
export default function MeasurePicker({ measures, selected, onChange, colors = [], max = 4, single = false, label = 'Measure' }) {
  const groups = groupMeasures(measures)
  const byKey = Object.fromEntries(measures.map(m => [m.key, m]))

  if (single) {
    return (
      <label className="block">
        <span className="text-xs font-semibold text-gray-500">{label}</span>
        <select className={`${SELECT_CLS} mt-1`} value={selected[0] || ''} onChange={e => onChange([e.target.value])}>
          {groups.map(g => (
            <optgroup key={g.name} label={g.name}>
              {g.items.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
    )
  }

  const full = selected.length >= max
  return (
    <div>
      <span className="text-xs font-semibold text-gray-500">{label} (pick 1 to {max})</span>
      <ul className="flex flex-wrap gap-2 mt-1.5 mb-2" aria-label="Selected measures">
        {selected.map((k, i) => (
          <li
            key={k}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 pl-2.5 pr-1 py-1 text-xs text-gray-800 max-w-full"
          >
            <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[i] }} />
            <span className="truncate">{byKey[k]?.label || k}</span>
            <button
              type="button"
              onClick={() => onChange(selected.filter(x => x !== k))}
              disabled={selected.length <= 1}
              aria-label={`Remove ${byKey[k]?.label || k}`}
              className="p-0.5 rounded-full text-gray-500 hover:text-gray-900 disabled:opacity-30"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
      <select
        className={SELECT_CLS}
        value=""
        disabled={full}
        aria-label="Add a measure"
        onChange={e => e.target.value && onChange([...selected, e.target.value])}
      >
        <option value="">{full ? `Maximum of ${max} reached` : 'Add a measure…'}</option>
        {groups.map(g => (
          <optgroup key={g.name} label={g.name}>
            {g.items.map(m => (
              <option key={m.key} value={m.key} disabled={selected.includes(m.key)}>{m.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
