// bookkeeping — double-entry ledger for Shep Portal's businesses. See
// bookkeeping-module-spec.md (workspace root) for the full design. Phase 1a
// added a SimpleFin bank feed (connect + sync + manual quick-categorize) on
// top of Phase 0's dual-write/manual-entry core. Phase 1b adds learned
// auto-post (bk_categorization_rules — a vendor needs AUTO_POST_THRESHOLD
// human confirmations before it posts unattended) and AI-suggested
// categories for brand-new vendors (suggest_category, still one click to
// confirm — never posts anything itself).
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

// Per-request caller context, built once in Deno.serve and passed as the
// third arg to every action handler. scope === null means unrestricted
// (admin); scope === [] means "granted Bookkeeping access but zero entities
// picked yet" — deliberately locked out, not open, until an admin picks
// entities via Admin > Users' Edit Access Settings modal.
type BkContext = { userId: string; isAdmin: boolean; scope: string[] | null }

// See the DUAL_WRITE_ONLY_ACTIONS comment at the Deno.serve allow-check for
// why these bypass can_view_bookkeeping entirely (valid session only).
const DUAL_WRITE_ONLY_ACTIONS = new Set([
  'post_mow_completion', 'post_mow_payment', 'post_crew_payout',
  'post_obligation_payment', 'post_bills_payment',
])

function assertEntityScope(entityName: string, ctx?: BkContext) {
  if (ctx && ctx.scope !== null && !ctx.scope.includes(entityName)) {
    throw new Error(`You do not have access to ${entityName} in Bookkeeping`)
  }
}

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

// A vendor needs this many human confirmations of the same category before
// later occurrences auto-post with no click at all (see bk_categorization_rules,
// Phase 1b). Confirmed with Thomas at 2 — fast enough to feel like it's
// learning, still requires a real repeat before being trusted unattended.
const AUTO_POST_THRESHOLD = 2

// Normalizes a transaction description into a stable lookup key for
// bk_categorization_rules — e.g. "SHELL OIL 5732801 SEATTLE WA" and
// "SHELL OIL 8834521 SEATTLE WA" both key to "shell oil seattle", so the
// store-number noise doesn't prevent matching the same vendor twice.
function vendorKey(description: string): string {
  return String(description || '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
}

/** Inserts a journal entry + its lines, then posts it via bk_post_journal_entry
 *  (server-side balance + period-lock check). Dedup-aware: if sourceModule/
 *  sourceRecordId already has an entry (unique index in the migration), this
 *  is a no-op — a retry or double-click, not an error. */
async function postEntry(opts: {
  entityId: string
  entryDate: string
  memo: string
  source: 'dual_write' | 'manual' | 'bank_feed'
  sourceModule?: string
  sourceRecordId?: string
  createdBy?: string
  lines: Array<{ accountId: string; debit?: number; credit?: number; partnerId?: string }>
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
    .map(l => ({ journal_entry_id: entryId, account_id: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0, partner_id: l.partnerId ?? null }))

  const { error: linesErr } = await sb.from('bk_journal_lines').insert(lineRows)
  if (linesErr) throw new Error(linesErr.message)

  const { error: postErr } = await sb.rpc('bk_post_journal_entry', { p_entry_id: entryId })
  if (postErr) throw new Error(postErr.message)

  return { posted: true, entryId }
}

// ── SimpleFin bank feed (Phase 1a) ──────────────────────────────────────
//
// Protocol confirmed directly against simplefin.org: no client id/secret,
// no OAuth. The user gets a one-time Setup Token from their own SimpleFin
// Bridge account (bridge.simplefin.org/simplefin/create — they authenticate
// to their own bank there, we never see those credentials), pastes it into
// Bookkeeping once, and `claim_setup_token` exchanges it for a persistent
// Access URL. GET {access_url}/accounts?version=2 returns every linked
// account's balance AND transactions in one call — 24 requests/day across
// the whole claim, 90-day max window per request.

// The Access URL has HTTP Basic Auth credentials baked into its userinfo
// component (scheme://user:pass@host/path) — but the WHATWG fetch spec
// fetch() implements forbids sending URLs with embedded credentials, so
// pulling them out and sending an explicit Authorization header (same as
// the protocol's own reference Python example) is required, not optional.
function parseAccessUrl(accessUrl: string): { baseUrl: string; authHeader: string } {
  const url = new URL(accessUrl)
  const username = url.username
  const password = url.password
  url.username = ''
  url.password = ''
  return { baseUrl: url.toString().replace(/\/$/, ''), authHeader: 'Basic ' + btoa(`${username}:${password}`) }
}

/** Notifies every admin + can_view_bookkeeping user that a bank connection
 *  needs re-auth. Deliberately simpler than src/lib/notifications.js's
 *  notify(): no category/mute check (bookkeeping has no notification
 *  preference wired up yet), and skips entirely — rather than refreshing
 *  read:false — when a non-dismissed row already exists, so a connection
 *  stuck in needs_reauth doesn't re-surface as unread on every sync. */
async function notifyReauth(claimId: string) {
  try {
    const [{ data: admins }, { data: permitted }] = await Promise.all([
      sb.from('profiles').select('id').eq('role', 'admin'),
      sb.from('profiles').select('id').eq('can_view_bookkeeping', true),
    ])
    const ids = [...new Set([...(admins || []), ...(permitted || [])].map((r: any) => r.id))]
    const sourceKey = `bk_reauth_${claimId}`

    for (const uid of ids) {
      const { data: existing } = await sb.from('notifications')
        .select('id, dismissed').eq('source_key', sourceKey).eq('user_id', uid).maybeSingle()
      if (existing) continue // already notified (dismissed or not) — don't spam or resurrect

      await sb.from('notifications').insert({
        user_id: uid,
        title: 'Bookkeeping bank connection needs re-authentication',
        body: 'A SimpleFin bank connection has expired or needs re-auth. Reconnect it from the Bookkeeping page.',
        module: 'bookkeeping',
        severity: 'action_needed',
        action_url: '/#/bookkeeping',
        source_key: sourceKey,
      })
    }
  } catch (err) {
    // Notifications must never break a sync.
    console.error('[bookkeeping] notifyReauth failed:', err)
  }
}

/** Fetches one claim's accounts+transactions and upserts them. Called both
 *  right after claiming a new Setup Token (so accounts appear immediately)
 *  and from the manual "Sync now" button. */
async function syncOneClaim(claim: { id: string; access_url: string; last_synced_at: string | null }) {
  const { baseUrl, authHeader } = parseAccessUrl(claim.access_url)
  // Overlap the window by 5 days on repeat syncs (protocol's own recommendation,
  // to not miss transactions that post late); 90 days back on first sync.
  const startDate = claim.last_synced_at
    ? Math.floor(new Date(claim.last_synced_at).getTime() / 1000) - 5 * 86400
    : Math.floor(Date.now() / 1000) - 90 * 86400

  const res = await fetch(`${baseUrl}/accounts?version=2&pending=1&start-date=${startDate}`, {
    headers: { Authorization: authHeader },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`SimpleFin sync failed (${res.status}): ${JSON.stringify(data?.errlist || data)}`)
  }

  const errlist: any[] = Array.isArray(data.errlist) ? data.errlist : []
  const reauthAccountIds = new Set(errlist.filter(e => e.account_id).map(e => e.account_id))
  const hasConnReauth = errlist.some(e => String(e.code || '').startsWith('con.'))

  const discoveredAccounts: any[] = []
  let autoPosted = 0
  for (const acct of data.accounts || []) {
    const status = reauthAccountIds.has(acct.id) ? 'needs_reauth' : 'active'
    const fields = {
      conn_id: acct.conn_id ?? null,
      conn_name: acct.conn_name ?? null,
      display_name: acct.name,
      currency: acct.currency ?? null,
      last_balance: acct.balance != null ? num(acct.balance) : null,
      last_balance_date: acct['balance-date'] ? new Date(acct['balance-date'] * 1000).toISOString() : null,
      status,
    }

    let { data: existing } = await sb.from('bk_bank_accounts').select('id, entity_id, ledger_account_id, status')
      .eq('claim_id', claim.id).eq('simplefin_account_id', acct.id).maybeSingle()

    if (!existing) {
      // Same real account seen under an older claim (e.g. a prior reconnect
      // after re-auth) — a fresh claim_id never matches the row above, which
      // was silently creating a duplicate bk_bank_accounts row (and a fresh
      // re-sync of its transactions) every single time a connection needed
      // reconnecting. Migrate the existing row's claim_id forward instead.
      // Some accounts already have multiple duplicates from before this fix
      // existed, so this can't assume at most one match — an already-mapped
      // duplicate wins over an ignored/unmapped one.
      const { data: elsewhere } = await sb.from('bk_bank_accounts')
        .select('id, entity_id, ledger_account_id, status')
        .eq('simplefin_account_id', acct.id).neq('claim_id', claim.id)
        .order('entity_id', { ascending: false, nullsFirst: false })
        .limit(1)
      if (elsewhere?.[0]) {
        existing = elsewhere[0]
        const { error: migrateErr } = await sb.from('bk_bank_accounts').update({ claim_id: claim.id }).eq('id', existing.id)
        if (migrateErr) throw new Error(migrateErr.message)
      }
    }

    let bankAccountId: string
    let mappingEntityId: string | null = existing?.entity_id ?? null
    let mappingLedgerAccountId: string | null = existing?.ledger_account_id ?? null
    if (existing) {
      bankAccountId = existing.id
      // A sync must never resurrect a status the user deliberately set —
      // 'ignored' means "stop bothering me about this one," not "reset on
      // the next refresh."
      const updateFields = existing.status === 'ignored' ? { ...fields, status: 'ignored' } : fields
      const { error: updErr } = await sb.from('bk_bank_accounts').update(updateFields).eq('id', bankAccountId)
      if (updErr) throw new Error(updErr.message)
    } else {
      const { data: inserted, error: insErr } = await sb.from('bk_bank_accounts')
        .insert({ claim_id: claim.id, simplefin_account_id: acct.id, ...fields })
        .select('id').single()
      if (insErr) throw new Error(insErr.message)
      bankAccountId = inserted.id
    }
    discoveredAccounts.push({ id: bankAccountId, displayName: acct.name, connName: acct.conn_name, status })

    const txRows = (acct.transactions || []).map((t: any) => ({
      bank_account_id: bankAccountId,
      simplefin_transaction_id: t.id,
      posted_at: new Date((t.posted || t.transacted_at || 0) * 1000).toISOString(),
      amount: num(t.amount),
      description: t.description,
      pending: !!t.pending,
    }))
    if (txRows.length > 0) {
      // matched_journal_entry_id is deliberately absent from these rows, so
      // an already-categorized transaction re-fetched inside the overlap
      // window keeps its match on conflict rather than being reset to null.
      const { error: txErr } = await sb.from('bk_raw_transactions')
        .upsert(txRows, { onConflict: 'bank_account_id,simplefin_transaction_id' })
      if (txErr) throw new Error(txErr.message)
    }

    // Auto-post anything matching a learned vendor pattern (Phase 1b) — only
    // once this account is mapped to an entity/ledger account, and only for
    // transactions still sitting unmatched (new this sync, or left over from
    // before the pattern crossed AUTO_POST_THRESHOLD).
    if (mappingEntityId && mappingLedgerAccountId && txRows.length > 0) {
      const { data: unmatched } = await sb.from('bk_raw_transactions')
        .select('id, amount, description, posted_at')
        .eq('bank_account_id', bankAccountId)
        .is('matched_journal_entry_id', null)
        .in('simplefin_transaction_id', txRows.map(t => t.simplefin_transaction_id))

      for (const raw of unmatched || []) {
        const key = vendorKey(raw.description)
        const { data: rule } = await sb.from('bk_categorization_rules')
          .select('account_id, times_confirmed').eq('entity_id', mappingEntityId).eq('vendor_key', key).maybeSingle()
        if (!rule || rule.times_confirmed < AUTO_POST_THRESHOLD) continue

        const amt = num(raw.amount)
        const lines = amt > 0
          ? [{ accountId: mappingLedgerAccountId, debit: Math.abs(amt) }, { accountId: rule.account_id, credit: Math.abs(amt) }]
          : [{ accountId: rule.account_id, debit: Math.abs(amt) }, { accountId: mappingLedgerAccountId, credit: Math.abs(amt) }]

        const result = await postEntry({
          entityId: mappingEntityId,
          entryDate: String(raw.posted_at).slice(0, 10),
          memo: `Auto-categorized (learned pattern): ${raw.description}`,
          source: 'bank_feed',
          sourceModule: 'bookkeeping_bank_feed_auto',
          sourceRecordId: raw.id,
          lines,
        })
        if (result.posted && result.entryId) {
          await sb.from('bk_raw_transactions').update({ matched_journal_entry_id: result.entryId }).eq('id', raw.id)
          autoPosted++
        }
      }
    }
  }

  await sb.from('bk_feed_claims').update({
    last_synced_at: new Date().toISOString(),
    status: hasConnReauth ? 'needs_reauth' : 'active',
  }).eq('id', claim.id)

  if (hasConnReauth || reauthAccountIds.size > 0) await notifyReauth(claim.id)

  return { discoveredAccounts, errlist, autoPosted }
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

  // HappyCuts.jsx only calls this from the no-Stripe-invoice cash path —
  // physical cash handed to Thomas in person. Per him, that money usually
  // never reaches the business bank account at all; it's kept or spent
  // personally, which is functionally an owner distribution the moment
  // it's collected, not a deposit. Default to that. depositedToBank:true
  // is there for the less-common case where the cash genuinely got
  // deposited — not currently sent by HappyCuts.jsx, but available.
  const depositedToBank = payload?.depositedToBank === true

  const entityId = await getEntityId(DEFAULT_ENTITY)
  const acct = await getAccountIds(entityId, depositedToBank ? ['1000', '1100'] : ['3100', '1100'])

  const result = await postEntry({
    entityId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: depositedToBank
      ? 'Mow payment received (cash) — deposited to business account'
      : 'Mow payment received (cash) — kept as owner distribution',
    source: 'dual_write',
    sourceModule: 'happy_cuts_schedule_paid',
    sourceRecordId: scheduleRecordId,
    createdBy: userId,
    lines: depositedToBank
      ? [{ accountId: acct['1000'], debit: amount }, { accountId: acct['1100'], credit: amount }]     // Cash / AR
      : [{ accountId: acct['3100'], debit: amount }, { accountId: acct['1100'], credit: amount }],    // Owner's Draws / AR
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

async function actionCreateManualEntry(payload: any, userId: string, ctx?: BkContext) {
  const date = String(payload?.date || new Date().toISOString().slice(0, 10))
  const memo = String(payload?.memo || '').trim()
  if (!memo) throw new Error('memo is required')
  const rawLines = Array.isArray(payload?.lines) ? payload.lines : []
  if (rawLines.length < 2) throw new Error('An entry needs at least two lines')

  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  assertEntityScope(entityName, ctx)
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

async function actionGetSummary(payload: any, _userId?: string, ctx?: BkContext) {
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  assertEntityScope(entityName, ctx)
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

async function actionListEntries(payload: any, _userId?: string, ctx?: BkContext) {
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  assertEntityScope(entityName, ctx)
  const entityId = await getEntityId(entityName)
  // CSV export needs the full range, not the on-screen page size — the cap
  // still exists (5000, not literally unbounded) so a single export can't
  // become a runaway query.
  const limit = Math.min(Number(payload?.limit) || 25, payload?.forExport ? 5000 : 100)

  const { data: entries, error } = await sb
    .from('bk_journal_entries')
    .select('id, entry_date, memo, source, source_module, source_record_id, status, created_by, receipt_document_id, bk_journal_lines(id, debit, credit, memo, bk_accounts(code, name))')
    .eq('entity_id', entityId)
    .eq('status', 'posted')
    .order('entry_date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)

  return { ok: true, entries: entries || [] }
}

// Entity is resolved indirectly here (via the entry's own entity_id), not
// supplied by the caller — assertEntryScope looks it up before acting.
async function assertEntryScope(entryId: string, ctx?: BkContext) {
  if (!ctx || ctx.scope === null) return
  const { data } = await sb.from('bk_journal_entries').select('bk_entities(name)').eq('id', entryId).single()
  const entityName = (data as any)?.bk_entities?.name
  if (!entityName || !ctx.scope.includes(entityName)) throw new Error('You do not have access to this entry')
}

async function actionAttachReceipt(payload: any, _userId?: string, ctx?: BkContext) {
  const entryId = String(payload?.entryId || '')
  if (!entryId) throw new Error('entryId is required')
  const documentId = String(payload?.documentId || '')
  if (!documentId) throw new Error('documentId is required')
  await assertEntryScope(entryId, ctx)
  const { error } = await sb.from('bk_journal_entries').update({ receipt_document_id: documentId }).eq('id', entryId)
  if (error) throw new Error(error.message)
  return { ok: true }
}

async function actionDetachReceipt(payload: any, _userId?: string, ctx?: BkContext) {
  const entryId = String(payload?.entryId || '')
  if (!entryId) throw new Error('entryId is required')
  await assertEntryScope(entryId, ctx)
  const { error } = await sb.from('bk_journal_entries').update({ receipt_document_id: null }).eq('id', entryId)
  if (error) throw new Error(error.message)
  return { ok: true }
}

async function actionGetBankCheck(payload: any, _userId?: string, ctx?: BkContext) {
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  assertEntityScope(entityName, ctx)
  const entityId = await getEntityId(entityName)
  const { data, error } = await sb.from('bk_bank_checks').select('*').eq('entity_id', entityId).maybeSingle()
  if (error) throw new Error(error.message)
  const summary: any = await actionGetSummary({ entityName })

  // Predates the SimpleFin bank feed (Phase 0a) — back then, "does this
  // match the bank" genuinely needed Thomas to type in whatever his
  // banking app showed. Now that a mapped checking account syncs its real
  // balance on every "Sync now," typing that same number in by hand is
  // just redundant data entry — use the synced balance automatically when
  // one exists, and only fall back to the manual bk_bank_checks value for
  // entities with no bank feed connected to Cash yet.
  let liveBalance: number | null = null
  let liveBalanceDate: string | null = null
  try {
    const cashAcct = await getAccountIds(entityId, ['1000'])
    const { data: feedAccount } = await sb.from('bk_bank_accounts')
      .select('last_balance, last_balance_date')
      .eq('entity_id', entityId).eq('ledger_account_id', cashAcct['1000']).eq('status', 'active')
      .order('last_balance_date', { ascending: false }).limit(1).maybeSingle()
    if (feedAccount?.last_balance != null) {
      liveBalance = Number(feedAccount.last_balance)
      liveBalanceDate = feedAccount.last_balance_date
    }
  } catch {
    // No '1000' Cash account, or no bank feed mapped to it yet — fine,
    // falls through to the manual value below.
  }

  return {
    ok: true,
    statementBalance: liveBalance ?? (data?.statement_balance ?? null),
    checkedAt: liveBalance != null ? liveBalanceDate : (data?.checked_at ?? null),
    ledgerCashBalance: summary.cashBalance,
    isLive: liveBalance != null,
  }
}

async function actionSetBankCheck(payload: any, userId: string, ctx?: BkContext) {
  const statementBalance = num(payload?.statementBalance)
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  assertEntityScope(entityName, ctx)
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

async function actionClaimSetupToken(payload: any, userId: string) {
  const setupToken = String(payload?.setupToken || '').trim()
  if (!setupToken) throw new Error('setupToken is required')

  let claimUrl: string
  try {
    claimUrl = atob(setupToken)
  } catch {
    throw new Error("That doesn't look like a valid Setup Token (expected base64)")
  }
  if (!/^https:\/\//.test(claimUrl)) throw new Error('Decoded Setup Token is not an HTTPS URL — refusing to use it')

  const claimRes = await fetch(claimUrl, { method: 'POST', headers: { 'Content-Length': '0' } })
  const accessUrl = (await claimRes.text()).trim()
  if (!claimRes.ok || !accessUrl.startsWith('https://')) {
    throw new Error(`Could not claim that Setup Token (status ${claimRes.status}) — it may already be used or expired. Generate a new one at bridge.simplefin.org.`)
  }

  const { data: claim, error: insErr } = await sb.from('bk_feed_claims')
    .insert({ access_url: accessUrl, created_by: userId })
    .select('id, access_url, last_synced_at').single()
  if (insErr) throw new Error(insErr.message)

  const result = await syncOneClaim(claim)
  return { ok: true, claimId: claim.id, ...result }
}

async function actionSyncFeedTransactions(payload: any) {
  const claimId = payload?.claimId ? String(payload.claimId) : null
  const query = claimId
    ? sb.from('bk_feed_claims').select('id, access_url, last_synced_at').eq('id', claimId)
    : sb.from('bk_feed_claims').select('id, access_url, last_synced_at').eq('status', 'active')
  const { data: claims, error } = await query
  if (error) throw new Error(error.message)
  if (!claims || claims.length === 0) return { ok: true, synced: 0, results: [] }

  const results = []
  let totalAutoPosted = 0
  for (const claim of claims) {
    try {
      const r = await syncOneClaim(claim)
      totalAutoPosted += r.autoPosted || 0
      results.push({ claimId: claim.id, ...r })
    } catch (err: any) {
      results.push({ claimId: claim.id, error: err?.message || String(err) })
    }
  }
  return { ok: true, synced: results.length, autoPosted: totalAutoPosted, results }
}

async function actionListFeedAccounts(payload: any, _userId?: string, ctx?: BkContext) {
  let q = sb.from('bk_bank_accounts')
    .select('id, claim_id, display_name, conn_name, currency, entity_id, ledger_account_id, last_balance, last_balance_date, status')
  if (payload?.entityName) {
    const entityName = String(payload.entityName)
    assertEntityScope(entityName, ctx)
    q = q.eq('entity_id', await getEntityId(entityName))
  } else {
    // Unmapped accounts aren't part of any entity's books yet — connect-time
    // housekeeping (same posture as claim/sync), not scoped per-entity.
    q = q.is('entity_id', null).neq('status', 'ignored')
  }
  const { data, error } = await q.order('display_name')
  if (error) throw new Error(error.message)
  return { ok: true, accounts: data || [] }
}

async function assertBankAccountScope(bankAccountId: string, ctx?: BkContext) {
  if (!ctx || ctx.scope === null) return
  const { data } = await sb.from('bk_bank_accounts').select('bk_entities(name)').eq('id', bankAccountId).single()
  const entityName = (data as any)?.bk_entities?.name
  // Not yet mapped to any entity — connect-time housekeeping, not scoped.
  if (!entityName) return
  if (!ctx.scope.includes(entityName)) throw new Error('You do not have access to this account')
}

async function actionIgnoreFeedAccount(payload: any, _userId?: string, ctx?: BkContext) {
  const bankAccountId = String(payload?.bankAccountId || '')
  if (!bankAccountId) throw new Error('bankAccountId is required')
  await assertBankAccountScope(bankAccountId, ctx)
  const { error } = await sb.from('bk_bank_accounts').update({ status: 'ignored' }).eq('id', bankAccountId)
  if (error) throw new Error(error.message)
  return { ok: true }
}

async function actionMapFeedAccount(payload: any, _userId?: string, ctx?: BkContext) {
  const bankAccountId = String(payload?.bankAccountId || '')
  if (!bankAccountId) throw new Error('bankAccountId is required')
  const entityName = String(payload?.entityName || '')
  if (!entityName) throw new Error('entityName is required')
  assertEntityScope(entityName, ctx)
  const ledgerAccountCode = String(payload?.ledgerAccountCode || '')
  if (!ledgerAccountCode) throw new Error('ledgerAccountCode is required')

  const entityId = await getEntityId(entityName)
  const acct = await getAccountIds(entityId, [ledgerAccountCode])

  const { error } = await sb.from('bk_bank_accounts')
    .update({ entity_id: entityId, ledger_account_id: acct[ledgerAccountCode] })
    .eq('id', bankAccountId)
  if (error) throw new Error(error.message)
  return { ok: true }
}

async function actionListRawTransactions(payload: any, _userId?: string, ctx?: BkContext) {
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  assertEntityScope(entityName, ctx)
  const unmatchedOnly = payload?.unmatchedOnly !== false
  const entityId = await getEntityId(entityName)

  let q = sb.from('bk_raw_transactions')
    .select('id, posted_at, amount, description, pending, matched_journal_entry_id, bk_bank_accounts!inner(id, display_name, entity_id, ledger_account_id)')
    .eq('bk_bank_accounts.entity_id', entityId)
    .order('posted_at', { ascending: false })
    .limit(100)
  if (unmatchedOnly) q = q.is('matched_journal_entry_id', null)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return { ok: true, transactions: data || [] }
}

async function actionQuickCategorizeTransaction(payload: any, userId: string, ctx?: BkContext) {
  const rawTransactionId = String(payload?.rawTransactionId || '')
  if (!rawTransactionId) throw new Error('rawTransactionId is required')
  const accountCode = String(payload?.accountCode || '')
  if (!accountCode) throw new Error('accountCode is required')

  const { data: raw, error: rawErr } = await sb.from('bk_raw_transactions')
    .select('id, amount, description, posted_at, matched_journal_entry_id, bk_bank_accounts!inner(entity_id, ledger_account_id, bk_entities(name))')
    .eq('id', rawTransactionId).single()
  if (rawErr || !raw) throw new Error('Transaction not found')
  if (raw.matched_journal_entry_id) throw new Error('This transaction has already been categorized')

  const bankAccount = (raw as any).bk_bank_accounts
  if (!bankAccount?.entity_id || !bankAccount?.ledger_account_id) {
    throw new Error("This bank account isn't mapped to an entity/ledger account yet")
  }
  if (ctx && ctx.scope !== null && !ctx.scope.includes(bankAccount.bk_entities?.name)) {
    throw new Error('You do not have access to this transaction')
  }

  const amount = num(raw.amount)
  const acct = await getAccountIds(bankAccount.entity_id, [accountCode])
  const otherAccountId = acct[accountCode]

  // SimpleFin sign convention: positive = deposit (money in), negative =
  // withdrawal — so a deposit debits the ledger's Cash/CC account and
  // credits the income account picked, and vice versa for a withdrawal.
  const lines = amount > 0
    ? [{ accountId: bankAccount.ledger_account_id, debit: Math.abs(amount) }, { accountId: otherAccountId, credit: Math.abs(amount) }]
    : [{ accountId: otherAccountId, debit: Math.abs(amount) }, { accountId: bankAccount.ledger_account_id, credit: Math.abs(amount) }]

  const result = await postEntry({
    entityId: bankAccount.entity_id,
    entryDate: String(raw.posted_at).slice(0, 10),
    memo: String(payload?.memo || raw.description || 'Bank feed transaction'),
    source: 'bank_feed',
    sourceModule: 'bookkeeping_bank_feed',
    sourceRecordId: rawTransactionId,
    createdBy: userId,
    lines,
  })

  if (result.posted && result.entryId) {
    await sb.from('bk_raw_transactions').update({ matched_journal_entry_id: result.entryId }).eq('id', rawTransactionId)

    // Record this confirmation for auto-post (Phase 1b) — best-effort, a
    // hiccup here shouldn't undo the categorization that already succeeded.
    try {
      const key = vendorKey(raw.description)
      const { data: existingRule } = await sb.from('bk_categorization_rules')
        .select('id, account_id, times_confirmed')
        .eq('entity_id', bankAccount.entity_id).eq('vendor_key', key).maybeSingle()
      if (existingRule) {
        const sameAccount = existingRule.account_id === otherAccountId
        await sb.from('bk_categorization_rules').update({
          account_id: otherAccountId,
          times_confirmed: sameAccount ? existingRule.times_confirmed + 1 : 1,
          last_confirmed_at: new Date().toISOString(),
        }).eq('id', existingRule.id)
      } else {
        await sb.from('bk_categorization_rules').insert({ entity_id: bankAccount.entity_id, vendor_key: key, account_id: otherAccountId })
      }
    } catch (err) {
      console.error('[bookkeeping] categorization_rules update failed:', err)
    }
  }
  return { ok: true, ...result }
}

async function actionSuggestCategory(payload: any, _userId?: string, ctx?: BkContext) {
  const rawTransactionId = String(payload?.rawTransactionId || '')
  if (!rawTransactionId) throw new Error('rawTransactionId is required')

  // Gemini over Claude specifically for this action — Thomas's call, cost:
  // gemini-2.5-flash-lite runs ~10x cheaper than claude-haiku-4-5 per token
  // (confirmed against Google's pricing page, 2026-08), and this is the one
  // Bookkeeping AI call with real per-transaction volume (every other AI
  // call in this codebase is one-shot per document/nudge, not per row).
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) return { ok: true, suggested: null }

  const { data: raw } = await sb.from('bk_raw_transactions')
    .select('id, amount, description, bk_bank_accounts!inner(entity_id, bk_entities!inner(name))')
    .eq('id', rawTransactionId).maybeSingle()
  const entityId = (raw as any)?.bk_bank_accounts?.entity_id
  const entityName = (raw as any)?.bk_bank_accounts?.bk_entities?.name || 'this business'
  if (!raw || !entityId) return { ok: true, suggested: null }
  if (ctx && ctx.scope !== null && !ctx.scope.includes(entityName)) return { ok: true, suggested: null }

  const { data: accounts } = await sb.from('bk_accounts')
    .select('code, name').eq('entity_id', entityId).in('account_type', ['income', 'expense'])
  const closedList = accounts || []
  if (closedList.length === 0) return { ok: true, suggested: null }

  // Same suggest-and-confirm shape as src/lib/documentLinks.js's
  // extractLinkedFields() — closed list injected into the prompt so the
  // model can never suggest a code outside the entity's real chart of
  // accounts. Never throws (fails soft to null) — a suggestion is a nice-
  // to-have, never load-bearing.
  try {
    // gemini-2.5-flash-lite 404s for new API keys ("no longer available to
    // new users") even though it's still listed by /v1beta/models — Google
    // deprecates by key-creation-date, not by removing the model outright.
    // gemini-flash-lite-latest is a floating alias Google keeps pointed at
    // whatever their current cheap model is (gemini-3.5-flash-lite as of
    // 2026-08), so this shouldn't need updating the next time they rotate.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Amount: ${raw.amount} (positive = deposit, negative = withdrawal). Description: ${raw.description}` }] }],
          systemInstruction: {
            parts: [{ text: `You categorize one bank transaction for ${entityName}'s small business ledger. Return ONLY JSON. Shape: {"code":string|null}. "code" must be exactly one of these account codes, or null if genuinely unsure: ${JSON.stringify(closedList.map(a => a.code))}. Reference (code → name): ${JSON.stringify(closedList)}. Never invent a code outside that list. Generic bank operations — ATM withdrawals, "cashback", ACH pushes/transfers, anything where the description names a bank action rather than a merchant or purpose — carry no real signal about what the money was for. Return null for those rather than guessing; a wrong guess is worse than no suggestion.` }],
          },
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 50 },
        }),
      },
    )
    if (!res.ok) {
      // Failing soft to null is correct behavior (a missing suggestion must
      // never block the transaction list) — but silent-by-design is exactly
      // how the gemini-2.5-flash-lite deprecation went unnoticed. Log it so
      // the next model/API break is a bk_error_log query, not manual curl
      // debugging.
      const body = await res.text().catch(() => '')
      sb.from('bk_error_log').insert({ action: 'suggest_category', error_message: `Gemini ${res.status}: ${body.slice(0, 500)}` }).then(() => {}, () => {})
      return { ok: true, suggested: null }
    }
    const json = await res.json()
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const parsed = JSON.parse(text)
    const match = closedList.find(a => a.code === parsed.code)
    return { ok: true, suggested: match || null }
  } catch (err: any) {
    sb.from('bk_error_log').insert({ action: 'suggest_category', error_message: err?.message || String(err) }).then(() => {}, () => {})
    return { ok: true, suggested: null }
  }
}

async function actionRecordDistribution(payload: any, userId: string, ctx?: BkContext) {
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  assertEntityScope(entityName, ctx)
  const amount = num(payload?.amount)
  if (amount <= 0) throw new Error('Amount must be greater than zero')
  const date = String(payload?.date || new Date().toISOString().slice(0, 10))
  const memo = String(payload?.memo || '').trim() || 'Owner distribution'

  const entityId = await getEntityId(entityName)
  const acct = await getAccountIds(entityId, ['1000', '3100'])

  const result = await postEntry({
    entityId,
    entryDate: date,
    memo,
    source: 'manual',
    createdBy: userId,
    lines: [
      { accountId: acct['3100'], debit: amount },   // Owner's Draws
      { accountId: acct['1000'], credit: amount },  // Cash
    ],
  })
  return { ok: true, ...result }
}

// ── Phase 3 — partner equity (Ridge & Anchor LLC) ───────────────────────
//
// Equity design: 3 SHARED accounts per entity (Partner Capital / Partner
// Draws / Partner Contributions) rather than one set per partner —
// bk_journal_lines.partner_id tags which partner a line belongs to. This is
// what makes the capital statement a plain group-by-partner_id query, and
// it means a third partner later costs zero new accounts.

async function actionListPartners(payload: any, _userId?: string, ctx?: BkContext) {
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  assertEntityScope(entityName, ctx)
  const entityId = await getEntityId(entityName)
  const { data, error } = await sb.from('bk_partners').select('id, name, ownership_pct').eq('entity_id', entityId).order('name')
  if (error) throw new Error(error.message)
  return { ok: true, partners: data || [] }
}

async function actionRecordPartnerDistribution(payload: any, userId: string, ctx?: BkContext) {
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  assertEntityScope(entityName, ctx)
  const partnerId = String(payload?.partnerId || '')
  if (!partnerId) throw new Error('partnerId is required')
  const amount = num(payload?.amount)
  if (amount <= 0) throw new Error('Amount must be greater than zero')
  const date = String(payload?.date || new Date().toISOString().slice(0, 10))
  const memo = String(payload?.memo || '').trim() || 'Partner distribution'

  const entityId = await getEntityId(entityName)
  const acct = await getAccountIds(entityId, ['1000', '3010'])

  const result = await postEntry({
    entityId,
    entryDate: date,
    memo,
    source: 'manual',
    createdBy: userId,
    lines: [
      { accountId: acct['3010'], debit: amount, partnerId },  // Partner Draws
      { accountId: acct['1000'], credit: amount },            // Cash
    ],
  })
  return { ok: true, ...result }
}

async function actionRecordPartnerContribution(payload: any, userId: string, ctx?: BkContext) {
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  assertEntityScope(entityName, ctx)
  const partnerId = String(payload?.partnerId || '')
  if (!partnerId) throw new Error('partnerId is required')
  const amount = num(payload?.amount)
  if (amount <= 0) throw new Error('Amount must be greater than zero')
  const date = String(payload?.date || new Date().toISOString().slice(0, 10))
  const memo = String(payload?.memo || '').trim() || 'Partner contribution'

  const entityId = await getEntityId(entityName)
  const acct = await getAccountIds(entityId, ['1000', '3020'])

  const result = await postEntry({
    entityId,
    entryDate: date,
    memo,
    source: 'manual',
    createdBy: userId,
    lines: [
      { accountId: acct['1000'], debit: amount },                // Cash
      { accountId: acct['3020'], credit: amount, partnerId },    // Partner Contributions
    ],
  })
  return { ok: true, ...result }
}

// Query-time computation, not a posted closing entry — real partnership
// closes are a deliberate CPA-driven step. "Allocated income" here is
// ownership_pct x the entity's period net income, shown as a preview of
// what capital would be if this period were closed, never written back
// into the ledger.
async function actionGetPartnerCapitalStatement(payload: any, _userId?: string, ctx?: BkContext) {
  const entityName = String(payload?.entityName || DEFAULT_ENTITY)
  assertEntityScope(entityName, ctx)
  const periodStart = String(payload?.periodStart || '')
  const periodEnd = String(payload?.periodEnd || '')
  if (!periodStart || !periodEnd) throw new Error('periodStart and periodEnd are required')

  const entityId = await getEntityId(entityName)

  const { data: partners, error: partnersErr } = await sb.from('bk_partners')
    .select('id, name, ownership_pct').eq('entity_id', entityId).order('name')
  if (partnersErr) throw new Error(partnersErr.message)

  const { data: accounts, error: acctErr } = await sb.from('bk_accounts')
    .select('id, code, account_type').eq('entity_id', entityId)
  if (acctErr) throw new Error(acctErr.message)
  const acctById = new Map((accounts || []).map(a => [a.id, a]))
  const drawsAcctId = (accounts || []).find(a => a.code === '3010')?.id
  const contribAcctId = (accounts || []).find(a => a.code === '3020')?.id

  const { data: allLines, error: linesErr } = await sb
    .from('bk_journal_lines')
    .select('account_id, debit, credit, partner_id, bk_journal_entries!inner(entry_date, status, entity_id)')
    .eq('bk_journal_entries.entity_id', entityId)
    .eq('bk_journal_entries.status', 'posted')
  if (linesErr) throw new Error(linesErr.message)

  // Two net-income figures, not one: periodNetIncome is "this quarter" for
  // display context, allTimeNetIncome is life-of-the-entity and is what
  // Ending Capital actually needs. There's no closing entry ever moving
  // prior periods' income into equity (deliberate — see comment above), so
  // every prior period's accumulated profit still lives in the income/
  // expense accounts. Allocating only the current period's income into
  // Ending Capital would silently understate it starting the second period
  // an entity has any activity.
  let periodNetIncome = 0
  let allTimeNetIncome = 0
  const byPartner: Record<string, { contributionsAllTime: number; drawsAllTime: number; contributionsPeriod: number; drawsPeriod: number }> = {}
  for (const p of partners || []) byPartner[p.id] = { contributionsAllTime: 0, drawsAllTime: 0, contributionsPeriod: 0, drawsPeriod: 0 }

  for (const line of allLines || []) {
    const entry = (line as any).bk_journal_entries
    const inPeriod = entry.entry_date >= periodStart && entry.entry_date <= periodEnd
    const acct = acctById.get(line.account_id)
    const net = Number(line.debit) - Number(line.credit)

    // Income is credit-normal, expense is debit-normal.
    if (acct?.account_type === 'income') {
      allTimeNetIncome += -net
      if (inPeriod) periodNetIncome += -net
    } else if (acct?.account_type === 'expense') {
      allTimeNetIncome -= net
      if (inPeriod) periodNetIncome -= net
    }

    if (line.partner_id && byPartner[line.partner_id]) {
      if (line.account_id === contribAcctId) {
        const amt = Number(line.credit) - Number(line.debit)
        byPartner[line.partner_id].contributionsAllTime += amt
        if (inPeriod) byPartner[line.partner_id].contributionsPeriod += amt
      } else if (line.account_id === drawsAcctId) {
        const amt = Number(line.debit) - Number(line.credit)
        byPartner[line.partner_id].drawsAllTime += amt
        if (inPeriod) byPartner[line.partner_id].drawsPeriod += amt
      }
    }
  }

  const result = (partners || []).map(p => {
    const b = byPartner[p.id]
    const pct = Number(p.ownership_pct) / 100
    const allocatedIncomePeriod = Math.round(periodNetIncome * pct * 100) / 100
    const allocatedIncomeAllTime = Math.round(allTimeNetIncome * pct * 100) / 100
    return {
      id: p.id,
      name: p.name,
      ownershipPct: Number(p.ownership_pct),
      contributionsPeriod: b.contributionsPeriod,
      drawsPeriod: b.drawsPeriod,
      contributionsAllTime: b.contributionsAllTime,
      drawsAllTime: b.drawsAllTime,
      allocatedIncomePeriod,
      endingBalance: b.contributionsAllTime - b.drawsAllTime + allocatedIncomeAllTime,
    }
  })

  return { ok: true, periodStart, periodEnd, periodNetIncome, allTimeNetIncome, partners: result }
}

// ── Phase 3 — dual-write from Bills Payment and Insurance/Obligation
// Payments (Insurance.jsx, PropertyDetail.jsx). Both are best-effort from
// the caller's side: getEntityId() throws when the resolved entity name
// isn't onboarded to Bookkeeping yet, and the frontend call sites catch
// that silently — same "never block the primary action" posture as the
// existing categorization_rules best-effort write.

const OBLIGATION_KIND_ACCOUNT: Record<string, string> = {
  'Property Tax': '5000',
  'Insurance': '5010',
}

// Insurance.jsx's Entity field and Property's Owner field both use the real
// legal title-holder name — but "Thomas Shepard" and "Thomas Shepard and
// Gabrielle Shepard" are two different strings that both mean the Personal
// entity. Resolve through this map before getEntityId(); anything not
// listed falls through unchanged, so the existing silent-skip-if-not-
// onboarded behavior still applies to any entity that isn't live yet.
const PROPERTY_OWNER_TO_BK_ENTITY: Record<string, string> = {
  'Thomas Shepard': 'Personal',
  'Thomas Shepard and Gabrielle Shepard': 'Personal',
  'Shepard Holdings LLC': 'Shepard Holdings LLC',
  'Virginia Holdings LLC': 'Virginia Holdings LLC',
  'Ridge & Anchor LLC': 'Ridge & Anchor LLC',
  'Happy Cuts LLC': 'Happy Cuts LLC',
  'East Meadow Consulting LLC': 'East Meadow Consulting LLC',
}
function resolveBkEntityName(rawName: string): string {
  return PROPERTY_OWNER_TO_BK_ENTITY[rawName] || rawName
}

async function actionPostObligationPayment(payload: any, userId: string) {
  const entityName = resolveBkEntityName(String(payload?.entityName || ''))
  if (!entityName) throw new Error('entityName is required')
  const kind = String(payload?.kind || '')
  const code = OBLIGATION_KIND_ACCOUNT[kind]
  if (!code) throw new Error(`Unsupported obligation kind: ${kind}`)
  const amount = num(payload?.amount)
  if (amount <= 0) throw new Error('Amount must be greater than zero')
  const date = String(payload?.date || new Date().toISOString().slice(0, 10))
  const memo = String(payload?.memo || '').trim() || `${kind} payment`
  const paymentRecordId = String(payload?.paymentRecordId || '')

  const entityId = await getEntityId(entityName)
  const acct = await getAccountIds(entityId, ['1000', code])

  const result = await postEntry({
    entityId,
    entryDate: date,
    memo,
    source: 'dual_write',
    sourceModule: 'bookkeeping_obligation_payment',
    sourceRecordId: paymentRecordId || undefined,
    createdBy: userId,
    lines: [
      { accountId: acct[code], debit: amount },
      { accountId: acct['1000'], credit: amount },
    ],
  })
  return { ok: true, ...result }
}

const BILLS_CATEGORY_ACCOUNT: Record<string, string> = {
  Insurance: '5010', Utilities: '5020', Maintenance: '5030', Internet: '5040',
  Mortgage: '5050', Cleaning: '5060', Handyman: '5070', Others: '5080',
}

async function actionPostBillsPayment(payload: any, userId: string) {
  const propertyOwner = resolveBkEntityName(String(payload?.propertyOwner || ''))
  if (!propertyOwner) throw new Error('propertyOwner is required')
  const category = String(payload?.category || '')
  const code = BILLS_CATEGORY_ACCOUNT[category]
  if (!code) throw new Error(`Unsupported bill category: ${category}`)
  const amount = num(payload?.amount)
  if (amount <= 0) throw new Error('Amount must be greater than zero')
  const date = String(payload?.date || new Date().toISOString().slice(0, 10))
  const memo = String(payload?.memo || '').trim() || 'Bill payment'
  const billRecordId = String(payload?.billRecordId || '')

  const entityId = await getEntityId(propertyOwner)
  const acct = await getAccountIds(entityId, ['1000', code])

  const result = await postEntry({
    entityId,
    entryDate: date,
    memo,
    source: 'dual_write',
    sourceModule: 'bookkeeping_bills_payment',
    sourceRecordId: billRecordId || undefined,
    createdBy: userId,
    lines: [
      { accountId: acct[code], debit: amount },
      { accountId: acct['1000'], credit: amount },
    ],
  })
  return { ok: true, ...result }
}

async function actionRecategorizeTransaction(payload: any, userId: string, ctx?: BkContext) {
  const entryId = String(payload?.entryId || '')
  if (!entryId) throw new Error('entryId is required')
  const accountCode = String(payload?.accountCode || '')
  if (!accountCode) throw new Error('accountCode is required')
  await assertEntryScope(entryId, ctx)

  const { data: entry, error: entryErr } = await sb.from('bk_journal_entries')
    .select('id, source_module, source_record_id').eq('id', entryId).single()
  if (entryErr || !entry) throw new Error('Entry not found')
  // Only entries tied to a specific bank transaction can be edited in
  // place — source_record_id is that transaction's id for exactly these
  // two source_modules (quick-categorize and learned auto-post). A manual
  // or dual-write entry has to be voided and re-entered instead.
  if (!['bookkeeping_bank_feed', 'bookkeeping_bank_feed_auto'].includes(entry.source_module || '')) {
    throw new Error("This entry isn't linked to a bank transaction — void it and re-enter manually instead")
  }
  const rawTransactionId = String(entry.source_record_id || '')
  if (!rawTransactionId) throw new Error('No linked transaction found for this entry')

  // Void the old posting, clear the transaction's match, then repost with
  // the corrected account — same logic actionQuickCategorizeTransaction
  // already uses (sign handling, dedup, categorization_rules confirmation).
  const { error: voidErr } = await sb.from('bk_journal_entries').update({ status: 'void' }).eq('id', entryId)
  if (voidErr) throw new Error(voidErr.message)
  const { error: clearErr } = await sb.from('bk_raw_transactions').update({ matched_journal_entry_id: null }).eq('id', rawTransactionId)
  if (clearErr) throw new Error(clearErr.message)

  return actionQuickCategorizeTransaction({ rawTransactionId, accountCode }, userId)
}

async function actionVoidEntry(payload: any, _userId?: string, ctx?: BkContext) {
  const entryId = String(payload?.entryId || '')
  if (!entryId) throw new Error('entryId is required')
  await assertEntryScope(entryId, ctx)
  const { error: voidErr } = await sb.from('bk_journal_entries').update({ status: 'void' }).eq('id', entryId)
  if (voidErr) throw new Error(voidErr.message)
  const { error: clearErr } = await sb.from('bk_raw_transactions').update({ matched_journal_entry_id: null }).eq('matched_journal_entry_id', entryId)
  if (clearErr) throw new Error(clearErr.message)
  return { ok: true }
}

async function actionRemoveFeedClaim(payload: any) {
  const claimId = String(payload?.claimId || '')
  if (!claimId) throw new Error('claimId is required')
  const { error } = await sb.from('bk_feed_claims').update({ status: 'removed' }).eq('id', claimId)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// Phase 2 — powers the Triage rule (src/lib/triageRules.js). Every other
// Bookkeeping action is scoped to one entity at a time, matching the
// Bookkeeping page's own UI; Triage needs the opposite — everything that
// needs attention, across every entity, in one call.
async function actionListTriageCandidates(_payload: any, _userId?: string, ctx?: BkContext) {
  // Reauth: whole-connection claims first (blocks every account under
  // them), then only account-specific issues NOT already covered by a
  // reauth claim — an act.-level error on an otherwise-active connection,
  // per syncOneClaim's con./act. distinction.
  const { data: reauthClaims } = await sb.from('bk_feed_claims').select('id').eq('status', 'needs_reauth')
  const reauthClaimIds = new Set((reauthClaims || []).map((c: any) => c.id))

  const { data: claimAccounts } = reauthClaimIds.size > 0
    ? await sb.from('bk_bank_accounts').select('claim_id, display_name, bk_entities(name)').in('claim_id', [...reauthClaimIds])
    : { data: [] as any[] }

  const claimCandidates = (reauthClaims || []).map((c: any) => {
    const accts = (claimAccounts || []).filter((a: any) => a.claim_id === c.id)
    const entityNames = [...new Set(accts.map((a: any) => a.bk_entities?.name).filter(Boolean))]
    const names = accts.map((a: any) => a.display_name).join(', ') || 'Bank connection'
    return { kind: 'claim', id: c.id, label: entityNames.length ? `${names} — ${entityNames.join(', ')}` : names, entityNames }
  })

  const { data: reauthAccounts } = await sb.from('bk_bank_accounts')
    .select('id, display_name, claim_id, bk_entities(name)').eq('status', 'needs_reauth')
  const accountCandidates = (reauthAccounts || [])
    .filter((a: any) => !reauthClaimIds.has(a.claim_id))
    .map((a: any) => ({
      kind: 'account', id: a.id,
      label: a.bk_entities?.name ? `${a.display_name} — ${a.bk_entities.name}` : a.display_name,
      entityNames: a.bk_entities?.name ? [a.bk_entities.name] : [],
    }))

  // Unreviewed backlog, aggregated per entity — one row per entity, not one
  // per transaction, so this stays a summary card, not a flood. Only
  // entities whose oldest unreviewed transaction is 3+ days old; same-day
  // review is the Bookkeeping page's job, not Triage's.
  const { data: unmatched } = await sb.from('bk_raw_transactions')
    .select('posted_at, bk_bank_accounts!inner(bk_entities(name))')
    .is('matched_journal_entry_id', null)

  const byEntity: Record<string, { entityName: string; count: number; oldest: string }> = {}
  for (const t of unmatched || []) {
    const entityName = (t as any).bk_bank_accounts?.bk_entities?.name
    if (!entityName) continue
    const posted = String(t.posted_at)
    if (!byEntity[entityName]) byEntity[entityName] = { entityName, count: 0, oldest: posted }
    byEntity[entityName].count++
    if (posted < byEntity[entityName].oldest) byEntity[entityName].oldest = posted
  }
  const THREE_DAYS_MS = 3 * 86400000
  let unreviewedBacklog = Object.values(byEntity).filter(e => Date.now() - new Date(e.oldest).getTime() >= THREE_DAYS_MS)

  let reauthCandidates = [...claimCandidates, ...accountCandidates]

  // Cross-entity by design (this is the one action that IS), so it's the
  // one place scope filtering has to happen after the fact rather than up
  // front — a scoped VA's Triage view should never surface another
  // entity's reauth/backlog card, or even that entity's name inside a
  // shared claim's label.
  if (ctx && ctx.scope !== null) {
    const scope = ctx.scope
    unreviewedBacklog = unreviewedBacklog.filter(e => scope.includes(e.entityName))
    reauthCandidates = reauthCandidates
      .map((c: any) => {
        const scopedNames = c.entityNames.filter((n: string) => scope.includes(n))
        // The label was built from the full entity list before filtering —
        // rebuild it (claim candidates only; account candidates' label
        // already names just their one entity) so a scoped viewer's card
        // never shows another entity's name even inside the label string.
        const label = c.kind === 'claim' && scopedNames.length
          ? c.label.split(' — ')[0] + (scopedNames.length ? ` — ${scopedNames.join(', ')}` : '')
          : c.label
        return { ...c, entityNames: scopedNames, label }
      })
      .filter((c: any) => c.entityNames.length > 0)
  }

  return { ok: true, reauthCandidates, unreviewedBacklog }
}

// Admin-only (enforced in Deno.serve before this runs, not just here) —
// dumps every entity's full ledger as one JSON object for a manual,
// off-Supabase backup. Deliberately excludes bk_feed_claims: that table's
// access_url has the SimpleFin Basic Auth credentials baked into it (see
// its own migration comment) — a downloadable backup file must never
// contain a live bank credential. Reconnecting after a real restore is a
// 30-second re-paste of a fresh Setup Token, not worth the exposure.
async function actionExportBackup(_payload: any) {
  const tables = [
    'bk_entities', 'bk_accounts', 'bk_journal_entries', 'bk_journal_lines',
    'bk_partners', 'bk_bank_accounts', 'bk_raw_transactions',
    'bk_categorization_rules', 'bk_bank_checks', 'bk_period_locks',
  ]
  const dump: Record<string, unknown> = { exportedAt: new Date().toISOString() }
  for (const table of tables) {
    const { data, error } = await sb.from(table).select('*')
    if (error) throw new Error(`${table}: ${error.message}`)
    dump[table] = data || []
  }
  return { ok: true, backup: dump }
}

const ACTIONS: Record<string, (payload: any, userId: string, ctx?: BkContext) => Promise<unknown>> = {
  post_mow_completion: actionPostMowCompletion,
  post_mow_payment:    actionPostMowPayment,
  post_crew_payout:    actionPostCrewPayout,
  create_manual_entry: actionCreateManualEntry,
  get_summary:         actionGetSummary,
  list_entries:        actionListEntries,
  get_bank_check:      actionGetBankCheck,
  set_bank_check:      actionSetBankCheck,
  claim_setup_token:      actionClaimSetupToken,
  sync_feed_transactions: actionSyncFeedTransactions,
  list_feed_accounts:     actionListFeedAccounts,
  map_feed_account:       actionMapFeedAccount,
  list_raw_transactions:  actionListRawTransactions,
  quick_categorize_transaction: actionQuickCategorizeTransaction,
  remove_feed_claim:      actionRemoveFeedClaim,
  suggest_category:       actionSuggestCategory,
  void_entry:             actionVoidEntry,
  record_distribution:    actionRecordDistribution,
  recategorize_transaction: actionRecategorizeTransaction,
  ignore_feed_account:      actionIgnoreFeedAccount,
  list_triage_candidates:   actionListTriageCandidates,
  attach_receipt:           actionAttachReceipt,
  detach_receipt:           actionDetachReceipt,
  list_partners:                    actionListPartners,
  record_partner_distribution:      actionRecordPartnerDistribution,
  record_partner_contribution:      actionRecordPartnerContribution,
  get_partner_capital_statement:    actionGetPartnerCapitalStatement,
  post_obligation_payment:          actionPostObligationPayment,
  post_bills_payment:               actionPostBillsPayment,
  export_backup:                    actionExportBackup,
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

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Body must be JSON' }, 400)
  }

  const action = String(body?.action || '')
  const handler = ACTIONS[action]
  if (!handler) return json({ ok: false, error: `Unknown action: ${action}. Valid: ${Object.keys(ACTIONS).join(', ')}` }, 400)

  const { data: profile } = await sb.from('profiles').select('role, can_view_bookkeeping, bookkeeping_entities').eq('id', userData.user.id).single()
  const isAdmin = profile?.role === 'admin'

  // Dual-write actions (Happy Cuts mow/crew payout, Insurance obligation
  // payments, Bills Payment suggestions) are triggered from OTHER pages
  // gated by THEIR OWN permission (can_view_happy_cuts / can_view_insurance
  // / can_view_properties) — requiring can_view_bookkeeping on top of that
  // was a real gap: anyone without it (e.g. Tony, can_view_happy_cuts=true
  // but can_view_bookkeeping=false) would silently never get a ledger
  // posting when they mark a mow paid. These actions never return ledger
  // data to the caller and only ever post an entry the caller already had
  // legitimate reason to trigger — a valid session is enough.
  const allowed = isAdmin || profile?.can_view_bookkeeping === true || DUAL_WRITE_ONLY_ACTIONS.has(action)
  if (!allowed) return json({ ok: false, error: 'You do not have access to Bookkeeping' }, 403)

  // export_backup dumps every entity's full ledger — admin only, not just
  // can_view_bookkeeping, regardless of entity scope.
  if (action === 'export_backup' && !isAdmin) return json({ ok: false, error: 'Admin only' }, 403)

  // Admins are unrestricted (scope = null). Everyone else is scoped to
  // whichever entities an admin has explicitly granted via Admin > Users'
  // "Edit Access Settings" — empty array by default, not "everything."
  const ctx: BkContext = { userId: userData.user.id, isAdmin, scope: isAdmin ? null : (profile?.bookkeeping_entities || []) }

  try {
    const result = await handler(body, ctx.userId, ctx)
    return json(result)
  } catch (err: any) {
    const message = err?.message || String(err)
    console.error(`[bookkeeping] ${action} failed:`, message)
    return json({ ok: false, error: message }, 400)
  }
})
