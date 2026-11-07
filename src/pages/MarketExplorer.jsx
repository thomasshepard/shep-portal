import { Link, useSearchParams } from 'react-router-dom'
import { ChartLine, Download } from 'lucide-react'
import LineChart from '../components/market/LineChart'
import MeasurePicker from '../components/market/MeasurePicker'
import RangePicker from '../components/market/RangePicker'
import { DataTable, SummaryTable } from '../components/market/SeriesTable'
import RecessionTable from '../components/market/RecessionTable'
import ComparePeriods from '../components/market/ComparePeriods'
import FeaturedViews from '../components/market/FeaturedViews'
import { FEATURED } from '../components/market/presets'
import {
  AREAS, DATA, DEFAULTS, MAX_SERIES, MODES, MONTHS, PARTIAL_YEAR, YEARS,
  buildCsv, buildSeries, downloadText, xLabelFor, fullRange, hikeBands, indexPoints, measureByKey, measuresFor, monthShift, recessionBands,
} from '../components/market/explorerData'
import { chipCls, compactNum, formatterFor, indexFormatter } from '../components/market/explorerFormat'
import { fmtMonth, isNum } from '../components/market/marketFormat'

// Theme colour tokens (one per selected series, in order); they flip with dark mode.
const SERIES_COLORS = [
  'rgb(var(--c-blue-600))', 'rgb(var(--c-amber-500))', 'rgb(var(--c-emerald-600))', 'rgb(var(--c-violet-600))',
]

function Card({ id, title, note, action, children }) {
  return (
    <section id={id} className="rounded-xl border border-gray-200 bg-white p-4 min-w-0 scroll-mt-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Toggle({ checked, onChange, disabled, children, title }) {
  return (
    <label className={`flex items-center gap-2 text-sm text-gray-800 ${disabled ? 'opacity-50' : 'cursor-pointer'}`} title={title}>
      <input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-blue-600" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      {children}
    </label>
  )
}

const parseRange = (s, fallback) => {
  const m = /^(\d{4})-(\d{4})$/.exec(s || '')
  if (!m) return fallback
  const [f, t] = [Number(m[1]), Number(m[2])]
  return YEARS.includes(f) && YEARS.includes(t) && f <= t ? { from: f, to: t } : fallback
}

export default function MarketExplorer() {
  const [sp, setSp] = useSearchParams()

  // ── URL state: every control reads from and writes to the query string ──────
  const update = (patch, reset = false) => {
    const next = new URLSearchParams(reset ? undefined : sp)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, String(v))
    }
    setSp(next, { replace: true })
  }

  const modeParam = sp.get('mode')
  const mode = MODES.some(m => m.key === modeParam) ? modeParam : 'annual'
  const metas = measuresFor(mode)
  const monthly = mode !== 'annual'

  const valid = new Set(metas.map(m => m.key))
  const pickedKeys = [...new Set((sp.get('m') || '').split(',').filter(k => valid.has(k)))].slice(0, mode === 'local' ? 1 : MAX_SERIES)
  const mKeys = pickedKeys.length ? pickedKeys : DEFAULTS[mode].m
  const pickedAreas = [...new Set((sp.get('a') || '').split(',').filter(a => AREAS.includes(a)))].slice(0, MAX_SERIES)
  const areas = pickedAreas.length ? pickedAreas : DEFAULTS.local.a

  const full = fullRange(mode)
  const rangeOptions = mode === 'annual' ? YEARS : MONTHS[mode]
  const parse = v => (mode === 'annual' ? (YEARS.includes(Number(v)) ? Number(v) : null) : (rangeOptions.includes(v) ? v : null))
  const rawFrom = parse(sp.get('from')) ?? full.from
  const rawTo = parse(sp.get('to')) ?? full.to
  const from = rawFrom > rawTo ? rawTo : rawFrom
  const to = rawFrom > rawTo ? rawFrom : rawTo

  const cmpA = parseRange(sp.get('ca'), { from: 1978, to: 1982 })
  const cmpB = parseRange(sp.get('cb'), { from: 2021, to: 2025 })

  const sortKeyParam = sp.get('sk')
  const sortDir = sp.get('sd') === 'asc' ? 'asc' : 'desc'

  // ── Series ──────────────────────────────────────────────────────────────────
  const series = buildSeries({ mode, measureKeys: mKeys, areas, from, to })
  const sortKey = sortKeyParam === 'x' || series.some(s => s.key === sortKeyParam) ? sortKeyParam : 'x'

  const unitsDiffer = new Set(series.map(s => s.format)).size > 1
  const idxParam = sp.get('idx')
  const indexed = idxParam === '1' ? true : idxParam === '0' ? false : unitsDiffer
  const rec = sp.get('rec') === '1' && mode !== 'local'

  const { chartSeries, dropped } = (() => {
    const out = []
    const dropped = []
    series.forEach((s, i) => {
      const f = formatterFor(s.format)
      const base = { key: s.key, label: s.label, color: SERIES_COLORS[i], fmt: f.full }
      if (indexed) {
        const pts = indexPoints(s.points)
        if (!pts) { dropped.push(s.label); return }
        const raw = new Map(s.points)
        out.push({ ...base, points: pts, tip: (v, x) => `${v.toFixed(1)} (${f.full(raw.get(x))})` })
      } else {
        out.push({ ...base, points: s.points })
      }
    })
    return { chartSeries: out, dropped }
  })()

  const twoAxes = sp.get('ax') === '1' && !indexed && chartSeries.length > 1
  const plotted = chartSeries.map((s, i) => ({ ...s, axis: twoAxes && i > 0 ? 'right' : 'left' }))
  const axisFormat = side => {
    if (indexed) return indexFormatter.axis
    const fm = [...new Set(series.filter((_, i) => (twoAxes && i > 0 ? 'right' : 'left') === side).map(s => s.format))]
    return fm.length === 1 ? formatterFor(fm[0]).axis : compactNum
  }

  const partialFrom = mode === 'annual' && PARTIAL_YEAR != null && from <= PARTIAL_YEAR && to >= PARTIAL_YEAR ? PARTIAL_YEAR : undefined
  const hikes = sp.get('hk') === '1'
  const bands = [...(rec ? recessionBands() : []), ...(hikes ? hikeBands(mode) : [])]
  const xLabel = xLabelFor(mode)

  // ── Presets ─────────────────────────────────────────────────────────────────
  const chips = mode === 'annual'
    ? DATA.eras.map(e => ({ label: e.label, from: Math.max(e.from, YEARS[0]), to: Math.min(e.to, YEARS[YEARS.length - 1]) }))
    : [
        ...[1, 3, 5].map(n => ({
          label: `Last ${n} year${n > 1 ? 's' : ''}`,
          from: monthShift(full.to, -(12 * n - 1)) < full.from ? full.from : monthShift(full.to, -(12 * n - 1)),
          to: full.to,
        })),
        { label: 'All', from: full.from, to: full.to },
      ]

  const csvSeries = series.map(s => ({ ...s, label: s.measureLabel ? `${s.measureLabel}: ${s.label}` : s.label }))
  const exportCsv = () => {
    downloadText(`market-explorer-${mode}-${from}_to_${to}.csv`, buildCsv(csvSeries, mode === 'annual' ? 'Year' : 'Month'))
  }
  const onSort = key => {
    if (key === sortKey) update({ sk: key, sd: sortDir === 'asc' ? 'desc' : 'asc' })
    else update({ sk: key, sd: key === 'x' ? 'desc' : 'asc' })
  }

  const activeId = FEATURED.find(c => {
    const keys = [...sp.keys()].filter(k => k !== 'sk' && k !== 'sd')
    const entries = Object.entries(c.params)
    return keys.length === entries.length && entries.every(([k, v]) => sp.get(k) === String(v))
  })?.id
  const pickFeatured = card => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries(card.params)) next.set(k, String(v))
    setSp(next, { replace: true })
    setTimeout(() => document.getElementById('explorer-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const compareMetas = mKeys.map(k => measureByKey('annual', k)).filter(Boolean)
  const ariaLabel = `Line chart of ${series.map(s => s.label).join(', ')}, ${monthly ? fmtMonth(from) : from} to ${monthly ? fmtMonth(to) : to}`
  const localMeasure = mode === 'local' ? measureByKey('local', mKeys[0]) : null

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <header>
        <p className="text-sm"><Link to="/market" className="text-blue-600 hover:underline">← Market Pulse</Link></p>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mt-1">
          <ChartLine size={24} className="text-blue-600 shrink-0" />
          Market Data Explorer
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Pick up to {MAX_SERIES} measures and a date range, then chart, compare and export them. Data compiled {new Date(`${DATA.generated}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
        </p>
      </header>

      <FeaturedViews onPick={pickFeatured} activeId={activeId} />

      {/* Mode tabs */}
      <div role="tablist" aria-label="Data set" className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {MODES.map(m => (
          <button
            key={m.key} type="button" role="tab" aria-selected={mode === m.key}
            onClick={() => update({ mode: m.key }, true)}
            className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
              mode === m.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <Card title="Choose what to chart">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            {mode === 'local' ? (
              <div className="space-y-3">
                <MeasurePicker single measures={metas} selected={mKeys} onChange={k => update({ m: k.join(',') })} label="Measure" />
                <fieldset>
                  <legend className="text-xs font-semibold text-gray-500">Areas (pick 1 to {MAX_SERIES})</legend>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {AREAS.map(a => {
                      const on = areas.includes(a)
                      const i = areas.indexOf(a)
                      return (
                        <button
                          key={a} type="button" aria-pressed={on} disabled={!on && areas.length >= MAX_SERIES}
                          className={`${chipCls(on)} disabled:opacity-40 disabled:cursor-not-allowed`}
                          style={on ? { background: SERIES_COLORS[i], borderColor: SERIES_COLORS[i] } : undefined}
                          onClick={() => {
                            const next = on ? areas.filter(x => x !== a) : [...areas, a]
                            if (next.length) update({ a: next.join(',') })
                          }}
                        >
                          {a}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              </div>
            ) : (
              <MeasurePicker measures={metas} selected={mKeys} colors={SERIES_COLORS} onChange={k => update({ m: k.join(',') })} />
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Date range</p>
            <RangePicker
              options={rangeOptions} from={from} to={to} monthly={monthly} chips={chips} idPrefix="main"
              onChange={(f, t) => update({ from: f, to: t })}
            />
          </div>
        </div>
      </Card>

      <Card
        id="explorer-chart"
        title={mode === 'local' ? `${localMeasure?.label} by area` : 'Chart'}
        note={mode === 'local' ? 'Realtor.com listings (asking prices, not closed sales).' : undefined}
      >
        <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
          <Toggle checked={indexed} onChange={v => update({ idx: v ? 1 : 0 })} title="Rebase every series to 100 at the start of the range">
            Index to 100 at start{idxParam == null && unitsDiffer ? ' (auto: units differ)' : ''}
          </Toggle>
          <Toggle
            checked={twoAxes} disabled={indexed || series.length < 2} onChange={v => update({ ax: v ? 1 : null })}
            title={indexed ? 'Not needed when indexed: every series shares one scale' : 'Put the first measure on the left axis and the rest on the right'}
          >
            Two axes
          </Toggle>
          <Toggle
            checked={hikes} onChange={v => update({ hk: v ? 1 : null })}
            title={mode === 'annual'
              ? 'Shade years whose average fed funds rate is up 1.0 point or more vs the prior year'
              : 'Shade months where fed funds is up 1.0 point or more vs 12 months earlier'}
          >
            Show rate hikes
          </Toggle>
          {mode !== 'local' && (
            <Toggle checked={rec} onChange={v => update({ rec: v ? 1 : null })} title="Shade US recessions, with a lighter band for the yield-curve inversion before each">
              Show recessions
            </Toggle>
          )}
        </div>
        {plotted.length > 0 ? (
          <LineChart
            series={plotted} xType={monthly ? 'month' : 'year'} height={300}
            yFormat={axisFormat('left')} rightFormat={axisFormat('right')}
            bands={bands} partialFrom={partialFrom} connectNulls={false} niceTicks ariaLabel={ariaLabel}
          />
        ) : (
          <p className="text-sm text-gray-500">Nothing to chart. Turn off “Index to 100” or pick other measures.</p>
        )}
        {partialFrom != null && <p className="text-xs text-gray-500 mt-1">{PARTIAL_YEAR} is year to date; its segment is dashed.</p>}
        {dropped.length > 0 && (
          <p className="text-xs text-amber-700 mt-1">
            Not charted because the first value in the range is zero, negative or missing, so it can’t be indexed: {dropped.join(', ')}.
          </p>
        )}
        {series.some(s => s.points.every(p => !isNum(p[1]))) && (
          <p className="text-xs text-gray-500 mt-1">Some selected series have no data in this range.</p>
        )}
      </Card>

      {mode !== 'local' && (
        <Card
          title="Recessions and the yield curve"
          note="When the 10-year minus 2-year Treasury spread went negative (inverted), and how many months passed before each recession began."
        >
          <RecessionTable />
        </Card>
      )}

      {mode === 'annual' && (
        <Card title="Compare two periods" note="Uses the measures chosen above, with each period starting at year 0 and indexed to 100.">
          <ComparePeriods
            measures={compareMetas} colors={SERIES_COLORS} a={cmpA} b={cmpB}
            onChange={(a, b) => update({ ca: `${a.from}-${a.to}`, cb: `${b.from}-${b.to}` })}
          />
        </Card>
      )}

      <Card
        title="Data table"
        note="Raw values for the selected range. In the summary, the latest value is green when it sits on the better side of the range for that measure and red when on the worse side; gray when neither direction is clearly better."
        action={
          <button
            type="button" onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
          >
            <Download size={14} /> Export CSV
          </button>
        }
      >
        <SummaryTable series={series} xLabel={xLabel} />
        <div className="mt-4">
          <DataTable series={series} xLabel={xLabel} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        </div>
      </Card>

      <footer className="text-xs text-gray-500 space-y-1 pb-2">
        {DATA.notes.map(n => <p key={n}>{n}</p>)}
      </footer>
    </div>
  )
}
