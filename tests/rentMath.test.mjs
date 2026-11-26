import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  daysInMonth,
  clampDay,
  ymd,
  centralToday,
  nextDueDate,
  addDays,
  isDueToSend,
  runKey,
  toCents,
  fromCents,
  splitAmounts,
  RENT_ACCOUNTS,
  rentAccountKey,
  paymentMethodTypes,
  dueDateUnixNoonCentral
} from '../supabase/functions/_shared/rentMath.js'

test('nextDueDate examples', () => {
  assert.equal(nextDueDate(31, '2026-02-10'), '2026-02-28')
  assert.equal(nextDueDate(24, '2026-11-25'), '2026-12-24')
  assert.equal(nextDueDate(27, '2026-11-25'), '2026-11-27')
  assert.equal(nextDueDate(5, '2026-12-20'), '2027-01-05')
  assert.equal(nextDueDate(29, '2028-02-01'), '2028-02-29')
})

test('nextDueDate throws on invalid dueDay', () => {
  assert.throws(() => nextDueDate(0, '2026-01-01'), /Due Day must be 1 to 31/)
  assert.throws(() => nextDueDate(32, '2026-01-01'), /Due Day must be 1 to 31/)
  assert.throws(() => nextDueDate(1.5, '2026-01-01'), /Due Day must be 1 to 31/)
})

test('splitAmounts - two Percent 50 on $1225', () => {
  const lines = [{ name: 'Rent', amount: 1225 }]
  const rows = [
    { id: 'r1', shareType: 'Percent', shareValue: 50, dueDay: 1 },
    { id: 'r2', shareType: 'Percent', shareValue: 50, dueDay: 2 }
  ]
  const res = splitAmounts(lines, rows)
  assert.equal(res.ok, true)
  assert.equal(res.rows[0].cents, 61250)
  assert.equal(res.rows[1].cents, 61250)
})

test('splitAmounts - three Percent 100/3 on $1000', () => {
  const lines = [{ name: 'Rent', amount: 1000 }]
  const rows = [
    { id: 'r1', shareType: 'Percent', shareValue: 100/3, dueDay: 1 },
    { id: 'r2', shareType: 'Percent', shareValue: 100/3, dueDay: 2 },
    { id: 'r3', shareType: 'Percent', shareValue: 100/3, dueDay: 3 }
  ]
  const res = splitAmounts(lines, rows)
  assert.equal(res.ok, true)
  assert.equal(res.rows[0].cents, 33333)
  assert.equal(res.rows[1].cents, 33333)
  assert.equal(res.rows[2].cents, 33334)
})

test('splitAmounts - Fixed 475 + 475 on $950', () => {
  const lines = [{ name: 'Rent', amount: 950 }]
  const rows = [
    { id: 'r1', shareType: 'Fixed', shareValue: 475, dueDay: 1 },
    { id: 'r2', shareType: 'Fixed', shareValue: 475, dueDay: 2 }
  ]
  const res = splitAmounts(lines, rows)
  assert.equal(res.ok, true)
  assert.equal(res.rows[0].cents, 47500)
  assert.equal(res.rows[1].cents, 47500)
})

test('splitAmounts - Full single row returns total and lines', () => {
  const lines = [{ name: 'Rent', amount: 1200 }, { name: 'Parking', amount: 50 }]
  const rows = [{ id: 'r1', shareType: 'Full', shareValue: 0, dueDay: 1 }]
  const res = splitAmounts(lines, rows)
  assert.equal(res.ok, true)
  assert.equal(res.rows[0].cents, 125000)
  assert.equal(res.rows[0].lines.length, 2)
  assert.equal(res.rows[0].lines[0].cents, 120000)
  assert.equal(res.rows[0].lines[1].cents, 5000)
})

test('splitAmounts - mixed Full+Percent returns ok false', () => {
  const lines = [{ name: 'Rent', amount: 1000 }]
  const rows = [
    { id: 'r1', shareType: 'Full', shareValue: 0, dueDay: 1 },
    { id: 'r2', shareType: 'Percent', shareValue: 50, dueDay: 2 }
  ]
  const res = splitAmounts(lines, rows)
  assert.equal(res.ok, false)
})

test('splitAmounts - Fixed 500 + 500 on $1225 returns ok false', () => {
  const lines = [{ name: 'Rent', amount: 1225 }]
  const rows = [
    { id: 'r1', shareType: 'Fixed', shareValue: 500, dueDay: 1 },
    { id: 'r2', shareType: 'Fixed', shareValue: 500, dueDay: 2 }
  ]
  const res = splitAmounts(lines, rows)
  assert.equal(res.ok, false)
  assert.ok(res.problem.includes('add up to $1,000.00'))
  assert.ok(res.problem.includes('lease total is $1,225.00'))
})

test('splitAmounts - empty lines returns ok false', () => {
  const lines = []
  const rows = [{ id: 'r1', shareType: 'Fixed', shareValue: 500, dueDay: 1 }]
  const res = splitAmounts(lines, rows)
  assert.equal(res.ok, false)
  assert.equal(res.problem, 'Lease total is $0 (no line items)')
})

test('isDueToSend - due 2026-12-24, send 10', () => {
  assert.equal(isDueToSend('2026-12-24', 10, '2026-12-13'), false)
  assert.equal(isDueToSend('2026-12-24', 10, '2026-12-14'), true)
})

test('isDueToSend - blank sendDays behaves as 10', () => {
  assert.equal(isDueToSend('2026-12-24', '', '2026-12-13'), false)
  assert.equal(isDueToSend('2026-12-24', null, '2026-12-14'), true)
  assert.equal(isDueToSend('2026-12-24', undefined, '2026-12-14'), true)
  assert.equal(isDueToSend('2026-12-24', NaN, '2026-12-14'), true)
})

test('rentAccountKey mappings', () => {
  assert.equal(rentAccountKey('East Meadow Properties'), 'east_meadow')
  assert.equal(rentAccountKey('Shepard Holdings'), 'shepard_holdings')
  assert.equal(rentAccountKey('Virginia Holdings'), null)
  assert.equal(rentAccountKey('Happy Cuts'), null)
  assert.equal(rentAccountKey(''), null)
  assert.equal(rentAccountKey(null), null)
})

test('paymentMethodTypes', () => {
  assert.deepEqual(paymentMethodTypes(['ACH', 'Card']), ['us_bank_account', 'card'])
  assert.deepEqual(paymentMethodTypes(['ACH']), ['us_bank_account'])
  assert.deepEqual(paymentMethodTypes([]), ['us_bank_account'])
  assert.deepEqual(paymentMethodTypes(['Card']), ['us_bank_account', 'card'])
})

test('dueDateUnixNoonCentral - CST (Jan) and CDT (Jul)', () => {
  // 2026-01-15 is CST (UTC-6), noon = 18:00 UTC
  assert.equal(dueDateUnixNoonCentral('2026-01-15'), Date.UTC(2026, 0, 15, 18) / 1000)
  // 2026-07-15 is CDT (UTC-5), noon = 17:00 UTC
  assert.equal(dueDateUnixNoonCentral('2026-07-15'), Date.UTC(2026, 6, 15, 17) / 1000)
})
test('splitAmounts - blank Percent share is rejected', () => {
  const res = splitAmounts([{ name: 'Rent', amount: 1000 }], [
    { id: 'a', shareType: 'Percent', shareValue: 50, dueDay: 1 },
    { id: 'b', shareType: 'Percent', shareValue: undefined, dueDay: 1 },
  ])
  assert.equal(res.ok, false)
})
