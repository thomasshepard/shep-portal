// run-migration — lets Claude Code apply SQL migrations directly instead of
// asking Thomas to paste them into the Supabase SQL editor by hand every
// time. Exists because this repo's `supabase db push` is blocked by a
// pre-existing migration-history mismatch unrelated to any single change
// (an old `20260810`-timestamped migration recorded on the remote with no
// matching local file — see bookkeeping-module CLAUDE.md context), and this
// CLI version has no lower-level "just run this SQL" command either.
//
// Auth: deployed WITH --no-verify-jwt (no Supabase user session involved at
// all — there's no user-facing caller for this) but gated by a shared
// secret header instead, exactly the same trust model as the existing
// hermes-gateway function's HERMES_API_KEY. MIGRATION_RUNNER_KEY is a
// random value known only to whoever set it — never logged, never sent to
// the frontend, not derivable from anything in this repo.
//
// Body shape: { sql: string } — the full contents of one migration file,
// run via a single unsafe() multi-statement call against SUPABASE_DB_URL
// (already an existing secret on this project — every edge function's
// runtime has it, this is the first to actually use it for a direct
// Postgres connection rather than going through supabase-js).

import postgres from 'npm:postgres@3'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type, x-migration-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const runnerKey = Deno.env.get('MIGRATION_RUNNER_KEY')
  if (!runnerKey || req.headers.get('x-migration-key') !== runnerKey) {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Body must be JSON' }, 400)
  }

  const sql = String(body?.sql || '').trim()
  if (!sql) return json({ ok: false, error: 'sql is required' }, 400)

  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) return json({ ok: false, error: 'SUPABASE_DB_URL is not set on this project' }, 500)

  const sqlClient = postgres(dbUrl, { max: 1 })
  try {
    const rows = await sqlClient.unsafe(sql)
    // Truncated + JSON-safe — this is a debugging aid (checking current
    // state before/after a migration), not meant for bulk data transfer.
    return json({ ok: true, rows: JSON.parse(JSON.stringify(rows)).slice(0, 200) })
  } catch (err: any) {
    return json({ ok: false, error: err?.message || String(err) }, 400)
  } finally {
    await sqlClient.end({ timeout: 5 })
  }
})
