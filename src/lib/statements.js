// Credit-card statement parsing engine for the Finances page.
//
// Responsibilities:
//   - parseCSV: small RFC-4180 CSV parser (no external lib)
//   - per-issuer adapters: map each bank's columns -> a normalized row shape
//   - detectIssuerFromCardName / issuer config (login + download links, steps)
//   - categorize / normalizeMerchant / dedup key helpers
//
// Normalized amount sign convention (matches the Airtable Transactions table):
//   negative = spending (a charge), positive = payment / credit / refund.
//
// No transaction data ever leaves the browser here — parsing is fully local.

export const CC_BASE_ID = 'appEzmb0zR7DIPiG4'
export const TX_TABLE = 'Transactions'
export const CARDS_TABLE = 'Credit Cards'

// ── CSV parsing ───────────────────────────────────────────

/** Parse CSV text into an array of string-arrays. Handles quoted fields,
 *  escaped quotes (""), embedded commas/newlines, and a leading BOM. */
export function parseCSV(text) {
  const rows = []
  let cur = []
  let field = ''
  let inQuotes = false
  const s = String(text).replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      cur.push(field); field = ''
    } else if (c === '\r') {
      // ignore — handled by \n
    } else if (c === '\n') {
      cur.push(field); rows.push(cur); cur = []; field = ''
    } else {
      field += c
    }
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur) }
  // drop fully-empty rows
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''))
}

// ── Value helpers ─────────────────────────────────────────

/** Parse a currency-ish string to a number. ("$1,234.56" -> 1234.56,
 *  "($50.00)" -> -50, "-50" -> -50). Returns NaN if unparseable. */
export function parseAmount(val) {
  if (val == null) return NaN
  let s = String(val).trim()
  if (!s) return NaN
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  s = s.replace(/[$,\s]/g, '')
  if (s.startsWith('-')) { neg = true; s = s.slice(1) }
  if (s.startsWith('+')) s = s.slice(1)
  const n = Number(s)
  if (Number.isNaN(n)) return NaN
  return neg ? -n : n
}

/** Normalize a date string to ISO YYYY-MM-DD. Accepts M/D/YYYY, M/D/YY,
 *  YYYY-MM-DD, and a few common variants. Returns '' if unparseable. */
export function parseDate(val) {
  if (!val) return ''
  const s = String(val).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) // ISO
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/) // US M/D/Y
  if (m) {
    let [, mo, d, y] = m
    if (y.length === 2) y = (Number(y) > 70 ? '19' : '20') + y
    return `${y}-${pad(mo)}-${pad(d)}`
  }
  const dt = new Date(s)
  if (!Number.isNaN(dt.getTime())) {
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  }
  return ''
}

function pad(n) { return String(n).padStart(2, '0') }

/** Convert header+data rows into array of {header: value} objects. */
function objectify(rows) {
  if (!rows.length) return []
  const header = rows[0].map((h) => String(h).trim())
  return rows.slice(1).map((r) => {
    const o = {}
    header.forEach((h, i) => { o[h] = r[i] != null ? String(r[i]).trim() : '' })
    return o
  })
}

/** Case/space-insensitive getter across possible column names. */
function pick(obj, ...names) {
  const keys = Object.keys(obj)
  for (const want of names) {
    const k = keys.find((k) => k.toLowerCase().replace(/[\s.]/g, '') === want.toLowerCase().replace(/[\s.]/g, ''))
    if (k != null) return obj[k]
  }
  return ''
}

// ── Merchant / category logic ─────────────────────────────

/** Clean a raw description into a display merchant name. */
export function normalizeMerchant(desc) {
  if (!desc) return ''
  let s = String(desc).trim().replace(/\s+/g, ' ')
  // strip trailing reference/store numbers and state tails
  s = s.replace(/\s+#?\d{3,}$/, '')
  s = s.replace(/\s+[A-Z]{2}$/, '') // trailing state code
  return s.slice(0, 60).trim()
}

/** Lowercased key for dedup/grouping (more aggressive than display). */
export function merchantKey(desc) {
  return String(desc || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\b\d+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

const CATEGORY_RULES = [
  [/netflix|spotify|hulu|disney\+?|hbo|max\b|youtube ?premium|paramount|peacock|apple ?(music|tv|one|icloud)|prime ?video|audible|patreon|substack|adobe|microsoft ?365|dropbox|notion|chatgpt|openai|anthropic|claude|google ?(storage|one)|canva|gym|planet ?fit|crunch|membership/i, 'Subscriptions'],
  [/grocery|kroger|publix|aldi|trader ?joe|whole ?foods|safeway|wegmans|food ?lion|harris ?teeter|costco|sam'?s ?club|walmart ?(super|groc)/i, 'Groceries'],
  [/restaurant|cafe|coffee|starbucks|dunkin|mcdonald|chick|chipotle|taco|pizza|grill|kitchen|diner|bar ?&|doordash|grubhub|uber ?eats|wingstop|panera|subway|wendy|burger/i, 'Restaurants'],
  [/shell|exxon|chevron|bp\b|marathon|speedway|circle ?k|sunoco|valero|quiktrip|wawa|gas\b|fuel/i, 'Gas'],
  [/airline|airlines|delta|united|american ?air|southwest|jetblue|hotel|marriott|hilton|hyatt|airbnb|expedia|booking\.?com|rental ?car|hertz|enterprise|uber\b|lyft|airport/i, 'Travel'],
  [/amazon|amzn|target|ebay|etsy|best ?buy|home ?depot|lowe'?s|walmart|wayfair|nike|apple ?store|store/i, 'Shopping'],
  [/electric|water|sewer|gas ?company|utility|comcast|xfinity|spectrum|at&t|verizon|t-?mobile|internet|power|energy/i, 'Utilities'],
  [/insurance|geico|progressive|state ?farm|allstate|nationwide|liberty ?mutual/i, 'Insurance'],
  [/pharmacy|cvs|walgreens|doctor|medical|dental|hospital|clinic|health|vision/i, 'Health'],
  [/cinema|movie|amc|regal|theater|steam|playstation|xbox|nintendo|ticketmaster|concert|game/i, 'Entertainment'],
  [/auto|car ?wash|jiffy|oil ?change|autozone|o'?reilly|napa|tire|mechanic|dmv/i, 'Auto'],
  [/interest|finance ?charge|annual ?fee|late ?fee|foreign ?transaction|cash ?advance/i, 'Fees & Interest'],
]

// Map issuer-provided category strings onto our canonical set.
const ISSUER_CAT_MAP = {
  'supermarkets': 'Groceries', 'groceries': 'Groceries', 'merchandise': 'Shopping',
  'gasoline': 'Gas', 'gas': 'Gas', 'restaurants': 'Restaurants', 'dining': 'Restaurants',
  'travel': 'Travel', 'airfare': 'Travel', 'lodging': 'Travel', 'services': 'Other',
  'medical services': 'Health', 'health & wellness': 'Health', 'entertainment': 'Entertainment',
  'department stores': 'Shopping', 'warehouse clubs': 'Groceries', 'home': 'Home',
  'home improvement': 'Home', 'utilities': 'Utilities', 'phone/cable': 'Utilities',
  'automotive': 'Auto', 'gas/automotive': 'Gas', 'fee/interest charge': 'Fees & Interest',
  'payment/credit': 'Payment', 'payments and credits': 'Payment', 'awards and rebate credits': 'Income/Credit',
}

/** Decide a canonical category. */
export function categorize(rawDescription, issuerCategory, amount, type) {
  if (type === 'Payment') return 'Payment'
  if (issuerCategory) {
    const mapped = ISSUER_CAT_MAP[String(issuerCategory).trim().toLowerCase()]
    if (mapped) return mapped
  }
  const desc = String(rawDescription || '')
  if (/payment|autopay|online ?pmt|thank ?you/i.test(desc) && amount > 0) return 'Payment'
  for (const [re, cat] of CATEGORY_RULES) if (re.test(desc)) return cat
  if (amount > 0) return 'Income/Credit'
  return 'Other'
}

function deriveType(amount, rawDescription, explicit) {
  if (explicit) {
    const t = explicit.toLowerCase()
    if (t.includes('payment')) return 'Payment'
    if (t.includes('fee')) return 'Fee'
    if (t.includes('return') || t.includes('credit') || t.includes('refund')) return 'Credit'
    if (t.includes('sale') || t.includes('purchase') || t.includes('debit')) return 'Sale'
  }
  if (/payment|autopay|thank ?you/i.test(rawDescription || '') && amount > 0) return 'Payment'
  if (/fee|interest/i.test(rawDescription || '')) return 'Fee'
  return amount > 0 ? 'Credit' : 'Sale'
}

/** Turn a partial normalized row into the full shape used everywhere. */
function finalize({ date, rawDescription, amount, issuerCategory = '', type: rawType = '' }) {
  const type = deriveType(amount, rawDescription, rawType)
  return {
    date,
    merchant: normalizeMerchant(rawDescription),
    rawDescription: String(rawDescription || '').slice(0, 250),
    amount: Math.round(amount * 100) / 100,
    category: categorize(rawDescription, issuerCategory, amount, type),
    type,
  }
}

// ── Per-issuer adapters ───────────────────────────────────
// Each adapter: { detect(headerLower[]) -> bool, parse(rows) -> partialRow[] }
// `rows` is the raw parseCSV output (incl. header for header-based banks).

function debitCreditAmount(debit, credit) {
  const d = parseAmount(debit)
  const c = parseAmount(credit)
  if (!Number.isNaN(c) && c !== 0) return Math.abs(c)   // credit -> positive
  if (!Number.isNaN(d) && d !== 0) return -Math.abs(d)  // debit  -> negative
  return 0
}

const ADAPTERS = {
  Discover: {
    detect: (h) => h.includes('trans. date') && h.includes('amount') && (h.includes('post date') || h.includes('category')),
    parse: (rows) => objectify(rows).map((o) => ({
      date: parseDate(pick(o, 'Trans. Date', 'Transaction Date')),
      rawDescription: pick(o, 'Description'),
      amount: -parseAmount(pick(o, 'Amount')), // Discover: + = charge -> flip to spending-negative
      issuerCategory: pick(o, 'Category'),
    })),
  },
  Chase: {
    detect: (h) => h.includes('transaction date') && h.includes('amount') && (h.includes('post date') || h.includes('type')),
    parse: (rows) => objectify(rows).map((o) => ({
      date: parseDate(pick(o, 'Transaction Date', 'Posting Date')),
      rawDescription: pick(o, 'Description'),
      amount: parseAmount(pick(o, 'Amount')), // Chase already: - = spend, + = payment
      issuerCategory: pick(o, 'Category'),
      type: pick(o, 'Type'),
    })),
  },
  'American Express': {
    detect: (h) => h.includes('date') && h.includes('description') && h.includes('amount') && !h.includes('debit') && !h.includes('trans. date') && !h.includes('transaction date'),
    parse: (rows) => objectify(rows).map((o) => ({
      date: parseDate(pick(o, 'Date')),
      rawDescription: pick(o, 'Description'),
      amount: -parseAmount(pick(o, 'Amount')), // Amex: + = charge -> flip
      issuerCategory: pick(o, 'Category'),
    })),
  },
  'Capital One': {
    detect: (h) => h.includes('debit') && h.includes('credit') && (h.includes('transaction date') || h.includes('posted date')),
    parse: (rows) => objectify(rows).map((o) => ({
      date: parseDate(pick(o, 'Transaction Date', 'Posted Date')),
      rawDescription: pick(o, 'Description'),
      amount: debitCreditAmount(pick(o, 'Debit'), pick(o, 'Credit')),
      issuerCategory: pick(o, 'Category'),
    })),
  },
  Citi: {
    detect: (h) => h.includes('debit') && h.includes('credit') && h.includes('status'),
    parse: (rows) => objectify(rows).map((o) => ({
      date: parseDate(pick(o, 'Date')),
      rawDescription: pick(o, 'Description'),
      amount: debitCreditAmount(pick(o, 'Debit'), pick(o, 'Credit')),
    })),
  },
  'Bank of America': {
    detect: (h) => h.includes('posted date') && h.includes('payee') && h.includes('amount'),
    parse: (rows) => objectify(rows)
      .filter((o) => !/beginning balance/i.test(pick(o, 'Payee')))
      .map((o) => ({
        date: parseDate(pick(o, 'Posted Date')),
        rawDescription: pick(o, 'Payee'),
        amount: parseAmount(pick(o, 'Amount')), // BoA: - = spend
      })),
  },
  'Apple Card': {
    detect: (h) => h.some((c) => c.includes('amount (usd)')) && h.includes('merchant'),
    parse: (rows) => objectify(rows).map((o) => ({
      date: parseDate(pick(o, 'Transaction Date')),
      rawDescription: pick(o, 'Merchant') || pick(o, 'Description'),
      amount: -parseAmount(pick(o, 'Amount (USD)')), // Apple: + = purchase -> flip
      issuerCategory: pick(o, 'Category'),
      type: pick(o, 'Type'),
    })),
  },
  'US Bank': {
    detect: (h) => h.includes('date') && h.includes('transaction') && h.includes('name') && h.includes('amount'),
    parse: (rows) => objectify(rows).map((o) => ({
      date: parseDate(pick(o, 'Date')),
      rawDescription: pick(o, 'Name'),
      amount: parseAmount(pick(o, 'Amount')), // US Bank: - = spend
      type: pick(o, 'Transaction'),
    })),
  },
  PayPal: {
    detect: (h) => h.includes('date') && h.includes('gross') && h.includes('name'),
    parse: (rows) => objectify(rows).map((o) => ({
      date: parseDate(pick(o, 'Date')),
      rawDescription: pick(o, 'Name') || pick(o, 'Type'),
      amount: parseAmount(pick(o, 'Gross')), // PayPal: - = money out
      type: pick(o, 'Type'),
    })),
  },
  'Wells Fargo': {
    // Wells Fargo exports have NO header row: Date, Amount, "*", "", Description
    detect: () => false, // detected structurally / by issuer hint, not by header
    parse: (rows) => rows
      .filter((r) => r.length >= 5 && parseDate(r[0]))
      .map((r) => ({
        date: parseDate(r[0]),
        rawDescription: r[4],
        amount: parseAmount(r[1]), // WF: - = spend
      })),
  },
}

// ── Issuer registry (links + checklist steps) ─────────────

const GENERIC_STEPS = [
  'Log in and open the card\'s Activity / Transactions page.',
  'Set the date range (e.g. last statement or last month).',
  'Choose Download / Export and select CSV.',
  'Save the file, then upload it below.',
]

export const ISSUERS = {
  Discover: { steps: ['Open Activity & Statements.', 'Under "Show me", pick a date range.', 'Click Download → choose CSV → Download.', 'Upload the file below.'] },
  Chase: { steps: ['Open the card → "See activity".', 'Click the download icon (top-right of activity).', 'Choose a date range, file type CSV (Spreadsheet).', 'Download, then upload below.'] },
  'American Express': { steps: ['Open Statements & Activity.', 'Pick a statement period or custom range.', 'Click Download → CSV.', 'Upload below.'] },
  'Capital One': { steps: ['Open the account → View Transactions.', 'Click "Download Transactions".', 'Select a date range and CSV format.', 'Upload below.'] },
  Citi: { steps: ['Open Account Activity.', 'Click the download/export icon.', 'Pick CSV and a date range.', 'Upload below.'] },
  'Bank of America': { steps: ['Open the card → Statements & Activity.', 'Click "Download".', 'Choose "Microsoft Excel format (CSV)".', 'Upload below.'] },
  'Apple Card': { steps: ['On iPhone: Wallet → Apple Card → Card Balance.', 'Tap a month → Export Transactions (CSV).', 'AirDrop / email the file to this computer.', 'Upload below.'] },
  'US Bank': { steps: ['Open the card → Transactions.', 'Click "Download transactions".', 'Choose CSV and a date range.', 'Upload below.'] },
  PayPal: { steps: ['Open Activity → Statements / Download.', 'Pick a date range, type "Balance affecting", CSV.', 'Create & download the report.', 'Upload below.'] },
  'Wells Fargo': { steps: ['Open the account → Download Account Activity.', 'Choose "Comma Delimited (.csv)".', 'Pick a date range and Download.', 'Upload below (no header row — that\'s expected).'] },
  Synchrony: { steps: GENERIC_STEPS },
  Other: { steps: GENERIC_STEPS },
}

/** Map a card's display name to a canonical issuer key. */
export function detectIssuerFromCardName(name) {
  const n = String(name || '').toLowerCase()
  if (n.includes('discover')) return 'Discover'
  if (n.includes('chase')) return 'Chase'
  if (n.includes('amazon prime store') || n.includes('synchrony')) return 'Synchrony'
  if (n.includes('amazon')) return 'Chase' // Chase Amazon card
  if (n.includes('american express') || n.includes('amex')) return 'American Express'
  if (n.includes('capitalone') || n.includes('capital one')) return 'Capital One'
  if (n.includes('citi')) return 'Citi'
  if (n.includes('bank of america') || n.includes('bofa')) return 'Bank of America'
  if (n.includes('wells fargo')) return 'Wells Fargo'
  if (n.includes('apple')) return 'Apple Card'
  if (n.includes('us bank') || n.includes('u.s. bank')) return 'US Bank'
  if (n.includes('paypal')) return 'PayPal'
  return 'Other'
}

/** Extract the last-4 (or last-N) digits from a card name for the dedup key. */
export function cardTail(name) {
  const matches = String(name || '').match(/\d{4,6}/g)
  return matches ? matches[matches.length - 1] : ''
}

export function makeDedupKey(tail, date, amount, rawDescription) {
  return `${tail}|${date}|${amount.toFixed(2)}|${merchantKey(rawDescription)}`
}

// ── Public entry points ───────────────────────────────────

/** Parse a CSV file's text into normalized rows.
 *  issuerHint (from the selected card) is tried first; falls back to header
 *  detection; if nothing matches, returns { needsMapping, headers, rawRows }. */
export function processStatement(text, issuerHint) {
  const rows = parseCSV(text)
  if (!rows.length) return { ok: false, error: 'File is empty or unreadable.' }

  const headerLower = rows[0].map((c) => String(c).toLowerCase().trim())

  // 1. Try the issuer implied by the selected card.
  const tryIssuer = (issuer) => {
    const a = ADAPTERS[issuer]
    if (!a) return null
    try {
      const parsed = a.parse(rows).filter((r) => r.date && !Number.isNaN(r.amount))
      return parsed.length ? { issuer, rows: parsed.map(finalize) } : null
    } catch { return null }
  }

  if (issuerHint) {
    const r = tryIssuer(issuerHint)
    if (r) return { ok: true, ...r }
  }

  // 2. Header-signature detection across all adapters.
  for (const [issuer, a] of Object.entries(ADAPTERS)) {
    if (a.detect(headerLower)) {
      const r = tryIssuer(issuer)
      if (r) return { ok: true, ...r }
    }
  }

  // 3. Unknown — hand back to the manual column-mapping UI.
  const hasHeader = headerLower.some((c) => /date|description|amount|payee|merchant/.test(c))
  return {
    ok: false,
    needsMapping: true,
    headers: hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`),
    rawRows: hasHeader ? rows.slice(1) : rows,
  }
}

/** Build normalized rows from a manual column mapping.
 *  map = { dateCol, descCol, amountCol, spendingIsPositive } (column indexes). */
export function applyManualMapping(rawRows, map) {
  const out = []
  for (const r of rawRows) {
    const date = parseDate(r[map.dateCol])
    let amount = parseAmount(r[map.amountCol])
    if (!date || Number.isNaN(amount)) continue
    if (map.spendingIsPositive) amount = -amount // flip so spending is negative
    out.push(finalize({ date, rawDescription: r[map.descCol], amount }))
  }
  return out
}
