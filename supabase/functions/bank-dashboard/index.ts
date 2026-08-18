// bank-dashboard — Plaid-backed consolidated balance view (personal + LLC
// accounts), ported from a standalone local Express app into Shep Portal
// proper so it's reachable from anywhere, not just one PC.
//
// Auth: deployed WITH jwt verification (no --no-verify-jwt) — the caller must
// be a logged-in Shep Portal user. On top of that, every action additionally
// checks the caller's profiles row for role='admin' OR can_view_bank_dashboard,
// since a valid Shep Portal session alone isn't enough to see live bank data.
//
// This function holds the only copy of Plaid access tokens (in bank_items,
// RLS-locked to service-role only) and is the only thing that ever talks to
// Plaid. The frontend never sees an access_token.
//
// Body shape: { action: string, ...payload }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const PLAID_CLIENT_ID  = Deno.env.get('PLAID_CLIENT_ID') ?? ''
const PLAID_SECRET     = Deno.env.get('PLAID_SECRET') ?? ''
const PLAID_ENV        = Deno.env.get('PLAID_ENV') ?? 'sandbox'
const PLAID_BASE       = `https://${PLAID_ENV}.plaid.com`

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// A Plaid API error carries a structured error_code ("ITEM_LOGIN_REQUIRED",
// "PRODUCT_NOT_READY", "RATE_LIMIT_EXCEEDED", etc.) alongside its message —
// attach it to the thrown Error so callers can tell "genuinely needs
// re-linking" apart from "transient, try again" instead of collapsing every
// failure into one indistinguishable message.
class PlaidError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

async function plaid(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${PLAID_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new PlaidError(data?.error_message || `Plaid ${path} failed: ${res.status}`, data?.error_code)
  return data
}

// If an account's own name looks like "Some Business LLC - Business Checking",
// the bank is already telling us who owns it.
function suggestOwner(accountName: string): string | null {
  const match = accountName.match(/^(.*?)\s+-\s+/)
  return match ? match[1].trim() : null
}

async function applyOwners(accounts: any[]) {
  const { data: rows } = await sb.from('bank_account_owners').select('account_id, owner')
  const owners: Record<string, string> = {}
  for (const r of rows || []) owners[r.account_id] = r.owner

  const toInsert: { account_id: string; owner: string }[] = []
  for (const acct of accounts) {
    if (acct.error || !acct.accountId) continue
    if (!(acct.accountId in owners)) {
      const suggestion = suggestOwner(acct.accountName)
      if (suggestion) {
        owners[acct.accountId] = suggestion
        toInsert.push({ account_id: acct.accountId, owner: suggestion })
      }
    }
    acct.owner = owners[acct.accountId] || null
  }
  if (toInsert.length) await sb.from('bank_account_owners').upsert(toInsert)
  return accounts
}

// ── Actions ──────────────────────────────────────────────────────────────

async function actionCreateLinkToken(_payload: any, userId: string) {
  const data = await plaid('/link/token/create', {
    user: { client_user_id: userId },
    client_name: 'Shep Portal — Bank Dashboard',
    products: ['auth'],
    country_codes: ['US'],
    language: 'en',
  })
  return { ok: true, link_token: data.link_token }
}

async function actionExchangeToken(payload: any) {
  const publicToken = String(payload?.public_token || '')
  if (!publicToken) throw new Error('public_token is required')
  const data = await plaid('/item/public_token/exchange', { public_token: publicToken })

  const { error } = await sb.from('bank_items').insert({
    item_id: data.item_id,
    access_token: data.access_token,
    institution_name: payload?.institution_name || 'Linked account',
  })
  if (error) throw new Error(error.message)
  return { ok: true }
}

async function actionGetBalances() {
  const { data: items, error } = await sb.from('bank_items').select('item_id, access_token, institution_name')
  if (error) throw new Error(error.message)

  const results: any[] = []
  for (const item of items || []) {
    try {
      const data = await plaid('/accounts/balance/get', { access_token: item.access_token })
      for (const acct of data.accounts) {
        results.push({
          itemId: item.item_id,
          accountId: acct.account_id,
          institutionName: item.institution_name,
          accountName: acct.name,
          mask: acct.mask,
          type: acct.subtype || acct.type,
          available: acct.balances.available,
          current: acct.balances.current,
          currency: acct.balances.iso_currency_code || 'USD',
        })
      }
    } catch (err: any) {
      console.error(`[bank-dashboard] balance fetch failed for ${item.institution_name}:`, err.code || '', err.message)
      // Only ITEM_LOGIN_REQUIRED (and the item-error family) actually means
      // "re-link this" — everything else (PRODUCT_NOT_READY right after a
      // fresh link, RATE_LIMIT_EXCEEDED, a transient network/institution
      // hiccup) is worth showing as what it really is instead of always
      // pointing at re-linking, which isn't the fix and just trains you to
      // ignore the message.
      const needsRelink = err.code === 'ITEM_LOGIN_REQUIRED'
      results.push({
        itemId: item.item_id,
        institutionName: item.institution_name,
        error: needsRelink
          ? 'Needs re-link — the bank requires you to sign in again'
          : (err.message || 'Could not fetch balance') + (err.code ? ` (${err.code})` : ''),
      })
    }
  }

  await applyOwners(results)
  const updatedAt = new Date().toISOString()
  await sb.from('bank_balances_cache').update({ updated_at: updatedAt, accounts: results }).eq('id', 1)
  return { ok: true, accounts: results, updatedAt }
}

async function actionGetBalancesCached() {
  const { data: cache } = await sb.from('bank_balances_cache').select('updated_at, accounts').eq('id', 1).single()
  const { data: items } = await sb.from('bank_items').select('item_id')
  const itemIds = new Set((items || []).map((i: any) => i.item_id))
  const accounts = (cache?.accounts || []).filter((a: any) => itemIds.has(a.itemId))
  await applyOwners(accounts)
  return { ok: true, accounts, updatedAt: cache?.updated_at || null }
}

async function actionListOwners() {
  const { data: rows } = await sb.from('bank_account_owners').select('owner')
  const distinct = new Set((rows || []).map((r: any) => r.owner).filter(Boolean))
  distinct.add('Personal')
  return { ok: true, owners: [...distinct].sort() }
}

async function actionSetOwner(payload: any) {
  const accountId = String(payload?.accountId || '')
  if (!accountId) throw new Error('accountId is required')
  const owner = payload?.owner ? String(payload.owner) : null
  if (owner) {
    await sb.from('bank_account_owners').upsert({ account_id: accountId, owner })
  } else {
    await sb.from('bank_account_owners').delete().eq('account_id', accountId)
  }
  return { ok: true }
}

async function actionListMortgages() {
  const { data } = await sb.from('bank_mortgage_reminders').select('account_id, label, amount, due_day')
  return { ok: true, mortgages: data || [] }
}

async function actionSetMortgage(payload: any) {
  const accountId = String(payload?.accountId || '')
  if (!accountId) throw new Error('accountId is required')

  const amountRaw = payload?.amount
  if (amountRaw === null || amountRaw === undefined || amountRaw === '') {
    await sb.from('bank_mortgage_reminders').delete().eq('account_id', accountId)
    return { ok: true }
  }

  const label = String(payload?.label || '').trim()
  if (!label) throw new Error('label is required')
  const amount = Number(amountRaw)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be a positive number')
  const dueDay = Number(payload?.dueDay)
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new Error('dueDay must be between 1 and 31')

  const { error } = await sb.from('bank_mortgage_reminders').upsert(
    { account_id: accountId, label, amount, due_day: dueDay, updated_at: new Date().toISOString() },
    { onConflict: 'account_id' }
  )
  if (error) throw new Error(error.message)
  return { ok: true }
}

async function actionListItems() {
  const { data } = await sb.from('bank_items').select('item_id, institution_name, added_at').order('added_at')
  return {
    ok: true,
    items: (data || []).map((i: any) => ({ itemId: i.item_id, institutionName: i.institution_name, addedAt: i.added_at })),
  }
}

async function actionRemoveItem(payload: any) {
  const itemId = String(payload?.itemId || '')
  if (!itemId) throw new Error('itemId is required')
  const { data: item } = await sb.from('bank_items').select('access_token').eq('item_id', itemId).single()
  if (!item) throw new Error('Item not found')
  try {
    await plaid('/item/remove', { access_token: item.access_token })
  } catch (err: any) {
    console.error('[bank-dashboard] Plaid item/remove failed (removing locally anyway):', err.message)
  }
  await sb.from('bank_items').delete().eq('item_id', itemId)
  return { ok: true }
}

const ACTIONS: Record<string, (payload: any, userId: string) => Promise<unknown>> = {
  create_link_token:   actionCreateLinkToken,
  exchange_token:      actionExchangeToken,
  get_balances:        actionGetBalances,
  get_balances_cached: actionGetBalancesCached,
  list_items:          actionListItems,
  remove_item:         actionRemoveItem,
  list_owners:         actionListOwners,
  set_owner:           actionSetOwner,
  list_mortgages:      actionListMortgages,
  set_mortgage:        actionSetMortgage,
}

// ── Entry point ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ ok: false, error: 'Unauthorized' }, 401)

  // Validate the caller's Shep Portal session and load their permission flags.
  const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await authClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return json({ ok: false, error: 'Unauthorized' }, 401)

  const { data: profile } = await sb.from('profiles').select('role, can_view_bank_dashboard').eq('id', userData.user.id).single()
  const allowed = profile?.role === 'admin' || profile?.can_view_bank_dashboard === true
  if (!allowed) return json({ ok: false, error: 'You do not have access to the bank dashboard' }, 403)

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
    console.error(`[bank-dashboard] ${action} failed:`, message)
    return json({ ok: false, error: message }, 400)
  }
})
