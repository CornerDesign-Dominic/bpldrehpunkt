import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile, requireRole } from './access.js'
import { shipmentTrackingArrivalConfirmationPath, validateShipmentTrackingArrivalConfirmation } from './shared/shipmentTrackingArrivalConfirmation.js'

export { DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION, normalizeShipmentTrackingArrivalConfirmation, shipmentTrackingArrivalConfirmationPath, shipmentTrackingArrivalConfirmationTemplateId, validateShipmentTrackingArrivalConfirmation } from './shared/shipmentTrackingArrivalConfirmation.js'

export function hasShipmentTrackingArrivalConfirmationAdminAccess(profile) {
  return profile?.active === true && ['admin', 'superadmin'].includes(profile?.role)
}

async function requireAdmin(request) {
  const profile = await requireActiveProfile(request)
  if (!hasShipmentTrackingArrivalConfirmationAdminAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für diese Sendungsverfolgungs-Einstellung.')
  return requireRole(profile, ['admin', 'superadmin'], 'Keine Berechtigung für diese Sendungsverfolgungs-Einstellung.')
}

export async function updateShipmentTrackingArrivalConfirmationHandler(request) {
  await requireAdmin(request)
  let settings
  try { settings = validateShipmentTrackingArrivalConfirmation(request.data?.settings) } catch (error) { throw new HttpsError('invalid-argument', error.message) }
  await getFirestore().doc(shipmentTrackingArrivalConfirmationPath).set({ ...settings, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true })
  return { settings }
}
