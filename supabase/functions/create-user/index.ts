import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Uses the service role key — never exposed to the browser.
// Creates the auth user with email_confirm: true so no confirmation
// email is sent and the user can log in immediately with the temp password.
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { email, password } = body
  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'email and password are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip confirmation email entirely
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ userId: data.user.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
