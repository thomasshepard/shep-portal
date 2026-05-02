import nacl from 'https://esm.sh/tweetnacl@1.0.3'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PUBLIC_KEY   = Deno.env.get('DISCORD_PUBLIC_KEY')!
const SB_URL       = Deno.env.get('SUPABASE_URL')!
const SVC_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const AIRTABLE_PAT = Deno.env.get('AIRTABLE_PAT')!
const TASKS_BASE   = 'appYVLCn1NVLevdry'
const TASKS_TABLE  = 'tbl3Di18kSLwEj1vN'

function hexToUint8Array(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.substr(i, 2), 16)
  return out
}

function verifySig(req: Request, body: string): boolean {
  const sig = req.headers.get('x-signature-ed25519')
  const ts  = req.headers.get('x-signature-timestamp')
  if (!sig || !ts) return false
  return nacl.sign.detached.verify(
    new TextEncoder().encode(ts + body),
    hexToUint8Array(sig),
    hexToUint8Array(PUBLIC_KEY),
  )
}

async function patchAirtable(recordId: string, fields: Record<string, unknown>) {
  const r = await fetch(`https://api.airtable.com/v0/${TASKS_BASE}/${TASKS_TABLE}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, typecast: true }),
  })
  return r.ok
}

Deno.serve(async (req) => {
  const body = await req.text()

  if (!verifySig(req, body)) {
    return new Response('invalid signature', { status: 401 })
  }

  const interaction = JSON.parse(body)

  // Discord PING — required handshake when registering the interactions URL
  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), { headers: { 'Content-Type': 'application/json' } })
  }

  // Button / component interaction
  if (interaction.type === 3) {
    const customId      = interaction.data?.custom_id ?? ''
    const discordUserId = interaction.member?.user?.id ?? interaction.user?.id ?? null

    const sb = createClient(SB_URL, SVC_KEY)

    const { data: pref } = await sb
      .from('notification_preferences')
      .select('user_id')
      .eq('discord_user_id', discordUserId)
      .maybeSingle()
    const userId = pref?.user_id ?? null

    let result = 'ok'
    let reply  = '✓ Got it.'

    if (customId.startsWith('done:task:')) {
      const taskId = customId.split(':')[2]
      const ok = await patchAirtable(taskId, {
        'Status': 'Done',
        'Completed At': new Date().toISOString().slice(0, 10),
      })
      result = ok ? 'ok' : 'airtable_failed'
      reply  = ok ? '✓ Marked task complete.' : '❌ Couldn\'t update Airtable.'
    } else if (customId === 'dismiss:digest') {
      reply = '🫡 Dismissed. See you tomorrow.'
    } else {
      reply  = `Unknown action: \`${customId}\``
      result = 'unknown_action'
    }

    await sb.from('discord_action_log').insert({
      user_id: userId, discord_user_id: discordUserId,
      command: customId.split(':')[0], target: customId,
      payload: interaction, result,
    })

    // type 4 = channel message, flags 64 = ephemeral (only the clicker sees it)
    return new Response(JSON.stringify({
      type: 4,
      data: { content: reply, flags: 64 },
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // Slash commands
  if (interaction.type === 2) {
    const name = interaction.data?.name ?? ''

    if (name === 'help') {
      return new Response(JSON.stringify({
        type: 4,
        data: {
          flags: 64,
          content: [
            '**Shep Portal commands**',
            '`/digest` — re-fetch and post today\'s digest',
            '`/status` — quick health snapshot of your businesses',
            '`/help` — this message',
            '',
            'Or use the buttons on the morning digest.',
          ].join('\n'),
        },
      }), { headers: { 'Content-Type': 'application/json' } })
    }

    if (name === 'digest') {
      // Fire async — Discord requires response within 3 seconds
      fetch(`${SB_URL}/functions/v1/send-daily-digest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SVC_KEY}` },
      }).catch(() => {})
      return new Response(JSON.stringify({
        type: 4,
        data: { content: '⏳ Pulling today\'s digest…', flags: 64 },
      }), { headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({
      type: 4,
      data: { content: `Unknown command: \`${name}\``, flags: 64 },
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('ignored', { status: 200 })
})
