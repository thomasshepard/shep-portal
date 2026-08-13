import { supabase } from './supabase'
import toast from 'react-hot-toast'

// Shared Fleet module config — used by Fleet.jsx and FleetDetail.jsx.
// Mirrors the pattern in src/lib/incubation.js: genuinely shared domain
// config gets its own lib file, but per-page render helpers (safeStr,
// StatTile, Field, etc.) stay copy-pasted per page per house style.

export const HC_BASE = import.meta.env.VITE_AIRTABLE_HAPPY_CUTS_BASE_ID
export const EQUIPMENT_TABLE = 'Equipment'
export const COST_TABLE = 'Cost Entries'

export const TYPES = ['Zero-Turn', 'Push Mower', 'Trimmer', 'Other']
export const STATUSES = ['Running', 'In Repair', 'Down', 'Sold']
export const LOCATIONS = ['Home', "Buster's", 'Job Site']
export const CATEGORIES = ['Parts', 'Labor - Buster', 'Labor - Self', 'Battery', 'Tires', 'Blades', 'Other']
export const VENDOR_PRESETS = ['Buster', 'Amazon', 'Walmart', 'TSC']

export const STATUS_BADGE = {
  Running: 'bg-green-100 text-green-700',
  'In Repair': 'bg-amber-100 text-amber-700',
  Down: 'bg-red-100 text-red-700',
  Sold: 'bg-gray-200 text-gray-600',
}
export const STATUS_DOT = {
  Running: 'bg-green-500',
  'In Repair': 'bg-amber-500',
  Down: 'bg-red-500',
  Sold: 'bg-gray-400',
}

export const STALE_DAYS = 60

/** Upload a photo to the fleet-photos bucket, returns its public URL (or null on failure). */
export async function uploadFleetPhoto(file) {
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `equipment/${Date.now()}_${safeName}`
    const { data, error } = await supabase.storage.from('fleet-photos').upload(path, file, {
      upsert: false,
      contentType: file.type,
    })
    if (error) throw error
    const { data: urlData } = supabase.storage.from('fleet-photos').getPublicUrl(data.path)
    return urlData.publicUrl
  } catch (e) {
    console.error('Photo upload failed:', e)
    toast.error('Photo upload failed: ' + (e?.message || JSON.stringify(e)))
    return null
  }
}

/** Photo URLs field holds a JSON array of {url, kind} — kind is 'tag' or 'machine'. */
export function parsePhotos(fields) {
  const raw = fields?.['Photo URLs']
  if (!raw || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Tolerate old plain-string entries just in case.
    return parsed.map(p => (typeof p === 'string' ? { url: p, kind: 'machine' } : p))
  } catch {
    return []
  }
}

export function daysSince(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return Math.round((Date.now() - d.getTime()) / 86400000)
}
