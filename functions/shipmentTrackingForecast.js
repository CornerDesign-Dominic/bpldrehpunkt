import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile, requireRole } from './access.js'
import { hasTrackingEditAccess, hasTrackingViewAccess } from './shipmentTracking.js'
import { buildShipmentTrackingForecast } from './shared/shipmentTrackingForecast.js'
import { shipmentTrackingAttention } from './shared/shipmentTrackingAttention.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shared/shipmentTrackingOperatingHours.js'
import { shipmentTrackingOperatingHoursPath } from './shipmentTrackingOperatingHours.js'
import { DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS, SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH, validateShipmentTrackingForecastSettings } from './shared/shipmentTrackingForecastSettings.js'

function validOrderId(value) { return typeof value === 'string' && value.trim() && value.trim().length <= 240 && !value.includes('/') ? value.trim() : '' }
function serializable(value) {
  if (value instanceof Date) return Timestamp.fromDate(value)
  if (Array.isArray(value)) return value.map(serializable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializable(item)]))
  return value
}
function publicForecast(value) {
  if (!value || typeof value !== 'object') return null
  return value
}
export function hasShipmentTrackingForecastAdminAccess(profile) { return profile?.active === true && ['admin', 'superadmin'].includes(profile?.role) }

export async function updateShipmentTrackingForecastSettingsHandler(request) {
  const profile = await requireActiveProfile(request)
  if (!hasShipmentTrackingForecastAdminAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für die Prognoseeinstellungen.')
  await requireRole(profile, ['admin', 'superadmin'], 'Keine Berechtigung für die Prognoseeinstellungen.')
  let settings
  try { settings = validateShipmentTrackingForecastSettings(request.data?.settings) } catch (error) { throw new HttpsError('invalid-argument', error.message) }
  await getFirestore().doc(SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH).set({ ...settings, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true })
  return { settings }
}

async function calculate(orderId, now = new Date()) {
  const db = getFirestore()
  const [orderSnapshot, trackingSnapshot, routeSnapshot, settingsSnapshot, eventSnapshot] = await Promise.all([
    db.doc(`transportOrders/${orderId}`).get(), db.doc(`transportOrderTrackings/${orderId}`).get(), db.doc(`transportOrderRoutes/${orderId}`).get(), db.doc(SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH).get(),
    db.collection(`transportOrderTrackings/${orderId}/events`).orderBy('eventTime', 'desc').limit(50).get(),
  ])
  if (!orderSnapshot.exists) throw new HttpsError('not-found', 'Transportauftrag nicht gefunden.')
  if (!trackingSnapshot.exists) return { forecast: { kind: 'none', state: 'none', message: 'Sendungsverfolgung noch nicht gestartet.' }, settings: settingsSnapshot.exists ? settingsSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS }
  const settings = settingsSnapshot.exists ? settingsSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS
  return {
    trackingRef: trackingSnapshot.ref, tracking: trackingSnapshot.data(),
    forecast: buildShipmentTrackingForecast({ tracking: trackingSnapshot.data(), imported: orderSnapshot.data()?.imported, route: routeSnapshot.exists ? routeSnapshot.data() : {}, events: eventSnapshot.docs.map((entry) => entry.data()), settings, now }), settings,
  }
}

export async function getShipmentTrackingForecastHandler(request) {
  const profile = await requireActiveProfile(request)
  if (!hasTrackingViewAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für die Transportprognose.')
  const orderId = validOrderId(request.data?.orderId)
  if (!orderId) throw new HttpsError('invalid-argument', 'Die Transportauftrags-ID ist ungültig.')
  const result = await calculate(orderId)
  const history = result.trackingRef ? await result.trackingRef.collection('forecastHistory').orderBy('createdAt', 'desc').limit(20).get() : null
  return { forecast: publicForecast(result.forecast), history: history ? history.docs.map((entry) => ({ id: entry.id, ...entry.data() })) : [], settings: { redThresholdPercent: result.settings.redThresholdPercent ?? 15, greenThresholdPercent: result.settings.greenThresholdPercent ?? 50 } }
}

export async function getShipmentTrackingAttentionHandler(request) {
  const profile = await requireActiveProfile(request)
  if (!hasTrackingViewAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für die Handlungsempfehlung.')
  const orderId = validOrderId(request.data?.orderId)
  if (!orderId) throw new HttpsError('invalid-argument', 'Die Transportauftrags-ID ist ungültig.')
  const db = getFirestore()
  const [orderSnapshot, trackingSnapshot, settingsSnapshot, operatingHoursSnapshot, mailSnapshot] = await Promise.all([
    db.doc(`transportOrders/${orderId}`).get(), db.doc(`transportOrderTrackings/${orderId}`).get(), db.doc(SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH).get(), db.doc(shipmentTrackingOperatingHoursPath).get(), db.collection(`transportOrders/${orderId}/receivedMails`).orderBy('receivedAt', 'desc').limit(50).get(),
  ])
  if (!orderSnapshot.exists) throw new HttpsError('not-found', 'Transportauftrag nicht gefunden.')
  const attention = shipmentTrackingAttention({ tracking: trackingSnapshot.exists ? trackingSnapshot.data() : null, imported: orderSnapshot.data()?.imported, receivedMails: mailSnapshot.docs.map((item) => item.data()), settings: settingsSnapshot.exists ? settingsSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS, operatingHours: operatingHoursSnapshot.exists ? operatingHoursSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS })
  return { attention }
}

export async function refreshShipmentTrackingForecastHandler(request) {
  const profile = await requireActiveProfile(request)
  if (!hasTrackingEditAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für die Transportprognose.')
  const orderId = validOrderId(request.data?.orderId)
  if (!orderId) throw new HttpsError('invalid-argument', 'Die Transportauftrags-ID ist ungültig.')
  const result = await calculate(orderId)
  if (!result.trackingRef) throw new HttpsError('failed-precondition', 'Die Sendungsverfolgung wurde noch nicht gestartet.')
  const forecast = result.forecast
  if (forecast.kind === 'none') throw new HttpsError('failed-precondition', forecast.message)
  if (['arrival', 'completed'].includes(forecast.kind)) {
    const current = { ...serializable(forecast), refreshedAt: FieldValue.serverTimestamp(), refreshedBy: request.auth.uid }
    await result.trackingRef.set({ currentForecast: current, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return { forecast: publicForecast(forecast) }
  }
  const record = { ...serializable(forecast), trigger: request.data?.trigger === 'automatic' ? 'automatic' : 'manual', createdAt: FieldValue.serverTimestamp(), createdBy: request.auth.uid }
  const current = { ...serializable(forecast), refreshedAt: FieldValue.serverTimestamp(), refreshedBy: request.auth.uid }
  await result.trackingRef.collection('forecastHistory').add(record)
  await result.trackingRef.set({ currentForecast: current, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  return { forecast: publicForecast(forecast) }
}

/** Server-side event adapter. The caller provides no mail data and this never
 * sends mail; it only persists a new, traceable calculation. */
export async function refreshAutomaticShipmentTrackingForecast(orderId) {
  const result = await calculate(orderId)
  if (!result.trackingRef || result.forecast.kind === 'none') return null
  const forecast = result.forecast
  const record = { ...serializable(forecast), trigger: 'automatic', createdAt: FieldValue.serverTimestamp(), createdBy: 'system' }
  const current = { ...serializable(forecast), refreshedAt: FieldValue.serverTimestamp(), refreshedBy: 'system' }
  if (['arrival', 'completed'].includes(forecast.kind)) {
    await result.trackingRef.set({ currentForecast: current, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return forecast
  }
  await result.trackingRef.collection('forecastHistory').add(record)
  await result.trackingRef.set({ currentForecast: current, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  return forecast
}

/** Synchronize terminal facts (including corrections) without creating a
 * forecast history entry. */
export async function finalizeShipmentTrackingForecastArrival(orderId) {
  const result = await calculate(orderId)
  if (!result.trackingRef) return null
  // A correction may remove the terminal fact; restore the current projection
  // without inventing another forecast-history calculation.
  const current = result.forecast.kind === 'none' ? null : { ...serializable(result.forecast), refreshedAt: FieldValue.serverTimestamp(), refreshedBy: 'system' }
  await result.trackingRef.set({ currentForecast: current, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  return result.forecast
}

export function shipmentTrackingMailAttentionChanged(before, after) {
  const review = (snapshot) => snapshot.exists && (snapshot.data()?.ai?.reviewRequired === true || ['needs_review', 'error'].includes(snapshot.data()?.ai?.status))
  const receivedAt = (snapshot) => snapshot.data()?.receivedAt?.toMillis?.() ?? snapshot.data()?.receivedAt ?? null
  return before.exists !== after.exists || review(before) !== review(after) || receivedAt(before) !== receivedAt(after)
}

export async function refreshShipmentTrackingAttentionSummary(orderId, { db = getFirestore() } = {}) {
  return db.runTransaction(async (transaction) => {
    const [orderSnapshot, trackingSnapshot, settingsSnapshot, operatingHoursSnapshot, mailSnapshot] = await Promise.all([
      transaction.get(db.doc(`transportOrders/${orderId}`)), transaction.get(db.doc(`transportOrderTrackings/${orderId}`)), transaction.get(db.doc(SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH)), transaction.get(db.doc(shipmentTrackingOperatingHoursPath)), transaction.get(db.collection(`transportOrders/${orderId}/receivedMails`).orderBy('receivedAt', 'desc').limit(50)),
    ])
    if (!orderSnapshot.exists || !trackingSnapshot.exists) return null
    const attention = shipmentTrackingAttention({ tracking: trackingSnapshot.data(), imported: orderSnapshot.data()?.imported, receivedMails: mailSnapshot.docs.map((item) => item.data()), settings: settingsSnapshot.exists ? settingsSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS, operatingHours: operatingHoursSnapshot.exists ? operatingHoursSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS })
    const manualReviewOpen = mailSnapshot.docs.some((entry) => { const ai = entry.data()?.ai; return ai?.reviewRequired === true || ['needs_review', 'error'].includes(ai?.status) })
    if (trackingSnapshot.data()?.attentionSummary?.manualReviewOpen !== manualReviewOpen) transaction.set(trackingSnapshot.ref, { attentionSummary: { manualReviewOpen, updatedAt: FieldValue.serverTimestamp() } }, { merge: true })
    return attention
  })
}
