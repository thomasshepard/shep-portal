// Admin only; preview reads Airtable only; send writes Lease Invoice rows (draft first) and Tenants' Stripe Customer ID, then calls Stripe. Deploy with JWT verification on (default).
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { buildPreview } from '../_shared/rentPreview.js'
import { centralToday } from '../_shared/rentMath.js'
import { getStripeClientForAccount, STRIPE_ACCOUNTS } from '../_shared/stripeAccounts.ts'
import { sendRentInvoices } from '../_shared/rentSend.js'

const AIRTABLE_PAT = Deno.env.get('AIRTABLE_PAT') ?? ''
const PM_BASE = 'appeuX9BHNgVXxdYZ'

const TABLES = {
  schedule: 'tbl2HYyA5a9eiRWoc',
  leases: 'tblr00YD7yxgirqtN',
  lineItems: 'tblRW3CsmQC6zI2RU',
  tenants: 'tblcUBwyCHhyYzUEC',
  units: 'tbl2tk7EjtR2k65WR',
  properties: 'tblsFZ6bhUwsnPLaj',
  invoices: 'tblvBW1tHvXrjL6Go'
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

async function listAll(tableId: string): Promise<any[]> {
  const allRecords: any[] = []
  let offset: string | null = null

  while (true) {
    const url = new URL(`https://api.airtable.com/v0/${PM_BASE}/${tableId}`)
    if (offset) url.searchParams.set('offset', offset)

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_PAT}` }
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable fetch failed (${res.status}): ${body}`)
    }

    const data = await res.json()
    allRecords.push(...data.records)

    if (!data.offset) break
    offset = data.offset
  }

  return allRecords
}

async function loadData() {
  const [schedule, leases, lineItems, tenants, units, properties, invoices] = await Promise.all([
    listAll(TABLES.schedule),
    listAll(TABLES.leases),
    listAll(TABLES.lineItems),
    listAll(TABLES.tenants),
    listAll(TABLES.units),
    listAll(TABLES.properties),
    listAll(TABLES.invoices)
  ])

  return { schedule, leases, lineItems, tenants, units, properties, invoices }
}

async function createRecord(table: string, fields: Record<string, unknown>) {
  const url = `https://api.airtable.com/v0/${PM_BASE}/${table}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AIRTABLE_PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields, typecast: true }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable create failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  return { id: data.id }
}

async function updateRecord(table: string, id: string, fields: Record<string, unknown>) {
  const url = `https://api.airtable.com/v0/${PM_BASE}/${table}/${id}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields, typecast: true }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable update failed (${res.status}): ${body}`)
  }
}

function stripeFor(account: string) {
  if (!account || !(account in STRIPE_ACCOUNTS)) {
    throw new Error('No rent Stripe account for this property')
  }
  try {
    return getStripeClientForAccount(account as keyof typeof STRIPE_ACCOUNTS)
  } catch {
    const entry = STRIPE_ACCOUNTS[account as keyof typeof STRIPE_ACCOUNTS]
    throw new Error(`Stripe key not set for this account (${entry.envVar})`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    await requireAdmin(req)
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body = await req.json()
    const { action } = body

    if (action === 'preview') {
      const data = await loadData()
      const result = buildPreview(data, centralToday())
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'send') {
      const { runKeys, expectedCents } = body
      if (!Array.isArray(runKeys) || runKeys.length === 0 || runKeys.length > 50 || runKeys.some(k => typeof k !== 'string')) {
        return new Response(
          JSON.stringify({ error: 'runKeys must be a list of 1 to 50 run keys' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const data = await loadData()
      const result = await sendRentInvoices({
        runKeys,
        expectedCents: expectedCents ?? {},
        data,
        today: centralToday(),
        deps: { stripeFor, createRecord, updateRecord },
      })
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})