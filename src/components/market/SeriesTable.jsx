import { useMemo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { isNum } from './marketFormat'
import { formatterFor } from './explorerFormat'
import { judge, summarize } from './explorerData'

const JUDGE_CLS = { good: 'text-green-700 font-semibold', bad: 'text-red-600 font-semibold' }

/** Summary table: one row per series. Values are raw (never indexed). */
export function SummaryTable({ series, xLabel }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            {['Series', 'High', 'Low', 'Average', 'Latest', 'Latest percentile'].map((h, i) => (
              <th key={h} scope="col" className={`py-2 px-2 font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map(s => {
            const f = formatterFor(s.format).full
            const st = summarize(s.points)
            if (!st) {
              return (
                <tr key={s.key} className="border-b border-gray-100 last:border-0">
                  <th scope="row" className="py-2.5 px-2 text-left font-medium text-gray-900">{s.label}</th>
                  <td colSpan={5} className="py-2.5 px-2 text-right text-gray-500">No data in this range</td>
                </tr>
              )
            }
            const verdict = judge(s.good, st.rank)
            return (
              <tr key={s.key} className="border-b border-gray-100 last:border-0 align-top">
                <th scope="row" className="py-2.5 px-2 text-left font-medium text-gray-900">{s.label}</th>
                <td className="py-2.5 px-2 text-right tabular-nums text-gray-700">{f(st.high[1])}<div className="text-xs text-gray-500">{xLabel(st.high[0])}</div></td>
                <td className="py-2.5 px-2 text-right tabular-nums text-gray-700">{f(st.low[1])}<div className="text-xs text-gray-500">{xLabel(st.low[0])}</div></td>
                <td className="py-2.5 px-2 text-right tabular-nums text-gray-700">{f(st.avg)}</td>
                <td className={`py-2.5 px-2 text-right tabular-nums ${JUDGE_CLS[verdict] || 'text-gray-700'}`}>
                  {f(st.latest[1])}<div className="text-xs font-normal text-gray-500">{xLabel(st.latest[0])}</div>
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-gray-700">{st.rank}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Sortable data table: one row per period, one column per series. */
export function DataTable({ series, xLabel, sortKey, sortDir, onSort, maxHeight = '24rem' }) {
  const rows = useMemo(() => {
    const map = new Map()
    series.forEach(s => {
      for (const [x, v] of s.points) {
        if (!map.has(x)) map.set(x, { x })
        map.get(x)[s.key] = isNum(v) ? v : null
      }
    })
    const list = [...map.values()]
    const dir = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (sortKey !== 'x') {
        if (av == null && bv == null) return 0
        if (av == null) return 1 // blanks always last
        if (bv == null) return -1
      }
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir
    })
    return list
  }, [series, sortKey, sortDir])

  const cols = [{ key: 'x', label: 'Period' }, ...series.map(s => ({ key: s.key, label: s.label, fmt: formatterFor(s.format).full }))]
  return (
    <div className="overflow-auto border border-gray-200 rounded-lg" style={{ maxHeight }}>
      <table className="w-full text-sm" style={{ minWidth: `${Math.max(360, cols.length * 130)}px` }}>
        <thead className="sticky top-0 bg-gray-50 z-[1]">
          <tr className="text-xs text-gray-500">
            {cols.map((c, i) => {
              const active = sortKey === c.key
              const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
              return (
                <th
                  key={c.key} scope="col" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`font-semibold border-b border-gray-200 ${i === 0 ? 'text-left' : 'text-right'}`}
                >
                  <button
                    type="button" onClick={() => onSort(c.key)}
                    className={`w-full py-2 px-2 flex items-center gap-1 ${i === 0 ? 'justify-start' : 'justify-end'} ${active ? 'text-gray-900' : ''}`}
                  >
                    <span>{c.label}</span><Icon size={12} className="shrink-0" />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.x} className="border-b border-gray-100 last:border-0">
              <td className="py-1.5 px-2 text-left font-medium text-gray-900 whitespace-nowrap">{xLabel(r.x)}</td>
              {cols.slice(1).map(c => (
                <td key={c.key} className="py-1.5 px-2 text-right tabular-nums text-gray-700">{c.fmt(r[c.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
