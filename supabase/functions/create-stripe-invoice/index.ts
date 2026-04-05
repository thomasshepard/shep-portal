import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const AIRTABLE_PAT = Deno.env.get('AIRTABLE_PAT') ?? ''
const AIRTABLE_BASE = 'appZOi48qf8SzyOml'
const SCHEDULE_TABLE = 'tbli7OArESf2SHL10'
const CONTACTS_TABLE = 'tbl1Y1siC5qV2fX8J'

// Airtable field IDs
const FIELDS = {
  stripeInvoiceUrl:    'fldoHweTNKKE7hjyy',
  stripeInvoiceId:     'fldC06DE4htmBScNM',
  stripeCustomerId:    'fld01FQpuNajt1eB3',
  invoiceStatus:       'fldhiIRXuRlvp3QXO',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    const err = await res.text()
    throw new Error(`Airtable update failed: ${err}`)
  }
  return res.json()
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const {
      mowRecordId,
      contactRecordId,
      clientName,
      clientEmail,
      stripeCustomerId: existingCustomerId,
      amount,
      description,
    } = body

    // Validate required fields
    if (!mowRecordId || !amount || !description) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: mowRecordId, amount, description' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Step 1: Find or create Stripe customer ---
    let customerId = existingCustomerId

    if (!customerId) {
      // Search for existing customer by email first
      if (clientEmail) {
        const existing = await stripe.customers.list({ email: clientEmail, limit: 1 })
        if (existing.data.length > 0) {
          customerId = existing.data[0].id
        }
      }

      // Create new customer if still not found
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: clientName || 'Happy Cuts Client',
          email: clientEmail || undefined,
          metadata: {
            airtable_contact_id: contactRecordId || '',
            source: 'happy_cuts_portal',
          },
        })
        customerId = customer.id

        // Save customer ID back to Airtable contact record
        if (contactRecordId) {
          await updateAirtable(CONTACTS_TABLE, contactRecordId, {
            [FIELDS.stripeCustomerId]: customerId,
          })
        }
      }
    }

    // --- Step 2: Create invoice item ---
    const amountInCents = Math.round(Number(amount) * 100)
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: amountInCents,
      currency: 'usd',
      description: description,
    })

    // --- Step 3: Create invoice ---
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: 7,
      metadata: {
        airtable_mow_id: mowRecordId,
        source: 'happy_cuts_portal',
      },
    })

    // --- Step 4: Finalize invoice ---
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id)

    // --- Step 5: Send invoice ---
    const sent = await stripe.invoices.sendInvoice(finalized.id)

    const invoiceUrl = sent.hosted_invoice_url ?? ''
    const invoiceId = sent.id

    // --- Step 6: Update Airtable schedule record ---
    if (mowRecordId) {
      await updateAirtable(SCHEDULE_TABLE, mowRecordId, {
        [FIELDS.stripeInvoiceUrl]:  invoiceUrl,
        [FIELDS.stripeInvoiceId]:   invoiceId,
        [FIELDS.invoiceStatus]:     'Sent',
      })
    }

    return new Response(
      JSON.stringify({ success: true, invoiceUrl, invoiceId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
