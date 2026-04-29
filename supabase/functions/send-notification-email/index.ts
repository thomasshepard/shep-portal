import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL       = 'onboarding@resend.dev'
const PORTAL_URL       = 'https://thomasshepard.github.io/shep-portal/'

Deno.serve(async (req) => {
  try {
    const payload      = await req.json()
    const notification = payload.record

    // Only send email for action_needed and critical
    if (!['action_needed', 'critical'].includes(notification.severity)) {
      return new Response(JSON.stringify({ skipped: true, reason: 'severity is info' }), { status: 200 })
    }

    // Cron-generated notifications are bundled into the daily digest instead
    if (notification.created_by_cron) {
      return new Response(JSON.stringify({ skipped: true, reason: 'created_by_cron' }), { status: 200 })
    }

    // Look up user email via service role (bypasses RLS on auth.users)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(notification.user_id)
    if (userError || !userData?.user?.email) {
      console.error('[send-notification-email] Could not get user email:', userError)
      // Return 200 so the webhook does not keep retrying
      return new Response(JSON.stringify({ error: 'user not found' }), { status: 200 })
    }

    const toEmail   = userData.user.email

    // Check notification preferences
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('email_enabled,paused_until,quiet_hours_start,quiet_hours_end,timezone,delivery_tasks,delivery_happy_cuts,delivery_properties,delivery_incubator,delivery_chickens,delivery_documents,delivery_llcs,delivery_alerts,delivery_system')
      .eq('user_id', notification.user_id)
      .maybeSingle()

    if (prefs) {
      const isCritical = notification.severity === 'critical'
      if (!prefs.email_enabled) {
        return new Response(JSON.stringify({ skipped: true, reason: 'email_disabled' }), { status: 200 })
      }
      if (!isCritical) {
        if (prefs.paused_until && new Date(prefs.paused_until) > new Date()) {
          return new Response(JSON.stringify({ skipped: true, reason: 'paused' }), { status: 200 })
        }
        if (prefs.quiet_hours_start != null && prefs.quiet_hours_end != null) {
          const tz = (prefs.timezone as string) || 'America/Chicago'
          const hourStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date())
          const hour = parseInt(hourStr, 10)
          const qs = prefs.quiet_hours_start as number
          const qe = prefs.quiet_hours_end as number
          const inQuiet = qs <= qe ? (hour >= qs && hour < qe) : (hour >= qs || hour < qe)
          if (inQuiet) {
            return new Response(JSON.stringify({ skipped: true, reason: 'quiet_hours' }), { status: 200 })
          }
        }
        const cat = ((notification.category || notification.module) as string).replace(/-/g, '_')
        const deliveryKey = `delivery_${cat}`
        const delivery = (prefs as Record<string, unknown>)[deliveryKey] as string | undefined
        if (delivery === 'digest' || delivery === 'off') {
          return new Response(JSON.stringify({ skipped: true, reason: `delivery_${delivery}` }), { status: 200 })
        }
      }
    }

    // action_url is stored as '/#/dashboard' — strip leading slash so it appends cleanly
    const actionUrl = notification.action_url
      ? `${PORTAL_URL}${notification.action_url.replace(/^\//, '')}`
      : PORTAL_URL

    const moduleLabel: Record<string, string> = {
      happy_cuts: 'Happy Cuts',
      properties: 'Properties',
      incubator:  'Incubator',
      chickens:   'Chickens',
      documents:  'Documents',
      llcs:       'LLCs',
      alerts:     'Alerts',
      system:     'System',
    }
    const label          = moduleLabel[notification.module] || notification.module
    const severityColor  = notification.severity === 'critical' ? '#ef4444' : '#f59e0b'
    const severityLabel  = notification.severity === 'critical' ? 'CRITICAL' : 'ACTION NEEDED'

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">

        <!-- Header bar -->
        <tr><td style="background:#1e293b;padding:16px 24px;">
          <span style="color:#ffffff;font-size:16px;font-weight:600;">Shep Portal</span>
          <span style="color:#94a3b8;font-size:13px;margin-left:8px;">${label}</span>
        </td></tr>

        <!-- Severity badge -->
        <tr><td style="padding:20px 24px 0;">
          <span style="display:inline-block;background:${severityColor};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.05em;padding:3px 8px;border-radius:4px;">${severityLabel}</span>
        </td></tr>

        <!-- Title -->
        <tr><td style="padding:12px 24px 0;">
          <p style="margin:0;font-size:18px;font-weight:600;color:#111827;">${notification.title}</p>
        </td></tr>

        <!-- Body -->
        ${notification.body ? `
        <tr><td style="padding:8px 24px 0;">
          <p style="margin:0;font-size:15px;color:#6b7280;">${notification.body}</p>
        </td></tr>` : ''}

        <!-- CTA button -->
        <tr><td style="padding:24px 24px 28px;">
          <a href="${actionUrl}"
             style="display:inline-block;background:#1e293b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:6px;">
            View in Portal →
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:12px 24px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Shep Portal · Cookeville, TN · You are receiving this because you have an account on this portal.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      toEmail,
        subject: notification.severity === 'critical'
          ? `[Shep] 🚨 ${notification.title}`
          : `[Shep] ⚡ ${notification.title}`,
        html,
      }),
    })

    const resendData = await resendRes.json()

    if (!resendRes.ok) {
      console.error('[send-notification-email] Resend error:', resendData)
      // Return 200 so webhook doesn't retry indefinitely
      return new Response(JSON.stringify({ error: resendData }), { status: 200 })
    }

    console.log('[send-notification-email] Sent to', toEmail, '— Resend ID:', resendData.id)
    return new Response(JSON.stringify({ ok: true, resend_id: resendData.id }), { status: 200 })

  } catch (err) {
    console.error('[send-notification-email] Unhandled error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 200 })
  }
})
