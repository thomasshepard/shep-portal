import { test, describe, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { handleWebhookRequest, handleRentEvent, WEBHOOK_ACCOUNTS, LI_EXTRA } from '../supabase/functions/_shared/rentWebhook.js'
import { LI, LEASE_INVOICE_TABLE } from '../supabase/functions/_shared/rentSend.js'

describe('rentWebhook', () => {
  let baseRecord
  let updates
  let deps

  beforeEach(() => {
    baseRecord = {
      id: 'recLI0000000000001',
      fields: {
        'Run Key': 'recS:2026-12-24',
        Status: 'open',
        'Stripe Invoice ID': 'in_1',
      },
    }
    updates = []

    deps = {
      getRecord: async (id) => (id === baseRecord.id ? { ...baseRecord } : null),
      findByStripeInvoiceId: async (sid) => (sid === 'in_1' ? { ...baseRecord } : null),
      updateRecord: async (id, fields) => {
        updates.push({ id, fields })
      },
      invoiceIdForCharge: async (chargeId) => (chargeId === 'ch_1' ? 'in_1' : null),
    }
  })

  function makeEvent(type, overrides = {}) {
    return {
      type,
      data: {
        object: {
          id: type.startsWith('invoice.') ? 'in_1' : undefined,
          metadata: { source: 'shep_portal_rent', lease_invoice_id: baseRecord.id },
          ...overrides,
        },
      },
      created: Math.floor(Date.now() / 1000),
    }
  }

  const verifyGood = async (raw, sig, secret) => {
    if (sig !== 'good') throw new Error('bad sig')
    return makeEvent('invoice.paid', { amount_paid: 110000, status_transitions: { paid_at: Date.UTC(2026, 11, 20, 18) / 1000 } })
  }
  const verifyBad = async () => { throw new Error('bad sig') }

  test('handleWebhookRequest: GET -> 405', async () => {
    const { status, body } = await handleWebhookRequest({
      method: 'GET', account: 'east_meadow', rawBody: '', signature: 'good',
      getSecret: () => 'secret', verify: verifyGood, deps,
    })
    assert.equal(status, 405)
    assert.deepEqual(body, { error: 'Method not allowed' })
  })

  test('handleWebhookRequest: no signature -> 400', async () => {
    const { status, body } = await handleWebhookRequest({
      method: 'POST', account: 'east_meadow', rawBody: '', signature: null,
      getSecret: () => 'secret', verify: verifyGood, deps,
    })
    assert.equal(status, 400)
    assert.deepEqual(body, { error: 'Invalid signature' })
  })

  test('handleWebhookRequest: bad signature -> 400', async () => {
    const { status, body } = await handleWebhookRequest({
      method: 'POST', account: 'east_meadow', rawBody: '', signature: 'bad',
      getSecret: () => 'secret', verify: verifyBad, deps,
    })
    assert.equal(status, 400)
    assert.deepEqual(body, { error: 'Invalid signature' })
  })

  test('handleWebhookRequest: unknown account -> 400', async () => {
    const { status, body } = await handleWebhookRequest({
      method: 'POST', account: 'happy_cuts', rawBody: '', signature: 'good',
      getSecret: () => 'secret', verify: verifyGood, deps,
    })
    assert.equal(status, 400)
    assert.deepEqual(body, { error: 'Unknown account' })
  })

  test('handleWebhookRequest: secret not set -> 400', async () => {
    const { status, body } = await handleWebhookRequest({
      method: 'POST', account: 'east_meadow', rawBody: '', signature: 'good',
      getSecret: () => '', verify: verifyGood, deps,
    })
    assert.equal(status, 400)
    assert.deepEqual(body, { error: 'Webhook secret not set for this account' })
  })

  test('handleRentEvent: invoice.paid with rent metadata -> updated:paid', async () => {
    const event = makeEvent('invoice.paid', { amount_paid: 110000, status_transitions: { paid_at: Date.UTC(2026, 11, 20, 18) / 1000 } })
    const outcome = await handleRentEvent(event, 'east_meadow', deps, new Date('2026-12-25T00:00:00Z'))
    assert.equal(outcome, 'updated:paid')
    assert.equal(updates.length, 1)
    const u = updates[0]
    assert.equal(u.fields[LI.status], 'paid')
    assert.equal(u.fields[LI_EXTRA.amountPaid], 1100)
    assert.equal(u.fields[LI_EXTRA.paidDate], '2026-12-20')
    assert.equal(u.fields[LI_EXTRA.lastWebhookEvent], 'invoice.paid')
    assert.equal(u.fields[LI_EXTRA.lastWebhookAt], '2026-12-25T00:00:00.000Z')
  })

  test('handleRentEvent: invoice.paid without rent metadata -> ignored', async () => {
    const event = makeEvent('invoice.paid', { metadata: { source: 'other' }, amount_paid: 110000 })
    const outcome = await handleRentEvent(event, 'east_meadow', deps)
    assert.equal(outcome, 'ignored')
    assert.equal(updates.length, 0)
  })

  test('handleRentEvent: payment_intent.processing via findByStripeInvoiceId -> updated:processing', async () => {
    const event = makeEvent('payment_intent.processing', { invoice: 'in_1' })
    const outcome = await handleRentEvent(event, 'east_meadow', deps)
    assert.equal(outcome, 'updated:processing')
    assert.equal(updates[0].fields[LI.status], 'processing')
  })

  test('handleRentEvent: record already paid, invoice.sent -> kept:paid, no status in update', async () => {
    baseRecord.fields.Status = 'paid'
    const event = makeEvent('invoice.sent')
    const outcome = await handleRentEvent(event, 'east_meadow', deps)
    assert.equal(outcome, 'kept:paid')
    assert.equal(updates.length, 1)
    assert.ok(!(LI.status in updates[0].fields))
    assert.equal(updates[0].fields[LI_EXTRA.lastWebhookEvent], 'invoice.sent')
  })

  test('handleRentEvent: record processing, invoice.sent -> kept:processing', async () => {
    baseRecord.fields.Status = 'processing'
    const outcome = await handleRentEvent(makeEvent('invoice.sent'), 'east_meadow', deps)
    assert.equal(outcome, 'kept:processing')
    assert.ok(!(LI.status in updates[0].fields))
  })

  test('handleRentEvent: charge.dispute.created -> updated:disputed', async () => {
    const event = makeEvent('charge.dispute.created', { charge: 'ch_1' })
    const outcome = await handleRentEvent(event, 'east_meadow', deps)
    assert.equal(outcome, 'updated:disputed')
    assert.equal(updates[0].fields[LI.status], 'disputed')
  })

  test('handleWebhookRequest: handler throws -> still 200 with error outcome', async () => {
    const throwingDeps = { ...deps, updateRecord: async () => { throw new Error('db down') } }
    const { status, body } = await handleWebhookRequest({
      method: 'POST', account: 'east_meadow', rawBody: '', signature: 'good',
      getSecret: () => 'secret', verify: verifyGood, deps: throwingDeps,
    })
    assert.equal(status, 200)
    assert.equal(body.received, true)
    assert.equal(body.outcome, 'error')
    assert.ok(body.error.includes('db down'))
  })
})