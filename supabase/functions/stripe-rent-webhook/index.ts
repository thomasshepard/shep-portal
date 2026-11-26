// Deployed with --no-verify-jwt (Stripe calls it with no Supabase session; the signature is the authentication).
// Handles ONLY invoices with metadata.source 'shep_portal_rent'.
// Endpoints: /functions/v1/stripe-rent-webhook?account=east_meadow and ?account=shepard_holdings

import Stripe from 'https://esm.sh/stripe@17?target=deno'
import { getStripeClientForAccount } from '../_shared/stripeAccounts.ts'
import { handleWebhookRequest } from '../_shared/rentWebhook.js'
import { LEASE_INVOICE_TABLE } from '../_shared/rentSend.js'

const AIRTABLE_PAT = Deno.env.get('AIRTABLE_PAT')
const PM_BASE = 'appeuX9BHNgVXxdYZ'

const sigChecker = new Stripe(Deno.env.get('STRIPE_EAST_MEADOW_KEY') || 'sk_signature_check_only', {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

const verify = async (raw: string, sig: string, secret: string) =>
  await sigChecker.webhooks.constructEventAsync(raw, sig, secret)

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const account = url.searchParams.get('account') ?? ''
  const rawBody = await req.text()
  const signature = req.headers.get('stripe-signature')

  const deps = {
    getRecord: async (id: string) => {
      if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return null
      const resp = await fetch(`https://api.airtable.com/v0/${PM_BASE}/${LEASE_INVOICE_TABLE}/${id}`, {
        headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
      })
      if (resp.status === 404) return null
      if (!resp.ok) throw new Error(`Airtable getRecord ${resp.status}`)
      return { id, fields: (await resp.json()).fields }
    },
    findByStripeInvoiceId: async (sid: string) => {
      if (!/^in_[A-Za-z0-9]+$/.test(sid)) return null
      const params = new URLSearchParams({
        filterByFormula: `{Stripe Invoice ID}='${sid}'`,
        maxRecords: '1',
      })
      const resp = await fetch(
        `https://api.airtable.com/v0/${PM_BASE}/${LEASE_INVOICE_TABLE}?${params}`,
        { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } },
      )
      if (!resp.ok) throw new Error(`Airtable findByStripeInvoiceId ${resp.status}`)
      const data = await resp.json()
      return data.records?.[0] ? { id: data.records[0].id, fields: data.records[0].fields } : null
    },
    updateRecord: async (id: string, fields: Record<string, unknown>) => {
      const resp = await fetch(`https://api.airtable.com/v0/${PM_BASE}/${LEASE_INVOICE_TABLE}/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields, typecast: true }),
      })
      if (!resp.ok) throw new Error(`Airtable updateRecord ${resp.status}`)
    },
    invoiceIdForCharge: async (chargeId: string) => {
      try {
        // Built only here (disputes), after the signature check passed, so a
        // missing API key can never turn a bad-signature request into a 500.
        const stripe = getStripeClientForAccount(account as 'east_meadow' | 'shepard_holdings')
        const ch = await stripe.charges.retrieve(chargeId)
        return typeof ch.invoice === 'string' ? ch.invoice : ch.invoice?.id ?? null
      } catch {
        return null
      }
    },
  }

  const { status, body } = await handleWebhookRequest({
    method: req.method,
    account,
    rawBody,
    signature,
    getSecret: (name: string) => Deno.env.get(name) ?? '',
    verify,
    deps,
  })

  console.log('[stripe-rent-webhook]', account, status, JSON.stringify(body))
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
})