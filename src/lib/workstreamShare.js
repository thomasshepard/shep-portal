import { supabase } from './supabase'

// Public share links: one token = one workstream's checklist. All data goes
// through the workstream-share edge function (no session needed).

export class ShareError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

export async function shareCall(token, action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('workstream-share', { body: { token, action, ...payload } })
  if (error) throw new ShareError('Could not reach the server. Check your connection and try again.', 'network')
  if (data?.error) throw new ShareError(data.error, data.code || 'server')
  return data
}

/** 256 random bits as 43 URL-safe characters (matches the table's check constraint). */
export function newShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function shareUrl(token) {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/share/${token}`
}
