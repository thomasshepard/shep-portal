import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const AIRTABLE_PAT     = Deno.env.get('AIRTABLE_PAT')!

const FROM_EMAIL = 'onboarding@resend.dev'
const PORTAL_URL = 'https://thomasshepard.github.io/shep-portal/'

const TASKS_BASE  = 'appYVLCn1NVLevdry'
const TASKS_TABLE = 'tbl3Di18kSLwEj1vN'

// Field IDs (must match src/lib/tasks.js)
const F_TITLE        = 'fldx2xmuxOVDls72i'
const F_STATUS       = 'fldWNIkplM2WKr0kq'
const F_DUE_DATE     = 'fldLxGJRu1XeK4z7t'
const F_MODULE       = 'fldR1DLAM4fEVDSws'
const F_ACTION_URL   = 'fldNzqMx8txSraQCY'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function todayISO() { return new Date().toISOString().slice(0, 10) }

function fmtDate(iso: string) {
  // "2026-05-10" → "May 10"
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function taskRow(t: any, today: string) {
  const title     = t.fields[F_TITLE] ?? 'Untitled'
  const due       = t.fields[F_DUE_DATE] as string | undefined
  const module    = t.fields[F_MODULE] ?? ''
  const actionUrl = t.fields[F_ACTION_URL] as string | undefined
  const url       = actionUrl
    ? `${PORTAL_URL}${actionUrl.replace(/^\//, '')}`
    : `${PORTAL_URL}#/tasks/${t.id}`

  let dueLabel = ''
  let dueColor = '#6b7280'
  if (due) {
    if (due < today)       { dueLabel = `Overdue (was ${fmtDate(due)})`; dueColor = '#ef4444' }
    else if (due === today){ dueLabel = 'Due today';                      dueColor = '#f59e0b' }
    else                   { dueLabel = `Due ${fmtDate(due)}`;           dueColor = '#6b7280' }
  }

  return `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;vertical-align:top;">
      <a href="${url}" style="font-size:14px;font-weight:500;color:#111827;text-decoration:none;">${title}</a>
      <div style="margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;">
        ${module ? `<span style="font-size:11px;color:#94a3b8;">${module}</span>` : ''}
        ${dueLabel ? `<span style="font-size:11px;font-weight:500;color:${dueColor};">${dueLabel}</span>` : ''}
      </div>
    </td>
  </tr>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { userId } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // ── Get user's email and name ─────────────────────────────────────────────
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId)
    if (userError || !userData?.user?.email) {
      console.error('[task-reminder] user lookup failed:', userError)
      return new Response(JSON.stringify({ error: 'user not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const toEmail  = userData.user.email
    const userName = (userData.user.user_metadata?.full_name as string | undefined)
      || toEmail.split('@')[0]
    const firstName = userName.split(' ')[0]

    // ── Fetch open tasks from Airtable ────────────────────────────────────────
    const today   = todayISO()
    const formula = encodeURIComponent(`AND({User ID}='${userId}', {Status}!='Done')`)
    const url     = `https://api.airtable.com/v0/${TASKS_BASE}/${TASKS_TABLE}`
      + `?filterByFormula=${formula}`
      + `&sort[0][field]=Due Date&sort[0][direction]=asc`
      + `&returnFieldsByFieldId=true`

    const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } })
    if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`)
    const tasks: any[] = (await r.json()).records ?? []

    if (tasks.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no open tasks' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Bucket tasks ─────────────────────────────────────────────────────────
    const overdue   = tasks.filter(t => t.fields[F_DUE_DATE] && t.fields[F_DUE_DATE] < today)
    const dueToday  = tasks.filter(t => t.fields[F_DUE_DATE] === today)
    const upcoming  = tasks.filter(t => !t.fields[F_DUE_DATE] || t.fields[F_DUE_DATE] > today)

    const overdueStat  = overdue.length
    const dueTodayStat = dueToday.length
    const totalStat    = tasks.length

    function section(label: string, color: string, rows: any[]) {
      if (!rows.length) return ''
      return `
      <tr><td style="padding-top:20px;padding-bottom:4px;">
        <span style="display:inline-block;background:${color};color:#fff;font-size:11px;font-weight:700;letter-spacing:.04em;padding:2px 8px;border-radius:4px;">${label} (${rows.length})</span>
      </td></tr>
      ${rows.map(t => taskRow(t, today)).join('')}`
    }

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">

        <tr><td style="background:#1e293b;padding:16px 24px;">
          <span style="color:#fff;font-size:16px;font-weight:600;">Shep Portal</span>
          <span style="color:#94a3b8;font-size:13px;margin-left:8px;">Task Reminder</span>
        </td></tr>

        <tr><td style="padding:20px 24px 0;">
          <p style="margin:0;font-size:18px;font-weight:600;color:#111827;">Hi ${firstName},</p>
          <p style="margin:8px 0 0;font-size:14px;color:#6b7280;">
            You have <strong>${totalStat} open task${totalStat === 1 ? '' : 's'}</strong>${overdueStat ? ` — <span style="color:#ef4444;font-weight:600;">${overdueStat} overdue</span>` : ''}${dueTodayStat ? ` and <span style="color:#f59e0b;font-weight:600;">${dueTodayStat} due today</span>` : ''}.
          </p>
        </td></tr>

        <tr><td style="padding:16px 24px 4px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${section('OVERDUE', '#ef4444', overdue)}
            ${section('DUE TODAY', '#f59e0b', dueToday)}
            ${section('UPCOMING', '#64748b', upcoming)}
          </table>
        </td></tr>

        <tr><td style="padding:20px 24px 28px;">
          <a href="${PORTAL_URL}#/tasks"
             style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:6px;">
            Open My Tasks →
          </a>
        </td></tr>

        <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:12px 24px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Shep Portal · Cookeville, TN</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

    const subject = overdueStat
      ? `[Shep] ⚠️ You have ${overdueStat} overdue task${overdueStat === 1 ? '' : 's'}`
      : `[Shep] 📋 Task reminder — ${totalStat} open task${totalStat === 1 ? '' : 's'}`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: toEmail, subject, html }),
    })
    const resendData = await resendRes.json()
    if (!resendRes.ok) {
      console.error('[task-reminder] Resend error:', resendData)
      return new Response(JSON.stringify({ error: resendData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('[task-reminder] Sent to', toEmail, '—', totalStat, 'tasks, Resend ID:', resendData.id)
    return new Response(JSON.stringify({ ok: true, sent_to: toEmail, task_count: totalStat }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('[task-reminder] fatal:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
