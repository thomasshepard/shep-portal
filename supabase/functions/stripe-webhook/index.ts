import Stripe from 'https://esm.sh/stripe@17?target=deno'

// Auto-syncs Airtable payment status whenever Stripe confirms an invoice is
// paid — whether that's an automatic card charge or a paid_out_of_band cash
// mark via mark-invoice-paid (Stripe fires invoice.paid either way, so this
// function ends up being the single source of truth for "did this get paid",
// and mark-invoice-paid's own direct Airtable write becomes a same-request
// head start rather than the only path). Deployed with --no-verify-jwt since
// Stripe calls this directly with no Supabase session — authenticity is
// established via the Stripe-Signature header instead.
const stripe = new Stripe(Deno.env.get('STRIPE_HAPPY_CUTS_KEY') ?? '', {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

const WEBHOOK_SECRET = Deno.env.get('STRIPE_HAPPY_CUTS_WEBHOOK_SECRET') ?? ''
const AIRTABLE_PAT = Deno.env.get('AIRTABLE_PAT') ?? ''
const AIRTABLE_BASE = 'appZOi48qf8SzyOml'
const SCHEDULE_TABLE = 'tbli7OArESf2SHL10'
const PROJECTS_TABLE = 'tblP7yDgETBBbgLpb'

// Mirrors the field IDs in create-stripe-invoice / mark-invoice-paid.
const SCHEDULE_FIELDS = { invoiceStatus: 'fldhiIRXuRlvp3QXO' }
const PROJECTS_FIELDS = { invoiceStatus: 'fldrA8Jw7VziWmEIX', status: 'fldrujp8KU3hpmD8D' }

async function updateAirtable(table: string, recordId: string, fields: Record<string, string>) {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE}/${table}/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields, typecast: true }),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    console.error(`[stripe-webhook] Airtable update failed (${table}/${recordId}):`, body)
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Signature verification needs the exact raw body — must read as text
  // before any JSON parsing.
  const signature = req.headers.get('stripe-signature')
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    if (!WEBHOOK_SECRET) throw new Error('STRIPE_HAPPY_CUTS_WEBHOOK_SECRET not configured')
    if (!signature) throw new Error('Missing stripe-signature header')
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, WEBHOOK_SECRET)
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err instanceof Error ? err.message : err)
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 })
  }

  console.log('[stripe-webhook] Received event:', event.type, event.id)

  try {
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice
      const recordId = invoice.metadata?.airtable_mow_id
      // table_id is only present on invoices created after this feature shipped —
      // older invoices fall back to Schedule, which is a no-op (logged, not fatal)
      // for any pre-existing Project invoice that gets paid before it's re-invoiced.
      const tableId = invoice.metadata?.table_id || SCHEDULE_TABLE

      if (!recordId) {
        console.warn('[stripe-webhook] invoice.paid with no airtable_mow_id metadata — ignoring:', invoice.id)
      } else if (tableId === PROJECTS_TABLE) {
        await updateAirtable(PROJECTS_TABLE, recordId, {
          [PROJECTS_FIELDS.invoiceStatus]: 'Paid',
          [PROJECTS_FIELDS.status]: 'Paid',
        })
        console.log('[stripe-webhook] Project marked Paid:', recordId)
      } else {
        await updateAirtable(SCHEDULE_TABLE, recordId, {
          [SCHEDULE_FIELDS.invoiceStatus]: 'Paid',
        })
        console.log('[stripe-webhook] Mow invoice status marked Paid:', recordId)
      }
    }
    // Other event types are received but intentionally ignored.
  } catch (err) {
    // Log but still return 200 below — a retry won't fix an Airtable-side
    // problem, and Stripe disables the endpoint after enough non-2xx responses.
    console.error('[stripe-webhook] Handler error:', err)
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
