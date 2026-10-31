import { useEffect, useMemo, useState } from 'react'
import {
  Wallet, ExternalLink, Upload, ListChecks, BarChart3, CheckCircle2,
  AlertTriangle, ChevronDown, ChevronRight, Sparkles, TrendingUp, TrendingDown,
  Repeat, X, Loader2,
} from 'lucide-react'
import {
  fetchAllRecords, createRecords, fmtCurrency, airtableConfigured,
} from '../lib/airtable'
import {
  CC_BASE_ID, TX_TABLE, CARDS_TABLE, ISSUERS,
  processStatement, applyManualMapping, detectIssuerFromCardName,
  cardTail, makeDedupKey, merchantKey,
} from '../lib/statements'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const arr = (v) => (Array.isArray(v) ? v : [])
const safeStr = (v, f = '') => (v == null ? f : String(v))
const safeNum = (v) => (typeof v === 'number' ? v : Number(v) || 0)

const TABS = [
  { id: 'checklist', label: 'Export Checklist', icon: ListChecks },
  { id: 'import', label: 'Import CSV', icon: Upload },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
]

export default function Finances() {
  const [tab, setTab] = useState('checklist')
  const [cards, setCards] = useState([])
  const [txns, setTxns] = useState([])
  const [existingKeys, setExistingKeys] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [uploadedCards, setUploadedCards] = useState(new Set()) // session checkmarks

  async function load() {
    setLoading(true)
    const [cardRes, txRes] = await Promise.all([
      fetchAllRecords(CARDS_TABLE, { fields: ['Name', 'Owner', 'Status', 'Download URL'] }, CC_BASE_ID),
      fetchAllRecords(TX_TABLE, {}, CC_BASE_ID),
    ])
    if (cardRes.error) toast.error('Failed to load cards: ' + cardRes.error)
    if (txRes.error) toast.error('Failed to load transactions: ' + txRes.error)
    setCards(arr(cardRes.data))
    const tx = arr(txRes.data)
    setTxns(tx)
    setExistingKeys(new Set(tx.map((r) => safeStr(r.fields?.['Dedup Key'])).filter(Boolean)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (!airtableConfigured()) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
        <AlertTriangle size={32} className="mx-auto text-yellow-500 mb-3" />
        <p className="font-medium text-yellow-800">Airtable is not configured.</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-emerald-100 p-2.5 rounded-xl"><Wallet className="text-emerald-600" size={24} /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Finances</h1>
          <p className="text-sm text-slate-500">Pull statements, consolidate transactions, and track spending.</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {tab === 'checklist' && <Checklist cards={cards} uploadedCards={uploadedCards} />}
          {tab === 'import' && (
            <Importer
              cards={cards}
              existingKeys={existingKeys}
              onImported={(cardId) => {
                setUploadedCards((s) => new Set(s).add(cardId))
                load()
              }}
            />
          )}
          {tab === 'dashboard' && <Dashboard txns={txns} />}
        </>
      )}
    </div>
  )
}

// ── Export checklist ──────────────────────────────────────

function Checklist({ cards, uploadedCards }) {
  const [openSteps, setOpenSteps] = useState(null)
  const active = cards.filter((c) => safeStr(c.fields?.Status, 'Active') !== 'Closed')
  const byOwner = {}
  for (const c of active) {
    const owner = safeStr(c.fields?.Owner, 'Other')
    ;(byOwner[owner] ||= []).push(c)
  }

  return (
    <div className="space-y-6">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-800">
        Open each card's download page, export transactions as <strong>CSV</strong>, then import them on the next tab.
        Log in manually — no passwords are stored here.
      </div>
      {Object.entries(byOwner).map(([owner, list]) => (
        <div key={owner}>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{owner}</h2>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {list.map((c) => {
              const name = safeStr(c.fields?.Name)
              const url = safeStr(c.fields?.['Download URL'])
              const issuer = detectIssuerFromCardName(name)
              const steps = ISSUERS[issuer]?.steps || []
              const done = uploadedCards.has(c.id)
              const open = openSteps === c.id
              return (
                <div key={c.id} className="p-3">
                  <div className="flex items-center gap-3">
                    {done
                      ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                      : <span className="w-[18px] h-[18px] rounded-full border-2 border-slate-300 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{name}</p>
                      <p className="text-xs text-slate-400">{issuer}</p>
                    </div>
                    <button
                      onClick={() => setOpenSteps(open ? null : c.id)}
                      className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                    >
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Steps
                    </button>
                    {url ? (
                      <a
                        href={url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm font-medium bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700"
                      >
                        Open <ExternalLink size={14} />
                      </a>
                    ) : <span className="text-xs text-slate-400">no link</span>}
                  </div>
                  {open && steps.length > 0 && (
                    <ol className="mt-2 ml-9 list-decimal text-sm text-slate-600 space-y-1">
                      {steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── CSV importer ──────────────────────────────────────────

function Importer({ cards, existingKeys, onImported }) {
  const [cardId, setCardId] = useState('')
  const [staged, setStaged] = useState(null) // { fileName, issuer, rows, needsMapping, headers, rawRows }
  const [mapping, setMapping] = useState({ dateCol: 0, descCol: 1, amountCol: 2, spendingIsPositive: false })
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const card = cards.find((c) => c.id === cardId)
  const cardName = safeStr(card?.fields?.Name)
  const tail = cardTail(cardName)
  const owner = safeStr(card?.fields?.Owner)

  // Decorate rows with dedup status against existing + within-file duplicates.
  const decorated = useMemo(() => {
    if (!staged?.rows) return []
    const seen = new Set()
    return staged.rows.map((r) => {
      const key = makeDedupKey(tail, r.date, r.amount, r.rawDescription)
      const dup = existingKeys.has(key) || seen.has(key)
      seen.add(key)
      return { ...r, key, dup }
    })
  }, [staged, tail, existingKeys])

  const newCount = decorated.filter((r) => !r.dup).length
  const dupCount = decorated.length - newCount

  async function handleFile(file) {
    if (!cardId) { toast.error('Select which card this file is for first.'); return }
    const text = await file.text()
    const issuerHint = detectIssuerFromCardName(cardName)
    const res = processStatement(text, issuerHint)
    if (res.ok) {
      setStaged({ fileName: file.name, issuer: res.issuer, rows: res.rows })
    } else if (res.needsMapping) {
      setStaged({ fileName: file.name, needsMapping: true, headers: res.headers, rawRows: res.rawRows, issuer: issuerHint })
      toast('Unrecognized format — map the columns below.', { icon: '🛠️' })
    } else {
      toast.error(res.error || 'Could not parse file.')
    }
  }

  function applyMapping() {
    const rows = applyManualMapping(staged.rawRows, mapping)
    if (!rows.length) { toast.error('No valid rows with that mapping.'); return }
    setStaged({ ...staged, needsMapping: false, rows })
  }

  async function confirmImport() {
    const toAdd = decorated.filter((r) => !r.dup)
    if (!toAdd.length) { toast.error('Nothing new to import.'); return }
    setSaving(true)
    const batch = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${staged.issuer}`
    const records = toAdd.map((r) => ({
      Name: `${r.date} · ${r.merchant} · ${r.amount.toFixed(2)}`,
      Card: [cardId],
      Owner: owner || undefined,
      Date: r.date,
      Merchant: r.merchant,
      'Raw Description': r.rawDescription,
      Amount: r.amount,
      Category: r.category,
      Issuer: staged.issuer === 'Other' ? undefined : staged.issuer,
      Type: r.type,
      'Import Batch': batch,
      'Dedup Key': r.key,
    }))
    const { data, error } = await createRecords(TX_TABLE, records, CC_BASE_ID)
    setSaving(false)
    if (error) {
      toast.error(`Imported ${data?.length || 0}/${records.length}, then failed: ${error}`)
    } else {
      toast.success(`Imported ${records.length} transactions${dupCount ? ` (${dupCount} duplicates skipped)` : ''}.`)
    }
    setStaged(null)
    onImported(cardId)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Which card is this statement for?</label>
        <select
          value={cardId}
          onChange={(e) => { setCardId(e.target.value); setStaged(null) }}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Select a card…</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {safeStr(c.fields?.Owner)} — {safeStr(c.fields?.Name)}
            </option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false)
          const f = e.dataTransfer.files?.[0]; if (f) handleFile(f)
        }}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white'
        }`}
      >
        <Upload size={28} className="mx-auto text-slate-400 mb-2" />
        <p className="text-sm text-slate-600">Drag a CSV here, or</p>
        <label className="inline-block mt-2 text-sm font-medium text-emerald-700 cursor-pointer hover:underline">
          browse files
          <input
            type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
          />
        </label>
      </div>

      {/* Manual column mapping */}
      {staged?.needsMapping && (
        <div className="bg-white rounded-xl border border-amber-300 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-800">Map the columns for {staged.fileName}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[['dateCol', 'Date'], ['descCol', 'Description'], ['amountCol', 'Amount']].map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 mb-1">{label}</label>
                <select
                  value={mapping[key]}
                  onChange={(e) => setMapping({ ...mapping, [key]: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                >
                  {staged.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Spending shown as</label>
              <select
                value={mapping.spendingIsPositive ? '1' : '0'}
                onChange={(e) => setMapping({ ...mapping, spendingIsPositive: e.target.value === '1' })}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="0">Negative numbers</option>
                <option value="1">Positive numbers</option>
              </select>
            </div>
          </div>
          <button onClick={applyMapping} className="text-sm font-medium bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700">
            Apply mapping
          </button>
        </div>
      )}

      {/* Preview */}
      {staged && !staged.needsMapping && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-slate-100">
            <div className="text-sm">
              <span className="font-medium text-slate-800">{staged.fileName}</span>
              <span className="text-slate-400"> · {staged.issuer}</span>
              <span className="ml-2 text-emerald-600 font-medium">{newCount} new</span>
              {dupCount > 0 && <span className="ml-2 text-slate-400">{dupCount} duplicate{dupCount > 1 ? 's' : ''}</span>}
            </div>
            <button onClick={() => setStaged(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Merchant</th>
                  <th className="text-left px-3 py-2 font-medium">Category</th>
                  <th className="text-right px-3 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {decorated.slice(0, 200).map((r, i) => (
                  <tr key={i} className={r.dup ? 'opacity-40' : ''}>
                    <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-1.5 text-slate-800">{r.merchant}{r.dup && <span className="ml-1 text-[10px] text-slate-400">(dup)</span>}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.category}</td>
                    <td className={`px-3 py-1.5 text-right whitespace-nowrap ${r.amount < 0 ? 'text-slate-800' : 'text-emerald-600'}`}>
                      {fmtCurrency(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-slate-100 flex justify-end">
            <button
              onClick={confirmImport}
              disabled={saving || newCount === 0}
              className="flex items-center gap-2 text-sm font-medium bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Import {newCount} transaction{newCount === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────

function Dashboard({ txns }) {
  const [nudges, setNudges] = useState(null)
  const [nudgeLoading, setNudgeLoading] = useState(false)

  const data = useMemo(() => buildAnalytics(txns), [txns])

  async function getNudges() {
    setNudgeLoading(true)
    try {
      const out = await fetchNudges(data)
      setNudges(out)
    } catch (e) {
      toast.error('AI nudges failed: ' + e.message)
    }
    setNudgeLoading(false)
  }

  if (!txns.length) {
    return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
      No transactions yet. Import some CSVs to see trends.
    </div>
  }

  const { curLabel, prevLabel, curSpend, prevSpend, categories, topMerchants, subscriptions } = data
  const spendDelta = prevSpend ? ((curSpend - prevSpend) / prevSpend) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label={`Spend — ${curLabel}`} value={fmtCurrency(-curSpend)} />
        <Stat label={`Spend — ${prevLabel}`} value={fmtCurrency(-prevSpend)} />
        <Stat
          label="Month over month"
          value={`${spendDelta >= 0 ? '+' : ''}${spendDelta.toFixed(1)}%`}
          tone={spendDelta > 0 ? 'bad' : 'good'}
          icon={spendDelta > 0 ? TrendingUp : TrendingDown}
        />
      </div>

      {/* Category breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-800 mb-3">Spending by category — {curLabel}</h2>
        <div className="space-y-2">
          {categories.length === 0 && <p className="text-sm text-slate-400">No spending this month.</p>}
          {categories.map((c) => {
            const pct = curSpend ? (c.amount / curSpend) * 100 : 0
            return (
              <div key={c.name}>
                <div className="flex justify-between text-sm mb-0.5">
                  <span className="text-slate-700">{c.name}</span>
                  <span className="text-slate-500">
                    {fmtCurrency(-c.amount)}
                    {c.delta != null && (
                      <span className={`ml-2 text-xs ${c.delta > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {c.delta > 0 ? '▲' : '▼'} {Math.abs(c.delta).toFixed(0)}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscriptions */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Repeat size={16} /> Recurring / subscriptions</h2>
          {subscriptions.length === 0 && <p className="text-sm text-slate-400">None detected yet (need ≥2 months of data).</p>}
          <div className="divide-y divide-slate-100">
            {subscriptions.map((s) => (
              <div key={s.name} className="flex justify-between py-1.5 text-sm">
                <span className="text-slate-700 truncate">{s.name} <span className="text-xs text-slate-400">×{s.months}mo</span></span>
                <span className="text-slate-600 whitespace-nowrap">{fmtCurrency(-s.typical)}/mo</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top merchants */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800 mb-3">Top merchants — {curLabel}</h2>
          {topMerchants.length === 0 && <p className="text-sm text-slate-400">No spending this month.</p>}
          <div className="divide-y divide-slate-100">
            {topMerchants.map((m) => (
              <div key={m.name} className="flex justify-between py-1.5 text-sm">
                <span className="text-slate-700 truncate">{m.name}</span>
                <span className="text-slate-600 whitespace-nowrap">{fmtCurrency(-m.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI nudges */}
      <div className="bg-gradient-to-br from-indigo-50 to-emerald-50 rounded-xl border border-indigo-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Sparkles size={16} className="text-indigo-500" /> Where to cut</h2>
          <button
            onClick={getNudges}
            disabled={nudgeLoading}
            className="flex items-center gap-1.5 text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {nudgeLoading && <Loader2 size={14} className="animate-spin" />}
            {nudges ? 'Refresh' : 'Analyze'}
          </button>
        </div>
        {!nudges && !nudgeLoading && <p className="text-sm text-slate-500">Get AI suggestions on subscriptions to cut and categories trending up.</p>}
        <div className="space-y-2">
          {arr(nudges).map((n, i) => (
            <div key={i} className="bg-white/70 rounded-lg p-2.5 text-sm text-slate-700 flex gap-2">
              <span>{n.icon || '💡'}</span><span>{n.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone, icon: Icon }) {
  const toneClass = tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-600' : 'text-slate-800'
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold flex items-center gap-1.5 ${toneClass}`}>
        {Icon && <Icon size={20} />}{value}
      </p>
    </div>
  )
}

// ── Analytics computation ─────────────────────────────────

function monthLabel(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

function buildAnalytics(txns) {
  const rows = txns.map((t) => ({
    date: safeStr(t.fields?.Date),
    amount: safeNum(t.fields?.Amount),
    category: safeStr(t.fields?.Category, 'Other'),
    merchant: safeStr(t.fields?.Merchant),
  })).filter((r) => r.date)

  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort()
  const cur = months[months.length - 1]
  const prev = months[months.length - 2]

  const spendIn = (ym) => rows.filter((r) => r.date.slice(0, 7) === ym && r.amount < 0)
    .reduce((s, r) => s + r.amount, 0) // negative total
  const curSpend = spendIn(cur)
  const prevSpend = prev ? spendIn(prev) : 0

  const catTotals = (ym) => {
    const m = {}
    rows.filter((r) => r.date.slice(0, 7) === ym && r.amount < 0)
      .forEach((r) => { m[r.category] = (m[r.category] || 0) + r.amount })
    return m
  }
  const curCats = catTotals(cur)
  const prevCats = prev ? catTotals(prev) : {}
  const categories = Object.entries(curCats)
    .map(([name, amount]) => {
      const p = prevCats[name]
      const delta = p ? ((amount - p) / p) * 100 : null
      return { name, amount, delta }
    })
    .sort((a, b) => a.amount - b.amount) // most negative (biggest spend) first

  const merchTotals = {}
  rows.filter((r) => r.date.slice(0, 7) === cur && r.amount < 0)
    .forEach((r) => { merchTotals[r.merchant] = (merchTotals[r.merchant] || 0) + r.amount })
  const topMerchants = Object.entries(merchTotals)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => a.amount - b.amount).slice(0, 8)

  // Recurring: same merchant key across >=2 distinct months, spending only.
  const recur = {}
  rows.filter((r) => r.amount < 0).forEach((r) => {
    const k = merchantKey(r.merchant)
    if (!k) return
    ;(recur[k] ||= { name: r.merchant, months: new Set(), amounts: [] })
    recur[k].months.add(r.date.slice(0, 7))
    recur[k].amounts.push(r.amount)
  })
  const subscriptions = Object.values(recur)
    .filter((s) => s.months.size >= 2)
    .map((s) => {
      const sorted = [...s.amounts].sort((a, b) => a - b)
      const typical = sorted[Math.floor(sorted.length / 2)] // median (negative)
      return { name: s.name, months: s.months.size, typical }
    })
    .sort((a, b) => a.typical - b.typical).slice(0, 12)

  return {
    curLabel: monthLabel(cur), prevLabel: monthLabel(prev),
    curSpend, prevSpend, categories, topMerchants, subscriptions,
  }
}

// ── AI nudges (aggregates only — no raw transactions sent) ─

async function fetchNudges(data) {
  const ANTH_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!ANTH_KEY) throw new Error('VITE_ANTHROPIC_API_KEY not set')
  const payload = {
    currentMonth: data.curLabel,
    totalSpend: Math.round(-data.curSpend),
    prevMonthSpend: Math.round(-data.prevSpend),
    categories: data.categories.map((c) => ({ name: c.name, spend: Math.round(-c.amount), changePct: c.delta == null ? null : Math.round(c.delta) })),
    subscriptions: data.subscriptions.map((s) => ({ name: s.name, monthly: Math.round(-s.typical), months: s.months })),
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTH_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: 'You are a personal-finance advisor reviewing aggregated monthly credit-card spending (no individual transactions). Return 3-5 short, specific, actionable money-saving nudges: flag subscriptions to cancel, categories trending up, and concrete cut targets with dollar figures. Return ONLY a JSON array: [{"icon":"emoji","text":"nudge"}]. No preamble, no markdown.',
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const text = json?.content?.[0]?.text || '[]'
  const match = text.match(/\[[\s\S]*\]/)
  return JSON.parse(match ? match[0] : '[]')
}
