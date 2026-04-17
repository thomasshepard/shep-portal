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
    // IGNORE portal-passed stripeCustomerId — it can be stale/wrong contact.
    // Always look up from Airtable using contactRecordId as source of truth.
    let customerId: string | null = null

    if (contactRecordId) {
      try {
        const contactRes = await fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE}/${CONTACTS_TABLE}/${contactRecordId}?returnFieldsByFieldId=true`,
          { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } }
        )
        const contactData = await contactRes.json()
        console.log('[Invoice] Airtable contact fields:', JSON.stringify(contactData?.fields))
        const storedId = contactData?.fields?.[FIELDS.stripeCustomerId]
        if (storedId) {
          // Verify it's still valid in Stripe
          try {
            const existing = await stripe.customers.retrieve(storedId)
            if (!(existing as any).deleted) {
              customerId = storedId
              console.log('[Invoice] Using stored Stripe customer from Airtable:', customerId, (existing as any).name)
            } else {
              console.log('[Invoice] Stored customer was deleted in Stripe — creating new')
            }
          } catch {
            console.log('[Invoice] Stored customer ID invalid in Stripe — creating new')
          }
        } else {
          console.log('[Invoice] No Stripe customer ID on Airtable contact:', contactRecordId)
        }
      } catch (err) {
        console.warn('[Invoice] Could not fetch contact from Airtable:', err)
      }
    }

    if (!customerId) {
      console.log('[Invoice] Creating new Stripe customer for:', clientName, '(contact:', contactRecordId, ')')
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

      if (contactRecordId) {
        await updateAirtable(CONTACTS_TABLE, contactRecordId, {
          [FIELDS.stripeCustomerId]: customerId,
        })
      }
    }

    // --- Step 2: Create invoice item ---
    const amountInCents = Math.round(Number(amount) * 100)
    console.log('[Invoice] Amount received:', amount, typeof amount, '→ cents:', amountInCents)
    const invoiceItem = await stripe.invoiceItems.create({
      customer: customerId,
      amount: amountInCents,
      currency: 'usd',
      description: description,
    })
    console.log('[Invoice] Created invoice item:', invoiceItem.id, 'customer:', customerId, 'amount:', amountInCents)

    // --- Step 3: Create invoice (explicitly include pending items) ---
    // Use mow service date as due date if provided, otherwise due immediately
    let dueDate: number | undefined
    if (body.mowDate) {
      const d = new Date(body.mowDate + 'T23:59:59Z')
      if (!isNaN(d.getTime())) {
        dueDate = Math.floor(d.getTime() / 1000)
      }
    }

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      ...(dueDate ? { due_date: dueDate } : { days_until_due: 0 }),
      pending_invoice_items_behavior: 'include',
      metadata: {
        airtable_record_id: mowRecordId,
        client_name: clientName,
        source: 'happy_cuts_portal',
      },
    })
    console.log('[Invoice] Created invoice:', invoice.id, 'amount_due:', invoice.amount_due)

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
