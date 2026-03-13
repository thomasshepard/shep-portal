import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  const isAdmin = profile?.role === 'admin'
  const isVA = profile?.role === 'va'

  // Admins can access everything. VAs get properties access. Other users need explicit flags.
  const permissions = {
    properties: isAdmin || isVA || !!profile?.can_view_properties,
    llcs: isAdmin || !!profile?.can_view_llcs,
    chickens: isAdmin || !!profile?.can_view_chickens,
    editTenants: isAdmin || isVA,
    manageMaintenance: isAdmin || isVA,
    logPayments: isAdmin || isVA,
    documents: isAdmin || !!profile?.can_view_documents,
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, isAdmin, isVA, permissions }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
