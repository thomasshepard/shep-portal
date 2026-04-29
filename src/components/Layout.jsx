import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAccessLog } from '../hooks/useAccessLog'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

function formatUntil(iso) {
  const d = new Date(iso)
  const diffH = (d - Date.now()) / 3600000
  if (diffH < 1) return `${Math.round(diffH * 60)}m`
  if (diffH < 24) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { log } = useAccessLog()
  const { session } = useAuth()
  const [pausedUntil, setPausedUntil] = useState(null)

  useEffect(() => {
    log('page_view', location.pathname)
  }, [location.pathname])

  // Re-fetch paused_until on every navigation so the banner reflects latest prefs
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return
    supabase
      .from('notification_preferences')
      .select('paused_until')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const val = data?.paused_until
        setPausedUntil(val && new Date(val) > new Date() ? val : null)
      })
  }, [session?.user?.id, location.pathname])

  async function handleResume() {
    const userId = session?.user?.id
    if (!userId) return
    await supabase
      .from('notification_preferences')
      .update({ paused_until: null })
      .eq('user_id', userId)
    setPausedUntil(null)
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuToggle={() => setSidebarOpen(true)} />
        {pausedUntil && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 flex-shrink-0">
            <span className="text-sm text-amber-800 font-medium">
              🔕 Notifications paused until {formatUntil(pausedUntil)}
            </span>
            <button
              onClick={handleResume}
              className="text-sm text-amber-600 hover:text-amber-800 font-semibold underline underline-offset-2"
            >
              Resume now
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
