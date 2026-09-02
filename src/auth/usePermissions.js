import { useMemo } from 'react'
import { canEdit, canManagePermissions, canManageUsers, canView, getPermissionLevel, hasPermission } from '../lib/permissions.js'
import { useAuth } from './useAuth.js'

export function usePermissions() {
  const { profile } = useAuth()
  return useMemo(() => ({
    canView: (module) => canView(profile, module),
    canEdit: (module) => canEdit(profile, module),
    hasPermission: (module, level) => hasPermission(profile, module, level),
    getPermissionLevel: (module) => getPermissionLevel(profile, module),
    canManageUsers: canManageUsers(profile),
    canManagePermissions: canManagePermissions(profile),
  }), [profile])
}
