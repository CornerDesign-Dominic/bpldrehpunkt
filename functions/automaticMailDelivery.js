import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile, requireRole } from './access.js'

export const automaticMailDeliveryPath = 'systemSettings/automaticMailDelivery'

export function automaticMailDeliveryPaused(settings) {
  return settings?.paused === true
}

/** Missing settings deliberately mean "active" so a deployment never
 * silently changes the current delivery behaviour. */
export async function areAutomaticMailsPaused(db = getFirestore()) {
  const snapshot = await db.doc(automaticMailDeliveryPath).get()
  return automaticMailDeliveryPaused(snapshot.exists ? snapshot.data() : null)
}

export async function updateAutomaticMailDeliveryHandler(request) {
  const profile = await requireRole(await requireActiveProfile(request), ['superadmin'], 'Diese Einstellung darf nur von Superadmins geändert werden.')
  const paused = request.data?.paused
  if (typeof paused !== 'boolean') throw new HttpsError('invalid-argument', 'Der Versandstatus muss als wahr oder falsch übergeben werden.')
  await getFirestore().doc(automaticMailDeliveryPath).set({
    paused,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid,
    updatedByName: [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || profile.email || 'Superadmin',
  }, { merge: true })
  return { paused }
}
