import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
)

// Sends one push payload to every device registered for a user; cleans up
// subscriptions the push service reports as gone (410).
async function sendToUser(userId: string, pushPayload: string) {
  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs?.length) return { sent: 0, failed: 0 }

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        pushPayload
      ).catch(async (err: any) => {
        if (err.statusCode === 410) {
          await sb.from('push_subscriptions').delete().eq('id', sub.id)
        }
        throw err
      })
    )
  )

  return {
    sent:   results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
  }
}

// New chat message → push every other channel member who hasn't muted the
// channel and hasn't turned off instant delivery for messages.
async function handleMessageInsert(message: any) {
  const [{ data: sender }, { data: members }] = await Promise.all([
    sb.from('profiles').select('full_name').eq('id', message.sender_id).single(),
    sb.from('msg_members')
      .select('profile_id, muted')
      .eq('channel_id', message.channel_id)
      .neq('profile_id', message.sender_id),
  ])

  const recipientIds = (members || []).filter(m => !m.muted).map(m => m.profile_id)
  if (!recipientIds.length) return { sent: 0, failed: 0, skipped: 0 }

  const { data: prefs } = await sb
    .from('notification_preferences')
    .select('user_id, mod_messages, delivery_messages')
    .in('user_id', recipientIds)
  const prefsMap = Object.fromEntries((prefs || []).map(p => [p.user_id, p]))

  const senderName = sender?.full_name || 'Someone'
  const bodyPreview = message.body?.trim()
    ? message.body.slice(0, 120)
    : (Array.isArray(message.attachments) && message.attachments.length ? '📎 sent an attachment' : 'sent a message')

  const pushPayload = JSON.stringify({
    title:      `${senderName}`,
    body:       bodyPreview,
    action_url: `/messages/${message.channel_id}`,  // sw.js prepends the `#` itself
    source_key: `msg:${message.id}`,
  })

  let sent = 0, failed = 0, skipped = 0
  for (const uid of recipientIds) {
    const p = prefsMap[uid]
    // Default to instant if the user has no prefs row yet (new signup).
    if (p && (p.mod_messages === false || p.delivery_messages === 'off')) { skipped++; continue }
    const r = await sendToUser(uid, pushPayload)
    sent += r.sent
    failed += r.failed
  }
  return { sent, failed, skipped }
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json()

    if (payload.table === 'msg_messages') {
      const result = await handleMessageInsert(payload.record)
      console.log(`[send-push] message channel=${payload.record?.channel_id}`, result)
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
    }

    // Default path: rows from the `notifications` table.
    const notification = payload.record

    // Only push for action_needed or critical
    if (!['action_needed', 'critical'].includes(notification?.severity)) {
      return new Response('skipped', { status: 200 })
    }

    const pushPayload = JSON.stringify({
      id:         notification.id,
      title:      notification.title,
      body:       notification.body,
      action_url: notification.action_url,
      source_key: notification.source_key,
    })

    const { sent, failed } = await sendToUser(notification.user_id, pushPayload)
    console.log(`[send-push] sent=${sent} failed=${failed} user=${notification.user_id}`)

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[send-push] Error:', err)
    return new Response('error', { status: 500 })
  }
})
