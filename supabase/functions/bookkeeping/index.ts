// bookkeeping — double-entry ledger for Shep Portal's businesses, Phase 0
// (Happy Cuts LLC only). See bookkeeping-module-spec.md (workspace root) for
// the full design.
//
// Auth: deployed WITH jwt verification (no --no-verify-jwt) — the caller must
// be a logged-in Shep Portal user. Every action additionally checks the
// caller's profiles row for role='admin' OR can_view_bookkeeping, since a
// valid session alone isn't enough to see or post financial data.
//
// The server computes journal lines, not the browser. Dual-write callers
// (HappyCuts.jsx) send minimal facts — a schedule record id, an amount — and
// the action functions here build the balanced entry themselves. The manual
// entry action still re-validates that its lines balance before posting;
// never trust the client's own balanced/unbalanced indicator.
//
// Body shape: { action: string, ...payload }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ── Shared helpers ──────────────────────────────────────────────────────

// Dual-write callers (HappyCuts.jsx) never send an entityName — they only
// ever mean Happy Cuts, so every action defaults to it. Read/write actions
// reachable from the Bookkeeping page itself accept payload.entityName to
// target a different entity (Phase 0b: LeadsCompanion).
const DEFAULT_ENTITY = 'Happy Cuts LLC'

async function getEntityId(name: string): Promise<string> {
  const { data, error } = await sb.from('bk_entities').select('id').eq('name', name).single()
  if (error || !data) throw new Error(`Entity "${name}" not found — has its migration run?`)
  return data.id
}

async function getAccountIds(entityId: string, codes: string[]): Promise<Record<string, string>> {
  const { data, error } = await sb.from('bk_accounts').select('id, code').eq('entity_id', entityId).in('code', codes)
  if (error) throw new Error(error.message)
  const byCode: Record<string, string> = {}
  for (const row of data || []) byCode[row.code] = row.id
  for (const code of codes) {
    if (!byCode[code]) throw new Error(`Account ${code} not found for entity ${entityId}`)
  }
  return byCode
}

const num = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`Expected a number, got ${JSON.stringify(v)}`)
  return Math.round(n * 100) / 100
}

/** Inserts a journal entry + its lines, then posts it via bk_post_journal_entry
 *  (server-side balance + period-lock check). Dedup-aware: if sourceModule/
 *  sourceRecordId already has an entry (unique index in the migration), this
 *  is a no-op — a retry or double-click, not an error. */
async function postEntry(opts: {
  entityId: string
  entryDate: string
  memo: string
  source: 'dual_write' | 'manual'
  sourceModule?: string
  sourceRecordId?: string
  createdBy?: string
  lines: Array<{ accountId: string; debit?: number; credit?: number }>
}): Promise<{ posted: boolean; alreadyPosted?: boolean; entryId?: string }> {
  const { data: entry, error: entryErr } = await sb.from('bk_journal_entries').insert({
    entity_id: opts.entityId,
    entry_date: opts.entryDate,
    memo: opts.memo,
    source: opts.source,
    source_module: opts.sourceModule ?? null,
    source_record_id: opts.sourceRecordId ?? null,
    created_by: opts.createdBy ?? null,
  }).select('id').single()

  if (entryErr) {
    // Unique violation on (source_module, source_record_id) = already posted.
    if (entryErr.code === '23505') return { posted: false, alreadyPosted: true }
    throw new Error(entryErr.message)
  }

  const entryId = entry.id
  const lineRows = opts.lines
    .filter(l => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0)
    .map(l => ({ journal_entry_id: entryId, account_id: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0 }))

  const { error: linesErr } = await sb.from('bk_journal_lines').insert(lineRows)
  if (linesErr) throw new Error(linesErr.message)

  const { error: postErr } = await sb.rpc('bk_post_journal_entry', { p_entry_id: entryId })
  if (postErr) throw new Error(postErr.message)

  return { posted: true, entryId }
}

// ── Actions ──────────────────────────────────────────────────────────────

async function actionPostMowCompletion(payload: any, userId: string) {
  const scheduleRecordId = String(payload?.scheduleRecordId || '')
  if (!scheduleRecordId) throw new Error('scheduleRecordId is required')
  const amount = num(payload?.amount)
  const payout = payload?.contractorPayout != null ? num(payload.contractorPayout) : 0

  const entityId = await getEntityId(DEFAULT_ENTITY)
  const codes = payout > 0 ? ['1100', '4000', '5000', '2000'] : ['1100', '4000']
  const acct = await getAccountIds(entityId, codes)

  const lines = [
    { accountId: acct['1100'], debit: amount },   // Accounts Receivable
    { accountId: acct['4000'], credit: amount },  // Mow Revenue
  ]
  if (payout > 0) {
    lines.push({ accountId: acct['5000'], debit: payout })   // Contractor Expense
    lines.push({ accountId: acct['2000'], credit: payout })  // Accrued Payroll
  }

  const result = await postEntry({
    entityId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `Mow completed — ${payload?.contractorName ? `worked by ${payload.contractorName}` : 'no crew assigned'}`,
    source: 'dual_write',
    sourceModule: 'happy_cuts_schedule_complete',
    sourceRecordId: scheduleRecordId,
    createdBy: userId,
    lines,
  })
  return { ok: true, ...result }
}

async function actionPostMowPayment(payload: any, userId: string) {
  const scheduleRecordId = String(payload?.scheduleRecordId || '')
  if (!scheduleRecordId) throw new Error('scheduleRecordId is required')
  const amount = num(payload?.amount)

  const entityId = await getEntityId(DEFAULT_ENTITY)
  const acct = await getAccountIds(entityId, ['1000', '1100'])

  const result = await postEntry({
    entityId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: 'Mow payment received (cash)',
    source: 'dual_write',
    sourceModule: 'happy_cuts_schedule_paid',
    sourceRecordId: scheduleRecordId,
    createdBy: userId,
    lines: [
      { accountId: acct['1000'], debit: amount },   // Cash
      { accountId: acct['1100'], credit: amount },  // Accounts Receivable
    ],
  })
  return { ok: true, ...result }
}

async function actionPostCrewPayout(payload: any, userId: string) {
  const scheduleRecordIds: string[] = Array.isArray(payload?.scheduleRecordIds) ? payload.scheduleRecordIds.map(String) : []
  if (scheduleRecordIds.length === 0) throw new Error('scheduleRecordIds is required')
  const totalAmount = num(payload?.totalAmount)

  const entityId = await getEntityId(DEFAULT_ENTITY)
  const acct = await getAccountIds(entityId, ['2000', '1000'])

  // Deterministic batch key from the actual set of jobs being paid — a
  // double-click with the same set is a no-op; a later payout run with a
  // different set of jobs gets its own key.
  const batchKey = [...scheduleRecordIds].sort().join(',')

  const result = await postEntry({
    entityId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `Crew payout — ${scheduleRecordIds.length} job${scheduleRecordIds.length === 1 ? '' : 's'}`,
    source: 'dual_write',
    sourceModule: 'happy_cuts_crew_payout',
    sourceRecordId: batchKey,
    createdBy: userId,
    lines: [
      { accountId: acct['2000'], debit: totalAmount },  // Accrued Payroll
      { accountId: acct['1000'], credit: totalAmount }, // Cash
    ],
  })
  return { ok: true, ...result }
}

async function actionCreateManualEntry(payload: any, userId: string) {
  const date = String(payload?.date || new Date().toISOString().slice(0, 10))
  const memo = String(payload?.memo || '').trim()
  if (!memo) throw new Error('memo is required')
  const rawLines = Array.isArray(payload?.lines) ? payload.lines : []
  if (rawLines.length < 2) throw new Error('An entry needs at least two lines')

  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  const entityId = await getEntityId(entityName)
  const codes = [...new Set(rawLines.map((l: any) => String(l.accountCode)))]
  const acct = await getAccountIds(entityId, codes)

  const lines = rawLines.map((l: any) => ({
    accountId: acct[String(l.accountCode)],
    debit: l.debit != null ? num(l.debit) : 0,
    credit: l.credit != null ? num(l.credit) : 0,
  }))

  // Re-validate balance server-side — never trust the client's checkmark.
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
  if (totalDebit !== totalCredit) throw new Error(`Entry does not balance: debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}`)
  if (totalDebit === 0) throw new Error('Entry has no amounts')

  const result = await postEntry({
    entityId,
    entryDate: date,
    memo,
    source: 'manual',
    createdBy: userId,
    lines,
  })
  return { ok: true, ...result }
}

async function actionGetSummary(payload: any) {
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  const entityId = await getEntityId(entityName)
  const monthStart = new Date().toISOString().slice(0, 8) + '01'

  const { data: accounts, error: acctErr } = await sb.from('bk_accounts').select('id, code, name, account_type').eq('entity_id', entityId)
  if (acctErr) throw new Error(acctErr.message)
  const acctById = new Map((accounts || []).map(a => [a.id, a]))

  const { data: allLines, error: linesErr } = await sb
    .from('bk_journal_lines')
    .select('account_id, debit, credit, bk_journal_entries!inner(entry_date, status, entity_id)')
    .eq('bk_journal_entries.entity_id', entityId)
    .eq('bk_journal_entries.status', 'posted')
  if (linesErr) throw new Error(linesErr.message)

  const pnlLines: Record<string, number> = {}
  const bsBalances: Record<string, number> = {}
  let cashBalance = 0

  for (const line of allLines || []) {
    const acct = acctById.get(line.account_id)
    if (!acct) continue
    const entry = (line as any).bk_journal_entries
    const net = Number(line.debit) - Number(line.credit)

    // Balance sheet: cumulative, all-time.
    bsBalances[acct.code] = (bsBalances[acct.code] || 0) + (acct.account_type === 'asset' || acct.account_type === 'expense' ? net : -net)
    if (acct.code === '1000') cashBalance += net

    // P&L: month-to-date only, income/expense accounts.
    if (entry.entry_date >= monthStart && (acct.account_type === 'income' || acct.account_type === 'expense')) {
      const key = acct.name
      pnlLines[key] = (pnlLines[key] || 0) + (acct.account_type === 'income' ? -net : net)
    }
  }

  const income = (accounts || []).filter(a => a.account_type === 'income').map(a => ({ code: a.code, name: a.name, amount: pnlLines[a.name] || 0 }))
  const expenses = (accounts || []).filter(a => a.account_type === 'expense').map(a => ({ code: a.code, name: a.name, amount: pnlLines[a.name] || 0 }))
  const totalIncome = income.reduce((s, l) => s + l.amount, 0)
  const totalExpenses = expenses.reduce((s, l) => s + l.amount, 0)

  const balanceSheet = (accounts || [])
    .filter(a => a.account_type !== 'income' && a.account_type !== 'expense')
    .map(a => ({ code: a.code, name: a.name, accountType: a.account_type, balance: bsBalances[a.code] || 0 }))

  return {
    ok: true,
    pnl: { income, expenses, netIncome: totalIncome - totalExpenses, monthStart },
    balanceSheet,
    cashBalance,
  }
}

async function actionListEntries(payload: any) {
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  const entityId = await getEntityId(entityName)
  const limit = Math.min(Number(payload?.limit) || 25, 100)

  const { data: entries, error } = await sb
    .from('bk_journal_entries')
    .select('id, entry_date, memo, source, source_module, source_record_id, status, created_by, bk_journal_lines(id, debit, credit, memo, bk_accounts(code, name))')
    .eq('entity_id', entityId)
    .eq('status', 'posted')
    .order('entry_date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)

  return { ok: true, entries: entries || [] }
}

async function actionGetBankCheck(payload: any) {
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  const entityId = await getEntityId(entityName)
  const { data, error } = await sb.from('bk_bank_checks').select('*').eq('entity_id', entityId).maybeSingle()
  if (error) throw new Error(error.message)
  const summary: any = await actionGetSummary({ entityName })
  return { ok: true, statementBalance: data?.statement_balance ?? null, checkedAt: data?.checked_at ?? null, ledgerCashBalance: summary.cashBalance }
}

async function actionSetBankCheck(payload: any, userId: string) {
  const statementBalance = num(payload?.statementBalance)
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  const entityId = await getEntityId(entityName)
  const { error } = await sb.from('bk_bank_checks').upsert({
    entity_id: entityId,
    statement_balance: statementBalance,
    checked_at: new Date().toISOString(),
    checked_by: userId,
  })
  if (error) throw new Error(error.message)
  return { ok: true }
}

const ACTIONS: Record<string, (payload: any, userId: string) => Promise<unknown>> = {
  post_mow_completion: actionPostMowCompletion,
  post_mow_payment:    actionPostMowPayment,
  post_crew_payout:    actionPostCrewPayout,
  create_manual_entry: actionCreateManualEntry,
  get_summary:         actionGetSummary,
  list_entries:        actionListEntries,
  get_bank_check:      actionGetBankCheck,
  set_bank_check:      actionSetBankCheck,
}

// ── Entry point ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ ok: false, error: 'Unauthorized' }, 401)

  const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await authClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return json({ ok: false, error: 'Unauthorized' }, 401)

  const { data: profile } = await sb.from('profiles').select('role, can_view_bookkeeping').eq('id', userData.user.id).single()
  const allowed = profile?.role === 'admin' || profile?.can_view_bookkeeping === true
  if (!allowed) return json({ ok: false, error: 'You do not have access to Bookkeeping' }, 403)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Body must be JSON' }, 400)
  }

  const action = String(body?.action || '')
  const handler = ACTIONS[action]
  if (!handler) return json({ ok: false, error: `Unknown action: ${action}. Valid: ${Object.keys(ACTIONS).join(', ')}` }, 400)

  try {
    const result = await handler(body, userData.user.id)
    return json(result)
  } catch (err: any) {
    const message = err?.message || String(err)
    console.error(`[bookkeeping] ${action} failed:`, message)
    return json({ ok: false, error: message }, 400)
  }
})
