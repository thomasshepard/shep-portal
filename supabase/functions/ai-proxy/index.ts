import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUser, AuthError } from '../_shared/auth.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const RENTCAST_API_KEY  = Deno.env.get('RENTCAST_API_KEY') ?? ''
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Only the models actually used by the portal's 6 Claude call sites.
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-6',
])
const MAX_TOKENS_CAP = 2000
const DAILY_REQUEST_LIMIT = 300

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// Service-role client — only used for the usage counter, which callers have no
// business reading or writing directly (RLS on ai_proxy_usage locks it to service_role).
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function withinDailyLimit(userId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: existing } = await adminClient
    .from('ai_proxy_usage')
    .select('request_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle()

  if (existing && existing.request_count >= DAILY_REQUEST_LIMIT) return false

  const { error } = await adminClient
    .from('ai_proxy_usage')
    .upsert(
      { user_id: userId, usage_date: today, request_count: (existing?.request_count ?? 0) + 1 },
      { onConflict: 'user_id,usage_date' }
    )
  // A logging hiccup shouldn't block a real request — fail open on the counter write itself.
  if (error) console.error('[ai-proxy] usage upsert failed (continuing anyway):', error)
  return true
}

async function handleClaude(body: Record<string, unknown>) {
  const { model, max_tokens, system, messages } = body
  if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
    return json({ error: `Model not allowed: ${model}` }, 400)
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages is required' }, 400)
  }
  const cappedTokens = Math.min(Number(max_tokens) || 500, MAX_TOKENS_CAP)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: cappedTokens, system, messages }),
  })
  const data = await res.json()
  return json(data, res.status)
}

async function handleRentcast(body: Record<string, unknown>) {
  const { address, bedrooms, bathrooms, squareFootage, propertyType, compCount } = body
  if (typeof address !== 'string' || !address.trim()) {
    return json({ error: 'address is required' }, 400)
  }

  const params = new URLSearchParams({ address: address.trim(), compCount: String(compCount || 12) })
  if (bedrooms) params.set('bedrooms', String(bedrooms))
  if (bathrooms) params.set('bathrooms', String(bathrooms))
  if (squareFootage) params.set('squareFootage', String(squareFootage))
  if (typeof propertyType === 'string' && propertyType) params.set('propertyType', propertyType)

  const res = await fetch(`https://api.rentcast.io/v1/avm/rent/long-term?${params}`, {
    headers: { 'X-Api-Key': RENTCAST_API_KEY },
  })
  const data = await res.json().catch(() => ({}))
  return json(data, res.status)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let user
  try {
    ;({ user } = await requireUser(req))
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401
    return json({ error: (err as Error).message }, status)
  }

  try {
    const body = await req.json()
    const action = body?.action

    if (action !== 'claude' && action !== 'rentcast') {
      return json({ error: 'action must be "claude" or "rentcast"' }, 400)
    }

    const allowed = await withinDailyLimit(user.id)
    if (!allowed) {
      return json({ error: `Daily AI usage limit reached (${DAILY_REQUEST_LIMIT} requests). Try again tomorrow.` }, 429)
    }

    return action === 'claude' ? await handleClaude(body) : await handleRentcast(body)
  } catch (err) {
    console.error('[ai-proxy] Error:', err)
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
