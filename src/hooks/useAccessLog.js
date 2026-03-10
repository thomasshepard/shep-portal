import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useAccessLog() {
  const { session } = useAuth()

  const log = useCallback(async (action, pagePath, metadata = {}) => {
    if (!session?.user) return
    await supabase.from('access_logs').insert({
      user_id: session.user.id,
      user_email: session.user.email,
      page_path: pagePath,
      action,
      metadata: {
        user_agent: navigator.userAgent,
        ...metadata,
      },
    })
  }, [session])

  return { log }
}
