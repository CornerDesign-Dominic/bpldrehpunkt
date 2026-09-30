import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile, requireRole } from './access.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, normalizeShipmentTrackingOperatingHours, previewShipmentTrackingOperatingHours, validateShipmentTrackingOperatingHours } from './shared/shipmentTrackingOperatingHours.js'

export const shipmentTrackingOperatingHoursPath = 'systemSettings/shipmentTrackingOperatingHours'

export function hasShipmentTrackingOperatingHoursAdminAccess(profile) {
  return profile?.active === true && ['admin', 'superadmin'].includes(profile?.role)
}

async function requireOperatingHoursAdmin(request) {
  const profile = await requireActiveProfile(request)
  if (!hasShipmentTrackingOperatingHoursAdminAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für die Betriebszeiten der Sendungsverfolgung.')
  return requireRole(profile, ['admin', 'superadmin'], 'Keine Berechtigung für die Betriebszeiten der Sendungsverfolgung.')
}

function settingsFromSnapshot(snapshot) {
  return normalizeShipmentTrackingOperatingHours(snapshot.exists ? snapshot.data() : DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS)
}

export async function updateShipmentTrackingOperatingHoursHandler(request) {
  await requireOperatingHoursAdmin(request)
  let settings
  try { settings = validateShipmentTrackingOperatingHours(request.data?.settings) } catch (error) { throw new HttpsError('invalid-argument', error.message) }
  await getFirestore().doc(shipmentTrackingOperatingHoursPath).set({ ...settings, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true })
  return { settings }
}

export async function previewShipmentTrackingOperatingHoursHandler(request) {
  await requireOperatingHoursAdmin(request)
  const snapshot = await getFirestore().doc(shipmentTrackingOperatingHoursPath).get()
  try {
    return { preview: previewShipmentTrackingOperatingHours(settingsFromSnapshot(snapshot), request.data ?? {}) }
  } catch (error) {
    throw new HttpsError('failed-precondition', error.message)
  }
}
