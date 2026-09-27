import { randomUUID } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile, requireRole } from './access.js'
import { SHIPMENT_TRACKING_RULE_CATALOG_PATH, fallbackShipmentTrackingRuleCatalog, materializeShipmentTrackingRuleCatalog } from './shared/shipmentTrackingRuleCatalog.js'

export const shipmentTrackingRuleCatalogPath = SHIPMENT_TRACKING_RULE_CATALOG_PATH
export const hasShipmentTrackingRuleCatalogAdminAccess = (profile) => profile?.active === true && ['admin', 'superadmin'].includes(profile?.role)

async function requireRuleCatalogAdmin(request) {
  const profile = await requireActiveProfile(request)
  if (!hasShipmentTrackingRuleCatalogAdminAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für die Regelstufen der Sendungsverfolgung.')
  return requireRole(profile, ['admin', 'superadmin'], 'Keine Berechtigung für die Regelstufen der Sendungsverfolgung.')
}

export async function updateShipmentTrackingRuleCatalogHandler(request) {
  await requireRuleCatalogAdmin(request)
  const ref = getFirestore().doc(shipmentTrackingRuleCatalogPath)
  const previous = await ref.get()
  let catalog
  try { catalog = materializeShipmentTrackingRuleCatalog(request.data?.catalog, previous.exists ? previous.data() : fallbackShipmentTrackingRuleCatalog(), randomUUID) } catch (error) { throw new HttpsError('invalid-argument', error.message) }
  await ref.set({ ...catalog, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true })
  return { catalog }
}
