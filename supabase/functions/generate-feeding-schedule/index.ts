// Replaces the n8n "Create Chicken Feeding Schedule" workflow.
//
// Receives the same payload shape as the n8n webhook so the frontend swap is one URL change.
// All math is deterministic — no LLM, no retries-because-the-model-rounded-wrong.

const AIRTABLE_PAT  = Deno.env.get('AIRTABLE_PAT') ?? ''
const CHICKENS_BASE = 'apppIiT84EaowkQVR'
const SCHEDULE_TBL  = 'tbl55s9JUg6g38w3g'

// Schedule table field IDs — copied verbatim from the original Gemini prompt.
const F = {
  flock:        'fld5fDKZo55Bbyc09',  // linked record array
  week:         'fldxCGvZa0KCKUwVS',
  weekStart:    'fldcPCvyqsv30nmm3',
  weekEnd:      'fldlfqCNLw1hIXoLl',
  ozPerBird:    'fld0YPhk4lD8XdO7L',
  quartsPerDay: 'fldXfLL0QGXeubBAq',
  version:      'fldIC1PIZc9y1WeKm',
  versionDate:  'fldRoKJKTj6L1ltY5',
  flockSize:    'fldY8IzmtzITAJ5Bx',
  isCurrent:    'fldy2kQTxvHAifAM5',
  notes:        'fld92a69Le2X7Sx5i',
}

// Cornish Cross weekly notes — same as the Gemini prompt.
const CORNISH_NOTES: Record<number, string> = {
  1: 'Chick starter feed 20-24% protein',
  2: '',
  3: 'Transition to grower feed 18-20% protein',
  4: '',
  5: 'Peak feeding window approaching',
  6: 'Peak week - watch for leg issues',
  7: 'Taper begins - consider 12hr feed pull overnight',
  8: 'Final week - pull feed 48hrs before processing',
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Parse the body even when the frontend sends it as text/plain (CORS-preflight avoidance trick).
async function parseBody(req: Request): Promise<any> {
  const ct = (req.headers.get('content-type') || '').toLowerCase()
  if (ct.includes('application/json')) return req.json()
  const text = await req.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { throw new Error('Body is not valid JSON') }
}

// ── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await parseBody(req)

    // Pull fields out of the same shape the n8n webhook used.
    const action          = String(body.action || 'generate_schedule')
    const flockId         = String(body.flockId || '')
    const flockName       = String(body.flockName || '')
    const hatchDate       = String(body.hatchDate || '')
    const birdCount       = Number(body.newBirdCount ?? body.birdCount ?? 0)
    const targetWeeks     = Number(body.targetWeeks || 0)
    const breed           = String(body.breed || '')
    const version         = Number(body.version || 1)
    const schedule        = Array.isArray(body.schedule) ? body.schedule : []

    // Validate
    if (!flockId.startsWith('rec'))       throw new Error('flockId must be an Airtable record id')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hatchDate)) throw new Error('hatchDate must be YYYY-MM-DD')
    if (!Number.isFinite(birdCount) || birdCount <= 0) throw new Error('birdCount must be a positive number')
    if (!Number.isFinite(targetWeeks) || targetWeeks <= 0) throw new Error('targetWeeks must be a positive number')
    if (schedule.length === 0)            throw new Error('schedule array is empty')

    const todayDate = new Date().toISOString().slice(0, 10)
    const isCornish = breed.toLowerCase().includes('cornish')

    console.log('[feeding-schedule]', action, 'flock', flockId, flockName,
                'birdCount', birdCount, 'version', version)

    // Build records — stop at min(targetWeeks, schedule.length) per the original prompt's
    // "If weeklyOzPerBird has fewer values than targetWeeks, stop at the last available value."
    const weekCount = Math.min(targetWeeks, schedule.length)
    const records: Array<{ fields: Record<string, unknown> }> = []

    for (let w = 1; w <= weekCount; w++) {
      const ozPerBird   = Number(schedule[w - 1]?.oz_per_bird ?? 0)
      const totalDailyOz = ozPerBird * birdCount
      const quartsPerDay = round2(totalDailyOz / 12)
      const weekStart    = addDaysISO(hatchDate, (w - 1) * 7)
      const weekEnd      = addDaysISO(hatchDate, w * 7 - 1)
      const note         = isCornish ? (CORNISH_NOTES[w] ?? '') : ''

      records.push({
        fields: {
          [F.flock]:        [flockId],
          [F.week]:         w,
          [F.weekStart]:    weekStart,
          [F.weekEnd]:      weekEnd,
          [F.ozPerBird]:    round2(ozPerBird),
          [F.quartsPerDay]: quartsPerDay,
          [F.version]:      version,
          [F.versionDate]:  todayDate,
          [F.flockSize]:    birdCount,
          [F.isCurrent]:    true,
          [F.notes]:        note,
        },
      })
    }

    // Defense-in-depth: also unset Is Current Version on any older rows for this flock.
    // The frontend already does this before calling us, but a direct caller (curl, retry)
    // shouldn't be able to leave two current versions live.
    if (action === 'recalculate_schedule') {
      const filter = encodeURIComponent(
        `AND(FIND('${flockId}', ARRAYJOIN({${F.flock}})), {${F.isCurrent}}=TRUE())`
      )
      const listUrl = `https://api.airtable.com/v0/${CHICKENS_BASE}/${SCHEDULE_TBL}?filterByFormula=${filter}&returnFieldsByFieldId=true`
      const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } })
      if (listRes.ok) {
        const json = await listRes.json()
        const ids: string[] = (json.records || []).map((r: any) => r.id)
        // Patch in batches of 10 (Airtable limit).
        for (let i = 0; i < ids.length; i += 10) {
          const slice = ids.slice(i, i + 10).map(id => ({
            id, fields: { [F.isCurrent]: false },
          }))
          await fetch(`https://api.airtable.com/v0/${CHICKENS_BASE}/${SCHEDULE_TBL}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${AIRTABLE_PAT}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ records: slice, typecast: true }),
          })
        }
        console.log('[feeding-schedule] deactivated', ids.length, 'old current rows')
      } else {
        console.warn('[feeding-schedule] could not list old rows:', listRes.status, await listRes.text())
        // Don't bail — frontend already cleared, this is just belt-and-suspenders.
      }
    }

    // Insert new records — Airtable max 10 per POST.
    const created: any[] = []
    for (let i = 0; i < records.length; i += 10) {
      const batch = records.slice(i, i + 10)
      const res = await fetch(`https://api.airtable.com/v0/${CHICKENS_BASE}/${SCHEDULE_TBL}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: batch, typecast: true }),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Airtable insert failed (${res.status}): ${err}`)
      }
      const j = await res.json()
      created.push(...(j.records || []))
    }

    console.log('[feeding-schedule] created', created.length, 'rows for', flockId, 'v' + version)
    return new Response(JSON.stringify({
      ok: true,
      action,
      flockId,
      flockName,
      version,
      weeksCreated: created.length,
      todayDate,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    console.error('[feeding-schedule] Error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
