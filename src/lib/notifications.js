import { supabase } from './supabase'

/**
 * Insert a notification for one or more users.
 *
 * @param {Object}          opts
 * @param {string|string[]} opts.userIds    - User ID or array of user IDs to notify
 * @param {string}          opts.title      - Short notification title
 * @param {string}          [opts.body]     - Optional longer description
 * @param {string}          opts.module     - 'happy_cuts' | 'properties' | 'incubator' | 'chickens' | 'documents' | 'llcs' | 'alerts' | 'system'
 * @param {string}          [opts.severity] - 'critical' | 'action_needed' | 'info'  (default: 'info')
 * @param {string}          [opts.actionUrl]  - Hash route e.g. '/#/happy-cuts'
 * @param {string}          [opts.sourceKey]  - Dedup key. If a record with this key already exists for a user, skip that user.
 * @param {Date|string}     [opts.expiresAt]  - Optional expiry. After this time the notification is filtered out.
 */
export async function notify({ userIds, title, body, module, severity = 'info', actionUrl, sourceKey, expiresAt }) {
  try {
    const ids = Array.isArray(userIds) ? userIds : [userIds]
    let skipUserIds = new Set()

    if (sourceKey) {
      const { data: existing } = await supabase
        .from('notifications')
        .select('user_id')
        .eq('source_key', sourceKey)
      if (existing?.length > 0) {
        skipUserIds = new Set(existing.map(r => r.user_id))
      }
    }

    const records = ids
      .filter(uid => !skipUserIds.has(uid))
      .map(uid => ({
        user_id:    uid,
        title,
        body:       body || null,
        module,
        severity,
        action_url: actionUrl || null,
        source_key: sourceKey || null,
        expires_at: expiresAt || null,
      }))

    if (records.length === 0) return

    const { error } = await supabase.from('notifications').insert(records)
    if (error) console.error('[notify] Insert error:', error)
  } catch (err) {
    // Notifications must never break the feature that triggered them
    console.error('[notify] Error:', err)
  }
}

/** Cache for admin user IDs — 5-minute TTL */
let adminCache = { ids: [], fetchedAt: 0 }

export async function getAdminUserIds() {
  const FIVE_MIN = 5 * 60 * 1000
  if (Date.now() - adminCache.fetchedAt < FIVE_MIN && adminCache.ids.length > 0) {
    return adminCache.ids
  }
  const { data } = await supabase.from('profiles').select('id').eq('role', 'admin')
  const ids = (data || []).map(r => r.id)
  adminCache = { ids, fetchedAt: Date.now() }
  return ids
}

/**
 * Get all user IDs with a specific permission flag, plus all admins.
 * @param {string} permissionFlag - e.g. 'can_view_chickens'
 */
export async function getUserIdsWithPermission(permissionFlag) {
  const [{ data: admins }, { data: permitted }] = await Promise.all([
    supabase.from('profiles').select('id').eq('role', 'admin'),
    supabase.from('profiles').select('id').eq(permissionFlag, true),
  ])
  const allIds = new Set()
  ;(admins || []).forEach(r => allIds.add(r.id))
  ;(permitted || []).forEach(r => allIds.add(r.id))
  return [...allIds]
}
