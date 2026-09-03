export const PERMISSION_LEVELS = ['none', 'view', 'edit']

// Keep every product module in one place. Adding a module is deliberately a
// small, explicit change: add it here, protect its route and add it to navigation.
export const MODULES = {
  vacation: { label: 'Urlaub' },
  team: { label: 'Team' },
  masterData: { label: 'Stammdaten' },
  crm: { label: 'CRM' },
  pallets: { label: 'Palettenmanagement' },
  news: { label: 'News' },
  documents: { label: 'Dokumente' },
  todos: { label: 'To-dos' },
}

export const USER_ROLES = ['user', 'admin', 'superadmin']
export const ROLE_LABELS = { user: 'User', admin: 'Admin', superadmin: 'Superadmin' }

const levelValue = { none: 0, view: 1, edit: 2 }

export function normalizeRole(role) {
  return USER_ROLES.includes(role) ? role : 'user'
}

export function normalizePermissions(permissions) {
  return Object.fromEntries(Object.keys(MODULES).map((module) => [module, PERMISSION_LEVELS.includes(permissions?.[module]) ? permissions[module] : 'none']))
}

export function getPermissionLevel(profile, module) {
  if (!Object.hasOwn(MODULES, module)) return 'none'
  if (normalizeRole(profile?.role) === 'superadmin') return 'edit'
  return normalizePermissions(profile?.permissions)[module]
}

export function hasPermission(profile, module, minimum = 'view') {
  return levelValue[getPermissionLevel(profile, module)] >= levelValue[minimum]
}

export const canView = (profile, module) => hasPermission(profile, module, 'view')
export const canEdit = (profile, module) => hasPermission(profile, module, 'edit')
export const canManageUsers = (profile) => ['admin', 'superadmin'].includes(normalizeRole(profile?.role))
export const canManagePermissions = (profile) => normalizeRole(profile?.role) === 'superadmin'
export const canManageVacations = (profile) => normalizeRole(profile?.role) === 'superadmin' || profile?.vacationManager === true

export function getSafeProfileDefaults(profile) {
  const vacationManager = profile?.vacationManager === true
  const vacationManagerAllDepartments = vacationManager && profile?.vacationManagerAllDepartments === true
  const vacationManagerDepartments = vacationManager && !vacationManagerAllDepartments && Array.isArray(profile?.vacationManagerDepartments)
    ? [...new Set(profile.vacationManagerDepartments.filter((department) => typeof department === 'string' && department.trim()).map((department) => department.trim()))]
    : []
  const departmentId = typeof profile?.departmentId === 'string' ? profile.departmentId.trim() : ''
  const departmentName = typeof profile?.departmentName === 'string' && profile.departmentName.trim()
    ? profile.departmentName.trim()
    : (typeof profile?.department === 'string' ? profile.department.trim() : '')
  const safeProfile = { ...profile, departmentName, department: departmentName, role: normalizeRole(profile?.role), permissions: normalizePermissions(profile?.permissions), vacationManager, vacationManagerAllDepartments, vacationManagerDepartments }
  if (departmentId) safeProfile.departmentId = departmentId
  else delete safeProfile.departmentId
  return safeProfile
}
