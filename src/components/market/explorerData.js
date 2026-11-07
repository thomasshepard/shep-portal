import explorer from '../../data/market-explorer.json'
import { isNum, toNum } from './marketFormat'
import { csvEscape } from './explorerFormat'
import { fmtMonth } from './marketFormat'

export const DATA = explorer

export const MODES = [
  { key: 'annual', label: 'Annual' },
  { key: 'monthly', label: 'Monthly national' },
  { key: 'local', label: 'Local' },
]

export const AREAS = ['Putnam County', 'Cumberland County', 'Cookeville metro', 'Nashville metro', 'Davidson County', 'Tennessee']
export const MAX_SERIES = 4

// The JSON groups and good/bad directions only the annual measures; monthly and local
// measures get a simple grouping here, and a good direction only where one is unambiguous.
const MONTHLY_GROUP = {
  mortgage_rate_30yr: 'Rates', treasury_10yr: 'Rates', fed_funds: 'Rates', fed_funds_change_12m: 'Rates', curve_10y_minus_2y: 'Rates',
  existing_home_sales: 'Sales and supply', new_home_sales_k: 'Sales and supply', new_home_months_supply: 'Sales and supply',
  active_listings: 'Listings', new_listings: 'Listings',
  rent_cpi: 'Prices', case_shiller: 'Prices',
  housing_starts_k: 'Construction', permits_k: 'Construction',
  unemployment_rate: 'Economy', cpi: 'Economy', consumer_sentiment: 'Economy',
}
const MONTHLY_GOOD = {
  mortgage_rate_30yr: 'down', existing_home_sales: 'up', new_home_sales_k: 'up',
  housing_starts_k: 'up', permits_k: 'up', unemployment_rate: 'down', consumer_sentiment: 'up',
}

const MEASURES = {
  annual: DATA.measures,
  monthly: DATA.monthly_measures.map(m => ({ ...m, group: MONTHLY_GROUP[m.key] || 'Other', good: MONTHLY_GOOD[m.key] ?? null })),
  local: DATA.local_measures.map(m => ({ ...m, group: 'Local listings', good: null })),
}
export const measuresFor = mode => MEASURES[mode]
export const measureByKey = (mode, key) => MEASURES[mode].find(m => m.key === key)

const uniqSorted = arr => [...new Set(arr)].sort()
export const YEARS = DATA.annual.map(r => r.year)
export const MONTHS = {
  monthly: uniqSorted(DATA.monthly.map(r => r.month)),
  local: uniqSorted(DATA.local.map(r => r.month)),
}
export const PARTIAL_YEAR = [...DATA.annual].reverse().find(r => r.partial)?.year ?? null

export const DEFAULTS = {
  annual: { m: ['mortgage_rate', 'payment_share_of_income'] },
  monthly: { m: ['mortgage_rate_30yr', 'treasury_10yr'] },
  local: { m: ['active_listings'], a: ['Putnam County', 'Cumberland County'] },
}

/** Full available range for a mode: years for annual, 'YYYY-MM' strings otherwise. */
export function fullRange(mode) {
  if (mode === 'annual') return { from: YEARS[0], to: YEARS[YEARS.length - 1] }
  const list = MONTHS[mode]
  return { from: list[0], to: list[list.length - 1] }
}

export function monthShift(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + delta
  return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`
}

const slug = s => s.replace(/\W+/g, '_')

/** Series for the main chart: [{ key, label, format, good, points: [[x, value|null], ...] }] */
export function buildSeries({ mode, measureKeys, areas, from, to }) {
  const within = x => x >= from && x <= to
  if (mode === 'annual') {
    return measureKeys.map(k => {
      const meta = measureByKey('annual', k)
      return {
        key: k, label: meta.label, format: meta.format, good: meta.good,
        points: DATA.annual.filter(r => within(r.year)).map(r => [r.year, isNum(r[k]) ? r[k] : null]),
      }
    })
  }
  if (mode === 'monthly') {
    return measureKeys.map(k => {
      const meta = measureByKey('monthly', k)
      return {
        key: k, label: meta.label, format: meta.format, good: meta.good,
        points: DATA.monthly.filter(r => within(r.month)).map(r => [r.month, isNum(r[k]) ? r[k] : null]),
      }
    })
  }
  const k = measureKeys[0]
  const meta = measureByKey('local', k)
  return areas.map(a => ({
    key: slug(a), label: a, format: meta.format, good: null, measureLabel: meta.label,
    points: DATA.local.filter(r => r.area === a && within(r.month)).map(r => [r.month, isNum(r[k]) ? r[k] : null]),
  }))
}

/** Rebase to 100 at the first available value. Returns null when that value is zero or negative. */
export function indexPoints(points) {
  const first = points.find(p => isNum(p[1]))
  if (!first || !(first[1] > 0)) return null
  return points.map(([x, v]) => [x, isNum(v) ? (v / first[1]) * 100 : null])
}

/** High, low, average, latest and percentile rank over the non-null values. */
export function summarize(points) {
  const vals = points.filter(p => isNum(p[1]))
  if (!vals.length) return null
  let high = vals[0]
  let low = vals[0]
  let sum = 0
  for (const p of vals) {
    if (p[1] > high[1]) high = p
    if (p[1] < low[1]) low = p
    sum += p[1]
  }
  const latest = vals[vals.length - 1]
  const rank = Math.round((vals.filter(p => p[1] <= latest[1]).length / vals.length) * 100)
  return { high, low, avg: sum / vals.length, latest, rank, count: vals.length }
}

/** 'good' | 'bad' | null for the latest value, by where it sits in the range and the measure's good direction. */
export function judge(good, rank) {
  if (!good || rank == null) return null
  if (rank === 50) return null
  return (good === 'up') === (rank > 50) ? 'good' : 'bad'
}

/** Shaded bands for the chart, in LineChart x units. */
export function recessionBands() {
  const out = []
  for (const r of DATA.recessions) {
    const inv = toNum(r.inversion_start, 'month')
    out.push({ kind: 'inversion', from: inv, to: inv + r.inversion_months / 12 })
    const rec = toNum(r.recession_start, 'month')
    out.push({ kind: 'recession', from: rec, to: rec + r.recession_months / 12 })
  }
  return out
}

const HIKE_POINTS = 1 // a "hiking" month: fed funds up this many points or more vs 12 months earlier
const HIKE_EPS = 1e-9

/** Merge sorted numeric positions into runs; step is the size of one position (1/12 for months, 1 for years). */
function runs(positions, step) {
  const out = []
  for (const p of positions) {
    const last = out[out.length - 1]
    if (last && p - last.to < step * 0.5) last.to = p + step
    else out.push({ from: p, to: p + step })
  }
  return out
}

/**
 * Shaded bands for fed-hiking periods, in LineChart x units.
 *  month  mode (monthly, local): every month where fed funds is up 1.0 point or more vs 12 months earlier
 *  annual mode: every year whose average fed funds rate is up 1.0 point or more vs the prior year's average
 */
export function hikeBands(mode) {
  if (mode === 'annual') {
    const yrs = DATA.annual.filter(r => isNum(r.fed_funds_change) && r.fed_funds_change * 100 >= HIKE_POINTS - HIKE_EPS).map(r => r.year)
    return runs(yrs.map(y => y - 0.5), 1).map(b => ({ ...b, kind: 'hike' }))
  }
  const ms = DATA.monthly
    .filter(r => isNum(r.fed_funds_change_12m) && r.fed_funds_change_12m >= HIKE_POINTS - HIKE_EPS)
    .map(r => toNum(r.month, 'month'))
  return runs(ms, 1 / 12).map(b => ({ ...b, kind: 'hike' }))
}

/** CSV text for the current view: one row per period, one column per series (raw values). */
export function buildCsv(series, periodLabel) {
  const xs = []
  const seen = new Set()
  for (const s of series) for (const [x] of s.points) if (!seen.has(x)) { seen.add(x); xs.push(x) }
  xs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const maps = series.map(s => new Map(s.points))
  const lines = [[periodLabel, ...series.map(s => s.label)].map(csvEscape).join(',')]
  for (const x of xs) {
    lines.push([x, ...maps.map(m => (isNum(m.get(x)) ? m.get(x) : ''))].map(csvEscape).join(','))
  }
  return lines.join('\n')
}

export function downloadText(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const xLabelFor = mode => (mode === 'annual' ? x => String(x) : x => fmtMonth(x))
