import { createHash } from 'node:crypto'
import process from 'node:process'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { recordDiagnostic } from './diagnostics.js'
import { previewSystemMailTemplate, sendSystemMailTemplate } from './systemMails.js'
import { hasTrackingEditAccess } from './shipmentTracking.js'
import { shipmentTrackingDryRun, shipmentTrackingBerlinLocal } from './shared/shipmentTrackingDryRun.js'
import { shipmentTrackingManualDispatchBundles, shipmentTrackingManualDispatchTemplateIds } from './shared/shipmentTrackingManualDispatch.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shared/shipmentTrackingOperatingHours.js'
import { SHIPMENT_TRACKING_RULE_CATALOG_PATH } from './shared/shipmentTrackingRuleCatalog.js'
import { shipmentTrackingOperatingHoursPath } from './shipmentTrackingOperatingHours.js'
import { externalEffectsEnvironment } from './externalEffects.js'

const allowedTemplateIds = new Set(Object.values(shipmentTrackingManualDispatchTemplateIds))
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const developmentRecipientDomain = 'brennpunkt-logistik.de'

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function actorName(profile) { return [text(profile?.firstName), text(profile?.lastName)].filter(Boolean).join(' ') || text(profile?.email) || 'Unbekannt' }
function validOrderId(value) { const id = text(value); return id && id.length <= 240 && !id.includes('/') ? id : '' }
function validBundleId(value) { const id = text(value); return id && id.length <= 2400 ? id : '' }
function validTemplateId(value) { const id = text(value); return allowedTemplateIds.has(id) ? id : '' }
function validRecipient(value) { const email = text(value); return email.length <= 320 && emailPattern.test(email) ? email : '' }
function storedCarrierRecipient(tracking) {
  const entry = tracking?.recipients?.carrier
  const email = validRecipient(entry?.email)
  return ['manual', 'transport-order-import'].includes(entry?.source) ? email : ''
}

/** The stored tracking recipient is either the TA dispatch address captured on
 * start or an explicit manual correction. During Dev it is restricted to BPL. */
export function isManualTrackingRecipientAllowed(recipient, environment = process.env) {
  const email = validRecipient(recipient)
  if (!email) return false
  const currentEnvironment = externalEffectsEnvironment(environment)
  if (currentEnvironment === 'production') return true
  return currentEnvironment === 'development' && email.toLowerCase().endsWith(`@${developmentRecipientDomain}`)
}

function assertPermittedRecipient(tracking, requestedRecipient) {
  const stored = storedCarrierRecipient(tracking)
  if (!stored) throw new HttpsError('failed-precondition', 'Für den Unternehmer ist keine gültige Empfängeradresse hinterlegt.')
  if (stored.toLowerCase() !== requestedRecipient.toLowerCase()) throw new HttpsError('failed-precondition', 'Die Empfängeradresse muss der hinterlegten Unternehmeradresse entsprechen.')
  if (!isManualTrackingRecipientAllowed(stored)) {
    if (externalEffectsEnvironment() !== 'development') throw new HttpsError('failed-precondition', 'Der manuelle Versand ist in dieser Umgebung deaktiviert.')
    throw new HttpsError('failed-precondition', `In der Dev-Testphase sind nur Empfänger mit @${developmentRecipientDomain} zulässig.`)
  }
  return stored
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

export function canManuallyDispatchShipmentTracking(tracking) {
  return tracking?.lifecycleStatus === 'active' || tracking?.lifecycleStatus === 'completed'
}

async function dispatchContext(db, orderId, { allowCompleted = false } = {}) {
  const [orderSnapshot, trackingSnapshot, catalogSnapshot, operatingHoursSnapshot] = await Promise.all([
    db.doc(`transportOrders/${orderId}`).get(),
    db.doc(`transportOrderTrackings/${orderId}`).get(),
    db.doc(SHIPMENT_TRACKING_RULE_CATALOG_PATH).get(),
    db.doc(shipmentTrackingOperatingHoursPath).get(),
  ])
  if (!orderSnapshot.exists) throw new HttpsError('not-found', 'Transportauftrag nicht gefunden.')
  if (!trackingSnapshot.exists || (trackingSnapshot.data()?.lifecycleStatus !== 'active' && !(allowCompleted && trackingSnapshot.data()?.lifecycleStatus === 'completed'))) {
    throw new HttpsError('failed-precondition', allowCompleted ? 'Für diesen Auftrag ist keine Sendungsverfolgung verfügbar.' : 'Für diesen Auftrag ist keine aktive Sendungsverfolgung vorhanden.')
  }
  const imported = orderSnapshot.data()?.imported || null
  const [customer, carrier] = await Promise.all([
    effectivePartner(db, imported?.customer?.partnerId),
    effectivePartner(db, imported?.carrier?.partnerId),
  ])
  const preview = shipmentTrackingDryRun({
    imported,
    tracking: trackingSnapshot.data(),
    customer,
    carrier,
    catalog: catalogSnapshot.exists ? catalogSnapshot.data() : null,
    operatingHours: operatingHoursSnapshot.exists ? operatingHoursSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS,
  })
  return { imported, externalNumber: text(orderSnapshot.data()?.externalNumber), tracking: trackingSnapshot.data(), preview }
}

function deterministicDeliveryId(bundleId) { return `manual-${createHash('sha256').update(bundleId).digest('hex')}` }
function weekday(date) { return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(`${date}T12:00:00Z`).getUTCDay()] }
function formatLoadingDateTime(local) {
  const [year, month, day] = local.date.split('-')
  return `${weekday(local.date)}, ${day}.${month}.${year}, ${local.time} Uhr`
}

/** A single loading window stays compact while still spelling out dates for
 * multi-day windows. This avoids ambiguous repeats such as 07:00–07:00. */
export function shipmentTrackingLoadingWindow(imported) {
  const from = shipmentTrackingBerlinLocal(imported?.loading?.window?.from)
  const until = shipmentTrackingBerlinLocal(imported?.loading?.window?.until)
  if (!from && !until) return 'Nicht hinterlegt'
  if (!from) return `bis ${formatLoadingDateTime(until)}`
  if (!until) return formatLoadingDateTime(from)
  if (from.date !== until.date) return `${formatLoadingDateTime(from)} bis ${formatLoadingDateTime(until)}`
  const [year, month, day] = from.date.split('-')
  const date = `${weekday(from.date)}, ${day}.${month}.${year}`
  if (from.time === until.time) return `${date}, ${from.time} Uhr`
  return `${date}, ${from.time}–${until.time} Uhr`
}
function loadingLocation(imported) { return text(imported?.loading?.city) || text(imported?.loading?.originalText) || 'Nicht hinterlegt' }
function orderNumber(imported, externalNumber) { return text(externalNumber) || text(imported?.externalNumber) || text(imported?.orderNumber) || 'Nicht hinterlegt' }
function templateValues(imported, externalNumber) {
  return { transportOrderNumber: orderNumber(imported, externalNumber), loadingLocation: loadingLocation(imported), loadingTime: shipmentTrackingLoadingWindow(imported) }
}
function topicsForTemplate(templateId) {
  if (templateId === shipmentTrackingManualDispatchTemplateIds.combined) return ['licensePlate', 'loadingSite']
  if (templateId === shipmentTrackingManualDispatchTemplateIds.generalUpdate) return []
  return templateId === shipmentTrackingManualDispatchTemplateIds.licensePlate ? ['licensePlate'] : ['loadingSite']
}
function templateLabel(templateId) {
  return ({
    [shipmentTrackingManualDispatchTemplateIds.licensePlate]: 'Kennzeichen anfragen',
    [shipmentTrackingManualDispatchTemplateIds.loadingSite]: 'LKW-Ankunft anfragen',
    [shipmentTrackingManualDispatchTemplateIds.combined]: 'Kennzeichen und LKW-Ankunft anfragen',
    [shipmentTrackingManualDispatchTemplateIds.generalUpdate]: 'Allgemeines Status-Update anfragen',
  })[templateId] || 'Tracking-Anfrage'
}
function matchingDueBundle(preview, requestedBundleId, templateId, recipient) {
  if (!requestedBundleId) return null
  return shipmentTrackingManualDispatchBundles(preview).find((bundle) => bundle.id === requestedBundleId && bundle.templateId === templateId && bundle.recipient === recipient) || null
}

function eventPayload({ delivery, actorId, actor }) {
  return {
    eventType: 'tracking_manual_mail_sent',
    changedFields: delivery.ruleIds.map((ruleId) => `externalRuleDispatches.${ruleId}`),
    oldValue: { delivery: null },
    newValue: { delivery },
    eventTime: FieldValue.serverTimestamp(),
    recordedAt: FieldValue.serverTimestamp(),
    recordedBy: actorId,
    recordedByName: actor,
    source: 'manual_mail',
    note: '',
  }
}

export function hasShipmentTrackingManualDispatchAccess(profile) {
  return hasTrackingEditAccess(profile)
}

/** Turns transport failures into safe, actionable admin diagnostics. Secrets,
 * URLs and the customized mail content deliberately never enter Firestore. */
export function manualMailTechnicalDiagnostic(error) {
  if (error?.cause?.code === 'ENOTFOUND') return { code: 'notification_endpoint_unreachable', message: 'Der Versanddienst ist nicht erreichbar.' }
  if (error?.message === 'notification-service-not-configured') return { code: 'notification_service_missing', message: 'Der Versanddienst ist nicht konfiguriert.' }
  if (/^notification-service-\d{3}$/.test(error?.message || '')) return { code: 'notification_service_rejected', message: 'Der Versanddienst hat die Anfrage abgelehnt.' }
  return { code: 'unexpected_error', message: 'Die manuelle Tracking-Anfrage konnte nicht versendet werden.' }
}

export async function previewManualShipmentTrackingMailHandler(request) {
  const profile = await requireActiveProfile(request)
  if (!hasShipmentTrackingManualDispatchAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung zur Anzeige der Tracking-Anfrage.')
  const orderId = validOrderId(request.data?.orderId)
  const templateId = validTemplateId(request.data?.templateId)
  if (!orderId || !templateId) throw new HttpsError('invalid-argument', 'Die Mailvorlage ist ungültig.')
  const db = getFirestore()
  const { imported, externalNumber } = await dispatchContext(db, orderId, { allowCompleted: true })
  const rendered = await previewSystemMailTemplate({ templateId, values: templateValues(imported, externalNumber) })
  return { templateId, templateLabel: templateLabel(templateId), subject: rendered.subject, message: rendered.message }
}

/** Explicit, manual delivery only. A matching current due bundle is the only
 * path that marks external rule stages as sent. */
export async function sendManualShipmentTrackingMailHandler(request) {
  const profile = await requireActiveProfile(request)
  if (!hasShipmentTrackingManualDispatchAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung zum Versand der Tracking-Anfrage.')
  const orderId = validOrderId(request.data?.orderId)
  const templateId = validTemplateId(request.data?.templateId)
  const recipient = validRecipient(request.data?.recipient)
  const subject = text(request.data?.subject)
  const message = text(request.data?.message)
  const requestedBundleId = request.data?.bundleId === undefined || request.data?.bundleId === null ? '' : validBundleId(request.data.bundleId)
  if (!orderId || !templateId || !recipient || !subject || !message || (request.data?.bundleId && !requestedBundleId)) throw new HttpsError('invalid-argument', 'Die manuelle Tracking-Anfrage ist ungültig.')

  const db = getFirestore()
  const actor = actorName(profile)
  let deliveryRef = null
  let delivery = null
  let deliveryClaimed = false
  let deliverySent = false
  try {
    const { imported, externalNumber, tracking, preview } = await dispatchContext(db, orderId, { allowCompleted: true })
    const permittedRecipient = assertPermittedRecipient(tracking, recipient)
    // A completed tracking may still be used for an explicit test request. It
    // deliberately never settles old rule stages retroactively.
    const dueBundle = tracking.lifecycleStatus === 'active' ? matchingDueBundle(preview, requestedBundleId, templateId, permittedRecipient) : null
    const trackingRef = db.doc(`transportOrderTrackings/${orderId}`)
    delivery = { recipient: permittedRecipient, templateId, templateLabel: templateLabel(templateId), ruleIds: dueBundle?.ruleIds || [], topics: dueBundle?.topics || topicsForTemplate(templateId), ...(dueBundle ? { scheduledAt: dueBundle.scheduledAt } : {}), ...(tracking.lifecycleStatus === 'completed' ? { afterCompletion: true } : {}) }
    deliveryRef = dueBundle ? trackingRef.collection('manualMailDeliveries').doc(deterministicDeliveryId(dueBundle.id)) : trackingRef.collection('manualMailDeliveries').doc()
    await db.runTransaction(async (transaction) => {
      const [trackingSnapshot, deliverySnapshot] = await Promise.all([transaction.get(trackingRef), transaction.get(deliveryRef)])
      if (!trackingSnapshot.exists || !canManuallyDispatchShipmentTracking(trackingSnapshot.data())) throw new HttpsError('failed-precondition', 'Die Sendungsverfolgung ist nicht verfügbar.')
      assertPermittedRecipient(trackingSnapshot.data(), permittedRecipient)
      const currentDelivery = deliverySnapshot.exists ? deliverySnapshot.data() : null
      if (dueBundle && currentDelivery?.status === 'sent') throw new HttpsError('already-exists', 'Diese Anfrage wurde bereits versendet.')
      if (dueBundle && currentDelivery?.status === 'delivered') return
      if (currentDelivery?.status === 'sending' && currentDelivery.lockedAt?.toMillis?.() > Date.now() - 10 * 60 * 1000) throw new HttpsError('failed-precondition', 'Diese Anfrage wird bereits versendet.')
      transaction.set(deliveryRef, { ...delivery, status: 'sending', attempts: (currentDelivery?.attempts || 0) + 1, lockedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      deliveryClaimed = true
    })

    if (deliveryClaimed) {
      const delivered = await sendSystemMailTemplate({
        recipient: permittedRecipient, templateId, values: templateValues(imported, externalNumber), subject, message,
        allowDevelopment: true,
      })
      if (!delivered) throw new HttpsError('failed-precondition', 'Der Versand ist in dieser Umgebung deaktiviert.')
      deliverySent = true
      await deliveryRef.set({ status: 'delivered', deliveredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    }

    const eventRef = trackingRef.collection('events').doc()
    await db.runTransaction(async (transaction) => {
      const trackingSnapshot = await transaction.get(trackingRef)
      if (!trackingSnapshot.exists) throw new HttpsError('not-found', 'Die Sendungsverfolgung ist nicht mehr verfügbar.')
      const externalRuleDispatches = { ...(trackingSnapshot.data()?.externalRuleDispatches || {}) }
      for (const ruleId of delivery.ruleIds) externalRuleDispatches[ruleId] = { dispatchId: deliveryRef.id, templateId, recipient, sentAt: FieldValue.serverTimestamp() }
      transaction.update(trackingRef, { ...(delivery.ruleIds.length ? { externalRuleDispatches } : {}), updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid, updatedByName: actor })
      transaction.set(deliveryRef, { status: 'sent', sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete() }, { merge: true })
      transaction.create(eventRef, eventPayload({ delivery, actorId: request.auth.uid, actor }))
    })
    return { orderId, deliveryId: deliveryRef.id, delivery }
  } catch (error) {
    if (deliveryRef && delivery && deliverySent) await deliveryRef.set({ status: 'delivered', deliveredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {})
    if (deliveryRef && delivery && deliveryClaimed && !deliverySent) await deliveryRef.set({ status: 'failed', failedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: error instanceof HttpsError ? error.code : 'delivery-failed' }, { merge: true }).catch(() => {})
    if (!(error instanceof HttpsError)) await recordDiagnostic({
      module: 'shipment-tracking-manual-mail', stage: 'send', ...manualMailTechnicalDiagnostic(error),
      actorId: request.auth.uid, actorName: actor, orderId,
    }, db)
    throw error
  }
}
