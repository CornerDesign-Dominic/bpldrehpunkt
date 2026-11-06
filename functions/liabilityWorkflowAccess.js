export const hasLiabilityAccess = (profile) => profile?.role === 'superadmin' || ['view', 'edit'].includes(profile?.permissions?.templates)
