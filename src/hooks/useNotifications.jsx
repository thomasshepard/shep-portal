import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useNotifications(userId) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const [loading, setLoading]             = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('dismissed', false)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(50)
    if (!error && data) {
      setNotifications(data)
      setUnreadCount(data.filter(n => !n.read).length)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Supabase Realtime — listen for new notifications for this user
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new
          // Respect expiry on live inserts
          if (n.expires_at && new Date(n.expires_at) < new Date()) return
          setNotifications(prev => [n, ...prev])
          if (!n.read) setUnreadCount(prev => prev + 1)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const markRead = useCallback(async (notificationId) => {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
    if (!error) {
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
  }, [])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('read', false)
    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    }
  }, [userId])

  const dismiss = useCallback(async (notificationId) => {
    const { error } = await supabase
      .from('notifications')
      .update({ dismissed: true, dismissed_at: new Date().toISOString(), read: true })
      .eq('id', notificationId)
    if (!error) {
      setNotifications(prev => prev.filter(n => n.id !== notificationId))
      setUnreadCount(prev => {
        const wasUnread = notifications.find(n => n.id === notificationId && !n.read)
        return wasUnread ? Math.max(0, prev - 1) : prev
      })
    }
  }, [notifications])

  const dismissAll = useCallback(async () => {
    if (!userId) return
    const { error } = await supabase
      .from('notifications')
      .update({ dismissed: true, dismissed_at: new Date().toISOString(), read: true })
      .eq('user_id', userId)
      .eq('dismissed', false)
    if (!error) {
      setNotifications([])
      setUnreadCount(0)
    }
  }, [userId])

  return { notifications, unreadCount, loading, markRead, markAllRead, dismiss, dismissAll, refresh: fetchNotifications }
}
