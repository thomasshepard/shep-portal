import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

export default function AdminRoute({ children }) {
  const { session, isAdmin, loading } = useAuth()

  if (loading) return <LoadingSpinner fullScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return children
}
