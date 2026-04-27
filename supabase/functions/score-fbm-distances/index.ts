const AIRTABLE_PAT    = Deno.env.get('AIRTABLE_PAT')!
const GOOGLE_MAPS_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')!
const FBM_BASE_ID     = 'app25IsSJz9bATUV7'
const AIRTABLE_BASE   = `https://api.airtable.com/v0/${FBM_BASE_ID}`

const AT_HEADERS = {
  Authorization: `Bearer ${AIRTABLE_PAT}`,
  'Content-Type': 'application/json',
}

// Fetch all records from a table with pagination
async function fetchAll(table: string, params: Record<string, string> = {}): Promise<any[]> {
  const records: any[] = []
  let offset: string | undefined

  do {
    const qs = new URLSearchParams(params)
    if (offset) qs.set('offset', offset)

    const res = await fetch(`${AIRTABLE_BASE}/${encodeURIComponent(table)}?${qs}`, {
      headers: AT_HEADERS,
    })
    if (!res.ok) throw new Error(`Airtable ${table}: ${await res.text()}`)

    const body = await res.json()
    records.push(...(body.records ?? []))
    offset = body.offset
  } while (offset)

  return records
}

// Batch-update in chunks of 10 (Airtable limit)
async function batchUpdate(
  table: string,
  updates: Array<{ id: string; fields: Record<string, unknown> }>,
): Promise<void> {
  for (let i = 0; i < updates.length; i += 10) {
    const chunk = updates.slice(i, i + 10)
    const res = await fetch(`${AIRTABLE_BASE}/${encodeURIComponent(table)}`, {
      method: 'PATCH',
      headers: AT_HEADERS,
      body: JSON.stringify({ records: chunk }),
    })
    if (!res.ok) throw new Error(`Airtable PATCH ${table}: ${await res.text()}`)
  }
}

interface Hub {
  name: string
  address: string
  maxDriveMinutes: number
}

interface ScoredResult {
  hubName: string
  distanceMiles: number
  driveTimeMinutes: number
  withinRange: boolean
}

async function scoreAddress(sellerAddress: string, hubs: Hub[]): Promise<ScoredResult | null> {
  if (!sellerAddress.trim()) return null

  const origins      = encodeURIComponent(sellerAddress)
  const destinations = hubs.map(h => encodeURIComponent(h.address)).join('|')
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${origins}&destinations=${destinations}&mode=driving&units=imperial&key=${GOOGLE_MAPS_KEY}`

  const res = await fetch(url)
  if (!res.ok) return null

  const data = await res.json()
  if (data.status !== 'OK') return null

  const elements: any[] = data.rows?.[0]?.elements ?? []

  let best: ScoredResult | null = null

  for (let i = 0; i < hubs.length; i++) {
    const el = elements[i]
    if (!el || el.status !== 'OK') continue

    const driveTimeMinutes = Math.round(el.duration.value / 60)
    const distanceMiles    = parseFloat((el.distance.value / 1609.344).toFixed(1))
    const withinRange      = driveTimeMinutes <= hubs[i].maxDriveMinutes

    if (!best || driveTimeMinutes < best.driveTimeMinutes) {
      best = { hubName: hubs[i].name, distanceMiles, driveTimeMinutes, withinRange }
    }
  }

  return best
}

Deno.serve(async () => {
  try {
    // 1. Load active hubs
    const hubRecords = await fetchAll('hubs', { filterByFormula: '{Active} = TRUE()' })
    const hubs: Hub[] = hubRecords
      .map(r => ({
        name:            String(r.fields['Hub Name']       ?? ''),
        address:         String(r.fields['Address']         ?? ''),
        maxDriveMinutes: Number(r.fields['Max Drive Minutes'] ?? 60),
      }))
      .filter(h => h.address)

    if (!hubs.length) {
      return new Response(
        JSON.stringify({ error: 'No active hubs configured' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // 2. Fetch matches that need distance scoring
    const matches = await fetchAll('matches', {
      filterByFormula: "AND({Needs Distance Score} = TRUE(), {Dismissed} != TRUE())",
    })

    const processed = matches.length
    let succeeded   = 0
    let failed      = 0
    const errors: string[] = []
    const updates: Array<{ id: string; fields: Record<string, unknown> }> = []

    // 3. Score each match
    for (const record of matches) {
      const sellerAddress = String(record.fields['Seller Address'] ?? '')

      try {
        const result = await scoreAddress(sellerAddress, hubs)

        if (result) {
          updates.push({
            id:     record.id,
            fields: {
              'Nearest Hub':          result.hubName,
              'Distance (miles)':     result.distanceMiles,
              'Drive Time (min)':     result.driveTimeMinutes,
              'Within Range':         result.withinRange,
              'Needs Distance Score': false,
            },
          })
          succeeded++
        } else {
          updates.push({
            id:     record.id,
            fields: {
              'Nearest Hub':          'Unknown',
              'Distance (miles)':     999,
              'Drive Time (min)':     999,
              'Within Range':         false,
              'Needs Distance Score': false,
            },
          })
          failed++
          if (sellerAddress) {
            errors.push(`No route: ${record.id} (${sellerAddress})`)
          }
        }
      } catch (err) {
        updates.push({
          id:     record.id,
          fields: {
            'Nearest Hub':          'Unknown',
            'Distance (miles)':     999,
            'Drive Time (min)':     999,
            'Within Range':         false,
            'Needs Distance Score': false,
          },
        })
        failed++
        errors.push(`${record.id}: ${String(err)}`)
      }
    }

    // 4. Write results back to Airtable
    if (updates.length) {
      await batchUpdate('matches', updates)
    }

    const result = { processed, succeeded, failed, errors }
    console.log('[score-fbm-distances]', JSON.stringify(result))

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[score-fbm-distances] Fatal:', String(err))
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
