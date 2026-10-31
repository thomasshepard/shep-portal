import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAdmin, AuthError } from '../_shared/auth.ts'

// Uses the service role key — never exposed to the browser.
// Creates the auth user with email_confirm: true so no confirmation
// email is sent and the user can log in immediately with the temp password.
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Called from the browser (AdminUsers.jsx via supabase.functions.invoke), so
// the CORS preflight (OPTIONS) needs an explicit response — without this,
// the browser blocks the request before it ever reaches the code below and
// supabase-js just reports a generic "Failed to send a request" fetch error.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    await requireAdmin(req)
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401
    return json({ error: err.message }, status)
  }

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { email, password } = body
  if (!email || !password) {
    return json({ error: 'email and password are required' }, 400)
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip confirmation email entirely
  })

  if (error) {
    return json({ error: error.message }, 400)
  }

  return json({ userId: data.user.id })
})
