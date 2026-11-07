import { fmtDollars, fmtInt, fmtPct, fmtSignedDays, fmtSignedPct } from './marketFormat'

const COLS = [
  { key: 'area', label: 'Area', align: 'left' },
  { key: 'median_list_price', label: 'Median list price', fmt: fmtDollars },
  { key: 'price_change_yoy', label: 'vs year ago', fmt: v => fmtSignedPct(v, 1) },
  { key: 'active_listings', label: 'Active listings', fmt: fmtInt },
  { key: 'active_vs_2019', label: 'vs 2019', fmt: v => fmtSignedPct(v, 0) },
  { key: 'median_days_on_market', label: 'Days on market', fmt: v => (v == null ? '' : String(Math.round(v))) },
  { key: 'dom_change_yoy', label: 'Days vs year ago', fmt: fmtSignedDays },
  { key: 'price_cut_share', label: 'Share with price cut', fmt: v => fmtPct(v, 0) },
]

export default function PressureTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            {COLS.map(c => (
              <th key={c.key} scope="col" className={`py-2 px-2 font-semibold ${c.align === 'left' ? 'text-left' : 'text-right'}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.area} className="border-b border-gray-100 last:border-0">
              {COLS.map(c => (
                <td
                  key={c.key}
                  className={`py-2.5 px-2 tabular-nums ${c.align === 'left' ? 'text-left font-medium text-gray-900' : 'text-right text-gray-700'}`}
                >
                  {c.key === 'area' ? r.area : c.fmt(r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
