import Stripe from 'https://esm.sh/stripe@17?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

const AIRTABLE_PAT  = Deno.env.get('AIRTABLE_PAT') ?? ''
const AIRTABLE_BASE = 'appZOi48qf8SzyOml'
const CONTACTS_TABLE = 'tbl1Y1siC5qV2fX8J'

const FIELDS = {
  name:             'fldGL097AcMkuoEOV',
  phone:            'fld8Pvw9PVZ2NbFAK',
  email:            'fldQyQqbLZFDYvNzL',
  stripeCustomerId: 'fld01FQpuNajt1eB3',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Normalize for matching: lowercase, trim, collapse whitespace, strip punctuation.
function normName(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '')
}
// Phone: digits only, last 10 (handles +1 prefix).
function normPhone(s: string): string {
  const digits = (s || '').replace(/\D/g, '')
  return digits.slice(-10)
}

async function fetchAllAirtableContacts(): Promise<any[]> {
  const all: any[] = []
  let offset: string | undefined
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${CONTACTS_TABLE}`)
    url.searchParams.set('returnFieldsByFieldId', 'true')
    if (offset) url.searchParams.set('offset', offset)
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } })
    if (!res.ok) throw new Error(`Airtable fetch failed: ${res.status} ${await res.text()}`)
    const json = await res.json()
    all.push(...(json.records || []))
    offset = json.offset
  } while (offset)
  return all
}

async function fetchAllStripeCustomers(): Promise<any[]> {
  const all: any[] = []
  let starting_after: string | undefined
  while (true) {
    const page = await stripe.customers.list({ limit: 100, ...(starting_after ? { starting_after } : {}) })
    all.push(...page.data)
    if (!page.has_more) break
    starting_after = page.data[page.data.length - 1].id
  }
  return all
}

async function patchAirtable(recordId: string, fields: Record<string, string>) {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE}/${CONTACTS_TABLE}/${recordId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, typecast: true }),
    }
  )
  if (!res.ok) throw new Error(`Airtable patch failed: ${res.status} ${await res.text()}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ?dryRun=true returns the report without writing.
  const url    = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === 'true'

  try {
    const [contacts, customers] = await Promise.all([
      fetchAllAirtableContacts(),
      fetchAllStripeCustomers(),
    ])

    // Index Stripe customers by normalized phone (last 10 digits) and name.
    const byPhone = new Map<string, any[]>()
    const byName  = new Map<string, any[]>()
    for (const c of customers) {
      const p = normPhone(c.phone || '')
      const n = normName(c.name  || '')
      if (p) (byPhone.get(p) || byPhone.set(p, []).get(p)!).push(c)
      if (n) (byName.get(n)  || byName.set(n,  []).get(n)!).push(c)
    }

    const matched:   any[] = []
    const ambiguous: any[] = []
    const unmatched: any[] = []
    const skipped:   any[] = []

    for (const rec of contacts) {
      const f       = rec.fields || {}
      const existId = f[FIELDS.stripeCustomerId]
      const name    = f[FIELDS.name]  || ''
      const phone   = f[FIELDS.phone] || ''

      if (existId) { skipped.push({ id: rec.id, name, reason: 'already has stripe id' }); continue }
      if (!name && !phone) { skipped.push({ id: rec.id, name, reason: 'no name or phone' }); continue }

      const np = normPhone(phone)
      const nn = normName(name)

      // Phone is the strongest signal — try it first.
      let candidates: any[] = []
      if (np && byPhone.has(np)) candidates = byPhone.get(np)!
      // Fallback to name (only if phone didn't match anything).
      if (candidates.length === 0 && nn && byName.has(nn)) candidates = byName.get(nn)!

      if (candidates.length === 0) {
        unmatched.push({ id: rec.id, name, phone })
      } else if (candidates.length === 1) {
        const stripeId = candidates[0].id
        matched.push({ airtableId: rec.id, name, phone, stripeId, stripeName: candidates[0].name, matchedBy: np && byPhone.get(np) === candidates ? 'phone' : 'name' })
        if (!dryRun) {
          try {
            await patchAirtable(rec.id, { [FIELDS.stripeCustomerId]: stripeId })
          } catch (err) {
            console.error('[backfill] patch failed for', rec.id, err)
          }
        }
      } else {
        ambiguous.push({
          id: rec.id, name, phone,
          candidates: candidates.map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })),
        })
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dryRun,
        counts: {
          contacts:  contacts.length,
          customers: customers.length,
          matched:   matched.length,
          ambiguous: ambiguous.length,
          unmatched: unmatched.length,
          skipped:   skipped.length,
        },
        matched, ambiguous, unmatched,
      }, null, 2),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('[backfill] Fatal:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
