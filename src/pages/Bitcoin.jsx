import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, ChevronDown, ChevronUp, Check, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchAllRecords, createRecord, fmtCurrency, fmtDate } from '../lib/airtable'
import { BTC_BASE_ID } from '../lib/airtable'

const safeStr = (val, fallback = '') => (val == null ? fallback : String(val))
const safeNum = (val) => (typeof val === 'number' ? val : parseFloat(val) || 0)

// Table IDs
const RH_SHEP_TBL      = 'tblNY2hBqThOmNRky'
const BTC_PURCHASE_TBL = 'tblAmFoRWXRLjNPHj'
const LC_JANINE_TBL    = 'tblz9xROlto0R2xCz'
const LC_RH_TBL        = 'tblK0E5G4wGQO6Yu1'
const RH_PURCHASES_TBL = 'tblg0eLNtJQPtikRb'

// WRITE field IDs — used in createRecord payloads
const RHF = {
  date:          'fldzmuHFuSbTg00Su',
  btc:           'fldE3FZrCCjHxdc6r',
  price:         'fld0N14QwwbueJLFM',
  walletFrom:    'fldevTavL8JKIaz9A',
  walletTo:      'fld9AtB1A2m0dMpgJ',
  fee:           'fldTbLUfEVPx1oa4h',
  amountUSDManual: 'fldJRgkH3s7DCIYh4',
  feeUSDManual:  'fldZ9GmVLDv42qsIa',
}

const BPF = {
  bankTransferDate: 'fldI0OyaLhGLYm4Oi',
  btcSettledDate:   'fldn5EUPRu9U9x05L',
  btc:              'fldgvCerd1oeKnbw3',
  price:            'fldcvilPw9WjKdl32',
  walletFrom:       'fld4201ojx6bMj4Jj',
  walletTo:         'fldmFeTdZUw8xrLsK',
  feeSats:          'fld6qT48fb9XGixuB',
  feeUSDManual:     'fldIZPUik2zykn1JV',
  lcToRH:           'fldXH5teRIsMiZwwW',
}

const LCJF = {
  date:           'fldezoIxNO07cStc6',
  btc:            'fldgucypKQpoieHU2',
  price:          'fld4Ql8993mh046pG',
  feeSats:        'fldzNLiszLvOJMUlR',
  feeUSDManual:   'fld2uk44yKHr6Iua7',
  conversionRate: 'fldzmqK9CBG8gi0y1',
  conversionPesos:'fldGRkvgWyROiktEn',
}

const LCRHF = {
  date:   'fld2fiF9n8NMaxhWD',
  amount: 'fldLqEPYNP27CF1Rw',
}

const RHPF = {
  date:  'fldSr61kcQo2okvU2',
  usd:   'fldsfLfZ7ZI2ZkmLd',
  btc:   'fldC3bEqb0Grq27LH',
  price: 'fldepw744xqlYMGkf',
  notes: 'fldKI9qNRcpwBGpwg',
}

// READ field names — as returned by Airtable API (record.fields is keyed by name, not ID)
const RH_READ = {
  date:  'BTC Settled Date',
  btc:   'Bitcoin calc by coinbase',
  price: 'BTC Price (USD)',
}

const BP_READ = {
  bankTransferDate: 'Bank Transfer Date',
  btc:              'Bitcoin Calc by coinbase',
  price:            'Bitcoin in USD',
}

const LCJ_READ = {
  date:  'Date',
  btc:   'BTC',
  price: 'BTC Price in USD',
}

const LCRH_READ = {
  date:   'Date',
  amount: 'Amount',
}

const JANINE_ADDRESS = '1Kdq7Wz8deiQyFSp4oKuaigF3JR1tmZZcC'
const today = () => new Date().toISOString().split('T')[0]
const fmtBTC = (val) => safeNum(val).toFixed(8) + ' BTC'
const fmtUSD = (val) => fmtCurrency(val)

const INPUT          = 'w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500'
const INPUT_REQUIRED = 'w-full px-3 py-1.5 bg-slate-700 border-l-2 border-l-yellow-400 border-y border-r border-slate-600 rounded text-sm text-white placeholder-slate-400 focus:outline-none focus:border-l-yellow-300 focus:border-slate-500'
const LABEL          = 'block text-xs text-slate-400 mb-1'
const READONLY       = 'w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-400 italic'

function FormField({ label, hint, children }) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
    </div>
  )
}

function StepCard({ step, title, subtitle, done, children }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 transition-colors ${
          done ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
        }`}>
          {done ? <Check className="w-4 h-4" /> : step}
        </div>
        <div className="flex-1">
          <h3 className={`font-semibold text-sm transition-colors ${done ? 'text-green-400' : 'text-white'}`}>{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {done && (
          <span className="text-xs text-green-400 font-medium flex items-center gap-1">
            <Check className="w-3 h-3" /> Saved
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function WalletPath({ from, to }) {
  return (
    <div className="flex items-center gap-2 text-xs mb-4 p-2 bg-slate-700/50 rounded-lg">
      <span className="text-slate-300 font-medium">{from}</span>
      <span className="text-slate-500">→</span>
      <span className="text-slate-300 font-medium">{to}</span>
    </div>
  )
}

function SaveButton({ onClick, saving, label }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="w-full mt-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
    >
      {saving ? 'Saving…' : label}
    </button>
  )
}

function StatCard({ title, btc, usd }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="text-xs text-slate-400 mb-1">{title}</div>
      <div className="text-base font-bold text-white">{fmtBTC(btc)}</div>
      {usd != null && <div className="text-xs text-slate-400 mt-0.5">{fmtUSD(usd)}</div>}
    </div>
  )
}

const DOT_COLOR = { rh: 'bg-orange-400', bp: 'bg-blue-400', lcj: 'bg-green-400' }

export default function Bitcoin() {
  const [btcPrice, setBtcPrice] = useState(null)
  const [priceLoading, setPriceLoading] = useState(false)

  const [rhRecords, setRhRecords] = useState([])
  const [bpRecords, setBpRecords] = useState([])
  const [lcjRecords, setLcjRecords] = useState([])
  const [lcrRecords, setLcrRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const [achOpen, setAchOpen] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [saved, setSaved] = useState({ step1: false, step2: false, step3: false, step4: false })

  const [s1, setS1] = useState({ date: today(), usd: '', btcReceived: '', price: '', notes: '' })
  const [s2, setS2] = useState({ date: today(), btc: '', price: '', fee: '', feeUSD: '' })
  const [s3, setS3] = useState({ bankDate: today(), settledDate: today(), btc: '', price: '', feeSats: '', feeUSD: '', achLink: '' })
  const [s4, setS4] = useState({ date: today(), btc: '', price: '', feeSats: '', feeUSD: '', convRate: '' })
  const [ach, setAch] = useState({ date: today(), amount: '' })

  const [saving1, setSaving1] = useState(false)
  const [saving2, setSaving2] = useState(false)
  const [saving3, setSaving3] = useState(false)
  const [saving4, setSaving4] = useState(false)
  const [savingAch, setSavingAch] = useState(false)

  const fetchPrice = useCallback(async () => {
    setPriceLoading(true)
    try {
      const res = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot')
      const json = await res.json()
      const price = parseFloat(json.data.amount)
      setBtcPrice(price)
      const ps = String(price)
      setS1(f => ({ ...f, price: ps }))
      setS2(f => ({ ...f, price: ps }))
      setS3(f => ({ ...f, price: ps }))
      setS4(f => ({ ...f, price: ps }))
    } catch {
      toast.error('Failed to fetch BTC price')
    } finally {
      setPriceLoading(false)
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [rh, bp, lcj, lcr] = await Promise.all([
      fetchAllRecords(RH_SHEP_TBL,      { sort: { field: 'BTC Settled Date',   direction: 'desc' } }, BTC_BASE_ID),
      fetchAllRecords(BTC_PURCHASE_TBL,  { sort: { field: 'Bank Transfer Date', direction: 'desc' } }, BTC_BASE_ID),
      fetchAllRecords(LC_JANINE_TBL,     { sort: { field: 'Date',               direction: 'desc' } }, BTC_BASE_ID),
      fetchAllRecords(LC_RH_TBL,         { sort: { field: 'Date',               direction: 'desc' } }, BTC_BASE_ID),
    ])
    setRhRecords(rh.data || [])
    setBpRecords(bp.data || [])
    setLcjRecords(lcj.data || [])
    setLcrRecords(lcr.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPrice()
    loadData()
  }, [fetchPrice, loadData])

  // Stats — read by field name
  const shepWallet =
    rhRecords.reduce((s, r) => s + safeNum(r.fields[RH_READ.btc]), 0) -
    bpRecords.reduce((s, r) => s + safeNum(r.fields[BP_READ.btc]), 0)

  const lcWallet =
    bpRecords.reduce((s, r) => s + safeNum(r.fields[BP_READ.btc]), 0) -
    lcjRecords.reduce((s, r) => s + safeNum(r.fields[LCJ_READ.btc]), 0)

  const totalJanine = lcjRecords.reduce((s, r) => s + safeNum(r.fields[LCJ_READ.btc]), 0)
  const lastTransfer = lcjRecords[0] || null

  // Activity feed — merge top 5 from each table, sort desc, take 15
  const feed = [
    ...rhRecords.slice(0, 5).map(r => ({
      type: 'rh', label: 'RH → Shepard',
      date: safeStr(r.fields[RH_READ.date]),
      btc:  safeNum(r.fields[RH_READ.btc]),
    })),
    ...bpRecords.slice(0, 5).map(r => ({
      type: 'bp', label: 'Shep → LCWallet1',
      date: safeStr(r.fields[BP_READ.bankTransferDate]),
      btc:  safeNum(r.fields[BP_READ.btc]),
    })),
    ...lcjRecords.slice(0, 5).map(r => ({
      type: 'lcj', label: 'LC → Janine',
      date: safeStr(r.fields[LCJ_READ.date]),
      btc:  safeNum(r.fields[LCJ_READ.btc]),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15)

  const s2USD  = safeNum(s2.btc) * safeNum(s2.price)
  const s3USD  = safeNum(s3.btc) * safeNum(s3.price)
  const s4USD  = safeNum(s4.btc) * safeNum(s4.price)
  const s4Pesos = s4.convRate ? s4USD * safeNum(s4.convRate) : 0

  function copyAddress() {
    navigator.clipboard.writeText(JANINE_ADDRESS)
    setCopiedAddress(true)
    setTimeout(() => setCopiedAddress(false), 2000)
  }

  function liveBtn(disabled) {
    return (
      <button
        onClick={fetchPrice}
        disabled={disabled}
        className="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded text-xs text-slate-300 flex-shrink-0 transition-colors whitespace-nowrap"
      >
        {disabled ? '…' : 'Live'}
      </button>
    )
  }

  async function saveStep1() {
    if (!s1.date || !s1.btcReceived) { toast.error('Date and BTC amount required'); return }
    setSaving1(true)
    const payload = {
      [RHPF.date]: s1.date,
      [RHPF.btc]:  parseFloat(s1.btcReceived),
      ...(s1.price && { [RHPF.price]: parseFloat(s1.price) }),
      ...(s1.usd   && { [RHPF.usd]:   parseFloat(s1.usd) }),
      ...(s1.notes && { [RHPF.notes]: s1.notes }),
    }
    const { error } = await createRecord(RH_PURCHASES_TBL, payload, BTC_BASE_ID)
    setSaving1(false)
    if (error) { toast.error(error); return }
    toast.success('RH purchase recorded')
    setSaved(p => ({ ...p, step1: true }))
    setS1({ date: today(), usd: '', btcReceived: '', price: s1.price, notes: '' })
  }

  async function saveStep2() {
    if (!s2.date || !s2.btc || !s2.price) { toast.error('Date, BTC amount, and price required'); return }
    setSaving2(true)
    const payload = {
      [RHF.date]:            s2.date,
      [RHF.btc]:             parseFloat(s2.btc),
      [RHF.price]:           parseFloat(s2.price),
      [RHF.walletFrom]:      'Robinhood',
      [RHF.walletTo]:        'Shepard Wallet 1-sparrow',
      [RHF.amountUSDManual]: s2USD,
      ...(s2.fee    && { [RHF.fee]:          parseFloat(s2.fee) }),
      ...(s2.feeUSD && { [RHF.feeUSDManual]: parseFloat(s2.feeUSD) }),
    }
    const { error } = await createRecord(RH_SHEP_TBL, payload, BTC_BASE_ID)
    setSaving2(false)
    if (error) { toast.error(error); return }
    toast.success('RH → Shepard recorded')
    setSaved(p => ({ ...p, step2: true }))
    setS2({ date: today(), btc: '', price: s2.price, fee: '', feeUSD: '' })
    loadData()
  }

  async function saveStep3() {
    if (!s3.bankDate || !s3.btc || !s3.price) { toast.error('Bank transfer date, BTC amount, and price required'); return }
    setSaving3(true)
    const payload = {
      [BPF.bankTransferDate]: s3.bankDate,
      [BPF.btcSettledDate]:   s3.settledDate,
      [BPF.btc]:              parseFloat(s3.btc),
      [BPF.price]:            parseFloat(s3.price),
      [BPF.walletFrom]:       'Shepard Wallet 1-sparrow',
      [BPF.walletTo]:         'LC Wallet1-sparrow',
      ...(s3.feeSats && { [BPF.feeSats]:      parseInt(s3.feeSats, 10) }),
      ...(s3.feeUSD  && { [BPF.feeUSDManual]: parseFloat(s3.feeUSD) }),
      ...(s3.achLink && { [BPF.lcToRH]:        [s3.achLink] }),
    }
    const { error } = await createRecord(BTC_PURCHASE_TBL, payload, BTC_BASE_ID)
    setSaving3(false)
    if (error) { toast.error(error); return }
    toast.success('Shep → LCWallet1 recorded')
    setSaved(p => ({ ...p, step3: true }))
    setS3({ bankDate: today(), settledDate: today(), btc: '', price: s3.price, feeSats: '', feeUSD: '', achLink: '' })
    loadData()
  }

  async function saveStep4() {
    if (!s4.date || !s4.btc || !s4.price) { toast.error('Date, BTC amount, and price required'); return }
    setSaving4(true)
    const payload = {
      [LCJF.date]:  s4.date,
      [LCJF.btc]:   parseFloat(s4.btc),
      [LCJF.price]: parseFloat(s4.price),
      ...(s4.feeSats  && { [LCJF.feeSats]:        parseInt(s4.feeSats, 10) }),
      ...(s4.feeUSD   && { [LCJF.feeUSDManual]:    parseFloat(s4.feeUSD) }),
      ...(s4.convRate && { [LCJF.conversionRate]:   parseFloat(s4.convRate) }),
      ...(s4.convRate && s4USD > 0 && { [LCJF.conversionPesos]: s4Pesos }),
    }
    const { error } = await createRecord(LC_JANINE_TBL, payload, BTC_BASE_ID)
    setSaving4(false)
    if (error) { toast.error(error); return }
    toast.success('LC → Janine recorded')
    setSaved(p => ({ ...p, step4: true }))
    setS4({ date: today(), btc: '', price: s4.price, feeSats: '', feeUSD: '', convRate: '' })
    loadData()
  }

  async function saveACH() {
    if (!ach.date || !ach.amount) { toast.error('Date and amount required'); return }
    setSavingAch(true)
    const { error } = await createRecord(LC_RH_TBL, {
      [LCRHF.date]:   ach.date,
      [LCRHF.amount]: parseFloat(ach.amount),
    }, BTC_BASE_ID)
    setSavingAch(false)
    if (error) { toast.error(error); return }
    toast.success('ACH transfer recorded')
    setAch({ date: today(), amount: '' })
    loadData()
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Bitcoin Tracker</h1>
            <p className="text-slate-400 text-sm mt-1">Weekly workflow — RH buy → Shep Wallet → LCWallet1 → Janine</p>
          </div>
          <div className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
            <div>
              <div className="text-xs text-slate-400">BTC / USD</div>
              <div className="text-lg font-bold text-orange-400">
                {btcPrice ? fmtUSD(btcPrice) : '—'}
              </div>
            </div>
            <button
              onClick={fetchPrice}
              disabled={priceLoading}
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
              title="Refresh price"
            >
              <RefreshCw size={16} className={priceLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-4 animate-pulse h-20" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Shepard Wallet"
              btc={shepWallet}
              usd={btcPrice != null ? shepWallet * btcPrice : null}
            />
            <StatCard
              title="LCWallet1"
              btc={lcWallet}
              usd={btcPrice != null ? lcWallet * btcPrice : null}
            />
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Total sent to Janine</div>
              <div className="text-base font-bold text-green-400">{fmtBTC(totalJanine)}</div>
              <div className="text-xs text-slate-500 mt-0.5">{lcjRecords.length} transfer{lcjRecords.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Last transfer</div>
              {lastTransfer ? (
                <>
                  <div className="text-sm font-semibold text-white">{fmtDate(safeStr(lastTransfer.fields[LCJ_READ.date]))}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{fmtBTC(lastTransfer.fields[LCJ_READ.btc])}</div>
                </>
              ) : (
                <div className="text-sm text-slate-500">—</div>
              )}
            </div>
          </div>
        )}

        {/* Two-column layout */}
        <div className="flex gap-6 items-start">

          {/* Left — forms */}
          <div className="flex-1 space-y-4 min-w-0">

            {/* Step 1 — RH Purchase */}
            <StepCard step={1} title="Buy on Robinhood" subtitle="Record the BTC purchase in Robinhood" done={saved.step1}>
              <div className="p-3 bg-blue-900/20 border border-blue-800/40 rounded-lg text-xs text-blue-300 mb-4">
                Buy BTC in Robinhood. Enter the purchase details below — use the Coinbase spot price at time of purchase.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Purchase Date">
                  <input type="date" className={INPUT_REQUIRED} value={s1.date} onChange={e => setS1(f => ({ ...f, date: e.target.value }))} />
                </FormField>
                <FormField label="BTC Received">
                  <input type="number" className={INPUT_REQUIRED} step="0.00000001" placeholder="0.00000000" value={s1.btcReceived} onChange={e => setS1(f => ({ ...f, btcReceived: e.target.value }))} />
                </FormField>
                <FormField label="BTC Price (Coinbase)">
                  <div className="flex gap-1.5">
                    <input type="number" className={INPUT_REQUIRED} placeholder="95840" value={s1.price} onChange={e => setS1(f => ({ ...f, price: e.target.value }))} />
                    {liveBtn(priceLoading)}
                  </div>
                </FormField>
                <FormField label="USD Invested">
                  <input type="number" className={INPUT} step="0.01" placeholder="0.00" value={s1.usd} onChange={e => setS1(f => ({ ...f, usd: e.target.value }))} />
                </FormField>
                <div className="col-span-2">
                  <FormField label="Notes">
                    <input type="text" className={INPUT} placeholder="Optional" value={s1.notes} onChange={e => setS1(f => ({ ...f, notes: e.target.value }))} />
                  </FormField>
                </div>
              </div>
              <SaveButton onClick={saveStep1} saving={saving1} label="Save RH Purchase" />
            </StepCard>

            {/* Step 2 — RH → Shepard */}
            <StepCard step={2} title="Robinhood → Shepard Wallet" subtitle="Record BTC withdrawal from Robinhood" done={saved.step2}>
              <WalletPath from="Robinhood" to="Shepard Wallet 1-sparrow" />
              <div className="grid grid-cols-2 gap-3">
                <FormField label="BTC Settled Date">
                  <input type="date" className={INPUT_REQUIRED} value={s2.date} onChange={e => setS2(f => ({ ...f, date: e.target.value }))} />
                </FormField>
                <FormField label="BTC amount">
                  <input type="number" className={INPUT_REQUIRED} step="0.00000001" placeholder="0.00000000" value={s2.btc} onChange={e => setS2(f => ({ ...f, btc: e.target.value }))} />
                </FormField>
                <FormField label="BTC Price (Coinbase)">
                  <div className="flex gap-1.5">
                    <input type="number" className={INPUT_REQUIRED} placeholder="95840" value={s2.price} onChange={e => setS2(f => ({ ...f, price: e.target.value }))} />
                    {liveBtn(priceLoading)}
                  </div>
                </FormField>
                <FormField label="Amount USD">
                  <div className={READONLY}>{s2.btc && s2.price ? fmtUSD(s2USD) : '—'}</div>
                </FormField>
                <FormField label="Network fee (BTC)" hint="Typically 0.00000091 BTC from Robinhood">
                  <input type="number" className={INPUT} step="0.00000001" placeholder="0.00000091" value={s2.fee} onChange={e => setS2(f => ({ ...f, fee: e.target.value }))} />
                </FormField>
                <FormField label="Fee USD (manual)">
                  <input type="number" className={INPUT} step="0.01" placeholder="Optional" value={s2.feeUSD} onChange={e => setS2(f => ({ ...f, feeUSD: e.target.value }))} />
                </FormField>
              </div>
              <SaveButton onClick={saveStep2} saving={saving2} label="Save RH → Shepard record" />
            </StepCard>

            {/* Step 3 — Shepard → LCWallet1 */}
            <StepCard step={3} title="Shepard Wallet → LCWallet1" subtitle="Record BTC transfer to LC wallet" done={saved.step3}>
              <WalletPath from="Shepard Wallet 1-sparrow" to="LC Wallet1-sparrow" />
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Bank Transfer Date">
                  <input type="date" className={INPUT_REQUIRED} value={s3.bankDate} onChange={e => setS3(f => ({ ...f, bankDate: e.target.value }))} />
                </FormField>
                <FormField label="BTC Settled Date">
                  <input type="date" className={INPUT_REQUIRED} value={s3.settledDate} onChange={e => setS3(f => ({ ...f, settledDate: e.target.value }))} />
                </FormField>
                <FormField label="BTC Price (Coinbase)">
                  <div className="flex gap-1.5">
                    <input type="number" className={INPUT_REQUIRED} placeholder="95840" value={s3.price} onChange={e => setS3(f => ({ ...f, price: e.target.value }))} />
                    {liveBtn(priceLoading)}
                  </div>
                </FormField>
                <FormField label="BTC amount">
                  <input type="number" className={INPUT_REQUIRED} step="0.00000001" placeholder="0.00000000" value={s3.btc} onChange={e => setS3(f => ({ ...f, btc: e.target.value }))} />
                </FormField>
                <FormField label="Amount USD">
                  <div className={READONLY}>{s3.btc && s3.price ? fmtUSD(s3USD) : '—'}</div>
                </FormField>
                <FormField label="Fee (SATS)" hint="Enter in satoshis (e.g. 300, 682)">
                  <input type="number" className={INPUT_REQUIRED} placeholder="300" value={s3.feeSats} onChange={e => setS3(f => ({ ...f, feeSats: e.target.value }))} />
                </FormField>
                <FormField label="Fee USD (manual)">
                  <input type="number" className={INPUT} step="0.01" placeholder="Optional" value={s3.feeUSD} onChange={e => setS3(f => ({ ...f, feeUSD: e.target.value }))} />
                </FormField>
                <FormField label="Link to ACH transfer (optional)">
                  <select className={INPUT} value={s3.achLink} onChange={e => setS3(f => ({ ...f, achLink: e.target.value }))}>
                    <option value="">— None —</option>
                    {lcrRecords.map(r => (
                      <option key={r.id} value={r.id}>
                        {safeStr(r.fields[LCRH_READ.date])} — {fmtUSD(r.fields[LCRH_READ.amount])}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <SaveButton onClick={saveStep3} saving={saving3} label="Save Shep → LCWallet1 record" />
            </StepCard>

            {/* Step 4 — LC → Janine */}
            <StepCard step={4} title="LCWallet1 → Janine" subtitle="Record BTC transfer to Janine's external wallet" done={saved.step4}>
              {/* Wallet path with inline copy button */}
              <div className="flex items-center gap-2 text-xs mb-4 p-2 bg-slate-700/50 rounded-lg">
                <span className="text-slate-300 font-medium">LC Wallet1-sparrow</span>
                <span className="text-slate-500">→</span>
                <span className="text-slate-300 font-medium">Janine's wallet</span>
                <button
                  onClick={copyAddress}
                  className={`ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    copiedAddress
                      ? 'bg-green-700 text-green-200'
                      : 'bg-slate-600 hover:bg-slate-500 text-slate-300'
                  }`}
                  title={JANINE_ADDRESS}
                >
                  {copiedAddress
                    ? <><Check className="w-3 h-3" /> Copied!</>
                    : <><Copy className="w-3 h-3" /> Copy address</>}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Date">
                  <input type="date" className={INPUT_REQUIRED} value={s4.date} onChange={e => setS4(f => ({ ...f, date: e.target.value }))} />
                </FormField>
                <FormField label="BTC amount">
                  <input type="number" className={INPUT_REQUIRED} step="0.00000001" placeholder="0.00000000" value={s4.btc} onChange={e => setS4(f => ({ ...f, btc: e.target.value }))} />
                </FormField>
                <FormField label="BTC Price (Coinbase)">
                  <div className="flex gap-1.5">
                    <input type="number" className={INPUT_REQUIRED} placeholder="95840" value={s4.price} onChange={e => setS4(f => ({ ...f, price: e.target.value }))} />
                    {liveBtn(priceLoading)}
                  </div>
                </FormField>
                <FormField label="Amount USD">
                  <div className={READONLY}>{s4.btc && s4.price ? fmtUSD(s4USD) : '—'}</div>
                </FormField>
                <FormField label="Fee (SATS)" hint="Enter in satoshis">
                  <input type="number" className={INPUT_REQUIRED} placeholder="431" value={s4.feeSats} onChange={e => setS4(f => ({ ...f, feeSats: e.target.value }))} />
                </FormField>
                <FormField label="Fee USD (manual)">
                  <input type="number" className={INPUT} step="0.01" placeholder="Optional" value={s4.feeUSD} onChange={e => setS4(f => ({ ...f, feeUSD: e.target.value }))} />
                </FormField>
                <FormField label="Conversion Rate (optional)">
                  <input type="number" className={INPUT} step="0.01" placeholder="e.g. 19.85 pesos per USD" value={s4.convRate} onChange={e => setS4(f => ({ ...f, convRate: e.target.value }))} />
                </FormField>
                <FormField label="Conversion to Pesos">
                  <div className={READONLY}>
                    {s4.convRate && s4USD > 0
                      ? '₱' + safeNum(s4Pesos).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : '—'}
                  </div>
                </FormField>
              </div>
              <SaveButton onClick={saveStep4} saving={saving4} label="Save LC → Janine record" />
            </StepCard>

            {/* ACH — collapsed by default */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <button
                onClick={() => setAchOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                <span>ACH Transfer — Chase → Robinhood (less frequent)</span>
                {achOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {achOpen && (
                <div className="px-5 pb-5 border-t border-slate-700 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Date">
                      <input type="date" className={INPUT} value={ach.date} onChange={e => setAch(f => ({ ...f, date: e.target.value }))} />
                    </FormField>
                    <FormField label="USD amount">
                      <input type="number" className={INPUT} step="0.01" placeholder="1000.00" value={ach.amount} onChange={e => setAch(f => ({ ...f, amount: e.target.value }))} />
                    </FormField>
                  </div>
                  <SaveButton onClick={saveACH} saving={savingAch} label="Save ACH transfer" />
                </div>
              )}
            </div>
          </div>

          {/* Right — activity feed */}
          <div className="w-72 flex-shrink-0 sticky top-6">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <h3 className="font-semibold text-white text-sm mb-3">Recent Activity</h3>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-14 bg-slate-700 rounded animate-pulse" />
                  ))}
                </div>
              ) : feed.length === 0 ? (
                <p className="text-sm text-slate-500">No activity yet</p>
              ) : (
                <div className="space-y-1">
                  {feed.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${DOT_COLOR[item.type]}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-300">{item.label}</div>
                        <div className="text-xs text-slate-500">{fmtDate(item.date)}</div>
                        <div className="text-xs text-slate-400">{fmtBTC(item.btc)}</div>
                        {btcPrice != null && (
                          <div className="text-xs text-slate-500">{fmtUSD(item.btc * btcPrice)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
