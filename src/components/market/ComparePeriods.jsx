import { useMemo } from 'react'
import LineChart from './LineChart'
import RangePicker from './RangePicker'
import { DATA, YEARS, PARTIAL_YEAR, indexPoints } from './explorerData'
import { fmtChange, formatterFor, indexFormatter, pctChange } from './explorerFormat'
import { isNum } from './marketFormat'

const short = (a, b) => (a === b ? String(a) : `${a}–${String(b).slice(2)}`)

/**
 * Two year ranges drawn from year 0 and indexed to 100, plus start / end / % change per measure.
 * Period A is solid, period B dashed; colour is per measure.
 */
export default function ComparePeriods({ measures, colors, a, b, onChange }) {
  const periods = [{ id: 'a', ...a, dash: undefined }, { id: 'b', ...b, dash: '6 3' }]

  const { series, rows, skipped } = useMemo(() => {
    const series = []
    const rows = []
    const skipped = []
    measures.forEach((m, mi) => {
      for (const p of periods) {
        const raw = []
        for (let y = p.from; y <= p.to; y++) {
          const r = DATA.annual.find(x => x.year === y)
          raw.push([y - p.from, r && isNum(r[m.key]) ? r[m.key] : null])
        }
        const idx = indexPoints(raw)
        const f = formatterFor(m.format)
        const first = raw.find(pt => isNum(pt[1]))
        const last = [...raw].reverse().find(pt => isNum(pt[1]))
        rows.push({
          key: `${m.key}${p.id}`, label: m.label, period: short(p.from, p.to), format: m.format,
          start: first ? first[1] : null, end: last ? last[1] : null,
          startYear: first ? p.from + first[0] : null, endYear: last ? p.from + last[0] : null,
        })
        if (!idx) { skipped.push(`${m.label} (${short(p.from, p.to)})`); continue }
        const rawByX = new Map(raw)
        series.push({
          key: `${m.key}${p.id}`, label: `${m.label}, ${short(p.from, p.to)}`, points: idx,
          color: colors[mi], dash: p.dash,
          tip: (v, x) => `${v.toFixed(1)} (${f.full(rawByX.get(x))})`,
        })
      }
    })
    return { series, rows, skipped }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measures, a.from, a.to, b.from, b.to])

  const hasPartial = PARTIAL_YEAR != null && [a, b].some(p => p.from <= PARTIAL_YEAR && p.to >= PARTIAL_YEAR)

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1.5">Period A (solid line)</p>
          <RangePicker options={YEARS} from={a.from} to={a.to} onChange={(f, t) => onChange({ from: f, to: t }, b)} idPrefix="cmp-a" />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1.5">Period B (dashed line)</p>
          <RangePicker options={YEARS} from={b.from} to={b.to} onChange={(f, t) => onChange(a, { from: f, to: t })} idPrefix="cmp-b" />
        </div>
      </div>

      {series.length > 0 ? (
        <LineChart
          series={series} xType="offset" yFormat={indexFormatter.axis} height={260}
          refLines={[{ y: 100, label: 'Start of each period (100)' }]}
          connectNulls={false} niceTicks
          ariaLabel="Line chart comparing the selected measures across two periods, each indexed to 100 at its first year"
        />
      ) : (
        <p className="text-sm text-gray-500">Nothing to chart: none of the selected measures can be indexed in these periods.</p>
      )}
      <p className="text-xs text-gray-500 mt-1">X axis: years since the start of each period (year 0 = first year, indexed to 100).</p>
      {skipped.length > 0 && (
        <p className="text-xs text-amber-700 mt-1">Not charted (the first value is zero, negative or missing): {skipped.join(', ')}.</p>
      )}
      {hasPartial && <p className="text-xs text-gray-500 mt-1">{PARTIAL_YEAR} is year to date.</p>}

      <div className="overflow-x-auto mt-4">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              {['Measure', 'Period', 'Start', 'End', 'Change'].map((h, i) => (
                <th key={h} scope="col" className={`py-2 px-2 font-semibold ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const f = formatterFor(r.format).full
              const ch = pctChange(r.start, r.end)
              const pts = r.format === 'pct' && isNum(r.start) && isNum(r.end) ? (r.end - r.start) * 100 : null
              return (
                <tr key={r.key} className="border-b border-gray-100 last:border-0 align-top">
                  <th scope="row" className="py-2 px-2 text-left font-medium text-gray-900">{r.label}</th>
                  <td className="py-2 px-2 text-left text-gray-700 whitespace-nowrap">{r.period}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-700">{f(r.start)}<div className="text-xs text-gray-500">{r.startYear ?? ''}</div></td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-700">{f(r.end)}<div className="text-xs text-gray-500">{r.endYear ?? ''}</div></td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold text-gray-900">
                    {fmtChange(ch)}
                    {pts != null && <div className="text-xs font-normal text-gray-500">{pts > 0 ? '+' : ''}{pts.toFixed(1)} pts</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
