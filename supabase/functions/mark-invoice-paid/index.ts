import Stripe from 'https://esm.sh/stripe@17?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_HAPPY_CUTS_KEY') ?? '', {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

const AIRTABLE_PAT = Deno.env.get('AIRTABLE_PAT') ?? ''
const AIRTABLE_BASE = 'appZOi48qf8SzyOml'
const SCHEDULE_TABLE = 'tbli7OArESf2SHL10'
const PROJECTS_TABLE = 'tblP7yDgETBBbgLpb'

// Per-table field IDs for the Airtable write-back — mirrors create-stripe-invoice's TABLE_FIELDS
const TABLE_FIELDS: Record<string, { invoiceStatus: string; notes: string }> = {
  [SCHEDULE_TABLE]: {
    invoiceStatus: 'fldhiIRXuRlvp3QXO',
    notes:         'fldos2p3iwvUCKlH6',
  },
  [PROJECTS_TABLE]: {
    invoiceStatus: 'fldrA8Jw7VziWmEIX',
    notes:         'fldN8Uktj2w4gpR5W',
  },
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { stripeInvoiceId, mowRecordId, existingNotes, tableId } = body
    const targetTable = tableId || SCHEDULE_TABLE
    const tFields = TABLE_FIELDS[targetTable] ?? TABLE_FIELDS[SCHEDULE_TABLE]

    console.log('[MarkPaid] Request:', { stripeInvoiceId, mowRecordId, targetTable })

    if (!stripeInvoiceId || !mowRecordId) {
      return new Response(
        JSON.stringify({ error: 'Missing stripeInvoiceId or mowRecordId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Make the cash payment unambiguous on the Stripe side ---
    // paid_out_of_band alone just flips the invoice to "Paid" with no record of
    // *how* — indistinguishable in the dashboard from any other manual override.
    // Stamp metadata (shows in the dashboard's Metadata panel) before marking it
    // paid. NOTE: `description` looked like a good spot for a visible note too,
    // but Stripe rejects updating it (or footer/custom_fields) on an invoice
    // that's already finalized — "Finalized invoices can't be updated in this
    // way" — those fields are draft-only, and by the time we're marking paid
    // the invoice has always already been finalized. Metadata is the one
    // invoice-level field Stripe allows editing at any status. Best-effort and
    // never blocks the actual paid-marking below — a metadata hiccup shouldn't
    // stop cash from getting recorded as paid.
    const paidAt = new Date().toISOString()
    try {
      const existingInvoice = await stripe.invoices.retrieve(stripeInvoiceId)
      await stripe.invoices.update(stripeInvoiceId, {
        metadata: {
          ...existingInvoice.metadata,
          payment_method: 'cash',
          cash_marked_via: 'shep_portal',
          cash_marked_at: paidAt,
        },
      })
    } catch (metaErr) {
      console.error('[MarkPaid] Could not stamp cash metadata (continuing anyway):', metaErr)
    }

    const paidInvoice = await stripe.invoices.pay(stripeInvoiceId, {
      paid_out_of_band: true,
    })

    console.log('[MarkPaid] Invoice marked paid:', paidInvoice.id, paidInvoice.status)

    const cashNote = 'Paid cash in person'
    const updatedNotes = existingNotes
      ? `${existingNotes}\n${cashNote}`
      : cashNote

    const atRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${targetTable}/${mowRecordId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            [tFields.invoiceStatus]: 'Paid',
            [tFields.notes]: updatedNotes,
          },
          typecast: true,
        }),
      }
    )

    if (!atRes.ok) {
      const err = await atRes.text()
      console.error('[MarkPaid] Airtable update failed:', err)
    }

    return new Response(
      JSON.stringify({ success: true, invoiceStatus: paidInvoice.status }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[MarkPaid] Error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
