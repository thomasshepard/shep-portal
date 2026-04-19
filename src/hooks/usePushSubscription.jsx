import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function usePushSubscription() {
  const { session } = useAuth()
  const [supported,  setSupported]  = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [permission, setPermission] = useState('default')
  const [loading,    setLoading]    = useState(false)

  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window)
    setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
  }, [])

  // Register service worker on mount
  useEffect(() => {
    if (!supported) return
    navigator.serviceWorker
      .register('/shep-portal/sw.js', { scope: '/shep-portal/' })
      .catch(err => console.error('[push] SW registration failed:', err))
  }, [supported])

  // Check if already subscribed
  useEffect(() => {
    if (!supported || !session) return
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => setSubscribed(!!sub))
    })
  }, [supported, session])

  async function subscribe() {
    if (!supported || !session) return
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      const json = sub.toJSON()
      await supabase.from('push_subscriptions').upsert({
        user_id:    session.user.id,
        endpoint:   json.endpoint,
        p256dh:     json.keys.p256dh,
        auth:       json.keys.auth,
        user_agent: navigator.userAgent,
      }, { onConflict: 'user_id,endpoint' })
      setSubscribed(true)
      setPermission('granted')
    } catch (err) {
      console.error('[push] Subscribe failed:', err)
    } finally {
      setLoading(false)
    }
  }

  async function unsubscribe() {
    if (!supported || !session) return
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        await supabase.from('push_subscriptions')
          .delete()
          .eq('user_id', session.user.id)
          .eq('endpoint', sub.endpoint)
      }
      setSubscribed(false)
    } catch (err) {
      console.error('[push] Unsubscribe failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return { supported, subscribed, permission, loading, subscribe, unsubscribe }
}
