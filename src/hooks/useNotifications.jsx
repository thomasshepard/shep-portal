import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

function playBlip() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch {}
}

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
      .or(`snoozed_until.is.null,snoozed_until.lt.${now}`)
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error && data) {
      setNotifications(data)
      setUnreadCount(data.filter(n => !n.read).length)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Supabase Realtime — new notifications for this user
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new
          if (n.expires_at && new Date(n.expires_at) < new Date()) return
          if (n.snoozed_until && new Date(n.snoozed_until) > new Date()) return
          setNotifications(prev => [n, ...prev])
          if (!n.read) {
            setUnreadCount(prev => prev + 1)
            // Play blip if sound is enabled and notification is notable
            if (localStorage.getItem('notif:sound') !== 'false' && n.severity !== 'info') {
              playBlip()
            }
          }
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
      setNotifications(prev => {
        const wasUnread = prev.find(n => n.id === notificationId && !n.read)
        if (wasUnread) setUnreadCount(c => Math.max(0, c - 1))
        return prev.filter(n => n.id !== notificationId)
      })
    }
  }, [])

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

  // Snooze: hide until `hours` from now, then auto-reappear on next fetch.
  const snooze = useCallback(async (notificationId, hours = 1) => {
    const snoozeUntil = new Date(Date.now() + hours * 3600000).toISOString()
    const { error } = await supabase
      .from('notifications')
      .update({ snoozed_until: snoozeUntil })
      .eq('id', notificationId)
    if (!error) {
      setNotifications(prev => {
        const wasUnread = prev.find(n => n.id === notificationId && !n.read)
        if (wasUnread) setUnreadCount(c => Math.max(0, c - 1))
        return prev.filter(n => n.id !== notificationId)
      })
    }
  }, [])

  const trackClick = useCallback(async (notificationId) => {
    await supabase
      .from('notifications')
      .update({ clicked_at: new Date().toISOString() })
      .eq('id', notificationId)
  }, [])

  return {
    notifications, unreadCount, loading,
    markRead, markAllRead, dismiss, dismissAll, snooze, trackClick,
    refresh: fetchNotifications,
  }
}
