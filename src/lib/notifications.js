import { supabase } from './supabase'

function severityRank(s) {
  return s === 'critical' ? 3 : s === 'action_needed' ? 2 : 1
}

/**
 * Insert or update a notification for one or more users.
 *
 * If a non-dismissed row with the same source_key already exists for a user,
 * it is updated in place (title/body refreshed, severity escalated if higher).
 * If the user dismissed it, the notification is not resurrected.
 * If the user's notification_preferences mute the given category, the insert is skipped.
 *
 * @param {Object}          opts
 * @param {string|string[]} opts.userIds
 * @param {string}          opts.title
 * @param {string}          [opts.body]
 * @param {string}          opts.module     - 'happy_cuts'|'properties'|'incubator'|'chickens'|'documents'|'llcs'|'alerts'|'system'
 * @param {string}          [opts.category] - matches mod_<category> pref column, e.g. 'tasks', 'happy_cuts'
 * @param {string}          [opts.severity] - 'critical'|'action_needed'|'info'  (default: 'info')
 * @param {string}          [opts.actionUrl]
 * @param {string}          [opts.sourceKey]
 * @param {Date|string}     [opts.expiresAt]
 */
export async function notify({
  userIds, title, body, module, category, severity = 'info',
  actionUrl, sourceKey, expiresAt,
}) {
  try {
    const ids = Array.isArray(userIds) ? userIds : [userIds]

    // Batch-fetch prefs for all target users so we can respect mutes.
    let prefsMap = {}
    if (category && ids.length > 0) {
      const modCol = `mod_${category}`
      const { data: prefsRows } = await supabase
        .from('notification_preferences')
        .select(`user_id, ${modCol}, email_enabled`)
        .in('user_id', ids)
      for (const row of prefsRows || []) prefsMap[row.user_id] = row
    }

    const toInsert = []

    for (const uid of ids) {
      // 1. Prefs check — skip if user muted this category.
      if (category) {
        const prefs = prefsMap[uid]
        if (prefs && prefs[`mod_${category}`] === false) continue
      }

      // 2. Source-key dedup / update-on-match (Step 8f).
      if (sourceKey) {
        const { data: existing } = await supabase
          .from('notifications')
          .select('id, severity, dismissed')
          .eq('source_key', sourceKey)
          .eq('user_id', uid)
          .maybeSingle()

        if (existing && !existing.dismissed) {
          // Update in place; escalate severity if the new one is higher.
          const newSev = severityRank(severity) > severityRank(existing.severity)
            ? severity : existing.severity
          await supabase.from('notifications').update({
            title,
            body:       body || null,
            severity:   newSev,
            read:       false,
            created_at: new Date().toISOString(),
          }).eq('id', existing.id)
          continue
        }
        if (existing && existing.dismissed) continue // user dismissed — don't resurrect
      }

      toInsert.push({
        user_id:    uid,
        title,
        body:       body || null,
        module,
        category:   category || null,
        severity,
        action_url: actionUrl || null,
        source_key: sourceKey || null,
        expires_at: expiresAt || null,
      })
    }

    if (toInsert.length === 0) return
    const { error } = await supabase.from('notifications').insert(toInsert)
    if (error) console.error('[notify] Insert error:', error)
  } catch (err) {
    // Notifications must never break the feature that triggered them.
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
 * @param {string} permissionFlag - e.g. 'can_view_properties'
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
