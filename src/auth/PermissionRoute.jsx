import { Navigate, useLocation } from 'react-router-dom'
import AuthLoadingScreen from './AuthLoadingScreen.jsx'
import { useAuth } from './useAuth.js'
import { canManageUsers, canView } from '../lib/permissions.js'

export function AccessDenied() {
  return <section className="page-state page-state--error"><h2>Keine Berechtigung</h2><p>Für diesen Bereich hast du keinen Zugriff.</p></section>
}

export default function PermissionRoute({ module, children, requireUserManagement = false }) {
  const { isLoading, profile } = useAuth()
  const location = useLocation()
  if (isLoading) return <AuthLoadingScreen />
  const allowed = requireUserManagement ? canManageUsers(profile) : canView(profile, module)
  if (allowed) return children
  // Keep a compact denial view for logged-in users; unauthenticated access still
  // goes through ProtectedRoute before this component.
  if (location.pathname === '/dashboard') return <Navigate to="/profil" replace />
  return <AccessDenied />
}
