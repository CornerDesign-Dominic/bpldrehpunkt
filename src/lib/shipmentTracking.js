import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase.js'
import { reportTechnicalFailure } from './diagnostics.js'
import { diagnosticCode } from './diagnosticClassification.js'

export const SHIPMENT_TRACKINGS_COLLECTION = 'transportOrderTrackings'

function mapSnapshot(snapshot) { return { id: snapshot.id, ...snapshot.data() } }

export async function getShipmentTracking(orderId) {
  try {
    const trackingRef = doc(db, SHIPMENT_TRACKINGS_COLLECTION, orderId)
    const [trackingSnapshot, eventSnapshots] = await Promise.all([
      getDoc(trackingRef),
      getDocs(query(collection(trackingRef, 'events'), orderBy('recordedAt', 'desc'))),
    ])
    return { tracking: trackingSnapshot.exists() ? mapSnapshot(trackingSnapshot) : null, events: eventSnapshots.docs.map(mapSnapshot) }
  } catch (error) {
    void reportTechnicalFailure({ module: 'shipment-tracking', stage: 'load', error, orderId })
    throw error
  }
}

function dateTimeInputToIso(value) {
  if (!value) return null
  const localDate = new Date(value)
  return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString()
}

export async function updateManualShipmentTracking({ orderId, action, values, recipientChanges, source, note }) {
  const changes = values && action === 'update' ? Object.fromEntries(Object.entries(values).map(([key, value]) => [key, key.endsWith('At') ? dateTimeInputToIso(value) : value])) : undefined
  try {
    const result = await httpsCallable(functions, 'updateManualShipmentTracking')({ orderId, action, ...(changes ? { changes } : {}), ...(recipientChanges ? { recipientChanges } : {}), source, note })
    return result.data
  } catch (error) {
    // Server-side failures are recorded by the callable itself; transport failures cannot be.
    if (diagnosticCode(error) !== 'internal') void reportTechnicalFailure({ module: 'shipment-tracking', stage: 'save', error, orderId })
    throw error
  }
}

export async function getShipmentTrackingDryRun(orderId) {
  try {
    const result = await httpsCallable(functions, 'getShipmentTrackingDryRun')({ orderId })
    if (!result.data?.preview || typeof result.data.preview !== 'object') {
      void reportTechnicalFailure({ module: 'shipment-tracking', stage: 'preview', code: 'invalid-response', orderId })
      throw Object.assign(new Error('Die Automatik-Vorschau hat kein gültiges Ergebnis geliefert.'), { code: 'functions/internal' })
    }
    return result.data.preview
  } catch (error) {
    if (diagnosticCode(error) !== 'internal') void reportTechnicalFailure({ module: 'shipment-tracking', stage: 'preview', error, orderId })
    throw error
  }
}

export async function sendManualShipmentTrackingMail(orderId, payload) {
  try {
    const result = await httpsCallable(functions, 'sendManualShipmentTrackingMail')({ orderId, ...payload })
    return result.data
  } catch (error) {
    if (diagnosticCode(error) !== 'internal') void reportTechnicalFailure({ module: 'shipment-tracking-manual-mail', stage: 'send', error, orderId })
    throw error
  }
}

export async function previewManualShipmentTrackingMail(orderId, templateId) {
  const result = await httpsCallable(functions, 'previewManualShipmentTrackingMail')({ orderId, templateId })
  if (typeof result.data?.templateId !== 'string' || typeof result.data.subject !== 'string' || typeof result.data.message !== 'string') throw Object.assign(new Error('Die Mailvorschau hat kein gültiges Ergebnis geliefert.'), { code: 'functions/internal' })
  return result.data
}

export function shipmentTrackingManualMailErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  if (code === 'functions/permission-denied') return 'Keine Berechtigung zum Versand der Tracking-Anfrage.'
  if (code === 'functions/failed-precondition' || code === 'functions/already-exists' || code === 'functions/not-found') return typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : 'Die Anfrage kann derzeit nicht versendet werden.'
  return 'Die Tracking-Anfrage konnte nicht versendet werden.'
}

export function shipmentTrackingDryRunErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  if (code === 'functions/permission-denied') return 'Keine Berechtigung zur Anzeige der Automatik-Vorschau.'
  if (code === 'functions/unauthenticated') return 'Die Automatik-Vorschau ist nicht authentifiziert erreichbar. Bitte die Sitzung erneut laden.'
  if (code === 'functions/failed-precondition' || code === 'functions/not-found') return typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : 'Die Automatik-Vorschau kann für diesen Auftrag nicht berechnet werden.'
  return 'Die Automatik-Vorschau konnte wegen eines technischen Fehlers nicht geladen werden.'
}
