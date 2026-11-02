import { canManageVacations, canView } from './permissions.js'

export const TEAM_VACATION_PATH = '/team-urlaub'

export const teamVacationTabs = Object.freeze([
  { id: 'overview', path: TEAM_VACATION_PATH, de: 'Übersicht', en: 'Overview' },
  { id: 'team', path: '/team', module: 'team', de: 'Das Team', en: 'The team' },
  { id: 'vacation', path: '/urlaub', module: 'vacation', de: 'Mein Urlaub', en: 'My leave' },
  { id: 'management', path: '/urlaubsmanagement', vacationManagement: true, de: 'Urlaubsmanagement', en: 'Leave management' },
])

export function canViewTeamVacationTab(profile, tab) {
  return tab.vacationManagement ? canManageVacations(profile) : !tab.module || canView(profile, tab.module)
}

export function canAccessTeamVacation(profile) {
  return teamVacationTabs.slice(1).some(tab => canViewTeamVacationTab(profile, tab))
}

export function isTeamVacationPath(pathname) {
  return teamVacationTabs.some(tab => pathname === tab.path || tab.id !== 'overview' && pathname.startsWith(`${tab.path}/`))
}
