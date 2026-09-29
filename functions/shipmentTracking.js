import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'
import { shipmentTrackingLifecycle } from './shared/shipmentTrackingLifecycle.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shared/shipmentTrackingOperatingHours.js'
import { shipmentTrackingOperatingHoursPath } from './shipmentTrackingOperatingHours.js'

const editableLevels = { none: 0, view: 1, edit: 2 }
const timestampFields = [
  'estimatedArrivalLoadingAt', 'actualArrivalLoadingAt', 'loadingStartedAt', 'loadingCompletedAt',
  'estimatedDepartureLoadingAt', 'actualDepartureLoadingAt', 'estimatedArrivalUnloadingAt',
  'actualArrivalUnloadingAt', 'unloadingStartedAt', 'unloadingCompletedAt',
]
const licensePlateFields = ['licensePlate', 'tractorLicensePlate', 'trailerLicensePlate']
const driverFields = ['driverName', 'driverPhone']
const editableFields = [...licensePlateFields, ...driverFields, ...timestampFields, 'proofStatus']
const sources = new Set(['manual', 'phone', 'other_mailbox', 'other'])
const recipientRoles = new Set(['customer', 'carrier'])
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function actorName(profile) { return [text(profile?.firstName), text(profile?.lastName)].filter(Boolean).join(' ') || text(profile?.email) || 'Unbekannt' }
export function hasTrackingViewAccess(profile) { return profile?.role === 'superadmin' || editableLevels[profile?.permissions?.transportOrders] >= editableLevels.view }
export function hasTrackingEditAccess(profile) { return profile?.role === 'superadmin' || editableLevels[profile?.permissions?.transportOrders] >= editableLevels.edit }

async function assertTrackingEditAccess(request) {
  const profile = await requireActiveProfile(request)
  if (!hasTrackingEditAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung zur Bearbeitung der Sendungsverfolgung.')
  return profile
}

function timestampFromInput(value, field) {
  if (value === null) return null
  if (typeof value !== 'string' || !value || value.length > 40) throw new HttpsError('invalid-argument', `${field} ist ungültig.`)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new HttpsError('invalid-argument', `${field} ist ungültig.`)
  return Timestamp.fromDate(date)
}

function valueIsSet(value) { return value !== null && value !== undefined }

export function deriveShipmentTrackingPosition(tracking) {
  if (tracking?.lifecycleStatus === 'completed') return { stageId: 'post_transport', progressToNextStage: 0 }
  if (valueIsSet(tracking?.actualArrivalUnloadingAt) || valueIsSet(tracking?.unloadingStartedAt) || valueIsSet(tracking?.unloadingCompletedAt)) return { stageId: 'unloading', progressToNextStage: 0 }
  if (valueIsSet(tracking?.actualDepartureLoadingAt)) return { stageId: 'in_transit', progressToNextStage: 0 }
  if (valueIsSet(tracking?.actualArrivalLoadingAt) || valueIsSet(tracking?.loadingStartedAt) || valueIsSet(tracking?.loadingCompletedAt)) return { stageId: 'loading', progressToNextStage: 0 }
  return { stageId: 'preparation', progressToNextStage: 0 }
}

/** Creates the stable tracking document shape for both manual and scheduled starts.
 * Lifecycle remains `active` until the final phase so existing permissions and
 * callables continue to work; `lifecyclePhase` is the readable lifecycle. */
export function createShipmentTrackingDocument(orderId, actorId, actor, { trackingMode = 'manual', lifecyclePhase = 'in_progress', trackingStartedEarly = false, carrierRecipientEmail = '' } = {}) {
  const carrierEmail = text(carrierRecipientEmail)
  const recipients = emailPattern.test(carrierEmail)
    ? { carrier: { email: carrierEmail, source: 'transport-order-import' } }
    : {}
  return {
    orderId,
    lifecycleStatus: 'active',
    lifecyclePhase,
    trackingMode,
    trackingStartedEarly,
    stageId: 'preparation',
    progressToNextStage: 0,
    licensePlate: null,
    tractorLicensePlate: null,
    trailerLicensePlate: null,
    driverName: null,
    driverPhone: null,
    estimatedArrivalLoadingAt: null,
    actualArrivalLoadingAt: null,
    loadingStartedAt: null,
    loadingCompletedAt: null,
    estimatedDepartureLoadingAt: null,
    actualDepartureLoadingAt: null,
    estimatedArrivalUnloadingAt: null,
    actualArrivalUnloadingAt: null,
    unloadingStartedAt: null,
    unloadingCompletedAt: null,
    proofStatus: 'unknown',
    recipients,
    externalRuleDispatches: {},
    automationPaused: false,
    automationPausedAt: null,
    automationSkippedBefore: null,
    lastAutomationPause: null,
    trackingStartedAt: FieldValue.serverTimestamp(),
    trackingCompletedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actorId,
    createdByName: actor,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorId,
    updatedByName: actor,
  }
}

function validOrderId(value) {
  const id = text(value)
  return id && id.length <= 240 && !id.includes('/') ? id : ''
}

function activationPreview(imported, operatingHours, now = new Date()) {
  const lifecycle = shipmentTrackingLifecycle({
    earliestLoading: imported?.loading?.window?.from,
    latestUnloading: imported?.unloading?.window?.until,
    operatingHours,
    now,
  })
  return { phase: lifecycle.phase, startAt: lifecycle.startAt, diagnostic: lifecycle.diagnostic }
}

/** Read-only start-time adapter. The opening-hours settings stay server-side. */
export async function getShipmentTrackingActivationHandler(request) {
  const profile = await requireActiveProfile(request)
  if (!hasTrackingViewAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung zur Anzeige des automatischen Tracking-Starts.')
  const orderId = validOrderId(request.data?.orderId)
  if (!orderId) throw new HttpsError('invalid-argument', 'Die Transportauftrags-ID ist ungültig.')
  const db = getFirestore()
  try {
    const [orderSnapshot, operatingHoursSnapshot] = await Promise.all([
      db.doc(`transportOrders/${orderId}`).get(),
      db.doc(shipmentTrackingOperatingHoursPath).get(),
    ])
    if (!orderSnapshot.exists) throw new HttpsError('not-found', 'Transportauftrag nicht gefunden.')
    return { activation: activationPreview(orderSnapshot.data()?.imported, operatingHoursSnapshot.exists ? operatingHoursSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS) }
  } catch (error) {
    if (!(error instanceof HttpsError)) await recordDiagnostic({
      module: 'shipment-tracking', stage: 'activation-preview', code: 'unexpected_error',
      message: 'Der automatische Start der Sendungsverfolgung konnte nicht berechnet werden.',
      actorId: request.auth.uid, actorName: actorName(profile), orderId,
    }, db)
    throw error
  }
}

function normalizedChanges(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpsError('invalid-argument', 'Ungültige Trackingdaten.')
  const keys = Object.keys(input)
  if (!keys.every((key) => editableFields.includes(key))) throw new HttpsError('invalid-argument', 'Ungültige Trackingdaten.')
  const result = {}
  for (const field of keys) {
    const value = input[field]
    if (timestampFields.includes(field)) result[field] = timestampFromInput(value, field)
    if (licensePlateFields.includes(field)) {
      if (value !== null && (typeof value !== 'string' || text(value).length > 80)) throw new HttpsError('invalid-argument', 'Das Kennzeichen ist ungültig.')
      result[field] = value === null || !text(value) ? null : text(value)
    }
    if (driverFields.includes(field)) {
      if (value !== null && (typeof value !== 'string' || text(value).length > (field === 'driverName' ? 140 : 60))) throw new HttpsError('invalid-argument', 'Die Fahrerangabe ist ungültig.')
      result[field] = value === null || !text(value) ? null : text(value)
    }
    if (field === 'proofStatus') {
      if (!['unknown', 'open', 'received'].includes(value)) throw new HttpsError('invalid-argument', 'Der Nachweisstatus ist ungültig.')
      result[field] = value
    }
  }
  return result
}

export function normalizeRecipientChanges(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpsError('invalid-argument', 'Ungültige Empfängerangaben.')
  const roles = Object.keys(input)
  if (!roles.length || !roles.every((role) => recipientRoles.has(role))) throw new HttpsError('invalid-argument', 'Ungültige Empfängerangaben.')
  const changes = {}
  for (const role of roles) {
    const value = input[role]
    if (value === null) { changes[role] = null; continue }
    if (typeof value !== 'string') throw new HttpsError('invalid-argument', `Die E-Mail-Adresse für ${role} ist ungültig.`)
    const email = value.trim()
    if (!email || email.length > 320 || !emailPattern.test(email)) throw new HttpsError('invalid-argument', `Die E-Mail-Adresse für ${role} ist ungültig.`)
    changes[role] = { email, source: 'manual' }
  }
  return changes
}

function storedRecipient(value) {
  return typeof value?.email === 'string' && value.email.trim() ? { email: value.email.trim(), source: value.source === 'manual' ? 'manual' : value.source || 'manual' } : null
}

export function applyRecipientChanges(currentRecipients, changes) {
  const recipients = {}
  for (const role of recipientRoles) {
    const previous = storedRecipient(currentRecipients?.[role])
    const next = Object.prototype.hasOwnProperty.call(changes, role) ? changes[role] : previous
    if (next) recipients[role] = next
  }
  const oldValue = { recipients: Object.fromEntries(Object.keys(changes).map((role) => [role, storedRecipient(currentRecipients?.[role])])) }
  const newValue = { recipients: Object.fromEntries(Object.keys(changes).map((role) => [role, changes[role]])) }
  return { recipients, oldValue, newValue }
}

export function canEditTrackingRecipients(tracking) { return tracking?.lifecycleStatus !== 'completed' }

function normalizedSource(value) {
  if (value === undefined || value === null) return 'manual'
  if (!sources.has(value)) throw new HttpsError('invalid-argument', 'Die Informationsquelle ist ungültig.')
  return value
}
function normalizedNote(value) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || value.trim().length > 2000) throw new HttpsError('invalid-argument', 'Die Bemerkung ist ungültig.')
  return value.trim()
}

function eventTimeFor(changes) { return timestampFields.map((field) => changes[field]).find(valueIsSet) || FieldValue.serverTimestamp() }
function eventPayload({ eventType, changedFields = [], oldValue = {}, newValue = {}, eventTime, actorId, actor, source, note }) {
  return {
    eventType,
    changedFields,
    oldValue,
    newValue,
    eventTime,
    recordedAt: FieldValue.serverTimestamp(),
    recordedBy: actorId,
    recordedByName: actor,
    source,
    note,
  }
}

export async function updateManualShipmentTrackingHandler(request) {
  const profile = await assertTrackingEditAccess(request)
  const orderId = validOrderId(request.data?.orderId)
  const action = request.data?.action
  if (!orderId || orderId.length > 240 || !['start', 'start_early', 'update', 'update_recipients', 'complete', 'pause_automation', 'resume_automation'].includes(action)) throw new HttpsError('invalid-argument', 'Ungültige Tracking-Aktion.')
  const source = normalizedSource(request.data?.source)
  const note = normalizedNote(request.data?.note)
  const changes = action === 'update' ? normalizedChanges(request.data?.changes) : {}
  const recipientChanges = action === 'update_recipients' ? normalizeRecipientChanges(request.data?.recipientChanges) : {}
  const earlyStartRequested = action === 'start' && request.data?.earlyStart === true
  if (action === 'update' && !Object.keys(changes).length) throw new HttpsError('invalid-argument', 'Es wurden keine Änderungen übergeben.')

  const db = getFirestore()
  const orderRef = db.doc(`transportOrders/${orderId}`)
  const trackingRef = db.doc(`transportOrderTrackings/${orderId}`)
  const eventRef = trackingRef.collection('events').doc()
  const actor = actorName(profile)

  try {
    const operatingHoursSnapshot = action === 'start' ? await db.doc(shipmentTrackingOperatingHoursPath).get() : null
    await db.runTransaction(async (transaction) => {
    const [orderSnapshot, trackingSnapshot] = await Promise.all([transaction.get(orderRef), transaction.get(trackingRef)])
    if (!orderSnapshot.exists) throw new HttpsError('not-found', 'Transportauftrag nicht gefunden.')
    const current = trackingSnapshot.exists ? trackingSnapshot.data() : null

    if (action === 'start') {
      if (current) throw new HttpsError('already-exists', 'Die Sendungsverfolgung wurde bereits gestartet.')
      const activation = earlyStartRequested ? activationPreview(orderSnapshot.data()?.imported, operatingHoursSnapshot.exists ? operatingHoursSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS) : null
      const trackingStartedEarly = Boolean(earlyStartRequested && activation?.phase === 'upcoming')
      const tracking = createShipmentTrackingDocument(orderId, request.auth.uid, actor, {
        lifecyclePhase: 'in_progress',
        trackingStartedEarly,
        carrierRecipientEmail: orderSnapshot.data()?.imported?.dispatch?.sentTo,
      })
      transaction.create(trackingRef, tracking)
      transaction.create(eventRef, eventPayload({ eventType: 'tracking_started', changedFields: ['lifecycleStatus', 'lifecyclePhase', 'trackingStartedEarly'], newValue: { lifecycleStatus: 'active', lifecyclePhase: 'in_progress', trackingStartedEarly }, eventTime: FieldValue.serverTimestamp(), actorId: request.auth.uid, actor, source, note }))
      return
    }

    if (!current) throw new HttpsError('failed-precondition', 'Die Sendungsverfolgung wurde noch nicht gestartet.')
    if (action === 'start_early') {
      if (current.lifecycleStatus === 'completed') throw new HttpsError('failed-precondition', 'Die Sendungsverfolgung ist bereits abgeschlossen.')
      if (current.lifecyclePhase !== 'upcoming') throw new HttpsError('failed-precondition', 'Die Sendungsverfolgung läuft bereits.')
      transaction.update(trackingRef, { lifecyclePhase: 'in_progress', trackingStartedEarly: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid, updatedByName: actor })
      transaction.create(eventRef, eventPayload({ eventType: 'tracking_phase_changed', changedFields: ['lifecyclePhase', 'trackingStartedEarly'], oldValue: { lifecyclePhase: current.lifecyclePhase, trackingStartedEarly: current.trackingStartedEarly === true }, newValue: { lifecyclePhase: 'in_progress', trackingStartedEarly: true }, eventTime: FieldValue.serverTimestamp(), actorId: request.auth.uid, actor, source, note }))
      return
    }
    if (action === 'pause_automation') {
      if (current.lifecycleStatus === 'completed') throw new HttpsError('failed-precondition', 'Die Sendungsverfolgung ist bereits abgeschlossen.')
      if (current.automationPaused === true) throw new HttpsError('failed-precondition', 'Die Sendungsverfolgungs-Automatik ist bereits pausiert.')
      const pausedAt = Timestamp.fromDate(new Date())
      transaction.update(trackingRef, { automationPaused: true, automationPausedAt: pausedAt, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid, updatedByName: actor })
      transaction.create(eventRef, eventPayload({ eventType: 'tracking_automation_paused', changedFields: ['automationPaused', 'automationPausedAt'], oldValue: { automationPaused: false }, newValue: { automationPaused: true, automationPausedAt: pausedAt }, eventTime: pausedAt, actorId: request.auth.uid, actor, source: 'manual', note: '' }))
      return
    }
    if (action === 'resume_automation') {
      if (current.lifecycleStatus === 'completed') throw new HttpsError('failed-precondition', 'Die Sendungsverfolgung ist bereits abgeschlossen.')
      if (current.automationPaused !== true) throw new HttpsError('failed-precondition', 'Die Sendungsverfolgungs-Automatik ist nicht pausiert.')
      const resumedAt = Timestamp.fromDate(new Date())
      const pause = { from: current.automationPausedAt || resumedAt, until: resumedAt }
      transaction.update(trackingRef, { automationPaused: false, automationPausedAt: null, automationSkippedBefore: resumedAt, lastAutomationPause: pause, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid, updatedByName: actor })
      transaction.create(eventRef, eventPayload({ eventType: 'tracking_automation_resumed', changedFields: ['automationPaused', 'automationSkippedBefore'], oldValue: { automationPaused: true, automationPausedAt: current.automationPausedAt || null }, newValue: { automationPaused: false, automationSkippedBefore: resumedAt, lastAutomationPause: pause }, eventTime: resumedAt, actorId: request.auth.uid, actor, source: 'manual', note: '' }))
      return
    }
    if (action === 'update_recipients') {
      if (!canEditTrackingRecipients(current)) throw new HttpsError('failed-precondition', 'Die Empfänger können nach Abschluss nicht mehr geändert werden.')
      const recipientUpdate = applyRecipientChanges(current.recipients, recipientChanges)
      transaction.update(trackingRef, { recipients: recipientUpdate.recipients, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid, updatedByName: actor })
      transaction.create(eventRef, eventPayload({ eventType: 'tracking_recipients_updated', changedFields: Object.keys(recipientChanges).map((role) => `recipients.${role}`), oldValue: recipientUpdate.oldValue, newValue: recipientUpdate.newValue, eventTime: FieldValue.serverTimestamp(), actorId: request.auth.uid, actor, source: 'manual', note: '' }))
      return
    }
    if (action === 'complete') {
      if (current.lifecycleStatus === 'completed') throw new HttpsError('failed-precondition', 'Die Sendungsverfolgung ist bereits abgeschlossen.')
      transaction.update(trackingRef, { lifecycleStatus: 'completed', lifecyclePhase: 'completed', trackingMode: 'manual', stageId: 'post_transport', progressToNextStage: 0, trackingCompletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid, updatedByName: actor })
      transaction.create(eventRef, eventPayload({ eventType: 'tracking_completed', changedFields: ['lifecycleStatus', 'lifecyclePhase', 'stageId', 'trackingCompletedAt'], oldValue: { lifecycleStatus: current.lifecycleStatus, lifecyclePhase: current.lifecyclePhase || null, stageId: current.stageId, trackingCompletedAt: current.trackingCompletedAt || null }, newValue: { lifecycleStatus: 'completed', lifecyclePhase: 'completed', stageId: 'post_transport' }, eventTime: FieldValue.serverTimestamp(), actorId: request.auth.uid, actor, source, note }))
      return
    }

    const oldValue = Object.fromEntries(Object.keys(changes).map((field) => [field, current[field] ?? null]))
    const merged = { ...current, ...changes }
    const position = deriveShipmentTrackingPosition(merged)
    transaction.update(trackingRef, { ...changes, ...position, trackingMode: 'manual', updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid, updatedByName: actor })
    transaction.create(eventRef, eventPayload({ eventType: 'tracking_updated', changedFields: Object.keys(changes), oldValue, newValue: changes, eventTime: eventTimeFor(changes), actorId: request.auth.uid, actor, source, note }))
    })
  } catch (error) {
    if (!(error instanceof HttpsError)) await recordDiagnostic({
      module: 'shipment-tracking', stage: 'save', code: 'unexpected_error',
      message: 'Änderung der Sendungsverfolgung fehlgeschlagen.',
      actorId: request.auth.uid, actorName: actor, orderId,
    }, db)
    throw error
  }

  return { orderId, action }
}
