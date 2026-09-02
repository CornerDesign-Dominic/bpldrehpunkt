import { Navigate } from 'react-router-dom'
import AuthLoadingScreen from './AuthLoadingScreen.jsx'
import { useAuth } from './useAuth.js'

export default function ProtectedRoute({ children }) {
  const { isLoading, user, isProfileActive } = useAuth()
  if (isLoading) return <AuthLoadingScreen />
  return user && isProfileActive ? children : <Navigate to="/login" replace />
}
