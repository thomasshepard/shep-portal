import { useMemo } from 'react'
import {
  LineChart as RLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, ReferenceArea,
} from 'recharts'
import useContainerWidth from './useContainerWidth'
import { fmtMonth, isNum, toNum } from './marketFormat'

const AXIS_TICK = { fontSize: 11, fill: 'rgb(var(--c-gray-500))' }
const TOOLTIP_STYLE = {
  background: 'rgb(var(--surface))',
  color: 'rgb(var(--c-gray-900))',
  border: '1px solid rgb(var(--c-gray-200))',
  borderRadius: 8,
}
const NICE = [1, 2, 5, 10, 20, 25, 50]
const niceStep = raw => NICE.find(s => s >= raw) || 50

/** Round-number ticks covering [min, max]; used so auto-scaled axes read 0 / 5% / 10% rather than 0 / 10.5% / 21%. */
function niceAxis(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  if (min === max) { const pad = Math.abs(min) * 0.1 || 1; min -= pad; max += pad }
  const raw = (max - min) / (count - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  const lo = Math.floor(min / step + 1e-9) * step
  const hi = Math.ceil(max / step - 1e-9) * step
  const ticks = []
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toPrecision(12)))
  return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] }
}

function shortMonth(n) {
  const y = Math.floor(n + 1e-6)
  const m = Math.round((n - y) * 12) + 1
  return fmtMonth(`${y}-${String(m).padStart(2, '0')}`).replace(/ \d\d(\d\d)$/, " '$1")
}

/**
 * Generic line chart for [x, y] pair series on a continuous x axis.
 *  series:      [{ key, label, points: [[x, y], ...], color, dash?, width?, axis?: 'left'|'right',
 *                  fmt?: v => string, tip?: (v, x) => string }]
 *  xType:       'month' ("2019-01"), 'year' (1970) or 'offset' (0, 1, 2 ... years since a start)
 *  yFormat:     left-axis tick formatter (and the default tooltip formatter)
 *  rightFormat: right-axis formatter; the right axis shows only if a series sets axis: 'right'
 *  refLines:    [{ y, label }]               horizontal dashed reference lines
 *  markers:     [{ x, label }]               vertical reference lines
 *  bands:       [{ from, to, kind }]         shaded x ranges in toNum() units; kind 'recession' | 'inversion' | 'hike'
 *  partialFrom: x value from which the last segment is drawn dashed (partial period)
 */
export default function LineChart({
  series, xType = 'month', yFormat = v => v, yDomain, yTicks, rightFormat, rightDomain,
  refLines = [], markers = [], bands = [], partialFrom, connectNulls = true, niceTicks = false,
  height = 240, ariaLabel,
}) {
  const [ref, width] = useContainerWidth()
  const narrow = width > 0 && width < 480
  const hasRight = series.some(s => s.axis === 'right')
  const np = partialFrom != null ? toNum(partialFrom, xType) : null

  const rows = useMemo(() => {
    const map = new Map()
    for (const s of series) {
      for (const [x, y] of s.points) {
        const n = toNum(x, xType)
        if (!map.has(n)) map.set(n, { n, x })
        map.get(n)[s.key] = isNum(y) ? y : null
      }
    }
    const out = [...map.values()].sort((a, b) => a.n - b.n)
    if (np != null) {
      for (const s of series) {
        let prev = null
        for (const r of out) {
          if (r.n < np) {
            r[`${s.key}__s`] = r[s.key]
            if (isNum(r[s.key])) prev = r
          } else {
            r[`${s.key}__s`] = null
          }
        }
        if (prev) prev[`${s.key}__p`] = prev[s.key]
        const rp = out.find(r => r.n === np)
        if (rp && isNum(rp[s.key])) rp[`${s.key}__p`] = rp[s.key]
      }
    }
    return out
  }, [series, xType, np])

  const lo = rows.length ? rows[0].n : 0
  const hi = rows.length ? rows[rows.length - 1].n : 0
  const span = hi - lo
  const shortMonthly = xType === 'month' && span < 2.5

  const ticks = useMemo(() => {
    if (!rows.length) return []
    let out
    if (xType === 'month') {
      if (shortMonthly) {
        const re = narrow ? /-(01|07)$/ : /-(01|04|07|10)$/
        out = rows.filter(r => re.test(String(r.x))).map(r => r.n)
      } else {
        const step = niceStep(span / (narrow ? 4 : 8))
        out = rows.filter(r => String(r.x).endsWith('-01') && Math.round(r.n) % step === 0).map(r => r.n)
      }
    } else {
      const step = niceStep(Math.max(1, span / (narrow ? 4 : 8)))
      out = []
      for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t)
    }
    return out.length ? out : [lo, hi]
  }, [rows, xType, narrow, span, lo, hi, shortMonthly])

  const tickFormat = n => {
    if (xType === 'month') {
      if (shortMonthly) return shortMonth(n)
      const y = String(Math.round(n))
      return narrow ? `'${y.slice(2)}` : y
    }
    return String(n)
  }
  const labelFormat = x => {
    if (xType === 'month') return fmtMonth(x, true)
    if (xType === 'offset') return `Year ${x}`
    return String(x)
  }

  const axisScale = side => {
    if (!niceTicks) return null
    const vals = []
    for (const s of series) {
      if ((s.axis || 'left') !== side) continue
      for (const [, y] of s.points) if (isNum(y)) vals.push(y)
    }
    return vals.length ? niceAxis(Math.min(...vals), Math.max(...vals)) : null
  }
  const leftScale = axisScale('left')
  const rightScale = axisScale('right')

  const single = series.length === 1
  const lastPoint = single ? [...rows].reverse().find(r => isNum(r[series[0].key])) : null
  const visibleBands = bands
    .map(b => ({ ...b, x1: Math.max(b.from, lo), x2: Math.min(b.to, hi) }))
    .filter(b => b.x1 < b.x2)
  const legendBands = [
    visibleBands.some(b => b.kind === 'inversion') && { label: 'Yield curve inverted', opacity: 0.1 },
    visibleBands.some(b => b.kind === 'recession') && { label: 'Recession', opacity: 0.28 },
    visibleBands.some(b => b.kind === 'hike') && { label: 'Fed hiking: up 1+ point in a year', opacity: 0.16, color: 'rgb(var(--c-red-500))' },
  ].filter(Boolean)
  const showLegend = !single || refLines.some(r => r.label) || legendBands.length > 0

  const renderTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const row = payload[0].payload
    return (
      <div style={TOOLTIP_STYLE} className="px-2.5 py-2 text-xs shadow">
        <div className="font-semibold mb-1">
          {labelFormat(row.x)}{np != null && row.n === np ? ' (year to date)' : ''}
        </div>
        {series.map(s => (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tabular-nums font-medium">
              {isNum(row[s.key]) ? (s.tip ? s.tip(row[s.key], row.x) : (s.fmt || yFormat)(row[s.key])) : 'n/a'}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      {showLegend && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-gray-600" aria-label="Legend">
          {!single && series.map(s => (
            <li key={s.key} className="flex items-center gap-1.5">
              <svg width="20" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="20" y2="4" stroke={s.color} strokeWidth={s.width || 2} strokeDasharray={s.dash} />
              </svg>
              {s.label}{s.axis === 'right' ? ' (right axis)' : ''}
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
          {legendBands.map(b => (
            <li key={b.label} className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-3 rounded-sm" style={{ background: b.color || 'rgb(var(--c-gray-500))', opacity: Math.min(1, b.opacity * 1.6) }} />
              {b.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
        {width > 0 && (
          <RLineChart width={width} height={height} data={rows} margin={{ top: 8, right: single ? 40 : hasRight ? 4 : 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="rgb(var(--c-gray-200))" vertical={false} />
            <XAxis
              dataKey="n" type="number" domain={[lo, hi]} ticks={ticks} tickFormatter={tickFormat}
              tick={AXIS_TICK} axisLine={false} tickLine={false} padding={{ left: 6, right: 6 }}
            />
            <YAxis
              yAxisId="left" tick={AXIS_TICK} axisLine={false} tickLine={false} width={narrow ? 44 : 52}
              tickFormatter={yFormat} domain={yDomain || leftScale?.domain || ['auto', 'auto']} ticks={yTicks || leftScale?.ticks}
            />
            {hasRight && (
              <YAxis
                yAxisId="right" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false} width={narrow ? 44 : 52}
                tickFormatter={rightFormat || yFormat} domain={rightDomain || rightScale?.domain || ['auto', 'auto']} ticks={rightScale?.ticks}
              />
            )}
            <Tooltip content={renderTip} />
            {visibleBands.map(b => (
              <ReferenceArea
                key={`${b.kind}${b.from}`} yAxisId="left" x1={b.x1} x2={b.x2}
                fill={b.kind === 'hike' ? 'rgb(var(--c-red-500))' : 'rgb(var(--c-gray-500))'}
                fillOpacity={b.kind === 'inversion' ? 0.1 : b.kind === 'hike' ? 0.16 : 0.28} stroke="none"
              />
            ))}
            {refLines.map(r => (
              <ReferenceLine key={`y${r.y}`} yAxisId="left" y={r.y} stroke="rgb(var(--c-gray-500))" strokeDasharray="5 4" />
            ))}
            {markers.map(m => (
              <ReferenceLine
                key={`x${m.x}`} yAxisId="left" x={toNum(m.x, xType)} stroke="rgb(var(--c-gray-500))" strokeDasharray="3 3"
                label={{ value: m.label, position: 'insideTopRight', fontSize: 10, fill: 'rgb(var(--c-gray-600))' }}
              />
            ))}
            {series.map(s => {
              const common = {
                yAxisId: s.axis || 'left', stroke: s.color, strokeWidth: s.width || 2, dot: false, isAnimationActive: false,
              }
              if (np == null) {
                return <Line key={s.key} dataKey={s.key} strokeDasharray={s.dash} activeDot={{ r: 4 }} connectNulls={connectNulls} {...common} />
              }
              return [
                <Line key={`${s.key}s`} dataKey={`${s.key}__s`} strokeDasharray={s.dash} activeDot={{ r: 4 }} connectNulls={connectNulls} {...common} />,
                <Line key={`${s.key}p`} dataKey={`${s.key}__p`} strokeDasharray="4 3" activeDot={{ r: 4 }} connectNulls {...common} />,
              ]
            })}
            {/* end-of-line value label for single-series charts */}
            {lastPoint && (
              <ReferenceDot
                yAxisId="left" x={lastPoint.n} y={lastPoint[series[0].key]} r={3.5} fill={series[0].color} stroke="none"
                label={{ value: (series[0].fmt || yFormat)(lastPoint[series[0].key]), position: 'right', fontSize: 11, fontWeight: 600, fill: series[0].color }}
              />
            )}
          </RLineChart>
        )}
      </div>
    </div>
  )
}
