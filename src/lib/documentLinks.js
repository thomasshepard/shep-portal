// Cross-links Documents (Desk Paper Cleanup base) to the Insurance and Taxes /
// Bills Payment / Compliance Log records they're actually about — insurance
// renewals, property tax bills, utility bills, LLC compliance mail.
//
// This module only classifies, extracts, and matches. It is suggest-and-confirm
// by design: it never writes to the PM base or the LLC base itself. Each target
// page (Insurance.jsx, PropertyDetail.jsx, LLCDetail.jsx) owns its own Apply
// action and decides what to do with the extracted fields.
//
// Pattern follows lib/incubation.js / lib/fleet.js (shared per-feature config)
// and reuses the AI-call shape already established in Finances.jsx's fetchNudges.

import { DOCS_BASE_ID } from './airtable'

const ANTH_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const PAT = import.meta.env.VITE_AIRTABLE_PAT

// ── Closed lists ─────────────────────────────────────────────────────────
// Fixed singleSelect choice lists on the target tables (confirmed against live
// Airtable schema + existing local constants in Insurance.jsx/ComplianceForm.jsx).
// The AI is always constrained to these — never allowed to invent a value that
// would land in a singleSelect field, since typecast auto-creates new choices
// and an AI-guessed variant would silently pollute the dropdown.

export const CLOSED_LISTS = {
  entity: [
    'Thomas Shepard', 'Thomas Shepard and Gabrielle Shepard', 'Shepard Holdings LLC',
    'Ridge & Anchor LLC', 'Virginia Holdings LLC', 'Happy Cuts LLC', 'East Meadow Consulting LLC',
  ],
  policyType: [
    'Landlord (DP-3)', 'Homeowners (HO-3)', 'Mobile Home', "Builder's Risk",
    'Vacant Dwelling', 'Flood', 'General Liability', 'Commercial Auto',
    'Personal Auto', 'Umbrella', 'Health', 'Workers Comp', 'Other',
  ],
  billsCategory: ['Utilities', 'Insurance', 'Maintenance', 'Internet', 'Mortgage', 'Others', 'Cleaning', 'Handyman'],
  complianceType: ['Annual Report', 'Registered Agent Renewal', 'EIN Application', 'Operating Agreement Update', 'State Registration'],
}

// ── Classification ───────────────────────────────────────────────────────
// doc is the shape produced by Documents.jsx's parseDoc(): { category, sender,
// notes, ocr, raw, ... }

const INSURANCE_TAX_DOC_TYPES = new Set([
  'Insurance Notice', 'Premium Notice', 'Policy Declarations', 'Coverage Notification Letter',
  'Auto Insurance Policy Declaration', 'Auto Insurance Information Packet',
  'Health Insurance Premium Notice', 'Insurance Document',
  'Property Tax Bill', 'Tax Notice', 'Parcel Detail Report', 'Property Assessment and Parcel Map',
  'Tax Document',
])

const PROPERTY_BILL_DOC_TYPES = new Set(['Electric Bill', 'Electric Statement', 'Utility Bill'])

const LLC_KEYWORDS = [
  'registered agent', 'annual report', 'secretary of state', 'franchise tax',
  'certificate of formation', 'certificate of organization',
]

export const LINK_KIND_LABELS = {
  insurance_tax: 'Insurance & Taxes',
  property_bill: 'Property Bill',
  llc_compliance: 'LLC Compliance',
}

// Fallback keyword scan — no Document Type bucket cleanly maps to LLC compliance
// mail, so this mirrors DocumentActionCenter's classifyDoc() keyword approach.
export function guessLlcCompliance(doc) {
  const haystack = `${doc.sender || ''} ${doc.notes || ''} ${doc.ocr || ''} ${doc.raw?.['Action Required'] || ''}`.toLowerCase()
  return LLC_KEYWORDS.some(kw => haystack.includes(kw))
}

/** Returns 'insurance_tax' | 'property_bill' | 'llc_compliance' | null */
export function classifyDocument(doc) {
  const docType = doc.category || ''
  if (INSURANCE_TAX_DOC_TYPES.has(docType)) return 'insurance_tax'
  if (PROPERTY_BILL_DOC_TYPES.has(docType)) return 'property_bill'
  if (guessLlcCompliance(doc)) return 'llc_compliance'
  return null
}

// ── AI extraction ────────────────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  insurance_tax: (lists) => `You extract structured data from a scanned insurance or property-tax notice for a property management portal. Return ONLY JSON, no markdown, no preamble. Shape:
{"subKind":"Insurance"|"Property Tax"|null,"vendorOrJurisdiction":string|null,"policyType":string|null,"policyNumber":string|null,"renewalDate":"YYYY-MM-DD"|null,"payableFrom":"YYYY-MM-DD"|null,"delinquentAfter":"YYYY-MM-DD"|null,"currentAmount":number|null,"entity":string|null,"propertyAddressGuess":string|null}
"policyType" must be exactly one of this list, or null: ${JSON.stringify(lists.policyType)}.
"entity" must be exactly one of this list, or null: ${JSON.stringify(lists.entity)}.
Never invent a value outside those lists — use null if unsure. If a field isn't present in the document, use null, don't guess.`,
  property_bill: (lists) => `You extract structured data from a scanned utility or property bill for a property management portal. Return ONLY JSON, no markdown, no preamble. Shape:
{"billName":string|null,"vendorPayee":string|null,"amountPaid":number|null,"paymentDate":"YYYY-MM-DD"|null,"category":string|null,"propertyAddressGuess":string|null}
"category" must be exactly one of this list, or null: ${JSON.stringify(lists.billsCategory)}.
Never invent a value outside that list — use null if unsure. If a field isn't present, use null.`,
  llc_compliance: (lists) => `You extract structured data from mail related to an LLC's state compliance (annual report, registered agent, EIN, etc.) for a property management portal. Return ONLY JSON, no markdown, no preamble. Shape:
{"llcNameGuess":string|null,"type":string|null,"dueDate":"YYYY-MM-DD"|null,"dateFiled":"YYYY-MM-DD"|null,"cost":number|null,"confirmationNumber":string|null}
"type" must be exactly one of this list, or null: ${JSON.stringify(lists.complianceType)}.
Never invent a value outside that list — use null if unsure. If a field isn't present, use null.`,
}

/** Calls Claude to pull structured fields out of a document's OCR/summary text.
 *  Returns the parsed object, or null on any failure (never throws). */
export async function extractLinkedFields(doc, kind) {
  if (!ANTH_KEY) return null
  const buildSystemPrompt = SYSTEM_PROMPTS[kind]
  if (!buildSystemPrompt) return null

  const payload = {
    documentType: doc.category || '',
    date: doc.date || '',
    sender: doc.sender || '',
    description: doc.notes || '',
    summary: doc.summary || '',
    text: (doc.ocr || '').slice(0, 6000),
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTH_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: buildSystemPrompt(CLOSED_LISTS),
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    let text = json?.content?.[0]?.text || '{}'
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    return JSON.parse(text)
  } catch {
    return null
  }
}

// ── Fuzzy name matching ──────────────────────────────────────────────────
// No existing equivalent in the codebase — safeStr/safeNum/arr are per-page
// render helpers, not matchers.

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b(llc|inc|co|corp|company|holdings)\b\.?/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Finds the best-matching candidate record for a free-text query.
 * @param {string} query - text to match (e.g. AI-extracted vendor/address/LLC guess)
 * @param {Array} candidates - Airtable records ({id, fields})
 * @param {string|function} nameField - field name to read off each candidate, or a (record) => string accessor
 * @param {{minScore?: number}} opts
 * @returns the best candidate record, or null if nothing clears minScore
 */
export function fuzzyMatchName(query, candidates, nameField, { minScore = 0.5 } = {}) {
  const q = normalizeName(query)
  if (!q || !Array.isArray(candidates)) return null

  let best = null
  let bestScore = 0
  for (const c of candidates) {
    const raw = typeof nameField === 'function' ? nameField(c) : c.fields?.[nameField]
    const n = normalizeName(raw)
    if (!n) continue

    let score
    if (n === q) score = 1
    else if (n.includes(q) || q.includes(n)) score = 0.8
    else {
      const qTokens = new Set(q.split(' ').filter(Boolean))
      const nTokens = new Set(n.split(' ').filter(Boolean))
      const overlap = [...qTokens].filter(t => nTokens.has(t)).length
      const union = new Set([...qTokens, ...nTokens]).size
      score = union ? overlap / union : 0
    }
    if (score > bestScore) { bestScore = score; best = c }
  }
  return bestScore >= minScore ? best : null
}

// ── Documents table field provisioning ───────────────────────────────────
// Mirrors Documents.jsx's ensureDocsFields() — creates the 5 caching fields on
// the Documents table if they don't exist yet.

const LINK_FIELD_DEFS = [
  {
    name: 'Link Kind', type: 'singleSelect',
    options: { choices: [{ name: 'Insurance & Taxes' }, { name: 'Property Bill' }, { name: 'LLC Compliance' }, { name: 'None' }] },
  },
  {
    name: 'Link Status', type: 'singleSelect',
    options: { choices: [{ name: 'Suggested' }, { name: 'Applied' }, { name: 'Dismissed' }, { name: 'No Match' }] },
  },
  { name: 'Link Match', type: 'singleLineText' },
  { name: 'Link Match Record ID', type: 'singleLineText' },
  { name: 'Link Fields', type: 'multilineText' },
]

export async function ensureLinkFields() {
  if (!PAT || !DOCS_BASE_ID) return
  try {
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${DOCS_BASE_ID}/tables`, {
      headers: { Authorization: `Bearer ${PAT}` },
    })
    if (!res.ok) return
    const json = await res.json()
    const table = (json.tables || []).find(t => t.name === 'Documents')
    if (!table) return
    const fieldNames = new Set((table.fields || []).map(f => f.name))
    const creates = LINK_FIELD_DEFS
      .filter(def => !fieldNames.has(def.name))
      .map(def => fetch(`https://api.airtable.com/v0/meta/bases/${DOCS_BASE_ID}/tables/${table.id}/fields`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: def.name, type: def.type, ...(def.options ? { options: def.options } : {}) }),
      }))
    if (creates.length > 0) await Promise.all(creates)
  } catch {
    // Non-fatal — fields may already exist
  }
}
