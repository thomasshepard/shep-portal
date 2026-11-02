// Public, logged-out endpoint for the /maintenance-request tenant form
// (SEC-1 follow-up). Deployed WITHOUT jwt verification (--no-verify-jwt) —
// unlike airtable-proxy, this one can't require a session, since a tenant
// filling out the form is never signed in.
//
// That's exactly why it stays this narrow: it does NOT take a baseId/table
// from the client the way airtable-proxy does. It only exposes two fixed
// actions against one fixed base (Property Management), so an anonymous
// caller can never read or write anything else in Airtable. The PAT itself
// never reaches the browser — previously this page bundled the full
// VITE_AIRTABLE_PAT client-side for every anonymous visitor.
const AIRTABLE_PAT = Deno.env.get('AIRTABLE_PAT') ?? ''
const PM_BASE_ID = 'appeuX9BHNgVXxdYZ' // Property Management

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function listProperties() {
  const params = new URLSearchParams()
  params.set('fields[0]', 'Address')
  const res = await fetch(`https://api.airtable.com/v0/${PM_BASE_ID}/Property?${params}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

async function createMaintenanceRequest(fields: Record<string, unknown>) {
  // Only pass through the handful of fields this form is allowed to set —
  // never trust the client to send arbitrary Airtable field names/values.
  const allowed = ['Name', 'Request Notes', 'Contact Phone', 'Contact Email', 'Date', 'Status', 'Property']
  const safeFields: Record<string, unknown> = {}
  for (const key of allowed) {
    if (fields[key] !== undefined && fields[key] !== '') safeFields[key] = fields[key]
  }
  if (!safeFields['Property'] || !Array.isArray(safeFields['Property'])) {
    throw new Error('Property is required')
  }
  safeFields['Status'] = 'Open' // never let the client set this to anything else

  const res = await fetch(`https://api.airtable.com/v0/${PM_BASE_ID}/Maintenance%20Requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: safeFields, typecast: true }),
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const action = body?.action

    if (action === 'listProperties') {
      const { status, data } = await listProperties()
      return json(data, status)
    }

    if (action === 'create') {
      const { status, data } = await createMaintenanceRequest(body.fields || {})
      return json(data, status)
    }

    return json({ error: 'action must be "listProperties" or "create"' }, 400)
  } catch (err) {
    console.error('[maintenance-request] Error:', err)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
