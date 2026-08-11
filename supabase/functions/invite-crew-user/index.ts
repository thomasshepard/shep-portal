import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Uses the service role key — never exposed to the browser.
// Sends a Supabase magic-link invite email so Crew Portal partners never set a
// password. Called from Admin > Crew Access (AdminCrewAccess.jsx).
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Where the invite link lands after the partner clicks it. Set the
// CREW_PORTAL_URL secret once the Crew Portal site is deployed
// (`supabase secrets set CREW_PORTAL_URL=https://...`); until then this
// falls back to the Shep Portal login, which is harmless but not the
// intended destination.
const CREW_PORTAL_URL = Deno.env.get('CREW_PORTAL_URL') || 'https://thomasshepard.github.io/shep-portal/'

// Called from the browser (AdminCrewAccess.jsx via supabase.functions.invoke),
// so the CORS preflight (OPTIONS) needs an explicit response — without this,
// the browser blocks the request before it ever reaches the code below and
// supabase-js just reports a generic "Failed to send a request" fetch error.
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: { email?: string; fullName?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { email, fullName } = body
  if (!email) {
    return json({ error: 'email is required' }, 400)
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: CREW_PORTAL_URL,
    data: fullName ? { full_name: fullName } : undefined,
  })

  if (error) {
    // Person already has a Supabase auth account (e.g. an existing Shep Portal
    // user being added as crew too) — look them up instead of failing.
    const alreadyRegistered = error.status === 422 || /already registered/i.test(error.message || '')
    if (alreadyRegistered) {
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers()
      const match = !listErr && list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (match) {
        return json({ userId: match.id, alreadyExisted: true })
      }
    }
    return json({ error: error.message }, 400)
  }

  return json({ userId: data.user.id })
})
