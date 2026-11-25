import { LI } from './rentSend.js'
import { centralToday } from './rentMath.js'

export const WEBHOOK_ACCOUNTS = Object.freeze({
  east_meadow: 'STRIPE_EAST_MEADOW_WEBHOOK_SECRET',
  shepard_holdings: 'STRIPE_SHEPARD_HOLDINGS_WEBHOOK_SECRET',
})
export const LI_EXTRA = {
  amountPaid: 'fldx3D490VFEBBpNJ',
  paidDate: 'fldnV7jVqdzXicmiJ',
  lastWebhookEvent: 'fld9A683yWSwm940n',
  lastWebhookAt: 'fldaDMQ85UfDgPPOR'
}

export async function handleWebhookRequest({ method, account, rawBody, signature, getSecret, verify, deps, now = new Date() }) {
  if (method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed' } }
  }
  if (!(account in WEBHOOK_ACCOUNTS)) {
    return { status: 400, body: { error: 'Unknown account' } }
  }
  const secret = getSecret(WEBHOOK_ACCOUNTS[account])
  if (!secret) {
    return { status: 400, body: { error: 'Webhook secret not set for this account' } }
  }
  if (!signature) {
    return { status: 400, body: { error: 'Invalid signature' } }
  }
  let event
  try {
    event = await verify(rawBody, signature, secret)
  } catch {
    return { status: 400, body: { error: 'Invalid signature' } }
  }
  try {
    const outcome = await handleRentEvent(event, account, deps, now)
    return { status: 200, body: { received: true, outcome } }
  } catch (e) {
    return { status: 200, body: { received: true, outcome: 'error', error: String(e.message || e) } }
  }
}

export async function handleRentEvent(event, account, deps, now = new Date()) {
  const { type, data } = event
  const obj = data?.object
  if (!obj) return 'ignored'

  let stripeInvoiceId = null
  let metaLeaseInvoiceId = null

  switch (type) {
    case 'invoice.sent':
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.voided':
    case 'invoice.marked_uncollectible': {
      if (obj.metadata?.source !== 'shep_portal_rent') return 'ignored'
      stripeInvoiceId = obj.id
      metaLeaseInvoiceId = obj.metadata.lease_invoice_id
      break
    }
    case 'payment_intent.processing':
    case 'charge.refunded': {
      stripeInvoiceId = typeof obj.invoice === 'string' ? obj.invoice : obj.invoice?.id
      if (!stripeInvoiceId) return 'ignored'
      break
    }
    case 'charge.dispute.created': {
      const chargeId = typeof obj.charge === 'string' ? obj.charge : obj.charge?.id
      if (!chargeId) return 'ignored'
      stripeInvoiceId = await deps.invoiceIdForCharge(chargeId)
      if (!stripeInvoiceId) return 'ignored'
      break
    }
    default:
      return 'ignored'
  }

  let record = null
  if (metaLeaseInvoiceId) {
    record = await deps.getRecord(metaLeaseInvoiceId)
  }
  if (!record) {
    record = await deps.findByStripeInvoiceId(stripeInvoiceId)
  }
  if (!record) return 'ignored'

  const fields = record.fields
  const runKey = fields['Run Key']
  if (!runKey) return 'ignored'

  const currentStripeInvoiceId = fields['Stripe Invoice ID']
  if (currentStripeInvoiceId && currentStripeInvoiceId !== stripeInvoiceId) return 'ignored'

  let newStatus = null
  const extra = {}
  const currentStatus = fields.Status

  switch (type) {
    case 'invoice.sent':
      newStatus = 'open'
      break
    case 'payment_intent.processing':
      newStatus = 'processing'
      break
    case 'invoice.paid': {
      newStatus = 'paid'
      extra[LI_EXTRA.amountPaid] = obj.amount_paid / 100
      const paidAt = obj.status_transitions?.paid_at || event.created
      extra[LI_EXTRA.paidDate] = centralToday(new Date(paidAt * 1000))
      break
    }
    case 'invoice.payment_failed':
      newStatus = 'failed'
      extra[LI.failureReason] = (obj.last_finalization_error?.message || 'Payment failed').slice(0, 500)
      break
    case 'invoice.voided':
      newStatus = 'void'
      break
    case 'invoice.marked_uncollectible':
      newStatus = 'uncollectible'
      break
    case 'charge.refunded':
      newStatus = 'refunded'
      break
    case 'charge.dispute.created':
      newStatus = 'disputed'
      break
  }

  if (!newStatus) return 'ignored'

  if (
    (currentStatus === 'paid' && (newStatus === 'open' || newStatus === 'processing')) ||
    (currentStatus === 'processing' && newStatus === 'open')
  ) {
    newStatus = currentStatus
  }

  const updateFields = {
    [LI_EXTRA.lastWebhookEvent]: event.type,
    [LI_EXTRA.lastWebhookAt]: now.toISOString(),
  }

  if (newStatus !== currentStatus) {
    updateFields[LI.status] = newStatus
  }

  Object.assign(updateFields, extra)

  if (!currentStripeInvoiceId) {
    updateFields[LI.stripeInvoiceId] = stripeInvoiceId
  }

  await deps.updateRecord(record.id, updateFields)

  return newStatus === currentStatus ? `kept:${currentStatus}` : `updated:${newStatus}`
}