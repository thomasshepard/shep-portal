import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { sendRentInvoices, LI } from '../supabase/functions/_shared/rentSend.js'
import { buildPreview } from '../supabase/functions/_shared/rentPreview.js'

const today = '2026-12-15'

function makeRec(id, fields) {
  return { id, fields }
}

const baseData = {
  schedule: [
    makeRec('recL1', {
      Active: true,
      Name: 'Schedule L1 Full',
      Lease: ['recLease1'],
      Payer: ['recTenant1'],
      'Share Type': 'Full',
      'Share Value': 100,
      'Due Day': 24,
      'Send Days Before': 10,
      'Payment Methods': ['ACH', 'Card']
    }),
  ],
  leases: [
    makeRec('recLease1', {
      'Billing On': true,
      Status: 'Open',
      'End Date': '2027-12-31',
      Property: ['recUnit1'],
      'Lease Invoice Line Item': ['recLine1']
    }),
  ],
  lineItems: [
    makeRec('recLine1', { Name: 'Rent', 'Line Item Total': 1100 }),
  ],
  tenants: [
    makeRec('recTenant1', { Name: 'Tenant One', Email: 'tenant1@example.com', 'Stripe Customer ID': 'cus_1' }),
  ],
  units: [
    makeRec('recUnit1', { Property: ['recProp1'] }),
  ],
  properties: [
    makeRec('recProp1', { Address: '182 Virginia St', 'Stripe Account': 'East Meadow Properties' }),
  ],
  invoices: []
}

describe('sendRentInvoices', () => {
  let preview
  let runKey

  beforeEach(() => {
    preview = buildPreview(baseData, today)
    const row = preview.rows.find(r => r.scheduleId === 'recL1')
    runKey = row.runKey
  })

  test('No key: stripeFor throws → result ok:false, error contains Stripe key not set, createRecord never called', async () => {
    const callLog = []
    const updates = []
    const deps = {
      stripeFor: () => { throw new Error('Stripe key not set for this account (STRIPE_EAST_MEADOW_KEY)') },
      createRecord: async () => { callLog.push('createRecord'); return { id: 'recNEW1' } },
      updateRecord: async (table, id, fields) => { callLog.push('updateRecord'); updates.push({ table, id, fields }) },
    }
    const result = await sendRentInvoices({ runKeys: [runKey], data: baseData, today, deps })
    assert.equal(result.results.length, 1)
    assert.equal(result.results[0].ok, false)
    assert.ok(result.results[0].error.includes('Stripe key not set'))
    assert.ok(!callLog.includes('createRecord'), 'createRecord should not be called')
  })

  test('Happy path: createRecord called before first Stripe call; invoices.create gets idempotencyKey and metadata; last Airtable update sets status open', async () => {
    const callLog = []
    const updates = []
    const deps = {
      stripeFor: (account) => ({
        customers: {
          retrieve: async () => { callLog.push('customers.retrieve'); throw new Error('not found') },
          list: async () => { callLog.push('customers.list'); return { data: [] } },
          create: async (params, opts) => { callLog.push('customers.create'); return { id: 'cus_new' } },
        },
        invoices: {
          retrieve: async (id) => ({ id, status: 'draft', total: 110000 }),
          search: async () => { callLog.push('invoices.search'); return { data: [] } },
          create: async (params, opts) => {
            callLog.push('invoices.create')
            assert.ok(opts.idempotencyKey.startsWith('rent-'))
            assert.equal(params.pending_invoice_items_behavior, 'exclude')
            assert.equal(params.collection_method, 'send_invoice')
            assert.equal(params.metadata.source, 'shep_portal_rent')
            assert.ok(params.metadata.run_key)
            return { id: 'in_1', status: 'draft', customer: '' }
          },
          update: async () => { callLog.push('invoices.update') },
          finalizeInvoice: async (id) => { callLog.push('invoices.finalizeInvoice'); return { id, status: 'open', hosted_invoice_url: 'https://pay', invoice_pdf: 'https://pdf' } },
          sendInvoice: async (id) => { callLog.push('invoices.sendInvoice'); return { id, status: 'open', hosted_invoice_url: 'https://pay', invoice_pdf: 'https://pdf' } },
        },
        invoiceItems: {
          create: async (params, opts) => { callLog.push('invoiceItems.create'); assert.ok(opts.idempotencyKey.includes('item-')); assert.equal(params.invoice, 'in_1') },
        },
      }),
      createRecord: async (table, fields) => { callLog.push('createRecord'); return { id: 'recNEW1' } },
      updateRecord: async (table, id, fields) => { callLog.push('updateRecord'); updates.push({ table, id, fields }) },
    }
    const result = await sendRentInvoices({ runKeys: [runKey], data: baseData, today, deps })
    assert.equal(result.results.length, 1)
    assert.equal(result.results[0].ok, true)
    assert.equal(result.results[0].stripeInvoiceId, 'in_1')
    assert.ok(callLog.indexOf('createRecord') < callLog.indexOf('invoices.create'), 'createRecord before invoices.create')
    const last = updates[updates.length - 1]
    assert.equal(last.fields[LI.status], 'open')
  })

  test('Airtable create fails → no Stripe call, result error starts with Airtable:', async () => {
    const callLog = []
    const updates = []
    const deps = {
      stripeFor: () => ({
        customers: { retrieve: async () => { callLog.push('customers.retrieve') }, list: async () => { callLog.push('customers.list'); return { data: [] } }, create: async () => { callLog.push('customers.create'); return { id: 'cus_new' } } },
        invoices: { retrieve: async (id) => ({ id, status: 'draft', total: 110000 }), search: async () => { callLog.push('invoices.search'); return { data: [] } }, create: async () => { callLog.push('invoices.create'); return { id: 'in_1', status: 'draft' } }, finalizeInvoice: async () => { callLog.push('invoices.finalizeInvoice'); return { id: 'in_1', status: 'open' } }, sendInvoice: async () => { callLog.push('invoices.sendInvoice') }, update: async () => { callLog.push('invoices.update') } },
        invoiceItems: { create: async () => { callLog.push('invoiceItems.create') } },
      }),
      createRecord: async () => { callLog.push('createRecord'); throw new Error('Airtable down') },
      updateRecord: async (table, id, fields) => { callLog.push('updateRecord'); updates.push({ table, id, fields }) },
    }
    const result = await sendRentInvoices({ runKeys: [runKey], data: baseData, today, deps })
    assert.equal(result.results[0].ok, false)
    assert.ok(result.results[0].error.startsWith('Airtable: '))
    assert.ok(!callLog.includes('invoices.create'), 'invoices.create should not be called')
  })

  test('Stripe invoices.create throws → failureReason updated, status draft, never set to open', async () => {
    const callLog = []
    const updates = []
    const deps = {
      stripeFor: () => ({
        customers: { retrieve: async () => { callLog.push('customers.retrieve'); throw new Error('not found') }, list: async () => { callLog.push('customers.list'); return { data: [] } }, create: async () => { callLog.push('customers.create'); return { id: 'cus_new' } } },
        invoices: { retrieve: async (id) => ({ id, status: 'draft', total: 110000 }), search: async () => { callLog.push('invoices.search'); return { data: [] } }, create: async () => { callLog.push('invoices.create'); throw new Error('Stripe down') }, finalizeInvoice: async () => { callLog.push('invoices.finalizeInvoice') }, sendInvoice: async () => { callLog.push('invoices.sendInvoice') }, update: async () => { callLog.push('invoices.update') } },
        invoiceItems: { create: async () => { callLog.push('invoiceItems.create') } },
      }),
      createRecord: async () => { callLog.push('createRecord'); return { id: 'recNEW1' } },
      updateRecord: async (table, id, fields) => { callLog.push('updateRecord'); updates.push({ table, id, fields }) },
    }
    const result = await sendRentInvoices({ runKeys: [runKey], data: baseData, today, deps })
    assert.equal(result.results[0].ok, false)
    assert.equal(result.results[0].status, 'draft')
    assert.ok(updates.some(u => typeof u.fields[LI.failureReason] === 'string' && u.fields[LI.failureReason].length > 0))
    assert.ok(!updates.some(u => u.fields[LI.status] === 'open'))
  })

  test('invoices.search returns existing open invoice → invoices.create NOT called, result uses existing id', async () => {
    const callLog = []
    const updates = []
    const deps = {
      stripeFor: () => ({
        customers: { retrieve: async () => { callLog.push('customers.retrieve'); throw new Error('not found') }, list: async () => { callLog.push('customers.list'); return { data: [] } }, create: async () => { callLog.push('customers.create'); return { id: 'cus_new' } } },
        invoices: { retrieve: async (id) => ({ id, status: 'draft', total: 110000 }), search: async () => { callLog.push('invoices.search'); return { data: [{ id: 'in_old', status: 'open', hosted_invoice_url: 'https://old' }] } }, create: async () => { callLog.push('invoices.create'); return { id: 'in_1', status: 'draft' } }, finalizeInvoice: async (id) => { callLog.push('invoices.finalizeInvoice'); return { id, status: 'open', hosted_invoice_url: 'https://old', invoice_pdf: 'https://pdf' } }, sendInvoice: async (id) => { callLog.push('invoices.sendInvoice'); return { id, status: 'open', hosted_invoice_url: 'https://old', invoice_pdf: 'https://pdf' } }, update: async () => { callLog.push('invoices.update') } },
        invoiceItems: { create: async () => { callLog.push('invoiceItems.create') } },
      }),
      createRecord: async () => { callLog.push('createRecord'); return { id: 'recNEW1' } },
      updateRecord: async (table, id, fields) => { callLog.push('updateRecord'); updates.push({ table, id, fields }) },
    }
    const result = await sendRentInvoices({ runKeys: [runKey], data: baseData, today, deps })
    assert.equal(result.results[0].ok, true)
    assert.equal(result.results[0].stripeInvoiceId, 'in_old')
    assert.ok(!callLog.includes('invoices.create'), 'invoices.create should not be called')
  })

  test('Unknown run key → status skipped', async () => {
    const callLog = []
    const deps = {
      stripeFor: () => ({ customers: { retrieve: async () => { callLog.push('customers.retrieve') } }, invoices: { retrieve: async (id) => ({ id, status: 'draft', total: 110000 }), search: async () => { callLog.push('invoices.search') } }, invoiceItems: { create: async () => { callLog.push('invoiceItems.create') } } }),
      createRecord: async () => { callLog.push('createRecord'); return { id: 'recNEW1' } },
      updateRecord: async () => { callLog.push('updateRecord') },
    }
    const result = await sendRentInvoices({ runKeys: ['recUNKNOWN:2026-12-24'], data: baseData, today, deps })
    assert.equal(result.results[0].ok, false)
    assert.equal(result.results[0].status, 'skipped')
    assert.ok(!callLog.includes('createRecord'))
  })

  test('expectedCents mismatch → skipped with Amount changed', async () => {
    const callLog = []
    const deps = {
      stripeFor: () => ({ customers: { retrieve: async () => { callLog.push('customers.retrieve') } }, invoices: { retrieve: async (id) => ({ id, status: 'draft', total: 110000 }), search: async () => { callLog.push('invoices.search') } }, invoiceItems: { create: async () => { callLog.push('invoiceItems.create') } } }),
      createRecord: async () => { callLog.push('createRecord'); return { id: 'recNEW1' } },
      updateRecord: async () => { callLog.push('updateRecord') },
    }
    const preview = buildPreview(baseData, today)
    const row = preview.rows.find(r => r.scheduleId === 'recL1')
    const wrongCents = row.cents + 1
    const result = await sendRentInvoices({ runKeys: [runKey], expectedCents: { [runKey]: wrongCents }, data: baseData, today, deps })
    assert.equal(result.results[0].ok, false)
    assert.equal(result.results[0].status, 'skipped')
    assert.ok(result.results[0].error.includes('Amount changed'))
    assert.ok(!callLog.includes('createRecord'))
  })

  test('Draft invoice with no Stripe Invoice ID → reuses existing draft (no new createRecord)', async () => {
    const dataWithDraft = {
      ...baseData,
      invoices: [makeRec('recDraft1', { 'Run Key': runKey, Status: 'draft' })]
    }
    const callLog = []
    const updates = []
    const deps = {
      stripeFor: () => ({
        customers: { retrieve: async () => { callLog.push('customers.retrieve'); throw new Error('not found') }, list: async () => { callLog.push('customers.list'); return { data: [] } }, create: async () => { callLog.push('customers.create'); return { id: 'cus_new' } } },
        invoices: { retrieve: async (id) => ({ id, status: 'draft', total: 110000 }), search: async () => { callLog.push('invoices.search'); return { data: [] } }, create: async () => { callLog.push('invoices.create'); return { id: 'in_1', status: 'draft' } }, finalizeInvoice: async (id) => { callLog.push('invoices.finalizeInvoice'); return { id, status: 'open', hosted_invoice_url: 'https://pay', invoice_pdf: 'https://pdf' } }, sendInvoice: async (id) => { callLog.push('invoices.sendInvoice'); return { id, status: 'open', hosted_invoice_url: 'https://pay', invoice_pdf: 'https://pdf' } }, update: async () => { callLog.push('invoices.update') } },
        invoiceItems: { create: async () => { callLog.push('invoiceItems.create') } },
      }),
      createRecord: async () => { callLog.push('createRecord'); return { id: 'recNEW1' } },
      updateRecord: async (table, id, fields) => { callLog.push('updateRecord'); updates.push({ table, id, fields }) },
    }
    const result = await sendRentInvoices({ runKeys: [runKey], data: dataWithDraft, today, deps })
    assert.equal(result.results[0].ok, true)
    assert.ok(!callLog.includes('createRecord'), 'createRecord should not be called for existing draft')
    assert.ok(updates.some(u => u.id === 'recDraft1'))
  })
})
describe('sendRentInvoices retry safety (lead review)', () => {
  const today2 = '2026-12-15'
  function fakeStripe(log, { found = [], total = 110000 } = {}) {
    return {
      customers: { retrieve: async (id) => ({ id }), list: async () => ({ data: [] }), create: async () => ({ id: 'cus_1' }) },
      invoices: {
        search: async () => ({ data: found }),
        create: async (params) => { log.push(['create', params]); return { id: 'in_new', status: 'draft', total: 0 } },
        retrieve: async (id) => { log.push(['retrieve', id]); return { id, status: 'draft', total } },
        finalizeInvoice: async (id) => { log.push(['finalize', id]); return { id, status: 'open', hosted_invoice_url: 'https://pay' } },
        sendInvoice: async (id) => { log.push(['send', id]); return { id, status: 'open', hosted_invoice_url: 'https://pay' } },
      },
      invoiceItems: { create: async (p) => { log.push(['item', p.invoice]); return {} } },
    }
  }
  const airtable = () => ({ createRecord: async () => ({ id: 'recNEW1' }), updateRecord: async () => {} })
  const key = () => buildPreview(baseData, today2).rows.find(r => r.scheduleId === 'recL1').runKey

  test('an empty draft found by search gets its items before it is finalized', async () => {
    const log = []
    const res = await sendRentInvoices({ runKeys: [key()], data: baseData, today: today2,
      deps: { stripeFor: () => fakeStripe(log, { found: [{ id: 'in_draft', status: 'draft', total: 0 }] }), ...airtable() } })
    assert.equal(res.results[0].ok, true)
    assert.ok(!log.some(([k]) => k === 'create'), 'no new invoice')
    const itemAt = log.findIndex(([k, v]) => k === 'item' && v === 'in_draft')
    const finAt = log.findIndex(([k]) => k === 'finalize')
    assert.ok(itemAt >= 0 && itemAt < finAt, 'items added before finalize')
  })

  test('a draft whose total does not match is never finalized', async () => {
    const log = []
    const res = await sendRentInvoices({ runKeys: [key()], data: baseData, today: today2,
      deps: { stripeFor: () => fakeStripe(log, { found: [{ id: 'in_draft', status: 'draft', total: 55000 }], total: 55000 }), ...airtable() } })
    assert.equal(res.results[0].ok, false)
    assert.equal(res.results[0].status, 'draft')
    assert.ok(!log.some(([k]) => k === 'finalize' || k === 'send'))
    assert.ok(!log.some(([k]) => k === 'item'), 'no items added to a non-empty draft')
  })

  test('due_date is never in the past', async () => {
    const log = []
    const late = Date.UTC(2026, 11, 24, 23) // Dec 24 after noon Central, the due day
    await sendRentInvoices({ runKeys: [buildPreview(baseData, '2026-12-24').rows.find(r => r.scheduleId === 'recL1').runKey],
      data: baseData, today: '2026-12-24', nowMs: () => late,
      deps: { stripeFor: () => fakeStripe(log), ...airtable() } })
    const created = log.find(([k]) => k === 'create')[1]
    assert.ok(created.due_date >= Math.floor(late / 1000) + 3600)
  })
})
