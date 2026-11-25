import { dueDateUnixNoonCentral } from './rentMath.js'
import { buildPreview } from './rentPreview.js'

export const LI = {
  rentSchedule: 'fldx6Lq5ARw3OS5Z0',
  runKey: 'fldnzOt8jrwPcd4gc',
  kind: 'fldZXTTcXtJwSmpLz',
  property: 'fldzZKeRI8XIjbpkh',
  status: 'fldW5SacGt9x4mUrR',
  stripeInvoiceId: 'fldBRwpxQ905vEbdg',
  amountDue: 'fldcVz4DyUfUujnrg',
  stripeAccount: 'fldGkXWpXyCRQOlrj',
  dueDate: 'fldMA9ch1JzEuqLqP',
  issuedDate: 'fldOCvMlVFOTO8DxI',
  leaseAgreements: 'fldEBid6WLOvoMOSB',
  tenant: 'fldN9rLoWUWUhGCqb',
  failureReason: 'fldcOi0SV4N9jQM0G',
  hostedUrl: 'fldn0VcBZoLhd20Y6',
  pdfUrl: 'fldB01ODjcCmzntck',
}
export const TENANT_STRIPE_CUSTOMER_ID = 'fldhczpBALyYrcrdl'
export const LEASE_INVOICE_TABLE = 'tblvBW1tHvXrjL6Go'
export const TENANTS_TABLE = 'tblcUBwyCHhyYzUEC'

export async function sendRentInvoices({ runKeys, expectedCents = {}, data, today, deps }) {
  const preview = buildPreview(data, today)
  const rowByKey = new Map(preview.rows.map(r => [r.runKey, r]))

  const uniqueRunKeys = [...new Set(runKeys)]
  const results = []

  for (const runKey of uniqueRunKeys) {
    const row = rowByKey.get(runKey)

    if (!row) {
      results.push({ runKey, ok: false, status: 'skipped', error: 'No longer due, or already sent' })
      continue
    }

    if (row.problems.length > 0) {
      results.push({ runKey, ok: false, status: 'skipped', error: row.problems.join('; ') })
      continue
    }

    if (expectedCents[runKey] !== undefined && expectedCents[runKey] !== row.cents) {
      results.push({ runKey, ok: false, status: 'skipped', error: 'Amount changed since the preview; refresh and try again' })
      continue
    }

    let stripe
    try {
      stripe = deps.stripeFor(row.account)
    } catch (e) {
      results.push({ runKey, ok: false, status: 'error', error: e.message })
      continue
    }

    let leaseInvoiceId = row.resumeDraftId
    if (!leaseInvoiceId) {
      try {
        const created = await deps.createRecord(LEASE_INVOICE_TABLE, {
          [LI.status]: 'draft',
          [LI.runKey]: row.runKey,
          [LI.kind]: 'Rent',
          [LI.amountDue]: row.cents / 100,
          [LI.dueDate]: row.dueDate,
          [LI.rentSchedule]: [row.scheduleId],
          [LI.leaseAgreements]: [row.leaseId],
          [LI.tenant]: [row.payerId],
          [LI.property]: [row.propertyId],
          [LI.stripeAccount]: row.accountName,
        })
        leaseInvoiceId = created.id
      } catch (e) {
        results.push({ runKey, ok: false, status: 'error', error: 'Airtable: ' + e.message })
        continue
      }
    }

    let invoice
    let customerId
    let isNewInvoice = false
    try {
      let cust
      if (row.stripeCustomerId) {
        try {
          cust = await stripe.customers.retrieve(row.stripeCustomerId)
          if (!cust.deleted) {
            customerId = cust.id
          }
        } catch {
          // ignore, will search/create
        }
      }
      if (!customerId) {
        const list = await stripe.customers.list({ email: row.email, limit: 1 })
        if (list.data.length > 0) {
          customerId = list.data[0].id
        }
      }
      if (!customerId) {
        cust = await stripe.customers.create({
          name: row.payerName,
          email: row.email,
          metadata: { source: 'shep_portal_rent', airtable_tenant_id: row.payerId },
        }, { idempotencyKey: `rent-cust-${row.account}-${row.payerId}` })
        customerId = cust.id
      }

      if (customerId !== row.stripeCustomerId) {
        await deps.updateRecord(TENANTS_TABLE, row.payerId, { [TENANT_STRIPE_CUSTOMER_ID]: customerId })
      }

      const found = await stripe.invoices.search({ query: `metadata['run_key']:'${row.runKey}'` })
      invoice = found.data.find(i => i.status !== 'void') || null

      if (!invoice) {
        isNewInvoice = true
        invoice = await stripe.invoices.create({
          customer: customerId,
          collection_method: 'send_invoice',
          due_date: dueDateUnixNoonCentral(row.dueDate),
          auto_advance: true,
          pending_invoice_items_behavior: 'exclude',
          payment_settings: { payment_method_types: row.paymentMethods },
          description: `Rent for ${row.address}, due ${row.dueDate}`,
          metadata: {
            source: 'shep_portal_rent',
            lease_invoice_id: leaseInvoiceId,
            schedule_id: row.scheduleId,
            lease_id: row.leaseId,
            property: row.address,
            run_key: row.runKey,
          },
        }, { idempotencyKey: `rent-${row.runKey}` })
      }

      if (isNewInvoice) {
        for (let i = 0; i < row.lines.length; i++) {
          const line = row.lines[i]
          await stripe.invoiceItems.create({
            customer: customerId,
            invoice: invoice.id,
            amount: line.cents,
            currency: 'usd',
            description: line.name,
          }, { idempotencyKey: `rent-${row.runKey}-item-${i}` })
        }
      }

      await deps.updateRecord(LEASE_INVOICE_TABLE, leaseInvoiceId, { [LI.stripeInvoiceId]: invoice.id })

      if (invoice.status === 'draft') {
        invoice = await stripe.invoices.finalizeInvoice(invoice.id)
      }
      if (invoice.status === 'open') {
        invoice = await stripe.invoices.sendInvoice(invoice.id)
      }

      await deps.updateRecord(LEASE_INVOICE_TABLE, leaseInvoiceId, {
        [LI.hostedUrl]: invoice.hosted_invoice_url || '',
        [LI.pdfUrl]: invoice.invoice_pdf || '',
        [LI.issuedDate]: today,
        [LI.status]: 'open',
        [LI.failureReason]: '',
      })

      results.push({ runKey, ok: true, status: 'open', stripeInvoiceId: invoice.id, hostedUrl: invoice.hosted_invoice_url || '' })
    } catch (e) {
      try {
        await deps.updateRecord(LEASE_INVOICE_TABLE, leaseInvoiceId, { [LI.failureReason]: String(e.message).slice(0, 500) })
      } catch {
        // best effort: keep the original Stripe error as the result
      }
      results.push({ runKey, ok: false, status: 'draft', error: e.message })
    }
  }

  return { results }
}