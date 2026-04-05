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
    // Simple rule: use stored ID if valid, otherwise create new. Never search by email.
    let customerId = existingCustomerId || null

    if (customerId) {
      // Verify the stored customer ID is still valid in Stripe
      try {
        const existing = await stripe.customers.retrieve(customerId)
        if ((existing as any).deleted) {
          console.log('[Invoice] Stored customer was deleted — creating new one')
          customerId = null
        } else {
          console.log('[Invoice] Using existing Stripe customer:', customerId, (existing as any).name)
        }
      } catch {
        console.log('[Invoice] Stored customer ID not found in Stripe — creating new one')
        customerId = null
      }
    }

    if (!customerId) {
      // No valid customer found — always create a fresh one
      console.log('[Invoice] Creating new Stripe customer for:', clientName)
      const customer = await stripe.customers.create({
        name: clientName || 'Happy Cuts Client',
        email: clientEmail || undefined,
        metadata: {
          airtable_contact_id: contactRecordId || '',
          source: 'happy_cuts_portal',
        },
      })
      customerId = customer.id
      console.log('[Invoice] Created new customer:', customerId)

      // Write the new customer ID back to the Airtable contact record
      if (contactRecordId) {
        await updateAirtable(CONTACTS_TABLE, contactRecordId, {
          [FIELDS.stripeCustomerId]: customerId,
        })
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
