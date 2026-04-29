import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const AIRTABLE_PAT     = Deno.env.get('AIRTABLE_PAT')!
const TASKS_BASE       = 'appYVLCn1NVLevdry'
const TASKS_TABLE      = 'tbl3Di18kSLwEj1vN'
const FROM_EMAIL       = 'onboarding@resend.dev'
const PORTAL_URL       = 'https://thomasshepard.github.io/shep-portal/'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function fetchAirtableTasks(pat: string): Promise<any[]> {
  const base = `https://api.airtable.com/v0/${TASKS_BASE}/${TASKS_TABLE}`
  const params = new URLSearchParams({
    filterByFormula: "AND(OR({Status}='To Do',{Status}='In Progress'),{Due Date}!='')",
  })
  const records: any[] = []
  let offset: string | undefined
  do {
    if (offset) params.set('offset', offset)
    const res = await fetch(`${base}?${params}`, { headers: { Authorization: `Bearer ${pat}` } })
    if (!res.ok) break
    const json = await res.json()
    records.push(...(json.records || []))
    offset = json.offset
  } while (offset)
  return records
}

const MODULE_LABEL: Record<string, string> = {
  happy_cuts: 'Happy Cuts', properties: 'Properties', incubator: 'Incubator',
  chickens: 'Chickens', documents: 'Docs', llcs: 'LLCs', alerts: 'Alerts', system: 'System',
}

function buildDigestHtml(opts: {
  userName: string
  notifs: any[]
  pastDue: any[]
  dueToday: any[]
  dueTomorrow: any[]
  laterTasks: any[]
  todayStr: string
}): string {
  const { userName, notifs, pastDue, dueToday, dueTomorrow, laterTasks, todayStr } = opts

  function notifRows() {
    if (!notifs.length) return ''
    const rows = notifs.slice(0, 10).map(n => {
      const label = MODULE_LABEL[n.module] || n.module
      const actionHref = n.action_url ? `${PORTAL_URL}${n.action_url.replace(/^\//, '')}` : PORTAL_URL
      const dotColor = n.severity === 'critical' ? '#ef4444' : n.severity === 'action_needed' ? '#f59e0b' : '#9ca3af'
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor};vertical-align:middle;margin-right:6px;"></span>
        <span style="font-size:11px;color:#9ca3af;text-transform:uppercase;">${label}</span><br>
        <span style="color:#111827;font-weight:${n.read ? '400' : '600'};">${n.title}</span>
        ${n.body ? `<br><span style="font-size:13px;color:#6b7280;">${n.body}</span>` : ''}
        ${n.action_url ? `<br><a href="${actionHref}" style="font-size:12px;color:#d97706;text-decoration:none;">View →</a>` : ''}
      </td></tr>`
    }).join('')
    return `<tr><td style="padding:16px 0 6px;"><p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#374151;border-bottom:2px solid #f3f4f6;padding-bottom:6px;">
      Notifications <span style="color:#9ca3af;font-weight:400;">(${notifs.length})</span></p></td></tr>${rows}`
  }

  function taskSection(label: string, tasks: any[], labelColor: string) {
    if (!tasks.length) return ''
    const rows = tasks.map(t => {
      const title = t.fields['Title'] || 'Task'
      const due = t.fields['Due Date'] || ''
      const taskUrl = `${PORTAL_URL}#/tasks`
      return `<tr><td style="padding:5px 0 5px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">
        ${title}<span style="color:#9ca3af;font-size:12px;margin-left:8px;">${due}</span>
        <a href="${taskUrl}" style="font-size:12px;color:#d97706;text-decoration:none;margin-left:8px;">→</a>
      </td></tr>`
    }).join('')
    return `<tr><td style="padding:12px 0 4px;"><p style="margin:0;font-size:13px;font-weight:700;color:${labelColor};">${label}</p></td></tr>${rows}`
  }

  const hasAnything = notifs.length || pastDue.length || dueToday.length || dueTomorrow.length || laterTasks.length
  if (!hasAnything) return ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="background:#1e293b;padding:16px 24px;">
          <span style="color:#fff;font-size:16px;font-weight:600;">Shep Portal</span>
          <span style="color:#94a3b8;font-size:13px;margin-left:8px;">Morning Digest · ${todayStr}</span>
        </td></tr>
        <tr><td style="padding:20px 24px 12px;">
          <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#111827;">Good morning, ${userName}.</p>
          <p style="margin:0;font-size:14px;color:#6b7280;">Here's what's on your plate today.</p>
        </td></tr>
        <tr><td style="padding:0 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${notifRows()}
            ${taskSection('⚠ Past due', pastDue, '#ef4444')}
            ${taskSection('Today', dueToday, '#f59e0b')}
            ${taskSection('Tomorrow', dueTomorrow, '#6b7280')}
            ${taskSection('This week', laterTasks, '#9ca3af')}
          </table>
        </td></tr>
        <tr><td style="padding:20px 24px 24px;">
          <a href="${PORTAL_URL}" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:6px;">Open Portal →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:12px 24px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Shep Portal · Daily digest.
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

    // 12-hour idempotency
    const { data: lastRun } = await sb.from('cron_runs').select('last_ran_at').eq('job_name', 'send-daily-digest').maybeSingle()
    if (lastRun?.last_ran_at && Date.now() - new Date(lastRun.last_ran_at).getTime() < 12 * 60 * 60 * 1000) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'ran within 12h' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    await sb.from('cron_runs').upsert({ job_name: 'send-daily-digest', last_ran_at: new Date().toISOString() })

    const todayStr     = new Date().toISOString().slice(0, 10)
    const tomorrowStr  = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const thisWeekEnd  = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const since48h     = new Date(Date.now() - 48 * 3600000).toISOString()

    // All auth users + prefs
    const [{ data: { users } }, { data: allPrefs }] = await Promise.all([
      sb.auth.admin.listUsers(),
      sb.from('notification_preferences').select('*'),
    ])
    const prefsMap = Object.fromEntries((allPrefs || []).map((p: any) => [p.user_id, p]))

    // All active tasks from Airtable, grouped by User ID
    const allTasks = await fetchAirtableTasks(AIRTABLE_PAT)
    const tasksByUser: Record<string, any[]> = {}
    for (const t of allTasks) {
      const uid = t.fields['User ID']
      if (uid) {
        if (!tasksByUser[uid]) tasksByUser[uid] = []
        tasksByUser[uid].push(t)
      }
    }

    let sentCount = 0
    const errors: string[] = []

    for (const user of users) {
      if (!user.email) continue
      const prefs = prefsMap[user.id] as any

      if (prefs?.email_enabled === false) continue
      if (prefs?.paused_until && new Date(prefs.paused_until) > new Date()) continue

      // Unread notifications from last 48h
      const { data: notifs } = await sb.from('notifications')
        .select('id,title,body,module,severity,action_url,read,created_at')
        .eq('user_id', user.id)
        .eq('dismissed', false)
        .gte('created_at', since48h)
        .order('created_at', { ascending: false })
        .limit(20)

      const userTasks   = tasksByUser[user.id] || []
      const pastDue     = userTasks.filter(t => t.fields['Due Date'] < todayStr)
      const dueToday    = userTasks.filter(t => t.fields['Due Date'] === todayStr)
      const dueTomorrow = userTasks.filter(t => t.fields['Due Date'] === tomorrowStr)
      const laterTasks  = userTasks.filter(t => {
        const d = t.fields['Due Date']
        return d > tomorrowStr && d <= thisWeekEnd
      })

      if (!notifs?.length && !pastDue.length && !dueToday.length && !dueTomorrow.length && !laterTasks.length) continue

      const userName = (user.user_metadata?.full_name as string) || user.email.split('@')[0]
      const html = buildDigestHtml({ userName, notifs: notifs || [], pastDue, dueToday, dueTomorrow, laterTasks, todayStr })
      if (!html) continue

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    FROM_EMAIL,
          to:      user.email,
          subject: `[Shep] Morning digest — ${todayStr}`,
          html,
        }),
      })
      if (res.ok) {
        sentCount++
      } else {
        const err = await res.json().catch(() => ({}))
        console.error('[send-daily-digest] Resend error for', user.email, err)
        errors.push(user.email)
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: sentCount, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[send-daily-digest] Fatal error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
