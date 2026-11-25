// Admin only, preview reads Airtable only. Deploy with JWT verification on (default).
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { buildPreview } from '../_shared/rentPreview.js'
import { centralToday } from '../_shared/rentMath.js'

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