import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'

const accessDeniedMessage = 'Dieses Benutzerkonto ist nicht für den Zugriff freigegeben.'

// A profile is usable only after its active status has explicitly been
// confirmed. Missing profiles and legacy profiles without `active` are never
// treated as active.
export function hasActiveProfile(profile) {
  return Boolean(profile) && profile.active === true
}

export async function requireActiveProfile(request) {
  if (!request?.auth?.uid) throw new HttpsError('unauthenticated', 'Anmeldung erforderlich.')
  const profileSnapshot = await getFirestore().doc(`users/${request.auth.uid}`).get()
  const profile = profileSnapshot.exists ? profileSnapshot.data() : null
  if (!hasActiveProfile(profile)) throw new HttpsError('permission-denied', accessDeniedMessage)
  return profile
}

export function requireRole(profile, allowedRoles, message = 'Keine Berechtigung für diese Aktion.') {
  if (!allowedRoles.includes(profile?.role)) throw new HttpsError('permission-denied', message)
  return profile
}

export { accessDeniedMessage }
