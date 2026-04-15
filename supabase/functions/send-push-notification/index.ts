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

Deno.serve(async (req) => {
  try {
    const payload      = await req.json()
    const notification = payload.record

    // Only push for action_needed or critical
    if (!['action_needed', 'critical'].includes(notification?.severity)) {
      return new Response('skipped', { status: 200 })
    }

    // Fetch all push subscriptions for this user
    const { data: subs, error } = await sb
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', notification.user_id)

    if (error || !subs?.length) {
      return new Response('no subscriptions', { status: 200 })
    }

    const pushPayload = JSON.stringify({
      id:         notification.id,
      title:      notification.title,
      body:       notification.body,
      action_url: notification.action_url,
      source_key: notification.source_key,
    })

    // Send to all registered devices
    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          pushPayload
        ).catch(async (err: any) => {
          // 410 Gone = subscription expired — clean it up
          if (err.statusCode === 410) {
            await sb.from('push_subscriptions').delete().eq('id', sub.id)
          }
          throw err
        })
      )
    )

    const sent   = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    console.log(`[send-push] sent=${sent} failed=${failed} user=${notification.user_id}`)

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[send-push] Error:', err)
    return new Response('error', { status: 500 })
  }
})
