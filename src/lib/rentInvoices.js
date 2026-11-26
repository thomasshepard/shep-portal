import { fetchAllRecords, PM_BASE_ID } from './airtable'
import { supabase } from './supabase'
export * from '../../supabase/functions/_shared/rentMath.js'

export const RENT_TABLES = {
  rentSchedule: 'tbl2HYyA5a9eiRWoc',
  leaseInvoice: 'tblvBW1tHvXrjL6Go',
  leaseAgreements: 'tblr00YD7yxgirqtN',
  lineItems: 'tblRW3CsmQC6zI2RU',
  tenants: 'tblcUBwyCHhyYzUEC',
  rentalUnits: 'tbl2tk7EjtR2k65WR',
  property: 'tblsFZ6bhUwsnPLaj'
}

export const RENT_SCHEDULE_FIELD_IDS = {
  name: 'fldCchUBD46JIoiJf',
  lease: 'fld9ZrvE46g5vp2jZ',
  payer: 'fldefGQILK0Die4yY',
  shareType: 'fldEhshKsmD1Wimdw',
  shareValue: 'fldaO2tJZIpzV10en',
  dueDay: 'fldjVuk292Yj53uh9',
  sendDaysBefore: 'fldngFdrV3GusRtyL',
  paymentMethods: 'fldacMIhIkFZedDoC',
  active: 'flde6r1vycjzbwEH8',
  lateFeeOverride: 'fldaHNwAmAi2QOehv',
  notes: 'fldFuFByPcGSbvBBm',
}

export const LEASE_INVOICE_FIELD_IDS = {
  rentSchedule: 'fldx6Lq5ARw3OS5Z0',
  runKey: 'fldnzOt8jrwPcd4gc',
  kind: 'fldZXTTcXtJwSmpLz',
  property: 'fldzZKeRI8XIjbpkh',
  status: 'fldW5SacGt9x4mUrR',
  stripeInvoiceId: 'fldBRwpxQ905vEbdg',
  amountDue: 'fldcVz4DyUfUujnrg',
  amountPaid: 'fldx3D490VFEBBpNJ',
  stripeAccount: 'fldGkXWpXyCRQOlrj',
  dueDate: 'fldMA9ch1JzEuqLqP',
  issuedDate: 'fldOCvMlVFOTO8DxI',
  paidDate: 'fldnV7jVqdzXicmiJ',
  leaseAgreements: 'fldEBid6WLOvoMOSB',
  tenant: 'fldN9rLoWUWUhGCqb',
  failureReason: 'fldcOi0SV4N9jQM0G',
  hostedUrl: 'fldn0VcBZoLhd20Y6',
  pdfUrl: 'fldB01ODjcCmzntck',
  lastWebhookEvent: 'fld9A683yWSwm940n',
  lastWebhookAt: 'fldaDMQ85UfDgPPOR',
  notes: 'fld3nraQUxMbbGY71',
}

export const RENT_SCHEDULE_FIELDS = {
  name: 'Name',
  lease: 'Lease',
  payer: 'Payer',
  shareType: 'Share Type',
  shareValue: 'Share Value',
  dueDay: 'Due Day',
  sendDaysBefore: 'Send Days Before',
  paymentMethods: 'Payment Methods',
  active: 'Active',
  lateFeeOverride: 'Late Fee Override',
  notes: 'Notes'
}

export const LEASE_INVOICE_FIELDS = {
  rentSchedule: 'Rent Schedule',
  runKey: 'Run Key',
  kind: 'Kind',
  property: 'Property',
  status: 'Status',
  stripeInvoiceId: 'Stripe Invoice ID',
  amountDue: 'Amount Due',
  amountPaid: 'Amount Paid',
  stripeAccount: 'Stripe Account',
  dueDate: 'Due Date',
  issuedDate: 'Issued Date',
  paidDate: 'Paid Date',
  leaseAgreements: 'Lease Agreements',
  tenant: 'Tenant',
  failureReason: 'Failure Reason',
  hostedUrl: 'Stripe Hosted URL',
  pdfUrl: 'Stripe PDF URL',
  lastWebhookEvent: 'Last Webhook Event',
  lastWebhookAt: 'Last Webhook At',
  notes: 'Notes'
}

export async function fetchRentSchedule() {
  return fetchAllRecords(RENT_TABLES.rentSchedule, {}, PM_BASE_ID)
}

export async function fetchOpenLeaseInvoices() {
  const { data, error } = await fetchAllRecords(RENT_TABLES.leaseInvoice, {}, PM_BASE_ID)
  if (error) return { data: null, error }
  const filtered = data
    .filter(r => {
      const status = r.fields[LEASE_INVOICE_FIELDS.status]
      return status !== 'paid' && status !== 'void'
    })
    .filter(r => r.fields[LEASE_INVOICE_FIELDS.runKey])
    .sort((a, b) => {
      const da = a.fields[LEASE_INVOICE_FIELDS.dueDate]
      const db = b.fields[LEASE_INVOICE_FIELDS.dueDate]
      return String(db).localeCompare(String(da))
    })
  return { data: filtered, error: null }
}

// Calls the admin-only rent-invoices edge function. Reads the real error text
// off the response on a non-2xx status (same pattern as Bookkeeping.jsx).
async function callRentInvoices(body) {
  const { data, error } = await supabase.functions.invoke('rent-invoices', { body })
  if (error) {
    let detail = error.message
    try {
      const b = await error.context?.json()
      if (b?.error) detail = b.error
    } catch { /* not JSON */ }
    throw new Error(detail || 'Rent invoices request failed')
  }
  return data
}

export function previewRentInvoices() {
  return callRentInvoices({ action: 'preview' })
}

export function sendRentInvoices(runKeys, expectedCents) {
  return callRentInvoices({ action: 'send', runKeys, expectedCents })
}