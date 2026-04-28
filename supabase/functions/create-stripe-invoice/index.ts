import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const AIRTABLE_PAT = Deno.env.get('AIRTABLE_PAT') ?? ''
const AIRTABLE_BASE = 'appZOi48qf8SzyOml'
const SCHEDULE_TABLE = 'tbli7OArESf2SHL10'
const CONTACTS_TABLE = 'tbl1Y1siC5qV2fX8J'

const FIELDS = {
  stripeInvoiceUrl:    'fldoHweTNKKE7hjyy',
  stripeInvoiceId:     'fldC06DE4htmBScNM',
  stripeCustomerId:    'fld01FQpuNajt1eB3',
  invoiceStatus:       'fldhiIRXuRlvp3QXO',
  email:               'fldQyQqbLZFDYvNzL',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Tags the error with errorType so the catch block can classify it.
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
    const err = new Error(`Airtable update failed: ${body}`) as Error & { errorType: string }
    err.errorType = res.status === 401 ? 'airtable_auth' : 'airtable_other'
    throw err
  }
  return res.json()
}

function classifyError(err: unknown): { errorType: string; message: string } {
  const anyErr = err as any
  const message = anyErr instanceof Error ? anyErr.message : 'Unknown error'

  // Already tagged by updateAirtable
  if (anyErr?.errorType) return { errorType: anyErr.errorType, message }

  // Stripe SDK errors carry a numeric statusCode
  if (anyErr?.statusCode || anyErr?.type?.startsWith?.('Stripe')) {
    return { errorType: 'stripe', message }
  }

  return { errorType: 'unknown', message }
}

Deno.serve(async (req) => {
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
      amount,
      description,
    } = body

    console.log('[Invoice] Request start — mowRecordId:', mowRecordId, 'contactRecordId:', contactRecordId, 'clientName:', clientName, 'amount:', amount)

    if (!mowRecordId || !amount || !description) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: mowRecordId, amount, description', errorType: 'validation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Step 1: Find or create Stripe customer ---
    // Always look up from Airtable using contactRecordId as source of truth.
    let customerId: string | null = null
    let contactEmail = ''

    if (contactRecordId) {
      try {
        const contactRes = await fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE}/${CONTACTS_TABLE}/${contactRecordId}?returnFieldsByFieldId=true`,
          { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } }
        )
        if (!contactRes.ok) {
          const body = await contactRes.text()
          const err = new Error(`Airtable contact fetch failed: ${body}`) as Error & { errorType: string }
          err.errorType = contactRes.status === 401 ? 'airtable_auth' : 'airtable_other'
          throw err
        }
        const contactData = await contactRes.json()
        console.log('[Invoice] Airtable contact fields:', JSON.stringify(contactData?.fields))
        const storedId = contactData?.fields?.[FIELDS.stripeCustomerId]
        contactEmail = contactData?.fields?.[FIELDS.email] ?? clientEmail ?? ''
        if (storedId) {
          try {
            const existing = await stripe.customers.retrieve(storedId)
            if (!(existing as any).deleted) {
              customerId = storedId
              console.log('[Invoice] Using stored Stripe customer from Airtable:', customerId, (existing as any).name)
              const existingEmail = (existing as any).email
              if (!existingEmail && contactEmail) {
                await stripe.customers.update(customerId!, { email: contactEmail })
                console.log('[Invoice] Patched email onto existing Stripe customer:', customerId)
              }
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
        // Re-throw Airtable auth failures so the caller sees errorType: 'airtable_auth'
        if ((err as any)?.errorType) throw err
        console.warn('[Invoice] Could not fetch contact from Airtable:', err)
      }
    }

    if (!customerId) {
      console.log('[Invoice] Creating new Stripe customer for:', clientName, '(contact:', contactRecordId, ')')
      const customer = await stripe.customers.create({
        name: clientName || 'Happy Cuts Client',
        email: contactEmail || undefined,
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

    // --- Step 3: Create invoice ---
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
        airtable_mow_id: mowRecordId,
        source: 'happy_cuts_portal',
      },
    })
    console.log('[Invoice] Created invoice:', invoice.id, 'amount_due:', invoice.amount_due)

    // --- Step 4: Write invoice ID to Airtable BEFORE finalizing ---
    // Validates Airtable auth early so a broken PAT never orphans a finalized Stripe invoice.
    if (mowRecordId) {
      console.log('[Invoice] Step 4 — writing invoice ID to Airtable before finalize:', invoice.id)
      await updateAirtable(SCHEDULE_TABLE, mowRecordId, {
        [FIELDS.stripeInvoiceId]:  invoice.id,
        [FIELDS.invoiceStatus]:    'Processing',
      })
      console.log('[Invoice] Step 4 — Airtable pre-finalize write OK')
    }

    // --- Step 5: Finalize invoice ---
    console.log('[Invoice] Step 5 — finalizing invoice:', invoice.id)
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id, {
      auto_advance: false,
    })
    console.log('[Invoice] Step 5 — finalized OK status:', finalized.status, 'hosted_url:', finalized.hosted_invoice_url)

    const hostedUrl = finalized.hosted_invoice_url ?? ''
    const pdfUrl    = finalized.invoice_pdf ?? ''
    const invoiceId = finalized.id

    // --- Step 6: Update Airtable with hosted URL and final status ---
    if (mowRecordId) {
      console.log('[Invoice] Step 6 — writing hosted URL back to Airtable')
      await updateAirtable(SCHEDULE_TABLE, mowRecordId, {
        [FIELDS.stripeInvoiceUrl]: hostedUrl,
        [FIELDS.invoiceStatus]:    'Finalized',
      })
      console.log('[Invoice] Step 6 — Airtable post-finalize write OK')
    }

    console.log('[Invoice] Success — invoiceId:', invoiceId, 'mowRecordId:', mowRecordId, 'hostedUrl:', hostedUrl)
    return new Response(
      JSON.stringify({
        invoiceId,
        hostedUrl,
        pdfUrl,
        status: finalized.status,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const { errorType, message } = classifyError(err)
    console.error('[Invoice] Error — errorType:', errorType, 'message:', message, err)
    return new Response(
      JSON.stringify({ error: message, errorType }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
