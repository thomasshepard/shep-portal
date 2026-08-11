// crew-portal — the entire data layer for the separate Happy Cuts Crew Portal
// site (partners see their assigned jobs for the day). See
// /Happy Cuts/crew-portal-design.md in the workspace root for the full design.
//
// This is the ONLY thing that ever holds the Airtable PAT for crew requests —
// the Crew Portal frontend bundle never gets it. Every response is built
// field-by-field per the caller's tier; never spread a raw Airtable record
// into a response.
//
// Auth: deployed WITH jwt verification (no --no-verify-jwt) — caller must be
// a logged-in Supabase user. On top of that, every action requires an active
// row in crew_links for that profile; a valid session alone isn't enough.
//
// Body shape: { action: string, ...payload } — same convention as
// hermes-gateway / bank-dashboard.
//
// Implemented actions (Phase 1): 'me', 'day'.
// Not yet implemented (later phases, see design doc §10): 'complete',
// 'reveal_contact', 'payouts'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const AIRTABLE_PAT     = Deno.env.get('AIRTABLE_PAT')!
const HC_BASE_ID       = Deno.env.get('AIRTABLE_HAPPY_CUTS_BASE_ID')!
const AT_BASE          = `https://api.airtable.com/v0/${HC_BASE_ID}`

const SCHEDULE_TABLE = 'tbli7OArESf2SHL10'
const CONTACTS_TABLE = 'tbl1Y1siC5qV2fX8J'
const CREW_TABLE     = 'tblDqfsBT67Erlwwu'

// Field IDs — mirrors the SF/CF/CRF constants in HappyCuts.jsx. Kept as a
// separate copy per this repo's convention (each consumer owns its field IDs).
const SF = {
  date: 'fldcu9rgNI8REbrE0',
  type: 'fldBt3Ewb6EGd3a4S',
  status: 'fldzyHzszEVZGhs6U',
  amount: 'fldJoKhtQX4MujAOi',
  duration: 'fldsVZmdyFnXAIszv',
  contacts: 'fldemlueed8aZMi7J',
  timePreference: 'fldAc9skq3oOTrjiE',
  scheduledTime: 'fldtwRBQ5DcQ2UQCF',
  sortOrder: 'fldkJxYo2JQZ25lLi',
  assignedTo: 'fldYaLvvamO0dyty9',
  plannedJobMode: 'fldi4YAjhiYa0mXu1',
}
const CF = {
  firstName: 'fldeEuPspHWDbvp7H',
  address: 'fldKeMIk04Z0jDLGB',
  city: 'fldrU58CIWkwZSXdq',
  specInstr: 'fldj6kBhVPzCMaodF',
  accessNotes: 'fldM9YDD9ApacPRB7',
  propertyPhoto: 'fldx5M8F2dZYEz3KO',
}
const CRF = {
  name: 'fldoR81EQ7j0NVq3F',
  soloRate: 'fldPJM8qLFTv3EhFF',
  jointRate: 'flddPnxcvCxxMkmZc',
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function safeStr(val: unknown, fallback = ''): string {
  if (val == null || val === '') return fallback
  if (typeof val === 'object') return (val as any).name || fallback
  return String(val)
}
function safeNum(val: unknown): number | null {
  if (val == null || typeof val === 'object') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}
function mapsUrl(address: string, city: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address} ${city} TN`)}`
}

async function atGet(table: string, query = '') {
  const r = await fetch(`${AT_BASE}/${table}${query}`, { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } })
  const json = await r.json()
  if (!r.ok) throw new Error(json?.error?.message || `Airtable ${table} fetch failed: ${r.status}`)
  return json
}

async function fetchAll(table: string, filterFormula?: string) {
  const records: any[] = []
  let offset: string | null = null
  do {
    let qs = '?returnFieldsByFieldId=true'
    if (filterFormula) qs += `&filterByFormula=${encodeURIComponent(filterFormula)}`
    if (offset) qs += `&offset=${offset}`
    const data = await atGet(table, qs)
    records.push(...(data.records || []))
    offset = data.offset || null
  } while (offset)
  return records
}

// Resolves the caller's JWT to a profile id + their crew_links row.
// Returns null if there's no active crew link — callers should 403.
async function getCrewCaller(req: Request) {
  const authHeader = req.headers.get('authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return null

  const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await authClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return null

  const { data: link, error: linkErr } = await sb
    .from('crew_links')
    .select('*')
    .eq('profile_id', userData.user.id)
    .eq('active', true)
    .maybeSingle()
  if (linkErr || !link) return null

  return { profileId: userData.user.id, email: userData.user.email as string, link }
}

async function handleMe(caller: NonNullable<Awaited<ReturnType<typeof getCrewCaller>>>) {
  const { data: profile } = await sb.from('profiles').select('full_name').eq('id', caller.profileId).maybeSingle()

  const crewRecords = await fetchAll(CREW_TABLE)
  const crewRecord = crewRecords.find(r => r.id === caller.link.airtable_crew_id)
  const name = profile?.full_name || safeStr(crewRecord?.fields?.[CRF.name], caller.email)

  let unpaidBalance: number | null = null
  if (caller.link.access_tier >= 4) {
    // Payout ledger isn't built yet (Phase 4) — omit rather than guess.
    unpaidBalance = null
  }

  return json({ name, tier: caller.link.access_tier, unpaidBalance })
}

function localDateStr(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function handleDay(caller: NonNullable<Awaited<ReturnType<typeof getCrewCaller>>>, requestedDate?: string) {
  const tier = caller.link.access_tier
  const todayLocal = localDateStr(new Date())
  // Validate shape before it ever touches the Airtable filterByFormula string below —
  // an unvalidated value here is a formula-injection surface, not just a bad date.
  let date = (requestedDate && DATE_RE.test(requestedDate)) ? requestedDate : todayLocal

  if (tier < 4) {
    // Tiers 1-3 only ever see today, regardless of what's requested.
    date = todayLocal
  } else {
    // Tier 4: within [today-90d, today+7d].
    const min = localDateStr(new Date(Date.now() - 90 * 86400000))
    const max = localDateStr(new Date(Date.now() + 7 * 86400000))
    if (date < min || date > max) date = todayLocal
  }

  const filter = `AND({${SF.date}}='${date}', NOT({${SF.status}}='Cancelled'))`
  const scheduleRecords = await fetchAll(SCHEDULE_TABLE, filter)

  // Crew match happens here, in code, not in the Airtable formula — a partner
  // can only ever receive jobs where Assigned To contains their own crew id.
  const myJobs = scheduleRecords.filter(r => {
    const assigned: string[] = r.fields?.[SF.assignedTo] || []
    return assigned.includes(caller.link.airtable_crew_id)
  })

  // Fetch only the contacts these specific jobs need — a full Contacts table
  // scan on every call wastes Airtable's 5 req/sec/base budget once more than
  // one or two partners are active.
  const contactIds = [...new Set(myJobs.map(r => (r.fields?.[SF.contacts] || [])[0]).filter(Boolean))]
  const contactRecords = contactIds.length
    ? await fetchAll(CONTACTS_TABLE, `OR(${contactIds.map(id => `RECORD_ID()='${id}'`).join(',')})`)
    : []
  const contactsById = Object.fromEntries(contactRecords.map(r => [r.id, r.fields || {}]))

  let soloRate = 100, jointRate = 100
  if (tier >= 2) {
    const crewRecords = await fetchAll(CREW_TABLE)
    const crewRecord = crewRecords.find(r => r.id === caller.link.airtable_crew_id)
    soloRate = safeNum(crewRecord?.fields?.[CRF.soloRate]) ?? 100
    jointRate = safeNum(crewRecord?.fields?.[CRF.jointRate]) ?? 100
  }

  const jobs = myJobs
    .sort((a, b) => (safeNum(a.fields?.[SF.sortOrder]) ?? 999) - (safeNum(b.fields?.[SF.sortOrder]) ?? 999))
    .map(r => {
      const f = r.fields || {}
      const contactId = (f[SF.contacts] || [])[0]
      const contact = contactId ? contactsById[contactId] : {}
      const address = safeStr(contact?.[CF.address])
      const city = safeStr(contact?.[CF.city])
      const timeLabel = safeStr(f[SF.scheduledTime]) || safeStr(f[SF.timePreference]) || 'Anytime'
      const amount = safeNum(f[SF.amount])
      const mode = safeStr(f[SF.plannedJobMode], 'Solo')
      const rate = mode === 'Joint' ? jointRate : soloRate

      const job: Record<string, unknown> = {
        id: r.id,
        order: safeNum(f[SF.sortOrder]),
        timeLabel,
        serviceType: safeStr(f[SF.type]),
        durationMin: safeNum(f[SF.duration]),
        clientFirstName: safeStr(contact?.[CF.firstName]),
        address,
        city,
        mapUrl: address ? mapsUrl(address, city) : null,
        propertyNotes: safeStr(contact?.[CF.specInstr]) || null,
        accessNotes: safeStr(contact?.[CF.accessNotes]) || null,
        propertyPhotoUrl: contact?.[CF.propertyPhoto]?.[0]?.url || null,
        status: safeStr(f[SF.status]),
      }

      // payout key is entirely absent below tier 2 — not zero, not null.
      if (tier >= 2 && amount != null) {
        job.payout = Math.round((amount * rate) / 100 * 100) / 100
      }

      return job
    })

  return json({ date, jobs })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { action?: string; date?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const caller = await getCrewCaller(req)
  if (!caller) return json({ error: 'Not authorized' }, 403)

  try {
    switch (body.action) {
      case 'me':
        return await handleMe(caller)
      case 'day':
        return await handleDay(caller, body.date)
      case 'complete':
      case 'reveal_contact':
      case 'payouts':
        return json({ error: `${body.action} is not implemented yet (later phase)` }, 501)
      default:
        return json({ error: `Unknown action: ${body.action}` }, 400)
    }
  } catch (err) {
    // Full detail (which can include raw Airtable error text — field/table
    // names, formula content) goes to the function log only. The client only
    // ever gets a generic message, same reasoning as the tier field-building
    // rule above: never hand back more than the caller needs.
    console.error(`crew-portal ${body.action} failed for ${caller.profileId}:`, err)
    return json({ error: 'Something went wrong loading your data. Try again, or tell Thomas if it keeps happening.' }, 500)
  }
})
