// Caller check for functions normally invoked by the database (pg_net triggers,
// pg_cron), GitHub Actions, or a button in the app, rather than by a person
// browsing. Pattern: a shared key header for machine callers, a session for
// browser callers.
//
// Staged on purpose: until the Supabase secret CRON_AUTH_ENFORCE is "true", a
// failed check only logs "would deny" and lets the request through, so every
// caller can be updated first. Flipping the secret needs no redeploy.
import { requireUser, requireAdmin, requireRoleOrFlag, AuthError } from './auth.ts'

type SessionRule = 'user' | 'admin' | { flag: string }

interface GuardOptions {
  cron?: boolean
  session?: SessionRule
  corsHeaders?: Record<string, string>
}

function configuredKeys(): string[] {
  return [Deno.env.get('CRON_SHARED_KEY'), Deno.env.get('BOOKKEEPING_CRON_KEY')]
    .filter((k): k is string => !!k)
}

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}

function hasValidCronKey(req: Request): boolean {
  const given = req.headers.get('x-cron-key') || ''
  return !!given && configuredKeys().some((k) => safeEqual(given, k))
}

// Returns null when the caller may proceed, or a Response to send back.
export async function guardCaller(req: Request, fnName: string, opts: GuardOptions): Promise<Response | null> {
  if (opts.cron && hasValidCronKey(req)) return null

  let reason = opts.cron ? 'no valid cron key' : 'no session'
  let status = 401
  if (opts.session) {
    try {
      if (opts.session === 'admin') await requireAdmin(req)
      else if (opts.session === 'user') await requireUser(req)
      else await requireRoleOrFlag(req, opts.session.flag)
      return null
    } catch (e) {
      reason = e instanceof AuthError ? e.message : 'auth check failed'
      status = e instanceof AuthError ? e.status : 401
    }
  }

  if (Deno.env.get('CRON_AUTH_ENFORCE') !== 'true') {
    console.warn(`[${fnName}] caller-auth log-only: would deny (${reason})`)
    return null
  }
  return new Response(JSON.stringify({ error: 'Not authorized' }), {
    status,
    headers: { ...(opts.corsHeaders ?? {}), 'Content-Type': 'application/json' },
  })
}
