import { DATA } from './explorerData'
import { fmtMonth, isNum } from './marketFormat'

/** Yield-curve inversions vs the recessions that followed, with the average lead time. */
export default function RecessionTable() {
  const rows = DATA.recessions
  const leads = rows.map(r => r.months_from_inversion_to_recession).filter(isNum)
  const avg = leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : null
  const heads = ['Recession', 'Curve inverted', 'Months inverted', 'Recession began', 'Months long', 'Months from inversion to recession']
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            {heads.map((h, i) => (
              <th key={h} scope="col" className={`py-2 px-2 font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} className="border-b border-gray-100">
              <th scope="row" className="py-2 px-2 text-left font-medium text-gray-900">{r.name}</th>
              <td className="py-2 px-2 text-right tabular-nums text-gray-700">{fmtMonth(r.inversion_start)}</td>
              <td className="py-2 px-2 text-right tabular-nums text-gray-700">{r.inversion_months ?? ''}</td>
              <td className="py-2 px-2 text-right tabular-nums text-gray-700">{fmtMonth(r.recession_start)}</td>
              <td className="py-2 px-2 text-right tabular-nums text-gray-700">{r.recession_months ?? ''}</td>
              <td className="py-2 px-2 text-right tabular-nums text-gray-700">{r.months_from_inversion_to_recession ?? ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-gray-900">
            <th scope="row" colSpan={5} className="py-2 px-2 text-left">Average months from inversion to recession</th>
            <td className="py-2 px-2 text-right tabular-nums">{avg == null ? '' : avg.toFixed(1)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
