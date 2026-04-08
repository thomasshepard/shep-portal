import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const AIRTABLE_PAT = Deno.env.get('AIRTABLE_PAT') ?? ''
const AIRTABLE_BASE = 'appZOi48qf8SzyOml'
const SCHEDULE_TABLE = 'tbli7OArESf2SHL10'

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
    const { stripeInvoiceId, mowRecordId, existingNotes } = body

    console.log('[MarkPaid] Request:', { stripeInvoiceId, mowRecordId })

    if (!stripeInvoiceId || !mowRecordId) {
      return new Response(
        JSON.stringify({ error: 'Missing stripeInvoiceId or mowRecordId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${SCHEDULE_TABLE}/${mowRecordId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            'fldhiIRXuRlvp3QXO': 'Paid',
            'fldos2p3iwvUCKlH6': updatedNotes,
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
