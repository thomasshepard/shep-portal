import { DATA, PARTIAL_YEAR, measureByKey } from './explorerData'
import { formatterFor } from './explorerFormat'
import { fmtMonth, isNum } from './marketFormat'

// Featured views: each card writes `params` (the explorer's own query-string keys) to the URL.
// `take` is a short plain-English paraphrase; `stats` are computed from the data at render time.
//   stat kinds: latest (default) | peak | mult (latest / first value) | cagr (compound annual growth) | lead (avg months inversion -> recession)

export const X_POSTS = [
  { label: 'Post 1', href: 'https://x.com/1RentalataTime/status/2116007148140507188' },
  { label: 'Post 2', href: 'https://x.com/1RentalataTime/status/2116001952282882506' },
  { label: 'Post 3', href: 'https://x.com/1RentalataTime/status/2113079905026220362' },
]

export const FEATURED = [
  {
    id: 'rate-shock',
    title: 'Rates spike, sales drop, prices hold',
    take: 'After a rate shock, the number of homes sold falls first, often 40 to 50 percent, while prices mostly hold.',
    params: { mode: 'annual', m: 'mortgage_rate,existing_home_sales,median_price', from: 1970, to: 2026 },
    stats: [{ mode: 'annual', key: 'mortgage_rate' }, { mode: 'annual', key: 'existing_home_sales' }],
  },
  {
    id: '1982',
    title: '1982 at 16 to 18 percent',
    take: 'Even with mortgage rates in the high teens, home prices kept rising year over year. They stayed positive at the peak.',
    params: { mode: 'annual', m: 'mortgage_rate,price_change_nominal', from: 1978, to: 1984, idx: 0 },
    stats: [{ mode: 'annual', key: 'mortgage_rate', kind: 'peak', label: 'Peak rate 1978-84', range: [1978, 1984] }, { mode: 'annual', key: 'mortgage_rate' }],
  },
  {
    id: 'transaction-crash',
    title: 'Transaction crash, not price crash',
    take: 'The pattern is a collapse in the number of sales, not in the median price. Compare 1978-82 with 2022 to now.',
    params: { mode: 'annual', m: 'existing_home_sales,median_price', from: 1976, to: 2026, ca: '1978-1982', cb: '2022-2026' },
    stats: [{ mode: 'annual', key: 'existing_home_sales' }, { mode: 'annual', key: 'median_price' }],
  },
  {
    id: 'not-2008',
    title: 'Not 2008',
    take: 'What would prove this view wrong: delinquencies and foreclosures heading toward 2008 levels. Watch those, not just prices.',
    params: { mode: 'annual', m: 'existing_home_sales,mortgage_rate,mortgage_delinquency_rate', from: 1991, to: 2026, ax: 1, idx: 0 },
    stats: [{ mode: 'annual', key: 'mortgage_delinquency_rate' }, { mode: 'annual', key: 'mortgage_delinquency_rate', kind: 'peak', label: 'Crisis peak' }],
  },
  {
    id: 'affordability',
    title: 'Affordability vs prices',
    take: 'Prices can hold while affordability gets worse: a higher rate takes a bigger share of income for the same house.',
    params: { mode: 'annual', m: 'payment_share_of_income,median_price', from: 1970, to: 2026, ax: 1, idx: 0 },
    stats: [{ mode: 'annual', key: 'payment_share_of_income' }, { mode: 'annual', key: 'median_price' }],
  },
  {
    id: 'lock-in',
    title: 'Lock-in',
    take: 'Owners with low-rate mortgages stay put, which keeps the supply of homes for sale tight and props prices up.',
    params: { mode: 'monthly', m: 'active_listings,mortgage_rate_30yr', from: '2016-07', ax: 1, idx: 0 },
    stats: [{ mode: 'monthly', key: 'active_listings' }, { mode: 'monthly', key: 'mortgage_rate_30yr' }],
  },
  {
    id: 'long-run',
    title: 'Long-run appreciation',
    take: 'Over decades, home prices have risen roughly 5 to 6 percent a year in nominal terms, a bit ahead of inflation.',
    params: { mode: 'annual', m: 'median_price,cpi_index', from: 1970, to: 2026 },
    stats: [{ mode: 'annual', key: 'median_price', kind: 'cagr', label: 'Median price per year' }, { mode: 'annual', key: 'cpi_index', kind: 'cagr', label: 'CPI per year' }],
  },
  {
    id: 'yield-curve',
    title: 'Yield curve and recession',
    take: 'An inverted yield curve has come before recessions, by about 11.75 months on average.',
    params: { mode: 'monthly', m: 'curve_10y_minus_2y', from: '1976-06', rec: 1 },
    stats: [{ mode: 'monthly', key: 'curve_10y_minus_2y' }, { kind: 'lead', label: 'Avg months to recession' }],
  },
  {
    id: 'fed-hikes',
    title: 'Fed hikes',
    take: 'Red months mark fed funds up a point or more in a year. Look at what new-home sales did after each stretch.',
    params: { mode: 'monthly', m: 'fed_funds,new_home_sales_k', hk: 1, ax: 1, idx: 0 },
    stats: [{ mode: 'monthly', key: 'fed_funds' }, { mode: 'monthly', key: 'fed_funds_change_12m' }],
  },
  {
    id: 'stocks-housing',
    title: 'Stocks vs housing',
    take: 'Stocks have outrun home prices since 1970. A K-shaped economy: owners of assets gain through the wealth effect.',
    params: { mode: 'annual', m: 'sp500_jan,median_price', from: 1970, to: 2026 },
    stats: [{ mode: 'annual', key: 'sp500_jan', kind: 'mult', label: 'S&P 500 since 1970' }, { mode: 'annual', key: 'median_price', kind: 'mult', label: 'Median price since 1970' }],
  },
]

const rowsFor = mode => (mode === 'annual' ? DATA.annual : DATA.monthly)
const xOf = (mode, r) => (mode === 'annual' ? r.year : r.month)
const xText = (mode, r) => (mode === 'annual' ? `${r.year}${r.partial && r.year === PARTIAL_YEAR ? ' YTD' : ''}` : fmtMonth(r.month))

/** Resolve a stat to { label, value, when } or null if the data has no value. */
export function resolveStat(stat) {
  if (stat.kind === 'lead') {
    const leads = DATA.recessions.map(r => r.months_from_inversion_to_recession).filter(isNum)
    if (!leads.length) return null
    return { label: stat.label, value: (leads.reduce((a, b) => a + b, 0) / leads.length).toFixed(1), when: `${leads.length} recessions` }
  }
  const meta = measureByKey(stat.mode, stat.key)
  if (!meta) return null
  const f = formatterFor(meta.format).full
  let rows = rowsFor(stat.mode).filter(r => isNum(r[stat.key]))
  if (stat.range) rows = rows.filter(r => xOf(stat.mode, r) >= stat.range[0] && xOf(stat.mode, r) <= stat.range[1])
  if (!rows.length) return null
  const last = rows[rows.length - 1]
  const first = rows[0]
  const label = stat.label || meta.label
  if (stat.kind === 'peak') {
    const top = rows.reduce((a, b) => (b[stat.key] > a[stat.key] ? b : a))
    return { label, value: f(top[stat.key]), when: xText(stat.mode, top) }
  }
  if (stat.kind === 'mult') {
    return { label, value: `${(last[stat.key] / first[stat.key]).toFixed(1)}x`, when: `${xOf(stat.mode, first)} to ${xText(stat.mode, last)}` }
  }
  if (stat.kind === 'cagr') {
    const years = last.year - first.year
    return { label, value: `${((Math.pow(last[stat.key] / first[stat.key], 1 / years) - 1) * 100).toFixed(1)}%`, when: `${first.year} to ${xText(stat.mode, last)}` }
  }
  return { label, value: f(last[stat.key]), when: xText(stat.mode, last) }
}
