#!/usr/bin/env node
/**
 * Refresh src/data/market-explorer.json from FRED (no API key needed, public CSV endpoint).
 *
 *   node scripts/pull-market-data.mjs            # fetch everything, rewrite the JSON
 *   node scripts/pull-market-data.mjs --check    # fetch + report only, write nothing
 *
 * What it refreshes
 *   - monthly:  national series (mortgage rate, Treasuries, fed funds, curve, sales, listings, CPI, ...)
 *               from 1971 onward, plus the computed fed_funds_change_12m
 *   - local:    Realtor.com county / metro / state listing series, per area in LOCAL_AREAS
 *   - annual:   only the FRED-derived measures (fed funds, CPI level, mortgage delinquency).
 *               The rest of the annual table comes from the "54 Years of Real Estate Data"
 *               spreadsheet and is left untouched.
 *
 * Add a local area by adding a row to LOCAL_AREAS (name + FRED code: CBSA, county FIPS or state
 * abbreviation). A series that FRED does not publish for an area is left blank and reported.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'market-explorer.json')
const CHECK_ONLY = process.argv.includes('--check')
const FRED = id => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`

// ── Config ───────────────────────────────────────────────────────────────────
// key in monthly rows → FRED series id. Weekly and daily series are averaged to months.
const MONTHLY = {
  mortgage_rate_30yr: 'MORTGAGE30US', // weekly (Freddie Mac PMMS), from 1971-04
  treasury_10yr: 'GS10',
  fed_funds: 'FEDFUNDS',
  curve_10y_minus_2y: 'T10Y2Y', // daily, from 1976-06
  existing_home_sales: 'EXHOSLUSM495S', // NAR data on FRED only goes back to 2025-09
  new_home_sales_k: 'HSN1F',
  new_home_months_supply: 'MSACSR',
  active_listings: 'ACTLISCOUUS', // Realtor.com, from 2016-07
  new_listings: 'NEWLISCOUUS',
  rent_cpi: 'CUSR0000SEHA',
  case_shiller: 'CSUSHPINSA', // from 1987-01
  housing_starts_k: 'HOUST',
  permits_k: 'PERMIT',
  unemployment_rate: 'UNRATE',
  cpi: 'CPIAUCSL',
  consumer_sentiment: 'UMCSENT',
}
const MONTHLY_START = '1971-01' // months before the first mortgage-rate reading stay out
const LOCAL_START = '2019-01'

// Realtor.com series ids are PREFIX + area code.
const LOCAL_PREFIX = {
  median_list_price: 'MEDLISPRI',
  active_listings: 'ACTLISCOU',
  new_listings: 'NEWLISCOU',
  median_days_on_market: 'MEDDAYONMAR',
  price_reduced_listings: 'PRIREDCOU',
}
const LOCAL_AREAS = [
  { name: 'Putnam County', code: '47141' },
  { name: 'Cumberland County', code: '47035' },
  { name: 'Cookeville metro', code: '18260' }, // CBSA
  { name: 'Tennessee', code: 'TN' },
  { name: 'Nashville metro', code: '34980' }, // CBSA (Nashville-Davidson-Murfreesboro-Franklin)
  { name: 'Davidson County', code: '47037' },
]

// Annual measures derived from FRED (everything else in `annual` is from the spreadsheet).
const ANNUAL_META = [
  { key: 'fed_funds_rate', label: 'Fed funds rate', format: 'pct', good: null, group: 'Rates and payments' },
  { key: 'fed_funds_change', label: 'Fed funds change vs prior year (points)', format: 'pct', good: null, group: 'Rates and payments' },
  { key: 'mortgage_delinquency_rate', label: 'Mortgage delinquency rate (bank-held, single-family)', format: 'pct', good: 'down', group: 'Housing market' },
  { key: 'cpi_index', label: 'CPI-U, annual average (1982-84 = 100)', format: 'index', good: null, group: 'Economy' },
]
const MONTHLY_META = [
  { key: 'fed_funds_change_12m', label: 'Fed funds change vs 12 months earlier (points)', format: 'points' },
]
const SOURCE_NOTE = 'FRED (Federal Reserve Bank of St. Louis); Realtor.com listing data via FRED; Freddie Mac mortgage rates via FRED.'
const NOTES = [
  'Nashville metro (CBSA 34980) and Davidson County (FIPS 47037) were added from the same Realtor.com series as Cookeville.',
  'Existing-home sales are not published monthly on FRED before September 2025; use Annual mode for the long history.',
  'Mortgage delinquency is the FRED bank-held single-family rate (quarterly, 1991 onward); no foreclosure series is available on FRED.',
]

// ── Helpers ──────────────────────────────────────────────────────────────────
const round = (v, d = 4) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d)
const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + delta
  return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`
}

/** Fetch a FRED CSV and return Map<'YYYY-MM', average>; null if the series does not exist. */
async function monthlySeries(id, startYm) {
  const res = await fetch(`${FRED(id)}&cosd=${startYm}-01`)
  if (!res.ok) return null
  const text = await res.text()
  const lines = text.trim().split(/\r?\n/)
  if (!lines[0] || !/^observation_date,/i.test(lines[0])) return null // FRED returns an HTML page for unknown ids
  const sums = new Map()
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',')
    const v = Number(raw)
    if (!date || raw === '' || raw === '.' || !Number.isFinite(v)) continue
    const ym = date.slice(0, 7)
    const s = sums.get(ym) || { sum: 0, n: 0 }
    s.sum += v
    s.n += 1
    sums.set(ym, s)
  }
  const out = new Map()
  for (const [ym, s] of sums) out.set(ym, s.sum / s.n)
  return out.size ? out : null
}

async function pool(items, size, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
  }))
  return out
}

// ── Main ─────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(FILE, 'utf8'))
const missing = []

// National monthly (+ the extra series the annual measures and fed_funds_change_12m need)
const natIds = Object.entries(MONTHLY)
const natFetched = await pool(natIds, 6, ([key, id]) => monthlySeries(id, key === 'fed_funds' ? '1970-01' : MONTHLY_START))
const nat = {}
natIds.forEach(([key, id], i) => {
  if (!natFetched[i]) missing.push(`monthly ${key} (${id})`)
  nat[key] = natFetched[i] || new Map()
})

const allMonths = new Set()
for (const m of Object.values(nat)) for (const ym of m.keys()) if (ym >= MONTHLY_START) allMonths.add(ym)
const firstMonth = [...nat.mortgage_rate_30yr.keys()].sort()[0] || MONTHLY_START
// Weekly/daily series reach into the current, incomplete month; stop at the last month FEDFUNDS has.
const lastMonth = [...nat.fed_funds.keys()].sort().at(-1)
const months = [...allMonths].filter(ym => ym >= firstMonth && ym <= lastMonth).sort()

data.monthly = months.map(ym => {
  const row = { month: ym }
  for (const key of Object.keys(MONTHLY)) row[key] = round(nat[key].get(ym) ?? null)
  const now = nat.fed_funds.get(ym)
  const then = nat.fed_funds.get(shiftMonth(ym, -12))
  row.fed_funds_change_12m = now != null && then != null ? round(now - then, 2) : null
  return row
})

// Local (Realtor.com)
const localJobs = []
for (const a of LOCAL_AREAS) for (const [key, prefix] of Object.entries(LOCAL_PREFIX)) localJobs.push({ a, key, id: prefix + a.code })
const localFetched = await pool(localJobs, 8, j => monthlySeries(j.id, LOCAL_START))
const localByArea = new Map(LOCAL_AREAS.map(a => [a.name, new Map()]))
localJobs.forEach((j, i) => {
  if (!localFetched[i]) { missing.push(`local ${j.a.name} ${j.key} (${j.id})`); return }
  for (const [ym, v] of localFetched[i]) {
    const rows = localByArea.get(j.a.name)
    if (!rows.has(ym)) rows.set(ym, { month: ym, area: j.a.name, ...Object.fromEntries(Object.keys(LOCAL_PREFIX).map(k => [k, null])) })
    rows.get(ym)[j.key] = round(v, 2)
  }
})
const localMonths = [...new Set([...localByArea.values()].flatMap(m => [...m.keys()]))].sort()
data.local = localMonths.flatMap(ym => LOCAL_AREAS.map(a => localByArea.get(a.name).get(ym)).filter(Boolean))

// Annual FRED-derived measures (year-to-date average for the partial year)
const annualAvg = monthMap => {
  const by = new Map()
  for (const [ym, v] of monthMap) {
    const y = Number(ym.slice(0, 4))
    const s = by.get(y) || { sum: 0, n: 0 }
    s.sum += v
    s.n += 1
    by.set(y, s)
  }
  return new Map([...by].map(([y, s]) => [y, s.sum / s.n]))
}
const delinq = await monthlySeries('DRSFRMACBS', '1991-01')
if (!delinq) missing.push('annual mortgage_delinquency_rate (DRSFRMACBS)')
const ffAnnual = annualAvg(nat.fed_funds)
const cpiFull = await monthlySeries('CPIAUCSL', '1970-01')
if (!cpiFull) missing.push('annual cpi_index (CPIAUCSL)')
const cpiAnnual = cpiFull ? annualAvg(cpiFull) : new Map()
const delAnnual = delinq ? annualAvg(delinq) : new Map()
for (const row of data.annual) {
  const ff = ffAnnual.get(row.year)
  const prev = ffAnnual.get(row.year - 1)
  row.fed_funds_rate = ff != null ? round(ff / 100, 5) : null
  row.fed_funds_change = ff != null && prev != null ? round((ff - prev) / 100, 5) : null
  row.mortgage_delinquency_rate = delAnnual.has(row.year) ? round(delAnnual.get(row.year) / 100, 5) : null
  row.cpi_index = cpiAnnual.has(row.year) ? round(cpiAnnual.get(row.year), 3) : null
}

// Measure lists, notes, provenance (idempotent)
const upsert = (list, meta) => { for (const m of meta) { const i = list.findIndex(x => x.key === m.key); if (i >= 0) list[i] = m; else list.push(m) } }
upsert(data.measures, ANNUAL_META)
upsert(data.monthly_measures, MONTHLY_META)
if (!data.sources.includes('Freddie Mac')) data.sources = `${data.sources}; ${SOURCE_NOTE}`
for (const n of NOTES) if (!data.notes.includes(n)) data.notes.push(n)
data.generated = new Date().toISOString().slice(0, 10)

// Report
console.log(`monthly: ${data.monthly.length} rows, ${data.monthly[0].month} to ${data.monthly.at(-1).month}`)
console.log(`local:   ${data.local.length} rows, ${LOCAL_AREAS.length} areas, ${localMonths[0]} to ${localMonths.at(-1)}`)
console.log(missing.length ? `Series FRED does not publish (left blank):\n  ${missing.join('\n  ')}` : 'All series found.')
if (CHECK_ONLY) {
  console.log('--check: nothing written.')
} else {
  writeFileSync(FILE, JSON.stringify(data))
  console.log(`Wrote ${FILE}`)
}
