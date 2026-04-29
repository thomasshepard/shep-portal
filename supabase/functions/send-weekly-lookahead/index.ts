import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const AIRTABLE_PAT     = Deno.env.get('AIRTABLE_PAT')!
const TASKS_BASE       = 'appYVLCn1NVLevdry'
const TASKS_TABLE      = 'tbl3Di18kSLwEj1vN'
const PM_BASE          = 'appeuX9BHNgVXxdYZ'
const LLC_BASE         = 'appvX3Tu1OGxOZB8k'
const FROM_EMAIL       = 'onboarding@resend.dev'
const PORTAL_URL       = 'https://thomasshepard.github.io/shep-portal/'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function fetchAirtable(baseId: string, table: string, params: Record<string, string> = {}, pat: string): Promise<any[]> {
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const records: any[] = []
  let offset: string | undefined
  do {
    if (offset) url.searchParams.set('offset', offset)
    else url.searchParams.delete('offset')
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${pat}` } })
    if (!res.ok) break
    const json = await res.json()
    records.push(...(json.records || []))
    offset = json.offset
  } while (offset)
  return records
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }

function buildLookaheadHtml(opts: {
  userName: string
  weekLabel: string
  tasks: any[]
  leases: { name: string; daysLeft: number; url: string }[]
  llcs: { name: string; daysLeft: number; url: string }[]
}): string {
  const { userName, weekLabel, tasks, leases, llcs } = opts

  function taskRows() {
    if (!tasks.length) return '<tr><td style="padding:8px 0;font-size:14px;color:#9ca3af;">No tasks due this week</td></tr>'
    return tasks.map(t => {
      const title = t.fields['Title'] || 'Task'
      const due = t.fields['Due Date'] || ''
      return `<tr><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">
        ${title}<span style="color:#9ca3af;font-size:12px;margin-left:8px;">${due}</span>
        <a href="${PORTAL_URL}#/tasks" style="font-size:12px;color:#d97706;text-decoration:none;margin-left:8px;">→</a>
      </td></tr>`
    }).join('')
  }

  function leaseRows() {
    if (!leases.length) return ''
    const rows = leases.map(l => `<tr><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">
      ${l.name}<span style="color:#9ca3af;font-size:12px;margin-left:8px;">${l.daysLeft}d left</span>
      <a href="${PORTAL_URL}#/properties" style="font-size:12px;color:#d97706;text-decoration:none;margin-left:8px;">→</a>
    </td></tr>`).join('')
    return `<tr><td style="padding:16px 0 4px;"><p style="margin:0;font-size:14px;font-weight:600;color:#374151;border-bottom:2px solid #f3f4f6;padding-bottom:6px;">
      Expiring leases <span style="color:#9ca3af;font-weight:400;">(${leases.length})</span></p></td></tr>${rows}`
  }

  function llcRows() {
    if (!llcs.length) return ''
    const rows = llcs.map(l => `<tr><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">
      ${l.name}<span style="color:#9ca3af;font-size:12px;margin-left:8px;">${l.daysLeft}d left</span>
      <a href="${PORTAL_URL}#/llcs" style="font-size:12px;color:#d97706;text-decoration:none;margin-left:8px;">→</a>
    </td></tr>`).join('')
    return `<tr><td style="padding:16px 0 4px;"><p style="margin:0;font-size:14px;font-weight:600;color:#374151;border-bottom:2px solid #f3f4f6;padding-bottom:6px;">
      LLC deadlines <span style="color:#9ca3af;font-weight:400;">(${llcs.length})</span></p></td></tr>${rows}`
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="background:#1e293b;padding:16px 24px;">
          <span style="color:#fff;font-size:16px;font-weight:600;">Shep Portal</span>
          <span style="color:#94a3b8;font-size:13px;margin-left:8px;">Week Ahead · ${weekLabel}</span>
        </td></tr>
        <tr><td style="padding:20px 24px 12px;">
          <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#111827;">Good evening, ${userName}.</p>
          <p style="margin:0;font-size:14px;color:#6b7280;">Here's what's coming up this week.</p>
        </td></tr>
        <tr><td style="padding:0 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:16px 0 4px;"><p style="margin:0;font-size:14px;font-weight:600;color:#374151;border-bottom:2px solid #f3f4f6;padding-bottom:6px;">
              Tasks this week <span style="color:#9ca3af;font-weight:400;">(${tasks.length})</span></p></td></tr>
            ${taskRows()}
            ${leaseRows()}
            ${llcRows()}
          </table>
        </td></tr>
        <tr><td style="padding:20px 24px 24px;">
          <a href="${PORTAL_URL}" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:6px;">Open Portal →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:12px 24px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Shep Portal · Weekly lookahead.
            <a href="${PORTAL_URL}#/notifications/settings" style="color:#9ca3af;">Manage preferences</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // 6-day idempotency (weekly job)
    const { data: lastRun } = await sb.from('cron_runs').select('last_ran_at').eq('job_name', 'send-weekly-lookahead').maybeSingle()
    if (lastRun?.last_ran_at && Date.now() - new Date(lastRun.last_ran_at).getTime() < 6 * 24 * 60 * 60 * 1000) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'ran within 6d' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    await sb.from('cron_runs').upsert({ job_name: 'send-weekly-lookahead', last_ran_at: new Date().toISOString() })

    const today    = new Date()
    const daysUntilMon = (1 - today.getDay() + 7) % 7 || 7
    const nextMon  = addDays(today, daysUntilMon)
    const nextSun  = addDays(nextMon, 6)
    const in14days = addDays(today, 14)
    const nextMonStr  = isoDate(nextMon)
    const nextSunStr  = isoDate(nextSun)
    const in14daysStr = isoDate(in14days)
    const todayStr    = isoDate(today)
    const weekLabel   = `${nextMonStr} – ${nextSunStr}`

    // Get admin users
    const [{ data: adminProfiles }, { data: { users } }, { data: allPrefs }] = await Promise.all([
      sb.from('profiles').select('id').eq('role', 'admin'),
      sb.auth.admin.listUsers(),
      sb.from('notification_preferences').select('user_id,email_enabled,paused_until'),
    ])
    const adminIds = new Set((adminProfiles || []).map((p: any) => p.id))
    const prefsMap = Object.fromEntries((allPrefs || []).map((p: any) => [p.user_id, p]))
    const adminUsers = users.filter(u => adminIds.has(u.id) && u.email)

    // Fetch all tasks, leases, and LLC deadlines in parallel
    const [allTasks, leases, tenants, units, properties, llcs] = await Promise.all([
      fetchAirtable(TASKS_BASE, TASKS_TABLE, {
        filterByFormula: `AND(OR({Status}='To Do',{Status}='In Progress'),{Due Date}>='${nextMonStr}',{Due Date}<='${nextSunStr}')`,
      }, AIRTABLE_PAT),
      fetchAirtable(PM_BASE, 'Lease Agreements', {}, AIRTABLE_PAT),
      fetchAirtable(PM_BASE, 'Tenants', { fields: ['Name'] }, AIRTABLE_PAT),
      fetchAirtable(PM_BASE, 'Rental Units', { fields: ['Name', 'Property'] }, AIRTABLE_PAT),
      fetchAirtable(PM_BASE, 'Property', { fields: ['Name', 'Address'] }, AIRTABLE_PAT),
      fetchAirtable(LLC_BASE, 'LLCs', {}, AIRTABLE_PAT),
    ])

    // Build task map by user
    const tasksByUser: Record<string, any[]> = {}
    for (const t of allTasks) {
      const uid = t.fields['User ID']
      if (uid) { if (!tasksByUser[uid]) tasksByUser[uid] = []; tasksByUser[uid].push(t) }
    }

    // Build expiring leases list (shared for all admins)
    const tenantMap   = Object.fromEntries(tenants.map((t: any) => [t.id, t.fields?.Name || 'Tenant']))
    const unitMap     = Object.fromEntries(units.map((u: any) => [u.id, u]))
    const propMap     = Object.fromEntries(properties.map((p: any) => [p.id, p.fields?.Address || p.fields?.Name || 'Property']))
    const expiringLeases: { name: string; daysLeft: number; url: string }[] = []
    for (const lease of leases) {
      const f = lease.fields
      const endDateStr = f['End Date']
      if (!endDateStr) continue
      const endDate = new Date(endDateStr + 'T12:00:00')
      const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000)
      if (daysLeft < 0 || daysLeft > 14) continue
      const tenantIds: string[] = Array.isArray(f['Tenant']) ? f['Tenant'] : []
      const tenantName = tenantIds.length > 0 ? tenantMap[tenantIds[0]] || 'Tenant' : 'Tenant'
      const unitIds: string[] = Array.isArray(f['Rental Unit']) ? f['Rental Unit'] : []
      let propName = 'Property'
      if (unitIds.length > 0) {
        const unit = unitMap[unitIds[0]]
        const propIds = Array.isArray(unit?.fields?.Property) ? unit.fields.Property : []
        if (propIds.length > 0) propName = propMap[propIds[0]] || propName
      }
      expiringLeases.push({ name: `${tenantName} at ${propName}`, daysLeft, url: '/#/properties' })
    }
    expiringLeases.sort((a, b) => a.daysLeft - b.daysLeft)

    // LLC deadlines
    const upcomingLLCs: { name: string; daysLeft: number; url: string }[] = []
    for (const llc of llcs) {
      const f = llc.fields
      const dueDateStr = f['Annual Report Due Date']
      if (!dueDateStr) continue
      const dueDate = new Date(dueDateStr + 'T12:00:00')
      const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
      if (daysLeft < 0 || daysLeft > 14) continue
      upcomingLLCs.push({ name: f['Name'] || 'LLC', daysLeft, url: '/#/llcs' })
    }
    upcomingLLCs.sort((a, b) => a.daysLeft - b.daysLeft)

    let sentCount = 0

    for (const user of adminUsers) {
      const prefs = prefsMap[user.id] as any
      if (prefs?.email_enabled === false) continue
      if (prefs?.paused_until && new Date(prefs.paused_until) > new Date()) continue

      const userTasks = tasksByUser[user.id] || []
      // Even if no tasks, still send if there are leases or LLC deadlines
      if (!userTasks.length && !expiringLeases.length && !upcomingLLCs.length) continue

      const userName = (user.user_metadata?.full_name as string) || user.email!.split('@')[0]
      const html = buildLookaheadHtml({ userName, weekLabel, tasks: userTasks, leases: expiringLeases, llcs: upcomingLLCs })

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    FROM_EMAIL,
          to:      user.email,
          subject: `[Shep] Week ahead — ${weekLabel}`,
          html,
        }),
      })
      if (res.ok) {
        sentCount++
      } else {
        const err = await res.json().catch(() => ({}))
        console.error('[send-weekly-lookahead] Resend error for', user.email, err)
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: sentCount, week: weekLabel }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[send-weekly-lookahead] Fatal error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
