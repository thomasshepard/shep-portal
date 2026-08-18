// Bank statement CSV parsing for Bookkeeping's backfill import — separate
// concern from statements.js (credit-card statement import for Finances),
// but reuses its parseCSV tokenizer rather than writing a second one; it's
// already a self-contained, entity-agnostic RFC-4180 parser.
//
// Relay Financial only for now — real format confirmed against an actual
// export (Accounts > Statements > Export > Download statements > CSV):
//   Date,Payee,Account #,Transaction Type,Description,Reference,Status,Amount,Currency,Balance
//   1/23/2026,STRIPE,,Receive,,"TRANSFER",SETTLED,+392.80,USD,1508.19
// Add a second bank's adapter the same way statements.js adds per-issuer
// adapters, if/when needed — don't guess a format ahead of a real sample.

import { parseCSV } from './statements.js'

function parseMDY(s) {
  const [m, d, y] = String(s).trim().split('/')
  if (!m || !d || !y) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Returns { rows: [{date, payee, referenceText, amount, status}], errors: string[] } */
export function parseRelayCsv(text) {
  const table = parseCSV(text)
  if (table.length === 0) return { rows: [], errors: ['Empty file'] }

  const header = table[0].map(h => h.trim())
  const idx = {
    date: header.indexOf('Date'),
    payee: header.indexOf('Payee'),
    reference: header.indexOf('Reference'),
    status: header.indexOf('Status'),
    amount: header.indexOf('Amount'),
  }
  if (idx.date === -1 || idx.amount === -1) {
    return { rows: [], errors: [`Doesn't look like a Relay export — expected a Date and Amount column, got: ${header.join(', ')}`] }
  }

  const rows = []
  const errors = []
  for (let i = 1; i < table.length; i++) {
    const cells = table[i]
    const date = parseMDY(cells[idx.date])
    const amountStr = String(cells[idx.amount] || '').trim()
    const amount = Number(amountStr.replace(/[+,]/g, ''))
    if (!date || !Number.isFinite(amount)) {
      errors.push(`Row ${i + 1}: couldn't parse date/amount ("${cells[idx.date]}", "${cells[idx.amount]}") — skipped`)
      continue
    }
    rows.push({
      date,
      payee: (cells[idx.payee] || '').trim(),
      referenceText: (cells[idx.reference] || '').trim(),
      amount,
      status: (cells[idx.status] || '').trim(),
    })
  }
  return { rows, errors }
}
