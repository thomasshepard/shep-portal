// Client wrapper for the `ai-proxy` edge function (SEC-2/SEC-3) — replaces the
// 6 direct-to-Anthropic and 1 direct-to-Rentcast calls that used to carry the
// VITE_ANTHROPIC_API_KEY / VITE_RENTCAST_API_KEY client-bundled keys.
//
// supabase.functions.invoke() attaches the caller's session automatically, so
// callers need no auth plumbing of their own. On success this resolves with
// the same JSON shape the Claude/Rentcast REST APIs themselves return, so
// existing `json.content?.[0]?.text` / `data.rent` style parsing is unchanged.

import { supabase } from './supabase'

async function invokeAiProxy(body) {
  const { data, error } = await supabase.functions.invoke('ai-proxy', { body })
  if (error) {
    let message = error.message || 'AI request failed'
    try {
      const errBody = await error.context?.json?.()
      // ai-proxy's own errors use {error}; pass-through Anthropic/Rentcast
      // error bodies use {error:{message}} and {message} respectively.
      if (errBody?.error?.message) message = errBody.error.message
      else if (typeof errBody?.error === 'string') message = errBody.error
      else if (typeof errBody?.message === 'string') message = errBody.message
    } catch {
      // ignore — fall back to error.message above
    }
    throw new Error(message)
  }
  if (data?.error) {
    throw new Error(typeof data.error === 'string' ? data.error : data.error.message || 'AI request failed')
  }
  return data
}

/** Mirrors the Anthropic Messages API request/response shape. */
export function callClaude({ model, max_tokens, system, messages }) {
  return invokeAiProxy({ action: 'claude', model, max_tokens, system, messages })
}

/** Mirrors Rentcast's /v1/avm/rent/long-term response shape. */
export function callRentcast({ address, bedrooms, bathrooms, squareFootage, propertyType, compCount }) {
  return invokeAiProxy({ action: 'rentcast', address, bedrooms, bathrooms, squareFootage, propertyType, compCount })
}
