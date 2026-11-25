import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildPreview } from '../supabase/functions/_shared/rentPreview.js'

const today = '2026-12-15'

function makeRec(id, fields) {
  return { id, fields }
}

describe('buildPreview', () => {
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
      makeRec('recL2a', {
        Active: true,
        Name: 'Schedule L2 50%',
        Lease: ['recLease2'],
        Payer: ['recTenant2'],
        'Share Type': 'Percent',
        'Share Value': 50,
        'Due Day': 19,
        'Send Days Before': 10,
        'Payment Methods': ['ACH']
      }),
      makeRec('recL2b', {
        Active: true,
        Name: 'Schedule L2 50% B',
        Lease: ['recLease2'],
        Payer: ['recTenant3'],
        'Share Type': 'Percent',
        'Share Value': 50,
        'Due Day': 19,
        'Send Days Before': 10,
        'Payment Methods': ['ACH']
      }),
      makeRec('recL3', {
        Active: true,
        Name: 'Schedule L3 No Billing',
        Lease: ['recLease3'],
        Payer: ['recTenant1'],
        'Share Type': 'Full',
        'Share Value': 100,
        'Due Day': 24,
        'Send Days Before': 10,
        'Payment Methods': ['ACH']
      }),
      makeRec('recL4', {
        Active: true,
        Name: 'Schedule L4 No Stripe',
        Lease: ['recLease4'],
        Payer: ['recTenant1'],
        'Share Type': 'Full',
        'Share Value': 100,
        'Due Day': 24,
        'Send Days Before': 10,
        'Payment Methods': ['ACH']
      }),
      makeRec('recNoLease', {
        Active: true,
        Name: 'No Lease Row',
        Lease: [],
        Payer: ['recTenant1'],
        'Share Type': 'Full',
        'Share Value': 100,
        'Due Day': 1,
        'Send Days Before': 10,
        'Payment Methods': ['ACH']
      })
    ],
    leases: [
      makeRec('recLease1', {
        'Billing On': true,
        Status: 'Open',
        'End Date': '2027-12-31',
        Property: ['recUnit1'],
        'Lease Invoice Line Item': ['recLine1']
      }),
      makeRec('recLease2', {
        'Billing On': true,
        Status: 'Open',
        'End Date': '2027-12-31',
        Property: ['recUnit2'],
        'Lease Invoice Line Item': ['recLine2', 'recLine3']
      }),
      makeRec('recLease3', {
        'Billing On': false,
        Status: 'Open',
        'End Date': '2027-12-31',
        Property: ['recUnit1'],
        'Lease Invoice Line Item': ['recLine1']
      }),
      makeRec('recLease4', {
        'Billing On': true,
        Status: 'Open',
        'End Date': '2027-12-31',
        Property: ['recUnit4'],
        'Lease Invoice Line Item': ['recLine1']
      })
    ],
    lineItems: [
      makeRec('recLine1', { Name: 'Rent', 'Line Item Total': 1100 }),
      makeRec('recLine2', { Name: 'Rent', 'Line Item Total': 1650 }),
      makeRec('recLine3', { Name: 'Pet Fee', 'Line Item Total': 35 })
    ],
    tenants: [
      makeRec('recTenant1', { Name: 'Tenant One', Email: 'tenant1@example.com', 'Stripe Customer ID': 'cus_1' }),
      makeRec('recTenant2', { Name: 'Tenant Two', Email: 'tenant2@example.com', 'Stripe Customer ID': 'cus_2' }),
      makeRec('recTenant3', { Name: 'Tenant Three', Email: '', 'Stripe Customer ID': 'cus_3' })
    ],
    units: [
      makeRec('recUnit1', { Property: ['recProp1'] }),
      makeRec('recUnit2', { Property: ['recProp2'] }),
      makeRec('recUnit4', { Property: ['recProp4'] })
    ],
    properties: [
      makeRec('recProp1', { Address: '182 Virginia St', 'Stripe Account': 'East Meadow Properties' }),
      makeRec('recProp2', { Address: '195 Kingwood Dr', 'Stripe Account': 'Shepard Holdings' }),
      makeRec('recProp4', { Address: '404 No Stripe Dr', 'Stripe Account': '' })
    ],
    invoices: []
  }

  test('L1 row: dueDate 2026-12-24, cents 110000, account east_meadow, runKey, no problems', () => {
    const result = buildPreview(baseData, today)
    const row = result.rows.find(r => r.scheduleId === 'recL1')
    assert.ok(row, 'L1 row should exist')
    assert.equal(row.dueDate, '2026-12-24')
    assert.equal(row.cents, 110000)
    assert.equal(row.account, 'east_meadow')
    assert.equal(row.runKey, 'recL1:2026-12-24')
    assert.deepEqual(row.problems, [])
    assert.equal(row.lines.length, 1)
    assert.equal(row.lines[0].name, 'Rent')
    assert.equal(row.lines[0].cents, 110000)
  })

  test('L2 rows: two rows, account shepard_holdings, cents 84250 each, T3 has email problem', () => {
    const result = buildPreview(baseData, today)
    const rows = result.rows.filter(r => r.scheduleId === 'recL2a' || r.scheduleId === 'recL2b')
    assert.equal(rows.length, 2)
    for (const row of rows) {
      assert.equal(row.account, 'shepard_holdings')
      assert.equal(row.cents, 84250)
    }
    const t3Row = rows.find(r => r.payerId === 'recTenant3')
    assert.ok(t3Row.problems.includes('Payer has no email'))
  })

  test('L3 produces no row (Billing On false)', () => {
    const result = buildPreview(baseData, today)
    const row = result.rows.find(r => r.scheduleId === 'recL3')
    assert.equal(row, undefined)
    assert.equal(result.notDue, 1)
  })

  test('L4 row has problem: No Stripe account on the property', () => {
    const result = buildPreview(baseData, today)
    const row = result.rows.find(r => r.scheduleId === 'recL4')
    assert.ok(row)
    assert.ok(row.problems.includes('No Stripe account on the property'))
  })

  test('Invoice with matching runKey and Status open hides row; Status void shows it', () => {
    const dataWithInvoice = {
      ...baseData,
      invoices: [makeRec('recInv1', { 'Run Key': 'recL1:2026-12-24', Status: 'open' })]
    }
    let result = buildPreview(dataWithInvoice, today)
    let row = result.rows.find(r => r.scheduleId === 'recL1')
    assert.equal(row, undefined)
    assert.equal(result.notDue, 2)

    dataWithInvoice.invoices[0].fields.Status = 'void'
    result = buildPreview(dataWithInvoice, today)
    row = result.rows.find(r => r.scheduleId === 'recL1')
    assert.ok(row)
    assert.equal(result.notDue, 1)
  })

  test('With today 2026-12-01, L1 row (due 24th, send 10 days before) is not in rows', () => {
    const result = buildPreview(baseData, '2026-12-01')
    const row = result.rows.find(r => r.scheduleId === 'recL1')
    assert.equal(row, undefined)
    // L1, L2 x2 and L4 are not due yet on Dec 1; L3 is skipped (Billing On off).
    assert.equal(result.notDue, 5)
  })

  test('No lease linked row appears with problem', () => {
    const result = buildPreview(baseData, today)
    const row = result.rows.find(r => r.scheduleId === 'recNoLease')
    assert.ok(row)
    assert.deepEqual(row.problems, ['No lease linked'])
    assert.equal(row.dueDate, null)
    assert.equal(row.cents, 0)
  })

  test('two Fixed rows same payer: due day 15 row appears with cents 47500; due day 1 row not due yet', () => {
    const twoFixedData = {
      schedule: [
        makeRec('recA', {
          Active: true,
          Name: 'Fixed Day 1',
          Lease: ['recLeaseFixed'],
          Payer: ['recTenantFixed'],
          'Share Type': 'Fixed',
          'Share Value': 475,
          'Due Day': 1,
          'Send Days Before': 10,
          'Payment Methods': ['ACH']
        }),
        makeRec('recB', {
          Active: true,
          Name: 'Fixed Day 15',
          Lease: ['recLeaseFixed'],
          Payer: ['recTenantFixed'],
          'Share Type': 'Fixed',
          'Share Value': 475,
          'Due Day': 15,
          'Send Days Before': 10,
          'Payment Methods': ['ACH']
        })
      ],
      leases: [
        makeRec('recLeaseFixed', {
          'Billing On': true,
          Status: 'Open',
          'End Date': '2027-12-31',
          Property: ['recUnitFixed'],
          'Lease Invoice Line Item': ['recLineFixed']
        })
      ],
      lineItems: [
        makeRec('recLineFixed', { Name: 'Rent', 'Line Item Total': 950 })
      ],
      tenants: [
        makeRec('recTenantFixed', { Name: 'Fixed Tenant', Email: 'fixed@example.com', 'Stripe Customer ID': 'cus_fixed' })
      ],
      units: [
        makeRec('recUnitFixed', { Property: ['recPropFixed'] })
      ],
      properties: [
        makeRec('recPropFixed', { Address: '123 Fixed St', 'Stripe Account': 'Test Account' })
      ],
      invoices: []
    }
    const result = buildPreview(twoFixedData, today)
    const rowB = result.rows.find(r => r.scheduleId === 'recB')
    assert.ok(rowB, 'recB (due day 15) row should exist')
    assert.equal(rowB.dueDate, '2026-12-15')
    assert.equal(rowB.cents, 47500)
    const rowA = result.rows.find(r => r.scheduleId === 'recA')
    assert.equal(rowA, undefined, 'recA (due day 1) row should not be due yet')
  })
})