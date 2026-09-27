import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'
import { hasTrackingViewAccess } from './shipmentTracking.js'
import { shipmentTrackingDryRun } from './shared/shipmentTrackingDryRun.js'
import { SHIPMENT_TRACKING_RULE_CATALOG_PATH } from './shared/shipmentTrackingRuleCatalog.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shared/shipmentTrackingOperatingHours.js'
import { shipmentTrackingOperatingHoursPath } from './shipmentTrackingOperatingHours.js'

function orderId(value) {
  return typeof value === 'string' && value.trim() && value.trim().length <= 240 && !value.includes('/') ? value.trim() : ''
}

export function hasShipmentTrackingDryRunAccess(profile) {
  return hasTrackingViewAccess(profile)
}

async function effectivePartner(db, partnerId) {
  if (!partnerId || typeof partnerId !== 'string' || partnerId.includes('/')) return null
  const visited = new Set()
  let currentId = partnerId
  for (let depth = 0; depth < 5; depth += 1) {
    if (visited.has(currentId)) return null
    visited.add(currentId)
    const snapshot = await db.doc(`businessPartners/${currentId}`).get()
    if (!snapshot.exists) return null
    const partner = { id: snapshot.id, ...snapshot.data() }
    if (!partner.mergedIntoPartnerId && partner.status !== 'merged') return partner
    if (typeof partner.mergedIntoPartnerId !== 'string' || !partner.mergedIntoPartnerId || partner.mergedIntoPartnerId.includes('/')) return null
    currentId = partner.mergedIntoPartnerId
  }
  return null
}

/** Read-only source adapter for the pure shared dry-run calculation. */
export async function getShipmentTrackingDryRunHandler(request) {
  const profile = await requireActiveProfile(request)
  if (!hasShipmentTrackingDryRunAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung zur Anzeige der Sendungsverfolgungs-Vorschau.')
  const id = orderId(request.data?.orderId)
  if (!id) throw new HttpsError('invalid-argument', 'Die Transportauftrags-ID ist ungültig.')

  const db = getFirestore()
  try {
    const [orderSnapshot, trackingSnapshot, catalogSnapshot, operatingHoursSnapshot] = await Promise.all([
      db.doc(`transportOrders/${id}`).get(),
      db.doc(`transportOrderTrackings/${id}`).get(),
      db.doc(SHIPMENT_TRACKING_RULE_CATALOG_PATH).get(),
      db.doc(shipmentTrackingOperatingHoursPath).get(),
    ])
    if (!orderSnapshot.exists) throw new HttpsError('not-found', 'Transportauftrag nicht gefunden.')
    const tracking = trackingSnapshot.exists ? trackingSnapshot.data() : null
    if (!tracking || tracking.lifecycleStatus !== 'active') throw new HttpsError('failed-precondition', 'Für diesen Auftrag ist keine aktive Sendungsverfolgung vorhanden.')
    const imported = orderSnapshot.data()?.imported || null
    const [customer, carrier] = await Promise.all([
      effectivePartner(db, imported?.customer?.partnerId),
      effectivePartner(db, imported?.carrier?.partnerId),
    ])
    return {
      preview: shipmentTrackingDryRun({
        imported,
        tracking,
        customer,
        carrier,
        // A missing catalog is a factual preview diagnostic, not a reason to
        // reject the whole callable request. The pure helper decides whether a
        // safe fallback is appropriate for scheduling.
        catalog: catalogSnapshot.exists ? catalogSnapshot.data() : null,
        operatingHours: operatingHoursSnapshot.exists ? operatingHoursSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS,
      }),
    }
  } catch (error) {
    if (!(error instanceof HttpsError)) await recordDiagnostic({
      module: 'tracking-preview', stage: 'load', code: 'unexpected_error',
      message: 'Die Tracking-Vorschau konnte nicht geladen werden.',
      actorId: request.auth.uid,
      actorName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email || 'Unbekannt',
      orderId: id,
    }, db)
    throw error
  }
}
