import { useMemo } from 'react'
import {
  LineChart as RLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot,
} from 'recharts'
import useContainerWidth from './useContainerWidth'
import { fmtMonth, isNum } from './marketFormat'

const AXIS_TICK = { fontSize: 11, fill: 'rgb(var(--c-gray-500))' }
const TOOLTIP_STYLE = {
  background: 'rgb(var(--surface))',
  color: 'rgb(var(--c-gray-900))',
  border: '1px solid rgb(var(--c-gray-200))',
  fontSize: 12,
  borderRadius: 8,
}

/**
 * Generic line chart for [x, y] pair series.
 *  series:    [{ key, label, points: [[x, y], ...], color, dash?, width? }]
 *  xType:     'month' ("2019-01") or 'year' (1970)
 *  yFormat:   value -> label (axis, tooltip)
 *  refLines:  [{ y, label }]      horizontal dashed reference lines
 *  markers:   [{ x, label }]      vertical reference lines
 */
export default function LineChart({
  series, xType = 'month', yFormat = v => v, yDomain, yTicks, refLines = [], markers = [],
  height = 240, ariaLabel,
}) {
  const [ref, width] = useContainerWidth()
  const narrow = width > 0 && width < 480

  const data = useMemo(() => {
    const rows = new Map()
    for (const s of series) {
      for (const [x, y] of s.points) {
        if (!rows.has(x)) rows.set(x, { x })
        rows.get(x)[s.key] = isNum(y) ? y : null
      }
    }
    return [...rows.values()].sort((a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0))
  }, [series])

  // One tick per year (Jan for months), thinned on narrow containers.
  const ticks = useMemo(() => {
    const yearOf = x => (xType === 'month' ? Number(String(x).slice(0, 4)) : Number(x))
    const all = data.filter(d => (xType === 'month' ? String(d.x).endsWith('-01') : true)).map(d => d.x)
    const years = all.map(yearOf)
    const span = years.length ? years[years.length - 1] - years[0] : 0
    const step = xType === 'year'
      ? (narrow ? 20 : 10)
      : Math.max(1, Math.ceil(span / (narrow ? 4 : 8)))
    const first = years[0]
    return all.filter((_, i) => (years[i] - first) % step === 0)
  }, [data, xType, narrow])

  const tickFormat = x => {
    if (xType === 'year') return String(x)
    const y = String(x).slice(0, 4)
    return narrow ? `'${y.slice(2)}` : y
  }
  const labelFormat = x => (xType === 'month' ? fmtMonth(x, true) : String(x))
  const single = series.length === 1
  const lastPoint = single ? [...data].reverse().find(d => isNum(d[series[0].key])) : null

  return (
    <div>
      {(!single || refLines.some(r => r.label)) && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-gray-600" aria-label="Legend">
          {!single && series.map(s => (
            <li key={s.key} className="flex items-center gap-1.5">
              <svg width="20" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="20" y2="4" stroke={s.color} strokeWidth={s.width || 2} strokeDasharray={s.dash} />
              </svg>
              {s.label}
            </li>
          ))}
          {refLines.filter(r => r.label).map(r => (
            <li key={`ref${r.y}`} className="flex items-center gap-1.5">
              <svg width="20" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="20" y2="4" stroke="rgb(var(--c-gray-500))" strokeWidth="1.5" strokeDasharray="5 4" />
              </svg>
              {r.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
        {width > 0 && (
          <RLineChart width={width} height={height} data={data} margin={{ top: 8, right: single ? 40 : 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="rgb(var(--c-gray-200))" vertical={false} />
            <XAxis
              dataKey="x" ticks={ticks} tickFormatter={tickFormat} tick={AXIS_TICK}
              axisLine={false} tickLine={false} interval={0} padding={{ left: 6, right: 6 }}
            />
            <YAxis
              tick={AXIS_TICK} axisLine={false} tickLine={false} width={narrow ? 42 : 48}
              tickFormatter={yFormat} domain={yDomain || ['auto', 'auto']} ticks={yTicks}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={labelFormat}
              formatter={(v, name) => [yFormat(v), name]}
            />
            {refLines.map(r => (
              <ReferenceLine
                key={`y${r.y}`} y={r.y} stroke="rgb(var(--c-gray-500))" strokeDasharray="5 4"
              />
            ))}
            {markers.map(m => (
              <ReferenceLine
                key={`x${m.x}`} x={m.x} stroke="rgb(var(--c-gray-500))" strokeDasharray="3 3"
                label={{ value: m.label, position: 'insideTopRight', fontSize: 10, fill: 'rgb(var(--c-gray-600))' }}
              />
            ))}
            {series.map(s => (
              <Line
                key={s.key} name={s.label} dataKey={s.key} stroke={s.color} strokeWidth={s.width || 2}
                strokeDasharray={s.dash} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false}
              />
            ))}
            {/* end-of-line value label for single-series charts */}
            {lastPoint && (
              <ReferenceDot
                x={lastPoint.x} y={lastPoint[series[0].key]} r={3.5} fill={series[0].color} stroke="none"
                label={{ value: yFormat(lastPoint[series[0].key]), position: 'right', fontSize: 11, fontWeight: 600, fill: series[0].color }}
              />
            )}
          </RLineChart>
        )}
      </div>
    </div>
  )
}
