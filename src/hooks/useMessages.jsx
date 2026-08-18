import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fetchMyChannels, fetchMessages, markChannelRead } from '../lib/messaging'

// Channel list for the sidebar — last message preview, unread counts, sorted
// by most recent activity. Any new message anywhere re-pulls the list; cheap
// enough at VA-team scale and keeps unread counts trivially correct.
export function useChannelList(profileId) {
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!profileId) return
    const data = await fetchMyChannels(profileId)
    setChannels(data)
    setLoading(false)
  }, [profileId])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!profileId) return
    const channel = supabase
      .channel(`msg-list:${profileId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'msg_messages' }, () => refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profileId, refresh])

  const totalUnread = channels.reduce((sum, c) => sum + (c.unreadCount || 0), 0)

  return { channels, loading, totalUnread, refresh }
}

// Messages for one open channel — initial page + realtime append + read tracking.
export function useChannelMessages(channelId, profileId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!channelId) { setMessages([]); return }
    setLoading(true)
    const data = await fetchMessages(channelId)
    setMessages(data)
    setLoading(false)
  }, [channelId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!channelId) return
    const channel = supabase
      .channel(`msg-channel:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'msg_messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          if (payload.new.thread_root_id) return // thread replies render inside the thread panel, not the main feed
          setMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new])
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'msg_messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [channelId])

  // Mark read whenever the channel is open and the feed changes (new message arrives while viewing).
  useEffect(() => {
    if (channelId && profileId) markChannelRead(channelId, profileId)
  }, [channelId, profileId, messages.length])

  return { messages, loading, refresh: load }
}
