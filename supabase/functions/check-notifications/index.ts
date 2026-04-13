import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Airtable base IDs (hardcoded — see CLAUDE.md for base ID notes)
const CHICKENS_BASE = 'apppIiT84EaowkQVR'
const PM_BASE       = 'appeuX9BHNgVXxdYZ'
const HC_BASE       = 'appZOi48qf8SzyOml'
const LLC_BASE      = 'appvX3Tu1OGxOZB8k'

// Airtable table names
const BATCHES_TABLE       = 'tblKomWeHkj9aGFDC'
const SCHEDULE_TABLE      = 'tbli7OArESf2SHL10'
const LLC_TABLE           = 'LLCs'
const LEASES_TABLE        = 'Lease Agreements'
const TENANTS_TABLE       = 'Tenants'
const RENTAL_UNITS_TABLE  = 'Rental Units'
const PROPERTY_TABLE      = 'Property'

// Happy Cuts Schedule field IDs
const HC_INV_STATUS  = 'fldhiIRXuRlvp3QXO'
const HC_CLIENT_NAME = 'fldjSJ0x5rJ3S0FYm'
const HC_AMOUNT      = 'fldJoKhtQX4MujAOi'
const HC_MOW_DATE    = 'fldcu9rgNI8REbrE0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchAirtable(baseId: string, tableIdOrName: string, params: Record<string, string> = {}, pat: string) {
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableIdOrName)}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const records: any[] = []
  let offset: string | undefined

  do {
    if (offset) url.searchParams.set('offset', offset)
    else url.searchParams.delete('offset')
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${pat}` } })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Airtable error (${tableIdOrName}): ${err?.error?.message || res.status}`)
    }
    const json = await res.json()
    records.push(...(json.records || []))
    offset = json.offset
  } while (offset)

  return records
}

async function insertIfNew(sb: any, record: object): Promise<boolean> {
  const r = record as any
  if (r.source_key) {
    const { data: existing } = await sb
      .from('notifications')
      .select('id')
      .eq('source_key', r.source_key)
      .limit(1)
    if (existing && existing.length > 0) return false
  }
  const { error } = await sb.from('notifications').insert(record)
  if (error) console.error('[check-notifications] Insert error:', error, record)
  return !error
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

// ── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl      = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const airtablePat      = Deno.env.get('AIRTABLE_PAT')!

    const sb = createClient(supabaseUrl, serviceRoleKey)

    // Fetch admin user IDs
    const { data: adminProfiles } = await sb.from('profiles').select('id').eq('role', 'admin')
    const adminIds: string[] = (adminProfiles || []).map((r: any) => r.id)

    // Fetch users with can_view_chickens
    const { data: chickenProfiles } = await sb.from('profiles').select('id').eq('can_view_chickens', true)
    const chickenUserIds: string[] = [...new Set([
      ...adminIds,
      ...(chickenProfiles || []).map((r: any) => r.id),
    ])]

    // Fetch users with can_view_properties
    const { data: propProfiles } = await sb.from('profiles').select('id').eq('can_view_properties', true)
    const propUserIds: string[] = [...new Set([
      ...adminIds,
      ...(propProfiles || []).map((r: any) => r.id),
    ])]

    const today = new Date()
    today.setHours(12, 0, 0, 0)

    let totalInserted = 0
    let batchCount = 0, mowCount = 0, leaseCount = 0, llcCount = 0

    const results = await Promise.allSettled([

      // ── Incubator ───────────────────────────────────────────────────────────
      (async () => {
        const batches = await fetchAirtable(CHICKENS_BASE, BATCHES_TABLE, {
          filterByFormula: "{Status} = 'Active'",
        }, airtablePat)
        batchCount = batches.length

        for (const batch of batches) {
          const f = batch.fields
          const setDateStr = f['Set Date']
          if (!setDateStr) continue

          const setDate = new Date(setDateStr + 'T12:00:00')
          const day = Math.floor((today.getTime() - setDate.getTime()) / 86400000) + 1
          const d7done  = (f['Day 7 Developing'] || 0) > 0 || (f['Day 7 Removed'] || 0) > 0
          const d14done = (f['Day 14 Developing'] || 0) > 0 || (f['Day 14 Removed'] || 0) > 0
          const batchName = f['Batch Name'] || 'Incubator batch'

          const notifs: { key: string; days: number; title: string; body: string; expires: Date }[] = []

          if (day >= 7 && !d7done) {
            notifs.push({ key: `incubator:candle7_due:${batch.id}`, days: 3,
              title: `Candle Day 7 — ${batchName}`,
              body: 'Check egg development and remove any clears',
              expires: addDays(today, 3) })
          }
          if (day >= 14 && !d14done) {
            notifs.push({ key: `incubator:candle14_due:${batch.id}`, days: 3,
              title: `Candle Day 14 — ${batchName}`,
              body: 'Check development and prep for lockdown',
              expires: addDays(today, 3) })
          }
          if (day >= 18 && day <= 19) {
            notifs.push({ key: `incubator:lockdown_due:${batch.id}`, days: 2,
              title: `Lockdown today — ${batchName}`,
              body: "Stop turning eggs. Raise humidity to 65–70% RH. Don't open lid.",
              expires: addDays(today, 2) })
          }
          if (day > 21 && !(f['Chicks Hatched'] > 0)) {
            notifs.push({ key: `incubator:recordhatch_due:${batch.id}`, days: 7,
              title: `Record hatch results — ${batchName}`,
              body: 'Hatch window has passed. Log your results.',
              expires: addDays(today, 7) })
          }

          for (const n of notifs) {
            for (const uid of chickenUserIds) {
              const inserted = await insertIfNew(sb, {
                user_id:    uid,
                title:      n.title,
                body:       n.body,
                module:     'incubator',
                severity:   'action_needed',
                action_url: '/#/chickens',
                source_key: `${n.key}:${uid}`,
                expires_at: n.expires.toISOString(),
              })
              if (inserted) totalInserted++
            }
          }
        }
      })(),

      // ── Happy Cuts — overdue invoices ────────────────────────────────────────
      (async () => {
        const mows = await fetchAirtable(HC_BASE, SCHEDULE_TABLE, {
          filterByFormula: `{${HC_INV_STATUS}} = 'Sent'`,
        }, airtablePat)
        mowCount = mows.length

        const sevenDaysAgo = new Date(today)
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        for (const mow of mows) {
          const f = mow.fields
          const mowDateStr = f[HC_MOW_DATE]
          if (!mowDateStr) continue
          const mowDate = new Date(mowDateStr + 'T12:00:00')
          if (mowDate > sevenDaysAgo) continue // not yet overdue

          const clientName = Array.isArray(f[HC_CLIENT_NAME]) ? f[HC_CLIENT_NAME][0] : (f[HC_CLIENT_NAME] || 'Client')
          const amount = f[HC_AMOUNT] || 0
          const daysAgo = Math.floor((today.getTime() - mowDate.getTime()) / 86400000)

          for (const uid of adminIds) {
            const inserted = await insertIfNew(sb, {
              user_id:    uid,
              title:      `Invoice overdue — ${clientName}`,
              body:       `$${amount} sent ${daysAgo} days ago`,
              module:     'happy_cuts',
              severity:   'action_needed',
              action_url: '/#/happy-cuts',
              source_key: `hc:invoice_overdue:${mow.id}:${uid}`,
              expires_at: null,
            })
            if (inserted) totalInserted++
          }
        }
      })(),

      // ── Properties — expiring leases ─────────────────────────────────────────
      (async () => {
        const [leases, tenants, units, properties] = await Promise.all([
          fetchAirtable(PM_BASE, LEASES_TABLE, {}, airtablePat),
          fetchAirtable(PM_BASE, TENANTS_TABLE, { fields: ['Name'] }, airtablePat),
          fetchAirtable(PM_BASE, RENTAL_UNITS_TABLE, { fields: ['Name', 'Property'] }, airtablePat),
          fetchAirtable(PM_BASE, PROPERTY_TABLE, { fields: ['Name', 'Address'] }, airtablePat),
        ])
        leaseCount = leases.length

        const tenantMap = Object.fromEntries(tenants.map((t: any) => [t.id, t.fields?.Name || 'Tenant']))
        const unitMap   = Object.fromEntries(units.map((u: any) => [u.id, u]))
        const propMap   = Object.fromEntries(properties.map((p: any) => [p.id, p.fields?.Address || p.fields?.Name || 'Property']))

        const in30 = new Date(today); in30.setDate(in30.getDate() + 30)
        const in7  = new Date(today); in7.setDate(in7.getDate() + 7)

        const activeStatuses = ['active', 'Active', 'Month-to-Month', 'month-to-month']

        for (const lease of leases) {
          const f = lease.fields
          const status = (f['Status'] || '').toLowerCase()
          if (!activeStatuses.some(s => s.toLowerCase() === status) && status !== '') {
            // Skip obviously inactive leases — but if Status is empty, check dates anyway
            if (status && !['active', 'month-to-month'].includes(status)) continue
          }

          const endDateStr = f['End Date']
          if (!endDateStr) continue
          const endDate = new Date(endDateStr + 'T12:00:00')
          if (endDate < today) continue // already expired

          const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000)
          if (daysLeft > 30) continue

          // Build display names
          const tenantIds: string[] = Array.isArray(f['Tenant']) ? f['Tenant'] : []
          const tenantName = tenantIds.length > 0 ? (tenantMap[tenantIds[0]] || 'Tenant') : 'Tenant'

          const unitIds: string[] = Array.isArray(f['Rental Unit']) ? f['Rental Unit'] : []
          let propName = 'Property'
          if (unitIds.length > 0) {
            const unit = unitMap[unitIds[0]]
            const propIds: string[] = Array.isArray(unit?.fields?.Property) ? unit.fields.Property : []
            if (propIds.length > 0) propName = propMap[propIds[0]] || propName
          }

          const severity  = daysLeft <= 7 ? 'critical' : 'action_needed'
          const sourceTag = daysLeft <= 7 ? 'lease_expiring_7' : 'lease_expiring_30'

          for (const uid of propUserIds) {
            const inserted = await insertIfNew(sb, {
              user_id:    uid,
              title:      `Lease expiring in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
              body:       `${tenantName} at ${propName}`,
              module:     'properties',
              severity,
              action_url: '/#/properties',
              source_key: `prop:${sourceTag}:${lease.id}:${uid}`,
              expires_at: endDate.toISOString(),
            })
            if (inserted) totalInserted++
          }
        }
      })(),

      // ── LLCs — compliance deadlines ──────────────────────────────────────────
      (async () => {
        const llcs = await fetchAirtable(LLC_BASE, LLC_TABLE, {}, airtablePat)
        llcCount = llcs.length

        const in30 = new Date(today); in30.setDate(in30.getDate() + 30)

        for (const llc of llcs) {
          const f = llc.fields
          const dueDateStr = f['Annual Report Due Date']
          if (!dueDateStr) continue
          const dueDate = new Date(dueDateStr + 'T12:00:00')
          if (dueDate < today || dueDate > in30) continue

          const daysLeft   = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
          const entityName = f['Name'] || 'LLC'

          for (const uid of adminIds) {
            const inserted = await insertIfNew(sb, {
              user_id:    uid,
              title:      `LLC compliance due — ${entityName}`,
              body:       `Due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
              module:     'llcs',
              severity:   'action_needed',
              action_url: '/#/llcs',
              source_key: `llc:compliance_due:${llc.id}:${uid}`,
              expires_at: dueDate.toISOString(),
            })
            if (inserted) totalInserted++
          }
        }
      })(),
    ])

    // Log any module failures
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[check-notifications] Module ${i} failed:`, r.reason)
      }
    })

    return new Response(JSON.stringify({
      ok: true,
      checked: { incubator: batchCount, happy_cuts: mowCount, properties: leaseCount, llcs: llcCount },
      notifications_created: totalInserted,
      ran_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[check-notifications] Fatal error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
