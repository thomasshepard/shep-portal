import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'
import { getStripeClientForAccount } from '../_shared/stripeAccounts.ts'

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

const InvoiceRequestSchema = z.object({
  account:         z.enum(['happy_cuts', 'east_meadow', 'shepard_holdings', 'virginia_holdings']).default('happy_cuts'),
  mowRecordId:     z.string().min(1),
  contactRecordId: z.string().optional(),
  clientName:      z.string().optional(),
  clientEmail:     z.string().optional(),
  amount:          z.union([z.string(), z.number()]),
  description:     z.string().min(1),
})

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

  if (anyErr?.errorType) return { errorType: anyErr.errorType, message }

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
    const rawBody = await req.json()

    const parseResult = InvoiceRequestSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parseResult.error.flatten().fieldErrors, errorType: 'validation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { account, mowRecordId, contactRecordId, clientName, clientEmail, amount, description } = parseResult.data

    let stripe
    try {
      stripe = getStripeClientForAccount(account)
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err.message, errorType: 'validation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[stripe-account: ${account}] Invoice request start — mowRecordId:`, mowRecordId, 'contactRecordId:', contactRecordId, 'clientName:', clientName, 'amount:', amount)

    // --- Step 1: Find or create Stripe customer ---
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
        if ((err as any)?.errorType) throw err
        console.warn('[Invoice] Could not fetch contact from Airtable:', err)
      }
    }

    if (!customerId) {
      console.log('[Invoice] Creating new Stripe customer for:', clientName, '(contact:', contactRecordId, ')')
      const emailToUse = contactEmail || clientEmail || ''
      const customer = await stripe.customers.create({
        name: clientName || 'Happy Cuts Client',
        email: emailToUse || undefined,
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
    // Use charge_automatically (NOT send_invoice) so Stripe doesn't require an
    // email and doesn't try to email the customer. Combined with auto_advance:false
    // on finalize, this produces an "open" invoice with a hosted_invoice_url that
    // the user can text to the customer manually. No email needed.
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'charge_automatically',
      pending_invoice_items_behavior: 'include',
      auto_advance: false,
      metadata: {
        airtable_mow_id: mowRecordId,
        source: 'happy_cuts_portal',
      },
    })
    console.log('[Invoice] Created invoice:', invoice.id, 'amount_due:', invoice.amount_due)

    // --- Step 4: Write invoice ID to Airtable BEFORE finalizing ---
    // Validates Airtable auth early so a broken PAT never orphans a finalized Stripe invoice.
    console.log('[Invoice] Step 4 — writing invoice ID to Airtable before finalize:', invoice.id)
    await updateAirtable(SCHEDULE_TABLE, mowRecordId, {
      [FIELDS.stripeInvoiceId]:  invoice.id,
      [FIELDS.invoiceStatus]:    'Processing',
    })
    console.log('[Invoice] Step 4 — Airtable pre-finalize write OK')

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
    console.log('[Invoice] Step 6 — writing hosted URL back to Airtable')
    await updateAirtable(SCHEDULE_TABLE, mowRecordId, {
      [FIELDS.stripeInvoiceUrl]: hostedUrl,
      [FIELDS.invoiceStatus]:    'Sent',
    })
    console.log('[Invoice] Step 6 — Airtable post-finalize write OK')

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
