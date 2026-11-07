import { fmtMonth } from './marketFormat'
import { chipCls } from './explorerFormat'

const SELECT_CLS = 'rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 min-w-0'
/**
 * From/to selects plus preset chips.
 *  options: list of values (years or 'YYYY-MM'); chips: [{ label, from, to }]
 */
export default function RangePicker({ options, from, to, onChange, chips = [], monthly = false, idPrefix = 'range' }) {
  const label = v => (monthly ? fmtMonth(v) : String(v))
  const setFrom = v => onChange(v, v > to ? v : to)
  const setTo = v => onChange(v < from ? v : from, v)
  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          From
          <select id={`${idPrefix}-from`} className={SELECT_CLS} value={from} onChange={e => setFrom(monthly ? e.target.value : Number(e.target.value))}>
            {options.map(o => <option key={o} value={o}>{label(o)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          To
          <select id={`${idPrefix}-to`} className={SELECT_CLS} value={to} onChange={e => setTo(monthly ? e.target.value : Number(e.target.value))}>
            {options.map(o => <option key={o} value={o}>{label(o)}</option>)}
          </select>
        </label>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Range presets">
          {chips.map(c => (
            <button key={c.label} type="button" className={chipCls(c.from === from && c.to === to)} onClick={() => onChange(c.from, c.to)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
