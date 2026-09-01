import { Navigate } from 'react-router-dom'
import AuthLoadingScreen from './AuthLoadingScreen.jsx'
import { useAuth } from './useAuth.js'

export default function PublicOnlyRoute({ children }) {
  const { isLoading, user } = useAuth()
  if (isLoading) return <AuthLoadingScreen />
  return user ? <Navigate to="/dashboard" replace /> : children
}
