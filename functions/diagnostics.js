import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile, requireRole } from './access.js'
import { hasTrackingViewAccess } from './shipmentTracking.js'

export const DIAGNOSTIC_MODULES = Object.freeze(['transport-route', 'tracking-preview', 'shipment-tracking', 'document-templates', 'website'])
const PAGE_SIZE = 50
const safeText = (value, maxLength = 160) => typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
const CLIENT_STAGES = Object.freeze({
  'shipment-tracking': ['load', 'save', 'preview'],
  'document-templates': ['personal-signature-load', 'company-stamp-load', 'pdf-create'],
  website: ['dashboard', 'transport-orders', 'partners', 'crm', 'administration', 'other'],
})
const CLIENT_CODES = new Set(['unavailable', 'deadline-exceeded', 'internal', 'unknown', 'resource-exhausted', 'runtime-error', 'unhandled-rejection', 'invalid-response', 'access-failure'])
const CLIENT_MESSAGES = {
  load: 'Sendungsverfolgung konnte nicht geladen werden.',
  save: 'Änderung der Sendungsverfolgung fehlgeschlagen.',
  preview: 'Tracking-Vorschau konnte nicht geladen werden.',
  'personal-signature-load': 'Persönliche Unterschrift konnte nicht geladen werden.',
  'company-stamp-load': 'Firmenstempel konnte nicht geladen werden.',
  'pdf-create': 'PDF aus einer Dokumentvorlage konnte nicht erstellt werden.',
  website: 'Ein unerwarteter Website-Fehler ist aufgetreten.',
}

export function buildDiagnosticEvent({ module, stage, code, message, actorId, actorName, orderId, originCountry, destinationCountry, createdAt }) {
  if (!DIAGNOSTIC_MODULES.includes(module)) throw new Error('Unknown diagnostic module')
  return {
    module,
    stage: safeText(stage, 40),
    code: safeText(code, 80) || 'unexpected_error',
    message: safeText(message, 240) || 'Ein unerwarteter Fehler ist aufgetreten.',
    actorId: safeText(actorId, 128),
    actorName: safeText(actorName, 120) || 'Unbekannt',
    orderId: safeText(orderId, 240),
    originCountry: safeText(originCountry, 2),
    destinationCountry: safeText(destinationCountry, 2),
    createdAt,
  }
}

export function appendDiagnosticToBatch(batch, db, event) {
  batch.set(db.collection('diagnosticEvents').doc(), buildDiagnosticEvent({ ...event, createdAt: FieldValue.serverTimestamp() }))
}

export async function recordDiagnostic(event, db = getFirestore()) {
  try {
    await db.collection('diagnosticEvents').add(buildDiagnosticEvent({ ...event, createdAt: FieldValue.serverTimestamp() }))
  } catch (error) {
    // A diagnostic write must never replace the error the user actually saw.
    logger.warn('Diagnoseeintrag konnte nicht gespeichert werden.', { code: error?.code || 'unknown' })
  }
}

export function normalizeClientDiagnostic(data) {
  const module = safeText(data?.module, 40)
  const stage = safeText(data?.stage, 40)
  const code = safeText(data?.code, 80)
  const orderId = safeText(data?.orderId, 240)
  if (!CLIENT_STAGES[module]?.includes(stage) || !CLIENT_CODES.has(code)) throw new HttpsError('invalid-argument', 'Ungültige Diagnoseangaben.')
  if (data?.orderId && (!orderId || orderId.includes('/'))) throw new HttpsError('invalid-argument', 'Ungültige Auftrags-ID.')
  if (['website', 'document-templates'].includes(module) && orderId) throw new HttpsError('invalid-argument', 'Ungültige Diagnoseangaben.')
  return { module, stage, code, orderId, message: CLIENT_MESSAGES[stage] || CLIENT_MESSAGES.website }
}

export async function reportClientDiagnosticHandler(request) {
  const profile = await requireActiveProfile(request)
  const event = normalizeClientDiagnostic(request.data)
  if (event.module === 'shipment-tracking' && !hasTrackingViewAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für die Sendungsverfolgung.')
  const db = getFirestore()
  if (event.orderId) {
    const order = await db.doc(`transportOrders/${event.orderId}`).get()
    if (!order.exists) throw new HttpsError('not-found', 'Transportauftrag nicht gefunden.')
  }
  const actorId = request.auth.uid
  const actorName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email || 'Unbekannt'
  const quotaRef = db.doc(`diagnosticClientQuotas/${actorId}`)
  const now = Date.now()
  const accepted = await db.runTransaction(async (transaction) => {
    const quota = await transaction.get(quotaRef)
    const previous = quota.exists ? quota.data() : null
    const windowStart = typeof previous?.windowStart === 'number' && now - previous.windowStart < 60 * 60 * 1000 ? previous.windowStart : now
    const count = windowStart === previous?.windowStart ? previous.count || 0 : 0
    const fingerprint = `${event.module}|${event.stage}|${event.code}|${event.orderId}`
    const recent = previous?.recent && windowStart === previous.windowStart ? previous.recent : {}
    if (count >= 60 || typeof recent[fingerprint] === 'number' && now - recent[fingerprint] < 60 * 1000) return false
    const currentRecent = Object.fromEntries(Object.entries(recent).filter(([, time]) => now - time < 60 * 1000))
    currentRecent[fingerprint] = now
    transaction.set(quotaRef, { windowStart, count: count + 1, recent: currentRecent })
    transaction.create(db.collection('diagnosticEvents').doc(), buildDiagnosticEvent({ ...event, actorId, actorName, createdAt: FieldValue.serverTimestamp() }))
    return true
  })
  return { recorded: accepted }
}

function parsedDate(value) {
  if (!value) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new HttpsError('invalid-argument', 'Ungültiger Datumsfilter.')
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new HttpsError('invalid-argument', 'Ungültiger Datumsfilter.')
  return Timestamp.fromDate(date)
}

export function buildDiagnosticQuery(collection, filters = {}) {
  const module = safeText(filters.module, 40)
  const actorId = safeText(filters.actorId, 128)
  if (module && !DIAGNOSTIC_MODULES.includes(module)) throw new HttpsError('invalid-argument', 'Ungültiger Modulfilter.')
  if (filters.actorId && (!actorId || actorId.includes('/'))) throw new HttpsError('invalid-argument', 'Ungültiger Benutzerfilter.')
  const from = parsedDate(filters.from)
  const to = parsedDate(filters.to)
  if (from && to && from.toMillis() >= to.toMillis()) throw new HttpsError('invalid-argument', 'Der Datumsbereich ist ungültig.')
  let query = collection
  if (module) query = query.where('module', '==', module)
  if (actorId) query = query.where('actorId', '==', actorId)
  if (from) query = query.where('createdAt', '>=', from)
  if (to) query = query.where('createdAt', '<', to)
  return query.orderBy('createdAt', 'desc')
}

export async function listDiagnosticsPageHandler(request) {
  const profile = await requireActiveProfile(request)
  requireRole(profile, ['admin', 'superadmin'], 'Keine Berechtigung für die Diagnose.')
  const db = getFirestore()
  const collection = db.collection('diagnosticEvents')
  const cursor = safeText(request.data?.cursor, 240)
  if (request.data?.cursor && (!cursor || cursor.includes('/'))) throw new HttpsError('invalid-argument', 'Ungültiger Seitencursor.')
  let query = buildDiagnosticQuery(collection, request.data || {})
  if (cursor) {
    const cursorSnapshot = await collection.doc(cursor).get()
    if (!cursorSnapshot.exists) throw new HttpsError('invalid-argument', 'Der Seitencursor ist nicht mehr verfügbar.')
    query = query.startAfter(cursorSnapshot)
  }
  const snapshot = await query.limit(PAGE_SIZE + 1).get()
  const visible = snapshot.docs.slice(0, PAGE_SIZE)
  return {
    entries: visible.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.().toISOString() || null })),
    nextCursor: snapshot.docs.length > PAGE_SIZE ? visible.at(-1).id : null,
  }
}
