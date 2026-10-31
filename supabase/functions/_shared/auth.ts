// Shared caller-identity checks for edge functions that must not trust their
// caller just because verify_jwt=true — that only proves *some* logged-in
// user is calling, not that they're allowed to do this particular thing.
// Pattern lifted from delete-user/index.ts, which had this check inline.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.status = status
  }
}

// Verifies the Authorization header belongs to a real, currently-valid
// session. Uses the anon key + the caller's own token (not the service role
// key), so RLS still applies to anything queried through callerClient.
export async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new AuthError('Missing authorization header')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error } = await callerClient.auth.getUser()
  if (error || !user) throw new AuthError('Not authenticated')

  return { user, callerClient }
}

// requireUser, plus checks profiles.role === 'admin'.
export async function requireAdmin(req: Request) {
  const { user, callerClient } = await requireUser(req)

  const { data: profile } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new AuthError('Not authorized', 403)

  return { user, callerClient }
}

// requireUser, plus checks profiles.role === 'admin' OR the given boolean
// permission flag column (e.g. 'can_view_happy_cuts') — same pattern every
// PermRoute in the frontend already uses, just enforced server-side too.
export async function requireRoleOrFlag(req: Request, flag: string) {
  const { user, callerClient } = await requireUser(req)

  const { data: profile } = await callerClient
    .from('profiles')
    .select(`role, ${flag}`)
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && !profile?.[flag]) {
    throw new AuthError('Not authorized', 403)
  }

  return { user, callerClient }
}
