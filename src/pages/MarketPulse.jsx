import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import market from '../data/market.json'
import LineChart from '../components/market/LineChart'
import BarList from '../components/market/BarList'
import PressureTable from '../components/market/PressureTable'
import {
  fmtDollars, fmtMonth, fmtPct, fmtSignedPct,
} from '../components/market/marketFormat'

// One accent colour (Cumberland, the focus area); everything else is muted.
const ACCENT = 'rgb(var(--c-blue-600))'
const MUTED_1 = 'rgb(var(--c-gray-700))'
const MUTED_2 = 'rgb(var(--c-gray-500))'
const MUTED_3 = 'rgb(var(--c-gray-400))'

const AREA_STYLE = {
  'Cumberland County': { color: ACCENT, width: 2.5 },
  'Putnam County': { color: MUTED_1 },
  'Cookeville metro': { color: MUTED_2, dash: '6 3' },
  Tennessee: { color: MUTED_3, dash: '2 3' },
  'United States': { color: MUTED_3 },
}

const pctAxis = v => `${Math.round(v * 100)}%`
const rateAxis = v => `${Number(v).toFixed(1)}%`

function Card({ title, note, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 min-w-0 ${className}`}>
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {note && <p className="text-xs text-gray-500 mt-1 mb-3">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </section>
  )
}

export default function MarketPulse() {
  const m = market
  const rows = m.seller_pressure
  const row = area => rows.find(r => r.area === area) || {}

  const latestMonth = useMemo(
    () => rows.map(r => r.month).filter(Boolean).sort().pop(),
    [rows],
  )

  const takeaway = useMemo(() => {
    const cum = row('Cumberland County')
    const cook = row('Cookeville metro')
    const us = row('United States')
    return `In Cumberland County ${fmtPct(cum.price_cut_share)} of listings have had a price cut, and active listings in the Cookeville metro are ${fmtSignedPct(cook.active_vs_2019)} vs 2019 while the US is ${fmtSignedPct(us.active_vs_2019, 1)}.`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const priceCutSeries = ['Putnam County', 'Cumberland County'].map(area => ({
    key: area, label: area, points: m.price_cut_share[area] || [], ...AREA_STYLE[area],
  }))

  const inventorySeries = Object.keys(m.inventory_index).map(area => ({
    key: area, label: area, points: m.inventory_index[area], ...AREA_STYLE[area],
  }))

  const rateSeries = [
    { key: 'mortgage', label: '30-year mortgage rate', points: m.rates.mortgage_30yr, color: ACCENT, width: 2.5 },
    { key: 'treasury', label: '10-year Treasury yield', points: m.rates.treasury_10yr, color: MUTED_2 },
  ]

  const paymentSeries = [
    { key: 'share', label: 'Payment share of income', points: m.payment_share_of_income, color: ACCENT, width: 2.5 },
  ]
  const lastYear = m.payment_share_of_income[m.payment_share_of_income.length - 1]?.[0]

  const loanItems = m.loan_value.map(l => ({
    label: l.label === 'Today' ? `Today (${(l.rate * 100).toFixed(2)}%)` : l.label,
    value: l.payment,
    valueLabel: `${fmtDollars(l.payment)}/mo`,
    sub: l.savings_vs_today > 0 ? `saves ${fmtDollars(l.savings_vs_today)}/mo` : null,
    highlight: l.label === 'Today',
    tip: l.savings_vs_today > 0
      ? `${l.label}: ${fmtDollars(l.payment)}/mo, ${fmtDollars(l.savings_vs_today)} less than today`
      : `Today: ${fmtDollars(l.payment)}/mo`,
  }))

  const lockMax = Math.max(...m.lock_in_q4_2025.buckets.map(b => b[1]))
  const lockItems = m.lock_in_q4_2025.buckets.map(([label, share]) => ({
    label,
    value: share,
    valueLabel: fmtPct(share, 1),
    highlight: share === lockMax,
    tip: `${label}: ${fmtPct(share, 1)} of mortgages`,
  }))

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp size={24} className="text-blue-600 shrink-0" />
          Upper Cumberland Market Pulse
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Data as of {fmtMonth(latestMonth, true)}</p>
        <p className="text-base text-gray-800 mt-3 max-w-3xl">{takeaway}</p>
        <p className="mt-3">
          <Link to="/market/explorer" className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-gray-50">
            Open the Data Explorer →
          </Link>
        </p>
      </header>

      <Card title="Seller pressure" note="How hard it is to sell right now. More price cuts, more listings and longer waits mean sellers have less leverage.">
        <PressureTable rows={rows} />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card
          title="Price cuts"
          note="Share of listings with a price cut. A rising share means more sellers are open to terms, subject-to or seller finance."
        >
          <LineChart
            series={priceCutSeries} yFormat={pctAxis} height={240}
            ariaLabel="Line chart of the share of listings with a price cut, Putnam and Cumberland counties"
          />
        </Card>

        <Card
          title="Inventory vs 2019"
          note="Active listings, where 100 equals that area's 2019 monthly average."
        >
          <LineChart
            series={inventorySeries} yFormat={v => Math.round(v)} height={240}
            yDomain={[0, 180]} yTicks={[0, 50, 100, 150]}
            refLines={[{ y: 100, label: '2019 average (100)' }]}
            ariaLabel="Line chart of active listings indexed to 2019 for five areas"
          />
        </Card>

        <Card
          title={`What a low-rate loan is worth (${fmtDollars(m.loan_amount)}, 30 years)`}
          note="Monthly principal and interest payment, and how much less it is than a loan at today's rate."
        >
          <BarList items={loanItems} ariaLabel="Monthly payment by interest rate" />
        </Card>

        <Card
          title="Mortgage rate vs 10-year Treasury"
          note="Mortgage rates follow the 10-year Treasury yield; the gap between them is the lender's spread."
        >
          <LineChart
            series={rateSeries} yFormat={rateAxis} height={240}
            ariaLabel="Line chart of the 30-year mortgage rate and the 10-year Treasury yield"
          />
        </Card>

        <Card
          title="Payment as a share of income since 1970"
          note={`20% down, median-priced home, median family income. ${lastYear} is a partial year (year to date).`}
        >
          <LineChart
            series={paymentSeries} xType="year" yFormat={pctAxis} height={240}
            yDomain={[0.1, 0.45]} yTicks={[0.1, 0.2, 0.3, 0.4]}
            markers={(m.payment_share_marks || []).map(x => ({ x, label: String(x) }))}
            ariaLabel="Line chart of the mortgage payment on a median home as a share of median family income since 1970"
          />
        </Card>

        <Card title="Lock-in: who has a low rate" note="Share of US mortgages by interest rate, Q4 2025.">
          <BarList items={lockItems} max={lockMax} ariaLabel="Share of mortgages by interest rate bucket" />
          <p className="text-xs text-gray-500 mt-4">
            Source: {m.lock_in_q4_2025.source}. {m.lock_in_q4_2025.note}.
          </p>
        </Card>
      </div>

      <footer className="text-xs text-gray-500 space-y-1 pb-2">
        {m.notes.map(n => <p key={n}>{n}</p>)}
      </footer>
    </div>
  )
}
