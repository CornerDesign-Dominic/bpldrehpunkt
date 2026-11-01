export const importPermission = { single: 'transportOrderSingleImport', bulk: 'transportOrderBulkImport', refresh: 'transportOrderRefresh' }
export const hasOrderImportAccess = (profile, kind) => Boolean(importPermission[kind]) && (profile?.role === 'superadmin' || profile?.permissions?.[importPermission[kind]] === 'edit')
export const canReadAllOrderImports = profile => ['admin', 'superadmin'].includes(profile?.role)
