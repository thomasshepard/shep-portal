import { supabase } from './supabase'

const MSG_SELECT = '*, profiles!msg_messages_sender_id_fkey(id, full_name, email)'

// ── Channels ──────────────────────────────────────────────────────────────────

// All channels the given profile belongs to, enriched with other members,
// last message preview, and unread count. N+1 per channel is intentional —
// fine at VA-team scale, revisit with a summary view if channel count grows.
export async function fetchMyChannels(profileId) {
  const { data: memberRows, error } = await supabase
    .from('msg_members')
    .select('channel_id, last_read_at, muted, msg_channels(id, kind, name, context_type, context_id, created_at, created_by)')
    .eq('profile_id', profileId)
  if (error || !memberRows?.length) return []

  const channelIds = memberRows.map(r => r.channel_id)

  const { data: allMembers } = await supabase
    .from('msg_members')
    .select('channel_id, profile_id, role, profiles(id, full_name, email)')
    .in('channel_id', channelIds)

  const channels = await Promise.all(memberRows.map(async (row) => {
    const [{ data: lastMsgs }, { count: unreadCount }] = await Promise.all([
      supabase
        .from('msg_messages')
        .select('id, body, sender_id, attachments, created_at, deleted_at')
        .eq('channel_id', row.channel_id)
        .is('thread_root_id', null)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('msg_messages')
        .select('id', { count: 'exact', head: true })
        .eq('channel_id', row.channel_id)
        .is('thread_root_id', null)
        .neq('sender_id', profileId)
        .gt('created_at', row.last_read_at),
    ])

    return {
      ...row.msg_channels,
      last_read_at: row.last_read_at,
      muted: row.muted,
      members: (allMembers || []).filter(m => m.channel_id === row.channel_id),
      lastMessage: lastMsgs?.[0] || null,
      unreadCount: unreadCount || 0,
    }
  }))

  return channels.sort((a, b) => {
    const at = a.lastMessage?.created_at || a.created_at
    const bt = b.lastMessage?.created_at || b.created_at
    return new Date(bt) - new Date(at)
  })
}

export function channelDisplayName(channel, myProfileId) {
  if (!channel) return ''
  if (channel.kind !== 'dm') return channel.name || 'Group chat'
  const other = (channel.members || []).find(m => m.profile_id !== myProfileId)
  return other?.profiles?.full_name || other?.profiles?.email || 'Direct message'
}

// Finds an existing 1:1 DM between the two profiles, or creates one.
export async function findOrCreateDM(myProfileId, otherProfileId) {
  const { data: mine } = await supabase
    .from('msg_members')
    .select('channel_id, msg_channels!inner(kind)')
    .eq('profile_id', myProfileId)
    .eq('msg_channels.kind', 'dm')

  for (const row of mine || []) {
    const { data: members } = await supabase
      .from('msg_members')
      .select('profile_id')
      .eq('channel_id', row.channel_id)
    const ids = new Set((members || []).map(m => m.profile_id))
    if (ids.size === 2 && ids.has(otherProfileId)) return row.channel_id
  }

  const { data: channel, error } = await supabase
    .from('msg_channels')
    .insert({ kind: 'dm', created_by: myProfileId })
    .select()
    .single()
  if (error) throw error

  const { error: memErr } = await supabase.from('msg_members').insert([
    { channel_id: channel.id, profile_id: myProfileId, role: 'owner' },
    { channel_id: channel.id, profile_id: otherProfileId, role: 'member' },
  ])
  if (memErr) throw memErr

  return channel.id
}

export async function createGroup(myProfileId, name, memberIds) {
  const { data: channel, error } = await supabase
    .from('msg_channels')
    .insert({ kind: 'group', name: name || null, created_by: myProfileId })
    .select()
    .single()
  if (error) throw error

  const rows = [
    { channel_id: channel.id, profile_id: myProfileId, role: 'owner' },
    ...memberIds.filter(id => id !== myProfileId).map(id => ({ channel_id: channel.id, profile_id: id, role: 'member' })),
  ]
  const { error: memErr } = await supabase.from('msg_members').insert(rows)
  if (memErr) throw memErr

  return channel.id
}

export async function fetchChannelMembers(channelId) {
  const { data } = await supabase
    .from('msg_members')
    .select('channel_id, profile_id, role, muted, profiles(id, full_name, email)')
    .eq('channel_id', channelId)
  return data || []
}

export async function markChannelRead(channelId, profileId) {
  await supabase
    .from('msg_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('profile_id', profileId)
}

export async function setChannelMuted(channelId, profileId, muted) {
  await supabase
    .from('msg_members')
    .update({ muted })
    .eq('channel_id', channelId)
    .eq('profile_id', profileId)
}

// ── Messages ──────────────────────────────────────────────────────────────────

// Root (non-thread) messages by default; pass threadRootId to fetch a thread
// (root + its replies) instead. Keyset pagination via `before`.
export async function fetchMessages(channelId, { before, limit = 50, threadRootId = null } = {}) {
  let query = supabase
    .from('msg_messages')
    .select(MSG_SELECT)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit)

  query = threadRootId
    ? query.or(`id.eq.${threadRootId},thread_root_id.eq.${threadRootId}`)
    : query.is('thread_root_id', null)

  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) throw error
  return (data || []).reverse()
}

function extractMentions(body, members) {
  if (!body) return []
  const ids = []
  for (const m of members) {
    const name = m.profiles?.full_name
    if (name && body.includes(`@${name}`)) ids.push(m.profile_id)
  }
  return ids
}

export async function sendMessage({ channelId, senderId, body, attachments = [], threadRootId = null, members = [] }) {
  const mentions = extractMentions(body, members)
  const { data, error } = await supabase
    .from('msg_messages')
    .insert({
      channel_id:     channelId,
      sender_id:      senderId,
      body:           body?.trim() || null,
      attachments,
      thread_root_id: threadRootId,
      mentions,
    })
    .select(MSG_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function editMessage(messageId, body) {
  const { error } = await supabase
    .from('msg_messages')
    .update({ body: body?.trim() || null, is_edited: true, edited_at: new Date().toISOString() })
    .eq('id', messageId)
  if (error) throw error
}

export async function deleteMessage(messageId) {
  const { error } = await supabase
    .from('msg_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
  if (error) throw error
}

// ── Attachments (private bucket, signed URLs only) ──────────────────────────

export async function uploadAttachment(file, channelId) {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const path = `${channelId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('message-attachments').upload(path, file)
  if (error) throw error
  return {
    path,
    kind: file.type.startsWith('image/') ? 'image' : 'file',
    name: file.name,
    size: file.size,
    mime: file.type,
  }
}

export async function signAttachmentUrl(path, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from('message-attachments').createSignedUrl(path, expiresIn)
  if (error) return null
  return data?.signedUrl || null
}

// ── Teammates (DM / group member picker) ────────────────────────────────────

export async function fetchTeammates(excludeProfileId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('is_active', true)
    .neq('id', excludeProfileId)
    .order('full_name')
  if (error) return []
  return data || []
}
