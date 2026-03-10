import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

export default function PermRoute({ permission, children }) {
  const { permissions, loading } = useAuth()
  if (loading) return <LoadingSpinner fullScreen />
  if (!permissions[permission]) return <Navigate to="/dashboard" replace />
  return children
}
