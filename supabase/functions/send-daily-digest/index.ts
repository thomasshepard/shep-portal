import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL       = Deno.env.get('SUPABASE_URL')!
const SVC_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const AIRTABLE_PAT = Deno.env.get('AIRTABLE_PAT')!
const BOT_TOKEN    = Deno.env.get('DISCORD_BOT_TOKEN')!
const CHANNEL_ID   = Deno.env.get('DISCORD_DIGEST_CHANNEL_ID')!

const PM_BASE       = 'appeuX9BHNgVXxdYZ'
const HC_BASE       = 'appZOi48qf8SzyOml'
const CHICKENS_BASE = 'apppIiT84EaowkQVR'
const LLC_BASE      = 'appvX3Tu1OGxOZB8k'
const TASKS_BASE    = 'appYVLCn1NVLevdry'
const TASKS_TABLE   = 'tbl3Di18kSLwEj1vN'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function airtableList(baseId: string, table: string, params: Record<string, string> = {}) {
  const all: any[] = []
  let offset: string | undefined
  do {
    const u = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`)
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v))
    if (offset) u.searchParams.set('offset', offset)
    const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } })
    if (!r.ok) throw new Error(`Airtable ${table}: ${r.status} ${await r.text()}`)
    const j = await r.json()
    all.push(...(j.records ?? []))
    offset = j.offset
  } while (offset)
  return all
}

function todayISO(): string { return new Date().toISOString().slice(0, 10) }
function yesterdayISO(): string {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10)
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

// ── Build today's snapshot ────────────────────────────────────────────────────
async function buildSnapshot(_userId: string) {
  const today = todayISO()

  const [leases, maintTickets, payments] = await Promise.all([
    airtableList(PM_BASE, 'Lease Agreements'),
    airtableList(PM_BASE, 'Maintenance', { filterByFormula: "AND(NOT({Status}='Closed'), NOT({Status}='Resolved'))" }),
    airtableList(PM_BASE, 'Rent Payments', { filterByFormula: "{Status}='Overdue'" }),
  ])
  const expiringSoon = leases.filter(l => {
    const ed = l.fields['End Date']; if (!ed) return false
    const d = daysBetween(today, ed); return d >= 0 && d <= 30
  }).length
  const expired = leases.filter(l => {
    const ed = l.fields['End Date']; if (!ed) return false
    const d = daysBetween(today, ed)
    const status = (l.fields['Status'] ?? '').toLowerCase()
    return d < 0 && (status === 'active' || status === 'month-to-month')
  }).length
  const overdueRentTotal = payments.reduce((s, p) => s + (Number(p.fields['Amount']) || 0), 0)

  const mows = await airtableList(HC_BASE, 'tbli7OArESf2SHL10', {
    filterByFormula: `AND({fldcu9rgNI8REbrE0}>='${today}', {fldcu9rgNI8REbrE0}<='${today}')`,
  })
  const todaysMowsCount   = mows.length
  const todaysMowsRevenue = mows.reduce((s, m) => s + (Number(m.fields['fldJoKhtQX4MujAOi']) || 0), 0)

  const flocks = await airtableList(CHICKENS_BASE, 'Flock', { filterByFormula: "{Status}='Active'" })
  const activeFlocks = flocks.map(f => {
    const hd = f.fields['Hatch Date']
    const day = hd ? daysBetween(hd, today) + 1 : null
    return { name: f.fields['Name'], day, count: f.fields['Current Count'] ?? f.fields['Bird Count'], target_weeks: f.fields['Target Weeks'] }
  })

  const llcs = await airtableList(LLC_BASE, 'LLCs')
  const llcOverdue  = llcs.filter(l => { const d = l.fields['Annual Report Due Date']; return d && daysBetween(today, d) < 0 }).length
  const llcDueSoon  = llcs.filter(l => { const d = l.fields['Annual Report Due Date']; if (!d) return false; const n = daysBetween(today, d); return n >= 0 && n <= 30 }).length

  const tasks = await airtableList(TASKS_BASE, TASKS_TABLE, {
    filterByFormula: "AND({Status}!='Done', {Due Date}!='')", returnFieldsByFieldId: 'true',
  })
  const tasksDueToday = tasks.filter(t => t.fields['fldLxGJRu1XeK4z7t'] === today).length
  const tasksOverdue  = tasks.filter(t => { const d = t.fields['fldLxGJRu1XeK4z7t']; return d && d < today }).length

  return {
    properties: {
      open_maintenance: maintTickets.length,
      overdue_rent: { count: payments.length, amount_cents: Math.round(overdueRentTotal * 100) },
      leases_expiring_30d: expiringSoon,
      leases_expired: expired,
    },
    happy_cuts: { mows_today: todaysMowsCount, revenue_booked_today_cents: Math.round(todaysMowsRevenue * 100) },
    chickens: { active_flocks: activeFlocks },
    llcs: { overdue: llcOverdue, due_30d: llcDueSoon },
    tasks: { open: tasks.length, due_today: tasksDueToday, overdue: tasksOverdue },
  }
}

// ── Compute deltas vs yesterday ───────────────────────────────────────────────
function computeDeltas(today: any, yesterday: any | null): string[] {
  if (!yesterday) return []
  const lines: string[] = []
  const fmtDelta = (label: string, a: number, b: number) => {
    if (a === b) return null
    return `${b > a ? '↑' : '↓'} ${label}: ${a} → ${b}`
  }
  const candidates = [
    fmtDelta('Open maintenance',   yesterday.properties.open_maintenance,    today.properties.open_maintenance),
    fmtDelta('Overdue rent count', yesterday.properties.overdue_rent.count,  today.properties.overdue_rent.count),
    fmtDelta('Expired leases',     yesterday.properties.leases_expired,      today.properties.leases_expired),
    fmtDelta('Tasks overdue',      yesterday.tasks.overdue,                  today.tasks.overdue),
    fmtDelta('LLCs overdue',       yesterday.llcs.overdue,                   today.llcs.overdue),
  ]
  return candidates.filter(Boolean) as string[]
}

// ── Render Discord message text ───────────────────────────────────────────────
function fmtCurrency(cents: number) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function renderDigest(snap: any, deltas: string[], actionableTasks: any[]) {
  const lines: string[] = []
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago',
  })

  lines.push(`🌅  **${date}**`, '')
  lines.push('**Today**')

  if (snap.happy_cuts.mows_today > 0) {
    lines.push(`• ${snap.happy_cuts.mows_today} mow${snap.happy_cuts.mows_today === 1 ? '' : 's'} — ${fmtCurrency(snap.happy_cuts.revenue_booked_today_cents)} booked`)
  }
  if (snap.properties.open_maintenance > 0) {
    lines.push(`• ${snap.properties.open_maintenance} maintenance ticket${snap.properties.open_maintenance === 1 ? '' : 's'} open`)
  }
  if (snap.properties.overdue_rent.count > 0) {
    lines.push(`• ${snap.properties.overdue_rent.count} overdue rent — ${fmtCurrency(snap.properties.overdue_rent.amount_cents)}`)
  }
  if (snap.properties.leases_expired > 0) {
    lines.push(`• ⚠️ ${snap.properties.leases_expired} expired lease${snap.properties.leases_expired === 1 ? '' : 's'} unrenewed`)
  }
  if (snap.properties.leases_expiring_30d > 0) {
    lines.push(`• ${snap.properties.leases_expiring_30d} lease${snap.properties.leases_expiring_30d === 1 ? '' : 's'} expiring within 30d`)
  }
  if (snap.llcs.overdue > 0) {
    lines.push(`• ⚠️ ${snap.llcs.overdue} LLC annual report${snap.llcs.overdue === 1 ? '' : 's'} overdue`)
  }
  if (snap.chickens.active_flocks.length > 0) {
    const f = snap.chickens.active_flocks[0]
    lines.push(`• Chickens: ${f.name} day ${f.day}, ${f.count} birds`)
  }
  if (snap.tasks.due_today > 0)  lines.push(`• ${snap.tasks.due_today} tasks due today`)
  if (snap.tasks.overdue > 0)    lines.push(`• ${snap.tasks.overdue} tasks overdue`)

  if (deltas.length) {
    lines.push('', '**Yesterday → today**')
    for (const d of deltas) lines.push(`• ${d}`)
  }

  if (actionableTasks.length) {
    lines.push('', '**Quick actions** (tap a button below):')
    actionableTasks.slice(0, 5).forEach((t, i) => {
      lines.push(`\`${i + 1}\` ${t.fields['fldx2xmuxOVDls72i'] ?? 'Task'}`)
    })
  }

  return lines.join('\n')
}

// ── Discord helpers ───────────────────────────────────────────────────────────
async function postToDiscord(content: string, components: any[]) {
  const r = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, components, allowed_mentions: { parse: ['users'] } }),
  })
  if (!r.ok) throw new Error(`Discord post failed: ${r.status} ${await r.text()}`)
  return r.json()
}

function buildButtons(actionableTasks: any[]) {
  const taskButtons = actionableTasks.slice(0, 5).map((t, i) => ({
    type: 2, style: 1, custom_id: `done:task:${t.id}`, label: `✓ Done ${i + 1}`,
  }))
  const rows: any[] = []
  if (taskButtons.length) {
    rows.push({ type: 1, components: taskButtons.slice(0, 5) })
  }
  rows.push({
    type: 1,
    components: [
      { type: 2, style: 5, label: 'Open portal', url: 'https://thomasshepard.github.io/shep-portal/' },
      { type: 2, style: 2, custom_id: 'dismiss:digest', label: 'Dismiss all' },
    ],
  })
  return rows
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const sb = createClient(SB_URL, SVC_KEY)

    const { data: prefs } = await sb
      .from('notification_preferences')
      .select('user_id, discord_user_id, digest_hour_local, timezone')
      .eq('digest_enabled', true)
      .eq('discord_enabled', true)

    if (!prefs || prefs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let sent = 0
    for (const p of prefs) {
      const today = todayISO()
      const snap  = await buildSnapshot(p.user_id)

      const { data: ySnapRow } = await sb
        .from('daily_snapshots')
        .select('snapshot')
        .eq('user_id', p.user_id)
        .eq('date', yesterdayISO())
        .maybeSingle()
      const deltas = computeDeltas(snap, ySnapRow?.snapshot ?? null)

      // Fetch this user's top actionable tasks (due today + overdue, oldest first, max 5)
      const tasksRes = await fetch(
        `https://api.airtable.com/v0/${TASKS_BASE}/${TASKS_TABLE}?` +
        `filterByFormula=${encodeURIComponent(`AND({User ID}='${p.user_id}', {Status}!='Done', {Due Date}<='${today}')`)}` +
        `&sort[0][field]=Due Date&sort[0][direction]=asc&maxRecords=5&returnFieldsByFieldId=true`,
        { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } }
      )
      const taskJson      = await tasksRes.json()
      const actionableTasks = taskJson.records ?? []

      const text       = renderDigest(snap, deltas, actionableTasks)
      const components = buildButtons(actionableTasks)
      const greeting   = p.discord_user_id ? `<@${p.discord_user_id}> ` : ''

      try {
        await postToDiscord(greeting + text, components)
        sent++
      } catch (err) {
        console.error('[digest] Discord post failed for', p.user_id, err)
      }

      await sb.from('daily_snapshots').upsert(
        { date: today, user_id: p.user_id, snapshot: snap, digest_text: text },
        { onConflict: 'date,user_id' }
      )
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[digest] fatal:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
