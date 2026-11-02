import { useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth.js'
import { AccessDenied } from '../../auth/PermissionRoute.jsx'
import { canAccessTeamVacation, canViewTeamVacationTab, teamVacationTabs } from '../../lib/teamVacationNavigation.js'
import ModuleSectionsLayout from './ModuleSectionsLayout.jsx'

export default function TeamVacationLayout() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  if (!canAccessTeamVacation(profile)) return <AccessDenied />
  const calendar = pathname === '/urlaub' || pathname === '/urlaubsmanagement'
  return <ModuleSectionsLayout tabs={teamVacationTabs.filter(tab => canViewTeamVacationTab(profile, tab))} labelDe="Team und Urlaub" labelEn="Team and leave" className={`team-vacation-workspace${calendar ? ' team-vacation-workspace--calendar' : ''}`} />
}
