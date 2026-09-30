import AuthLoadingScreen from './AuthLoadingScreen.jsx'
import { useAuth } from './useAuth.js'
import { canEdit, canManagePermissions, canManageUsers, canManageVacations, canView, canViewSystemCalendars } from '../lib/permissions.js'

export function AccessDenied() {
  return <section className="page-state page-state--error"><h2>Keine Berechtigung</h2><p>Für diesen Bereich hast du keinen Zugriff.</p></section>
}

export default function PermissionRoute({ module, children, minimum = 'view', requireUserManagement = false, requireVacationManagement = false, requireSuperadmin = false }) {
  const { isLoading, profile } = useAuth()
  if (isLoading) return <AuthLoadingScreen />
  const allowed = requireSuperadmin ? canManagePermissions(profile) && profile?.active === true : requireUserManagement ? canManageUsers(profile) : requireVacationManagement ? canManageVacations(profile) : module === 'calendar' ? canView(profile, 'calendar') || canViewSystemCalendars(profile) : minimum === 'edit' ? canEdit(profile, module) : canView(profile, module)
  if (allowed) return children
  return <AccessDenied />
}
