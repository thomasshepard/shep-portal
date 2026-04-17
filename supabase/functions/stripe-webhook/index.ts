import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!,
{
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const AIRTABLE_PAT        = Deno.env.get('AIRTABLE_PAT')!
const HAPPY_CUTS_BASE     = 'appZOi48qf8SzyOml'
const SCHEDULE_TABLE      = 'tbli7OArESf2SHL10'
const RESEND_API_KEY      = Deno.env.get('RESEND_API_KEY')!
const NOTIFY_EMAIL        = Deno.env.get('HAPPY_CUTS_NOTIFY_EMAIL')!  // Thomas's email
const WEBHOOK_SECRET      = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

// Airtable field IDs for Schedule table
// fldzyHzszEVZGhs6U = Status (mow status — do NOT change)
// fldhiIRXuRlvp3QXO = Invoice Status
// PAID_AT_FIELD_ID  = fill in after running add-paid-at-field.js
const INVOICE_STATUS_FIELD = 'fldhiIRXuRlvp3QXO'
const PAID_AT_FIELD        = 'fldjNgGcQZnIQJqxo'  // ← replaced with real ID: fldjNgGcQZnIQJqxo
const FROM_EMAIL           = 'onboarding@resend.dev' // from send-notification-email function

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')
  let event: Stripe.Event

  try {
    event = Stripe.webhooks.constructEvent(body, sig!, WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  if (event.type !== 'invoice.paid') {
    // Acknowledge but ignore other event types
    return new Response(JSON.stringify({ received: true }), { status: 200 })
  }

  const invoice = event.data.object as Stripe.Invoice
  const recordId = invoice.metadata?.airtable_record_id
  const clientName = invoice.metadata?.client_name || 'Unknown client'
  const amountPaid = (invoice.amount_paid / 100).toFixed(2)
  const paidDate   = new Date(invoice.status_transitions.paid_at! * 1000)
    .toISOString().split('T')[0]  // YYYY-MM-DD

  console.log(`invoice.paid — client: ${clientName}, record: ${recordId}, amount: $${amountPaid}`)

  if (!recordId) {
    console.error('No airtable_record_id in invoice metadata — cannot update mow record')
    // Still return 200 so Stripe doesn't retry
    return new Response(JSON.stringify({ received: true, warning: 'no record id' }), { status: 200 })
  }

  // --- Update Airtable ---
  const airtableRes = await fetch(
    `https://api.airtable.com/v0/${HAPPY_CUTS_BASE}/${SCHEDULE_TABLE}/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          [INVOICE_STATUS_FIELD]: 'Paid',
          [PAID_AT_FIELD]: paidDate,
        },
        typecast: true,
      }),
    }
  )

  if (!airtableRes.ok) {
    const err = await airtableRes.text()
    console.error('Airtable PATCH failed:', err)
    // Don't return 500 — email still worth sending
  } else {
    console.log(`Airtable updated: record ${recordId} → Invoice Status = Paid, Paid At = ${paidDate}`)
  }

  // --- Send notification email ---
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,  // ← updated to use the verified sender
      to: [NOTIFY_EMAIL],
      subject: `💰 Payment received — ${clientName} ($${amountPaid})`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;"><h2 style="color: #16a34a; margin-bottom: 8px;">Payment Received ✓</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Client</td>
              <td style="padding: 8px 0; font-weight: 600; font-size: 14px;">${clientName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Amount</td>
              <td style="padding: 8px 0; font-weight: 600; font-size: 14px; color: #16a34a;">$${amountPaid}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Date</td>
              <td style="padding: 8px 0; font-size: 14px;">${paidDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Invoice</td>
              <td style="padding: 8px 0; font-size: 14px;">${invoice.id}</td>
            </tr>
          </table>
          <p style="margin-top: 24px; font-size: 13px; color: #9ca3af;">
            Mow record updated in Shep Portal automatically.
          </p>
        </div>
      `,
    }),
  })

  if (!emailRes.ok) {
    const err = await emailRes.text()
    console.error('Resend email failed:', err)
  } else {
    console.log('Payment notification email sent')
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
