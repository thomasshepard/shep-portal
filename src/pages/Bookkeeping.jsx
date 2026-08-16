import { useState, useEffect } from 'react'
import { Calculator, Plus, X, ChevronDown, ChevronUp, Link2, CheckCircle2, Loader2, Landmark, RefreshCw, AlertTriangle, Wallet, Paperclip } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { fmtCurrency, fetchAllRecords, DOCS_BASE_ID } from '../lib/airtable'
import { suggestReceiptForTransaction } from '../lib/documentLinks'
import LoadingSpinner from '../components/LoadingSpinner'

// Local field-name access for Documents records — this page doesn't own the
// Documents table, so it copies Documents.jsx's own defensive multi-name
// pick() rather than assuming one canonical field name (per that module's
// documented schema drift between the "Documents"/"Scanned Documents"
// tables). Only the handful of fields receipt-matching actually needs.
function pickDocField(fields, ...keys) {
  for (const k of keys) if (fields[k] != null && fields[k] !== '') return fields[k]
  return null
}
function parseDocLite(record) {
  const f = record.fields || {}
  return {
    id: record.id,
    name: pickDocField(f, 'Name', 'Document Name', 'Title') || 'Untitled document',
    date: pickDocField(f, 'Date', 'Document Date'),
    summary: pickDocField(f, 'Summary', 'AI Summary') || '',
    ocr: f['OCR'] || '',
    attachments: Array.isArray(pickDocField(f, 'Attachments', 'File', 'Scan', 'Document')) ? pickDocField(f, 'Attachments', 'File', 'Scan', 'Document') : [],
  }
}

// Live, clickable entities. LeadsCompanion joined Happy Cuts in Phase 0b —
// both are real manual-entry-capable entities now.
const ACTIVE_ENTITIES = ['Happy Cuts LLC', 'East Meadow Consulting LLC']

// Entities the spec has planned but hasn't built yet — shown as locked pills
// so the roadmap is visible without implying they're clickable.
const LOCKED_ENTITIES = [
  { name: 'East Meadow Properties', phase: 'Phase 4' },
  { name: 'Ridge & Anchor LLC', phase: 'Phase 3' },
  { name: 'UCHB', phase: 'Phase 3' },
  { name: 'Personal', phase: 'Phase 6' },
]

async function callBookkeeping(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('bookkeeping', { body: { action, ...payload } })
  if (error) {
    // supabase-js doesn't parse the response body on a non-2xx status — it
    // just gives a generic "Edge Function returned a non-2xx status code".
    // The function always replies with a real { ok: false, error } JSON
    // body, so read it directly off the underlying Response for a message
    // that's actually actionable.
    let detail = error.message
    try {
      const body = await error.context?.json()
      if (body?.error) detail = body.error
    } catch { /* body wasn't JSON or already consumed — fall back to generic message */ }
    throw new Error(detail || `${action} failed`)
  }
  if (data?.ok === false) throw new Error(data.error || `${action} failed`)
  return data
}

function accountsFromSummary(summary) {
  if (!summary) return []
  const bs = (summary.balanceSheet || []).map(a => ({ code: a.code, name: a.name }))
  const income = (summary.pnl?.income || []).map(a => ({ code: a.code, name: a.name }))
  const expenses = (summary.pnl?.expenses || []).map(a => ({ code: a.code, name: a.name }))
  return [...bs, ...income, ...expenses]
}

export default function Bookkeeping() {
  const [selectedEntity, setSelectedEntity] = useState('Happy Cuts LLC')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)
  const [entries, setEntries] = useState([])
  const [bankCheck, setBankCheck] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [distributionModalOpen, setDistributionModalOpen] = useState(false)
  const [statementInput, setStatementInput] = useState('')

  useEffect(() => { load() }, [selectedEntity])

  async function load() {
    setLoading(true)
    try {
      const [s, e, b] = await Promise.all([
        callBookkeeping('get_summary', { entityName: selectedEntity }),
        callBookkeeping('list_entries', { entityName: selectedEntity, limit: 25 }),
        callBookkeeping('get_bank_check', { entityName: selectedEntity }),
      ])
      setSummary(s)
      setEntries(e.entries || [])
      setBankCheck(b)
      setStatementInput(b.statementBalance != null ? String(b.statementBalance) : '')
    } catch (e) {
      toast.error('Failed to load Bookkeeping: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveBankCheck() {
    const val = Number(statementInput)
    if (!Number.isFinite(val)) return toast.error('Enter a number')
    try {
      await callBookkeeping('set_bank_check', { entityName: selectedEntity, statementBalance: val })
      toast.success('Saved')
      load()
    } catch (e) {
      toast.error('Failed to save: ' + e.message)
    }
  }

  const accounts = accountsFromSummary(summary)
  // Bank Feed's two dropdowns need different slices of the chart of accounts:
  // mapping a bank account to the ledger only makes sense against Cash/liability
  // accounts, while quick-categorizing a transaction picks the "other side" —
  // usually income/expense, same as every dual-write posting does, but also
  // equity (Owner's Draws) — a bank transaction that's really the owner
  // moving money to themselves (e.g. an ACH push with no merchant signal)
  // needs to land there too, not just via the separate Record Distribution
  // flow, or the raw transaction never gets marked reviewed.
  const cashLikeAccounts = (summary?.balanceSheet || []).filter(a => a.accountType === 'asset' || a.accountType === 'liability')
  const equityAccounts = (summary?.balanceSheet || []).filter(a => a.accountType === 'equity')
  const expenseIncomeAccounts = [...(summary?.pnl?.income || []), ...(summary?.pnl?.expenses || []), ...equityAccounts]

  if (loading) return <LoadingSpinner />

  const matchDiff = bankCheck ? Math.round((Number(bankCheck.statementBalance || 0) - Number(bankCheck.ledgerCashBalance || 0)) * 100) / 100 : null
  const isClean = bankCheck?.statementBalance != null && matchDiff === 0

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calculator size={24} className="text-violet-600" />
            Bookkeeping
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{selectedEntity} &middot; double-entry, CPA-ready</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setDistributionModalOpen(true)}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Wallet size={15} /> Record Distribution
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={15} /> New Entry
          </button>
        </div>
      </div>

      {/* Entity rail */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ACTIVE_ENTITIES.map(name => (
          <button
            key={name}
            onClick={() => setSelectedEntity(name)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              selectedEntity === name ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {name}
          </button>
        ))}
        {LOCKED_ENTITIES.map(e => (
          <div key={e.name} className="flex-shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium border border-gray-200 text-gray-400">
            {e.name}
            <span className="text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">{e.phase}</span>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Revenue · MTD" value={fmtCurrency(summary?.pnl?.income?.reduce((s, l) => s + l.amount, 0) || 0)} />
        <StatTile label="Expenses · MTD" value={fmtCurrency(summary?.pnl?.expenses?.reduce((s, l) => s + l.amount, 0) || 0)} />
        <StatTile
          label="Net Income · MTD"
          value={fmtCurrency(summary?.pnl?.netIncome || 0)}
          tone={summary?.pnl?.netIncome >= 0 ? 'good' : 'bad'}
        />
        <StatTile
          label="Bank Match"
          value={bankCheck?.statementBalance == null ? 'Not set' : isClean ? 'Clean' : 'Off'}
          tone={bankCheck?.statementBalance == null ? undefined : isClean ? 'good' : 'bad'}
          sub={bankCheck?.statementBalance == null ? 'Enter a statement balance below' : isClean ? undefined : `${fmtCurrency(Math.abs(matchDiff))} ${matchDiff > 0 ? 'more' : 'less'} on the ledger`}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {/* P&L */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-sm">Profit &amp; Loss</h2>
            <span className="text-xs text-gray-400">Month to date</span>
          </div>
          <div className="px-4 py-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-1">Income</p>
            {(summary?.pnl?.income || []).map(l => <LineRow key={l.name} label={l.name} amount={l.amount} />)}
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-2">Expenses</p>
            {(summary?.pnl?.expenses || []).map(l => <LineRow key={l.name} label={l.name} amount={l.amount} />)}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100">
              <span className="text-sm font-bold text-gray-900">Net Income</span>
              <span className="text-sm font-extrabold text-gray-900 tabular-nums">{fmtCurrency(summary?.pnl?.netIncome || 0)}</span>
            </div>
          </div>
        </div>

        {/* Balance Sheet */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-sm">Balance Sheet</h2>
            <span className="text-xs text-gray-400">As of today</span>
          </div>
          <div className="px-4 py-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-1">Assets</p>
            {(summary?.balanceSheet || []).filter(a => a.accountType === 'asset').map(a => <LineRow key={a.code} label={a.name} amount={a.balance} />)}
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-2">Liabilities &amp; Equity</p>
            {(summary?.balanceSheet || []).filter(a => a.accountType !== 'asset').map(a => <LineRow key={a.code} label={a.name} amount={a.balance} />)}
          </div>
        </div>
      </div>

      {/* Bank check — auto once a bank feed is mapped to Cash (its synced
          balance is used directly, no need to type in what the feed
          already told us); manual entry stays as the fallback for entities
          without a connected bank account yet. */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
        {bankCheck?.isLive ? (
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-semibold text-gray-800">Does this match the bank?</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Checked automatically against your connected bank feed{bankCheck.checkedAt ? ` — balance as of ${String(bankCheck.checkedAt).slice(0, 10)}` : ''}. {fmtCurrency(bankCheck.statementBalance)} on the bank, {fmtCurrency(bankCheck.ledgerCashBalance)} on the ledger.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-semibold text-gray-800">Does this match the bank?</p>
              <p className="text-xs text-gray-500 mt-0.5">No bank feed connected to Cash yet for {selectedEntity} — enter the current checking balance from online banking &mdash; compared against what the ledger computes.</p>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number" step="0.01" value={statementInput}
                onChange={e => setStatementInput(e.target.value)}
                className="h-9 pl-6 pr-3 w-36 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button onClick={saveBankCheck} className="h-9 px-3.5 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800">
              Check
            </button>
          </>
        )}
      </div>

      {/* Bank Feed */}
      <BankFeedPanel
        key={selectedEntity}
        entityName={selectedEntity}
        cashLikeAccounts={cashLikeAccounts}
        expenseIncomeAccounts={expenseIncomeAccounts}
        onPosted={load}
      />

      {/* Legend */}
      <div className="flex items-center gap-5 flex-wrap bg-violet-50/60 border border-violet-100 rounded-xl px-4 py-2.5 text-xs text-gray-600">
        <span className="font-semibold text-gray-700">How entries get here</span>
        <span className="flex items-center gap-1.5"><Badge tone="auto">Auto</Badge> posted by the module that captured it &mdash; no re-typing</span>
        <span className="flex items-center gap-1.5"><Badge tone="manual">Manual</Badge> entered directly in Bookkeeping</span>
      </div>

      {/* Entries */}
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-2">Journal Entries</h2>
        {entries.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
            No entries yet. Complete a mow in Happy Cuts, or add one manually.
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => (
              <EntryRow key={entry.id} entry={entry} entries={entries} expanded={expandedId === entry.id} onToggle={() => setExpandedId(id => id === entry.id ? null : entry.id)} onVoided={load} accounts={expenseIncomeAccounts} />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <NewEntryModal
          entityName={selectedEntity}
          accounts={accounts}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }}
        />
      )}

      {distributionModalOpen && (
        <DistributionModal
          entityName={selectedEntity}
          onClose={() => setDistributionModalOpen(false)}
          onSaved={() => { setDistributionModalOpen(false); load() }}
        />
      )}
    </div>
  )
}

function StatTile({ label, value, tone, sub }) {
  const toneCls = tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-600' : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums leading-tight ${toneCls}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function LineRow({ label, amount }) {
  return (
    <div className="flex items-center justify-between text-[13px] py-0.5">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-800 tabular-nums">{fmtCurrency(amount)}</span>
    </div>
  )
}

function Badge({ tone, children }) {
  const cls = tone === 'auto' ? 'bg-violet-100 text-violet-700' : tone === 'manual' ? 'bg-gray-100 text-gray-600' : tone === 'bad' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
  return <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}

// Only entries posted from a specific bank transaction (quick-categorize or
// learned auto-post) can be re-categorized in place — bk_journal_entries.
// source_record_id is the raw transaction's id for exactly those two
// source_modules, which is what recategorize_transaction needs to void the
// old posting and repost with the corrected account.
const RECATEGORIZABLE_MODULES = new Set(['bookkeeping_bank_feed', 'bookkeeping_bank_feed_auto'])

function EntryRow({ entry, entries, expanded, onToggle, onVoided, accounts }) {
  const [voiding, setVoiding] = useState(false)
  const [recategorizing, setRecategorizing] = useState(false)
  const total = (entry.bk_journal_lines || []).reduce((s, l) => s + Number(l.debit || 0), 0)
  // Bank-feed entries (Phase 1a manual quick-categorize, Phase 1b learned
  // auto-post) are posted by the module the same way dual-write is —
  // 'dual_write' alone under-counted what actually counts as "Auto".
  const isAuto = entry.source === 'dual_write' || entry.source === 'bank_feed'
  const sourceLabel = {
    happy_cuts_schedule_complete: 'Schedule',
    happy_cuts_schedule_paid: 'Schedule',
    happy_cuts_crew_payout: 'Crew',
    bookkeeping_bank_feed: 'Bank Feed',
    bookkeeping_bank_feed_auto: 'Bank Feed · Learned',
  }[entry.source_module] || entry.source_module
  const canRecategorize = RECATEGORIZABLE_MODULES.has(entry.source_module) && accounts?.length > 0

  async function handleVoid() {
    if (!confirm('Void this entry? It will drop out of every report, and the transaction (if from the bank feed) becomes re-categorizable.')) return
    setVoiding(true)
    try {
      await callBookkeeping('void_entry', { entryId: entry.id })
      toast.success('Voided')
      onVoided?.()
    } catch (e) {
      toast.error('Failed to void: ' + e.message)
    }
    setVoiding(false)
  }

  async function handleRecategorize(accountCode) {
    if (!accountCode) return
    setRecategorizing(true)
    try {
      await callBookkeeping('recategorize_transaction', { entryId: entry.id, accountCode })
      toast.success('Recategorized')
      onVoided?.() // same "refresh everything" callback works for either correction
    } catch (e) {
      toast.error('Failed to recategorize: ' + e.message)
    }
    setRecategorizing(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-gray-800 flex-1 min-w-0 break-words">{entry.memo || 'Journal entry'}</p>
          <span className="text-sm font-bold text-gray-900 tabular-nums flex-shrink-0">{fmtCurrency(total)}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <span className="text-xs text-gray-400">{entry.entry_date}</span>
          {isAuto ? (
            <Badge tone="auto"><Link2 size={10} /> Auto &middot; {sourceLabel}</Badge>
          ) : (
            <Badge tone="manual">Manual</Badge>
          )}
          <Badge tone="posted"><CheckCircle2 size={10} /> Posted</Badge>
          <span className="ml-auto">
            {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </span>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  <th className="text-left pb-1.5">Account</th>
                  <th className="text-right pb-1.5">Debit</th>
                  <th className="text-right pb-1.5">Credit</th>
                </tr>
              </thead>
              <tbody>
                {(entry.bk_journal_lines || []).map(line => (
                  <tr key={line.id} className="border-t border-gray-50">
                    <td className="py-1.5 font-medium text-gray-700">{line.bk_accounts?.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{Number(line.debit) > 0 ? fmtCurrency(line.debit) : '—'}</td>
                    <td className="py-1.5 text-right tabular-nums">{Number(line.credit) > 0 ? fmtCurrency(line.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ReceiptSection entry={entry} entries={entries} total={total} onChanged={onVoided} />

          {canRecategorize && (
            <div className="mt-3 pt-2 border-t border-gray-100">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Wrong category?</label>
              <select
                defaultValue=""
                disabled={recategorizing}
                onChange={e => handleRecategorize(e.target.value)}
                className="w-full h-11 text-sm border border-gray-300 rounded-lg px-3"
              >
                <option value="" disabled>Change to…</option>
                {accounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <p className="text-[11px] text-gray-400">source_record_id: {entry.source_record_id || '—'}</p>
            <button
              onClick={handleVoid} disabled={voiding}
              className="text-[11px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50 flex items-center gap-1"
            >
              {voiding && <Loader2 size={11} className="animate-spin" />}
              Void
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Attaches a scanned receipt (Documents module, Airtable) to an already-
// posted journal entry. Opposite direction from documentLinks.js's existing
// Documents→Insurance/Bills/LLC pattern (starts from the transaction, finds
// a matching document, not the other way around) — see the plan notes in
// src/lib/documentLinks.js's suggestReceiptForTransaction() for why. Date-
// range candidate filtering, not category-based — nothing in the live
// Airtable schema confirms a "Receipt" Document Type value to gate on.
function ReceiptSection({ entry, entries, total, onChanged }) {
  const [receiptDoc, setReceiptDoc] = useState(null)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [picking, setPicking] = useState(false)
  const [searching, setSearching] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [suggestion, setSuggestion] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (!entry.receipt_document_id) return
    let cancelled = false
    // Airtable attachment URLs expire in a couple hours — always re-fetch
    // live rather than caching anything, same as Documents.jsx itself does.
    async function load() {
      setLoadingDoc(true)
      try {
        const { data } = await fetchAllRecords('Documents', { filterByFormula: `RECORD_ID()='${entry.receipt_document_id}'` }, DOCS_BASE_ID)
        if (!cancelled) setReceiptDoc(data?.[0] ? parseDocLite(data[0]) : null)
      } catch {
        if (!cancelled) setReceiptDoc(null)
      } finally {
        if (!cancelled) setLoadingDoc(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [entry.receipt_document_id])

  async function findCandidates() {
    setPicking(true)
    setSearching(true)
    setCandidates([])
    setSuggestion(null)
    try {
      const { data } = await fetchAllRecords('Documents', {}, DOCS_BASE_ID)
      const alreadyUsed = new Set(
        (entries || []).filter(e => e.id !== entry.id && e.receipt_document_id).map(e => e.receipt_document_id)
      )
      const entryDate = new Date(entry.entry_date)
      const list = (data || [])
        .map(parseDocLite)
        .filter(d => d.attachments.length > 0 && !alreadyUsed.has(d.id) && d.date)
        .filter(d => Math.abs((new Date(d.date) - entryDate) / 86400000) <= 5)
        .slice(0, 20)
      setCandidates(list)

      const match = await suggestReceiptForTransaction(
        { amount: total, date: entry.entry_date, description: entry.memo },
        list.map(d => ({ id: d.id, name: d.name, date: d.date, summary: d.summary, ocr: d.ocr }))
      )
      setSuggestion(match)
    } catch (e) {
      toast.error('Failed to search Documents: ' + e.message)
    }
    setSearching(false)
  }

  async function attach(documentId) {
    setBusyId(documentId)
    try {
      await callBookkeeping('attach_receipt', { entryId: entry.id, documentId })
      toast.success('Receipt attached')
      setPicking(false)
      onChanged?.()
    } catch (e) {
      toast.error('Failed to attach: ' + e.message)
    }
    setBusyId(null)
  }

  async function detach() {
    setBusyId('detach')
    try {
      await callBookkeeping('detach_receipt', { entryId: entry.id })
      toast.success('Removed')
      setReceiptDoc(null)
      onChanged?.()
    } catch (e) {
      toast.error('Failed to remove: ' + e.message)
    }
    setBusyId(null)
  }

  if (entry.receipt_document_id) {
    return (
      <div className="mt-3 pt-2 border-t border-gray-100">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Receipt</p>
        {loadingDoc ? (
          <p className="text-xs text-gray-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</p>
        ) : receiptDoc ? (
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            {receiptDoc.attachments[0]?.thumbnails?.small?.url && (
              <img src={receiptDoc.attachments[0].thumbnails.small.url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
            )}
            <a href={receiptDoc.attachments[0]?.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline flex-1 min-w-0 truncate">
              {receiptDoc.name}
            </a>
            <button onClick={detach} disabled={busyId === 'detach'} className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50 flex-shrink-0">
              {busyId === 'detach' ? <Loader2 size={12} className="animate-spin" /> : 'Remove'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Receipt document no longer found in Documents.</p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-3 pt-2 border-t border-gray-100">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Receipt</p>
        {picking && (
          <button onClick={() => setPicking(false)} className="text-[11px] font-medium text-gray-400 hover:text-gray-600">Cancel</button>
        )}
      </div>
      {!picking ? (
        <button onClick={findCandidates} className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1.5">
          <Paperclip size={12} /> Attach Receipt
        </button>
      ) : searching ? (
        <p className="text-xs text-gray-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Searching Documents…</p>
      ) : candidates.length === 0 ? (
        <p className="text-xs text-gray-400">No documents found within 5 days of this entry's date.</p>
      ) : (
        <div className="space-y-1">
          <p className="text-[11px] text-gray-400 mb-1">Tap the matching receipt to attach it — nothing is linked until you pick one.</p>
          {suggestion && (
            <button
              onClick={() => attach(suggestion.documentId)} disabled={busyId === suggestion.documentId}
              className="w-full flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-left hover:bg-amber-100 disabled:opacity-50"
            >
              {busyId === suggestion.documentId ? <Loader2 size={12} className="animate-spin flex-shrink-0" /> : <span className="flex-shrink-0">★</span>}
              <span className="text-sm text-gray-800 truncate">{suggestion.name} <span className="text-xs text-gray-400">(suggested)</span></span>
            </button>
          )}
          {!suggestion && (
            <p className="text-[11px] text-gray-400">No confident AI match — showing every document within 5 days, pick manually:</p>
          )}
          {candidates.filter(c => c.id !== suggestion?.documentId).map(c => (
            <button
              key={c.id} onClick={() => attach(c.id)} disabled={busyId === c.id}
              className="w-full flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="text-sm text-gray-700 truncate">{c.name}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">{busyId === c.id ? <Loader2 size={12} className="animate-spin" /> : c.date}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NewEntryModal({ entityName, accounts, onClose, onSaved }) {
  const emptyLine = () => ({ accountCode: accounts[0]?.code || '', debit: '', credit: '' })
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState([emptyLine(), emptyLine()])
  const [saving, setSaving] = useState(false)

  function setLine(i, patch) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }
  function addLine() { setLines(prev => [...prev, emptyLine()]) }
  function removeLine(i) { setLines(prev => prev.filter((_, idx) => idx !== i)) }

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.005

  async function handleSubmit(e) {
    e.preventDefault()
    if (!memo.trim()) return toast.error('Give it a memo')
    if (!balanced) return toast.error('Debits and credits must balance')
    setSaving(true)
    try {
      await callBookkeeping('create_manual_entry', {
        entityName, date, memo,
        lines: lines
          .filter(l => Number(l.debit) > 0 || Number(l.credit) > 0)
          .map(l => ({ accountCode: l.accountCode, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
      })
      toast.success('Posted')
      onSaved()
    } catch (err) {
      toast.error('Failed to post: ' + err.message)
    }
    setSaving(false)
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <h2 className="font-semibold text-gray-900">New Journal Entry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Memo</label>
              <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="What is this for?" className={inp} />
            </div>
          </div>

          <div>
            <div className="grid grid-cols-[1fr_100px_100px_28px] gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1 mb-1">
              <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span />
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_100px_100px_28px] gap-2 items-center">
                  <select value={l.accountCode} onChange={e => setLine(i, { accountCode: e.target.value })} className={inp}>
                    {accounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
                  </select>
                  <input type="number" step="0.01" value={l.debit} onChange={e => setLine(i, { debit: e.target.value, credit: '' })} className={inp + ' text-right'} />
                  <input type="number" step="0.01" value={l.credit} onChange={e => setLine(i, { credit: e.target.value, debit: '' })} className={inp + ' text-right'} />
                  <button type="button" onClick={() => removeLine(i)} disabled={lines.length <= 2} className="text-gray-300 hover:text-red-500 disabled:opacity-30">
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addLine} className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1">
              <Plus size={13} /> Add line
            </button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className={`text-xs font-bold flex items-center gap-1.5 ${balanced ? 'text-green-600' : 'text-gray-400'}`}>
              {balanced && <CheckCircle2 size={13} />}
              {balanced ? 'Balanced' : `${fmtCurrency(totalDebit)} / ${fmtCurrency(totalCredit)}`}
            </span>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button type="submit" disabled={saving || !balanced}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                Post Entry
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// Money the owner takes out of the entity — Dr Owner's Draws / Cr Cash,
// posted via record_distribution. Deliberately a simpler form than
// NewEntryModal's line-by-line builder: amount + memo + date is the whole
// shape of this transaction, no account picker needed.
function DistributionModal({ entityName, onClose, onSaved }) {
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter an amount')
    setSaving(true)
    try {
      await callBookkeeping('record_distribution', { entityName, amount: amt, memo: memo.trim(), date })
      toast.success('Distribution recorded')
      onSaved()
    } catch (err) {
      toast.error('Failed to record: ' + err.message)
    }
    setSaving(false)
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Wallet size={16} className="text-violet-600" /> Record Distribution</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-gray-500 -mt-1">Money taken out of {entityName} for personal use — reduces Cash and Owner's Draws.</p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={inp + ' pl-6'} autoFocus />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Memo (optional)</label>
            <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="What was this for?" className={inp} />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Record
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Bank feed — SimpleFin only. Phase 1a shipped connect/sync/manual quick-
// categorize; Phase 1b adds a starred AI-suggested category per transaction
// (still one click to confirm, never auto-selected) and reflects learned-
// pattern auto-posts in the sync toast. Self-contained: remounts fresh
// whenever the parent's `key={entityName}` changes rather than threading
// feed state through Bookkeeping()'s own load(). `onPosted` lets a
// successful quick-categorize refresh the parent's P&L/balance sheet.
function BankFeedPanel({ entityName, cashLikeAccounts, expenseIncomeAccounts, onPosted }) {
  const [loading, setLoading] = useState(true)
  const [mappedAccounts, setMappedAccounts] = useState([])
  const [unmappedAccounts, setUnmappedAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [setupToken, setSetupToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [suggestions, setSuggestions] = useState({}) // rawTransactionId -> { code, name }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [mapped, unmapped, txs] = await Promise.all([
        callBookkeeping('list_feed_accounts', { entityName }),
        callBookkeeping('list_feed_accounts', {}),
        callBookkeeping('list_raw_transactions', { entityName }),
      ])
      setMappedAccounts(mapped.accounts || [])
      setUnmappedAccounts(unmapped.accounts || [])
      const list = txs.transactions || []
      setTransactions(list)
      // Best-effort AI starting-category suggestion per transaction — never
      // blocks the list from rendering, never posts anything on its own.
      // Still a real Claude call per row, so only worth firing for whatever's
      // actually unreviewed (already the case — list_raw_transactions
      // defaults to unmatchedOnly).
      list.forEach(t => {
        callBookkeeping('suggest_category', { rawTransactionId: t.id })
          .then(r => { if (r.suggested) setSuggestions(prev => ({ ...prev, [t.id]: r.suggested })) })
          .catch(() => {})
      })
    } catch (e) {
      toast.error('Failed to load bank feed: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function connect(e) {
    e.preventDefault()
    if (!setupToken.trim()) return
    setConnecting(true)
    try {
      await callBookkeeping('claim_setup_token', { setupToken: setupToken.trim() })
      toast.success('Connected — map each account below to finish setup')
      setSetupToken('')
      load()
    } catch (e) {
      toast.error('Failed to connect: ' + e.message)
    }
    setConnecting(false)
  }

  async function mapAccount(bankAccountId, ledgerAccountCode) {
    if (!ledgerAccountCode) return
    setBusyId(bankAccountId)
    try {
      await callBookkeeping('map_feed_account', { bankAccountId, entityName, ledgerAccountCode })
      toast.success('Mapped')
      load()
    } catch (e) {
      toast.error('Failed to map: ' + e.message)
    }
    setBusyId(null)
  }

  async function ignoreAccount(bankAccountId) {
    if (!confirm("Ignore this account? It'll stop showing up here — nothing else changes.")) return
    setBusyId(bankAccountId)
    try {
      await callBookkeeping('ignore_feed_account', { bankAccountId })
      load()
    } catch (e) {
      toast.error('Failed to ignore: ' + e.message)
    }
    setBusyId(null)
  }

  async function sync() {
    setSyncing(true)
    try {
      const result = await callBookkeeping('sync_feed_transactions', {})
      const failed = (result.results || []).filter(r => r.error)
      if (failed.length > 0) toast.error(`Sync had ${failed.length} issue(s) — see console`)
      else if (result.autoPosted > 0) toast.success(`Synced — ${result.autoPosted} auto-categorized from learned patterns`)
      else toast.success('Synced')
      load()
    } catch (e) {
      toast.error('Failed to sync: ' + e.message)
    }
    setSyncing(false)
  }

  async function categorize(rawTransactionId, accountCode) {
    if (!accountCode) return
    setBusyId(rawTransactionId)
    try {
      await callBookkeeping('quick_categorize_transaction', { rawTransactionId, accountCode })
      setTransactions(prev => prev.filter(t => t.id !== rawTransactionId))
      onPosted?.()
    } catch (e) {
      toast.error('Failed to post: ' + e.message)
    }
    setBusyId(null)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-2 text-sm text-gray-400">
        <Loader2 size={14} className="animate-spin" /> Loading bank feed…
      </div>
    )
  }

  const unmappedForThisEntity = unmappedAccounts // any claimed-but-unmapped account can be mapped to whichever entity is open right now

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
          <Landmark size={15} className="text-violet-600" /> Bank Feed
        </h2>
        {mappedAccounts.length > 0 && (
          <button onClick={sync} disabled={syncing} className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 py-2 px-1 -my-2 -mx-1">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Sync now
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Connect form */}
        <form onSubmit={connect} className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Connect a bank &mdash; <a href="https://bridge.simplefin.org/simplefin/create" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">get a Setup Token here</a>, then paste it below
            </label>
            <textarea
              value={setupToken} onChange={e => setSetupToken(e.target.value)}
              placeholder="Paste Setup Token"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button type="submit" disabled={connecting || !setupToken.trim()}
            className="h-11 px-4 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2">
            {connecting && <Loader2 size={14} className="animate-spin" />}
            Connect
          </button>
        </form>

        {/* Unmapped accounts needing a Cash/liability account picked */}
        {unmappedForThisEntity.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Needs mapping to {entityName}</p>
            {unmappedForThisEntity.map(a => (
              <div key={a.id} className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-gray-700">{a.displayName || a.display_name}{a.connName || a.conn_name ? ` · ${a.connName || a.conn_name}` : ''}</p>
                  <button
                    onClick={() => ignoreAccount(a.id)} disabled={busyId === a.id}
                    className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 flex-shrink-0 py-1"
                  >
                    Ignore
                  </button>
                </div>
                <select
                  defaultValue=""
                  disabled={busyId === a.id}
                  onChange={e => mapAccount(a.id, e.target.value)}
                  className="w-full h-11 text-sm border border-gray-300 rounded-lg px-3"
                >
                  <option value="" disabled>Map to account…</option>
                  {cashLikeAccounts.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Mapped accounts summary */}
        {mappedAccounts.length > 0 && (
          <div className="space-y-1">
            {mappedAccounts.map(a => (
              <div key={a.id} className="flex items-center justify-between text-[13px] py-1">
                <span className="text-gray-600 flex items-center gap-1.5">
                  {a.display_name}
                  {a.status === 'needs_reauth' && (
                    <Badge tone="bad"><AlertTriangle size={10} /> Needs re-auth</Badge>
                  )}
                </span>
                <span className="font-medium text-gray-800 tabular-nums">{a.last_balance != null ? fmtCurrency(a.last_balance) : '—'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Unreviewed transactions — stacked cards, not a cramped single-line
            row: on a phone a fixed-width date + truncating description +
            amount + text-xs select all on one line was unusable. Full-width,
            real-height (44px+) selects instead. */}
        {transactions.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-2">Unreviewed transactions</p>
            {transactions.map(t => (
              <div key={t.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 break-words">{t.description}{t.pending ? ' (pending)' : ''}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{String(t.posted_at).slice(0, 10)}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">{fmtCurrency(t.amount)}</span>
                </div>
                <select
                  defaultValue=""
                  disabled={busyId === t.id}
                  onChange={e => categorize(t.id, e.target.value)}
                  className="w-full h-11 text-sm border border-gray-300 rounded-lg px-3"
                >
                  <option value="" disabled>Categorize…</option>
                  {suggestions[t.id] && (
                    <option value={suggestions[t.id].code}>★ {suggestions[t.id].name} (suggested)</option>
                  )}
                  {expenseIncomeAccounts.filter(c => c.code !== suggestions[t.id]?.code).map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {mappedAccounts.length === 0 && unmappedForThisEntity.length === 0 && (
          <p className="text-xs text-gray-400">No bank accounts connected for {entityName} yet.</p>
        )}
      </div>
    </div>
  )
}
