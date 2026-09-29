import { createHash } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { externalEffectsEnvironment } from './externalEffects.js'
import { createShipmentTrackingDocument } from './shipmentTracking.js'
import { shipmentTrackingDryRun, shipmentTrackingBerlinLocal, shipmentTrackingArrivalConfirmationRule } from './shared/shipmentTrackingDryRun.js'
import { shipmentTrackingManualDispatchBundles } from './shared/shipmentTrackingManualDispatch.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shared/shipmentTrackingOperatingHours.js'
import { SHIPMENT_TRACKING_RULE_CATALOG_PATH } from './shared/shipmentTrackingRuleCatalog.js'
import { isActiveShipmentTrackingPhase, shipmentTrackingLifecycle } from './shared/shipmentTrackingLifecycle.js'
import { shipmentTrackingOperatingHoursPath } from './shipmentTrackingOperatingHours.js'
import { DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION, normalizeShipmentTrackingArrivalConfirmation, shipmentTrackingArrivalConfirmationPath, shipmentTrackingArrivalConfirmationTemplateId } from './shipmentTrackingArrivalConfirmation.js'
import { sendSystemMailTemplate, systemMailNotificationUrl } from './systemMails.js'

const DEVELOPMENT_RECIPIENT_DOMAIN = 'brennpunkt-logistik.de'
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function eventPayload(eventType, oldValue, newValue) {
  return {
    eventType,
    changedFields: Object.keys(newValue || {}),
    oldValue: oldValue || {},
    newValue: newValue || {},
    eventTime: FieldValue.serverTimestamp(),
    recordedAt: FieldValue.serverTimestamp(),
    recordedBy: 'system',
    recordedByName: 'Sendungsverfolgungs-Automatik',
    source: 'automatic',
    note: '',
  }
}

function storedCarrierRecipient(tracking) {
  const entry = tracking?.recipients?.carrier
  const email = text(entry?.email)
  return ['manual', 'transport-order-import'].includes(entry?.source) && emailPattern.test(email) ? email : ''
}

function localKey(value) {
  if (value && typeof value === 'object' && typeof value.date === 'string' && typeof value.time === 'string') return `${value.date}T${value.time}`
  const local = shipmentTrackingBerlinLocal(value)
  return local ? `${local.date}T${local.time}` : ''
}

/** A rule may intentionally begin before the standard lifecycle start.
 * Provision the tracking at that earlier point, but keep its visible phase as
 * `Bevorstehend` until the calculated start date is reached. */
export function shouldActivateShipmentTracking(lifecycle, preview, now) {
  if (!lifecycle?.startAt) return false
  if (isActiveShipmentTrackingPhase(lifecycle.phase)) return true
  if (lifecycle.phase !== 'upcoming') return false
  const ruleTimes = (preview?.rules || []).map((rule) => localKey(rule?.scheduledAt)).filter(Boolean)
  const activationAt = [localKey(lifecycle.startAt), ...ruleTimes].filter(Boolean).sort()[0]
  const clock = localKey(now)
  return Boolean(clock && activationAt && clock >= activationAt)
}

export function isDevelopmentTrackingRecipientAllowed(recipient) {
  return typeof recipient === 'string' && recipient.trim().toLowerCase().endsWith(`@${DEVELOPMENT_RECIPIENT_DOMAIN}`)
}

export function automaticTrackingDeliveryId(bundleId) {
  return `automatic-${createHash('sha256').update(bundleId).digest('hex')}`
}

/** Calculates the one short-notice arrival confirmation without looking at
 * existing rule-catalogue steps. A small scheduler tolerance avoids sending a
 * stale mail when an order is first seen long after the intended point. */
export function shipmentTrackingArrivalConfirmationPlan({ imported, tracking, carrier, settings, operatingHours, now }) {
  const rule = shipmentTrackingArrivalConfirmationRule({ imported, tracking, carrier, settings, operatingHours, now })
  if (!rule || rule.status !== 'due' || rule.withinDispatchWindow !== true) return null
  return { scheduledAt: rule.scheduledAt, scheduled: shipmentTrackingBerlinLocal(rule.scheduledAt), offsetWorkingHours: normalizeShipmentTrackingArrivalConfirmation(settings).offsetWorkingHours }
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

function loadingTime(imported) {
  const local = shipmentTrackingBerlinLocal(imported?.loading?.window?.from)
  if (!local) return 'Nicht hinterlegt'
  const [year, month, day] = local.date.split('-')
  return `${day}.${month}.${year}, ${local.time} Uhr`
}
function templateValues(imported, externalNumber) {
  return {
    transportOrderNumber: text(externalNumber) || text(imported?.externalNumber) || text(imported?.orderNumber) || 'Nicht hinterlegt',
    loadingLocation: text(imported?.loading?.city) || text(imported?.loading?.originalText) || 'Nicht hinterlegt',
    loadingTime: loadingTime(imported),
  }
}

async function synchronizeLifecycle(db, orderSnapshot, currentTracking, operatingHours, now, activationRequired = false) {
  const orderId = orderSnapshot.id
  const imported = orderSnapshot.data()?.imported || null
  const lifecycle = shipmentTrackingLifecycle({
    earliestLoading: imported?.loading?.window?.from,
    latestUnloading: imported?.unloading?.window?.until,
    operatingHours,
    now,
  })
  const trackingRef = db.doc(`transportOrderTrackings/${orderId}`)
  const eventRef = trackingRef.collection('events').doc()

  if (!currentTracking && !isActiveShipmentTrackingPhase(lifecycle.phase) && !activationRequired) return { tracking: null, lifecycle }
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(trackingRef)
    const tracking = snapshot.exists ? snapshot.data() : null
    if (!tracking) {
      if (!isActiveShipmentTrackingPhase(lifecycle.phase) && !activationRequired) return
      const next = createShipmentTrackingDocument(orderId, 'system', 'Sendungsverfolgungs-Automatik', {
        trackingMode: 'automatic',
        lifecyclePhase: lifecycle.phase,
        carrierRecipientEmail: imported?.dispatch?.sentTo,
      })
      transaction.create(trackingRef, next)
      transaction.create(eventRef, eventPayload('tracking_started', {}, { lifecycleStatus: 'active', lifecyclePhase: lifecycle.phase, trackingMode: 'automatic' }))
      return
    }
    if (tracking.lifecycleStatus === 'completed') return
    if (lifecycle.phase === 'completed') {
      transaction.update(trackingRef, {
        lifecycleStatus: 'completed', lifecyclePhase: 'completed', stageId: 'post_transport', progressToNextStage: 0,
        trackingCompletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system', updatedByName: 'Sendungsverfolgungs-Automatik',
      })
      transaction.create(eventRef, eventPayload('tracking_completed', { lifecycleStatus: tracking.lifecycleStatus, lifecyclePhase: tracking.lifecyclePhase || null }, { lifecycleStatus: 'completed', lifecyclePhase: 'completed' }))
      return
    }
    if (tracking.lifecyclePhase !== lifecycle.phase && !(tracking.trackingStartedEarly === true && lifecycle.phase === 'upcoming')) {
      transaction.update(trackingRef, { lifecyclePhase: lifecycle.phase, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system', updatedByName: 'Sendungsverfolgungs-Automatik' })
      transaction.create(eventRef, eventPayload('tracking_phase_changed', { lifecyclePhase: tracking.lifecyclePhase || 'in_progress' }, { lifecyclePhase: lifecycle.phase }))
    }
  })
  const updated = await trackingRef.get()
  return { tracking: updated.exists ? updated.data() : null, lifecycle }
}

async function recordBlockedDelivery(trackingRef, bundle, reason) {
  const deliveryRef = trackingRef.collection('automaticMailDeliveries').doc(automaticTrackingDeliveryId(bundle.id))
  await deliveryRef.set({
    status: 'blocked', recipient: bundle.recipient, templateId: bundle.templateId, ruleIds: bundle.ruleIds, topics: bundle.topics,
    scheduledAt: bundle.scheduledAt, lastError: reason, updatedAt: FieldValue.serverTimestamp(), blockedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
}

async function dispatchArrivalConfirmation(db, { orderId, imported, externalNumber, tracking, operatingHours, settings, now }) {
  if (!tracking || tracking.lifecycleStatus !== 'active' || !['upcoming', 'in_progress'].includes(tracking.lifecyclePhase || 'in_progress')) return { sent: 0, blocked: 0 }
  if (tracking.automationPaused === true || tracking.actualArrivalLoadingAt) return { sent: 0, blocked: 0 }
  const carrier = await effectivePartner(db, imported?.carrier?.partnerId)
  const plan = shipmentTrackingArrivalConfirmationPlan({ imported, tracking, carrier, settings, operatingHours, now })
  const recipient = storedCarrierRecipient(tracking)
  if (!plan || !recipient) return { sent: 0, blocked: 0 }
  const normalizedSettings = normalizeShipmentTrackingArrivalConfirmation(settings)
  const trackingRef = db.doc(`transportOrderTrackings/${orderId}`)
  const deliveryRef = trackingRef.collection('automaticMailDeliveries').doc(automaticTrackingDeliveryId(`actual-arrival-confirmation:${orderId}:${plan.scheduledAt}:${recipient.toLowerCase()}`))
  const deliveryData = {
    kind: 'actual-arrival-confirmation', recipient, templateId: shipmentTrackingArrivalConfirmationTemplateId,
    ruleIds: ['actualArrivalConfirmation'], topics: ['loadingSite'], scheduledAt: plan.scheduledAt,
  }
  // Automatic transport-mail dispatch is deliberately available only in Dev
  // during the test phase. Production cannot send until explicitly enabled.
  if (externalEffectsEnvironment() !== 'development' || !isDevelopmentTrackingRecipientAllowed(recipient)) {
    await deliveryRef.set({ ...deliveryData, status: 'blocked', lastError: externalEffectsEnvironment() === 'development' ? 'recipient-domain-not-allowed' : 'automatic-delivery-disabled', updatedAt: FieldValue.serverTimestamp(), blockedAt: FieldValue.serverTimestamp() }, { merge: true })
    return { sent: 0, blocked: 1 }
  }
  let claimed = false
  await db.runTransaction(async (transaction) => {
    const [trackingSnapshot, deliverySnapshot] = await Promise.all([transaction.get(trackingRef), transaction.get(deliveryRef)])
    const currentTracking = trackingSnapshot.exists ? trackingSnapshot.data() : null
    if (!currentTracking || currentTracking.lifecycleStatus !== 'active' || currentTracking.automationPaused === true || currentTracking.actualArrivalLoadingAt || currentTracking.actualArrivalConfirmationDispatch?.dispatchId) return
    if (storedCarrierRecipient(currentTracking).toLowerCase() !== recipient.toLowerCase()) return
    if (deliverySnapshot.exists && ['sending', 'sent', 'delivered'].includes(deliverySnapshot.data()?.status)) return
    transaction.set(deliveryRef, { ...deliveryData, status: 'sending', attempts: (deliverySnapshot.data()?.attempts || 0) + 1, lockedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    claimed = true
  })
  if (!claimed) return { sent: 0, blocked: 0 }
  const beforeSend = await trackingRef.get()
  if (!beforeSend.exists || beforeSend.data()?.automationPaused === true || beforeSend.data()?.actualArrivalLoadingAt || beforeSend.data()?.actualArrivalConfirmationDispatch?.dispatchId) {
    await deliveryRef.set({ status: 'skipped', updatedAt: FieldValue.serverTimestamp(), lastError: 'arrival-recorded-or-automation-paused-before-send' }, { merge: true })
    return { sent: 0, blocked: 0 }
  }
  try {
    const delivered = await sendSystemMailTemplate({ recipient, templateId: shipmentTrackingArrivalConfirmationTemplateId, values: templateValues(imported, externalNumber), subject: normalizedSettings.subject, message: normalizedSettings.message, allowDevelopment: true })
    if (!delivered) throw new Error('automatic-delivery-disabled')
    const eventRef = trackingRef.collection('events').doc()
    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(trackingRef)
      if (!fresh.exists || fresh.data()?.lifecycleStatus !== 'active') return
      transaction.update(trackingRef, { actualArrivalConfirmationDispatch: { dispatchId: deliveryRef.id, templateId: shipmentTrackingArrivalConfirmationTemplateId, recipient, sentAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system', updatedByName: 'Sendungsverfolgungs-Automatik' })
      transaction.set(deliveryRef, { status: 'sent', sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete() }, { merge: true })
      transaction.create(eventRef, eventPayload('tracking_actual_arrival_confirmation_sent', {}, { delivery: deliveryData }))
    })
    return { sent: 1, blocked: 0 }
  } catch (error) {
    await deliveryRef.set({ status: 'failed', failedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: error instanceof Error ? error.message.slice(0, 240) : 'delivery-failed' }, { merge: true })
    logger.error('Kurz-vor-Ladung-Anfrage fehlgeschlagen.', { orderId, deliveryId: deliveryRef.id, error: error instanceof Error ? error.message : 'unknown' })
    return { sent: 0, blocked: 0 }
  }
}

async function dispatchDueBundles(db, { orderId, imported, externalNumber, tracking, catalog, operatingHours, arrivalConfirmationSettings, now }) {
  if (!tracking || tracking.lifecycleStatus !== 'active' || !['upcoming', 'in_progress'].includes(tracking.lifecyclePhase || 'in_progress')) return { sent: 0, blocked: 0 }
  if (tracking.automationPaused === true) return { sent: 0, blocked: 0 }
  const [customer, carrier] = await Promise.all([effectivePartner(db, imported?.customer?.partnerId), effectivePartner(db, imported?.carrier?.partnerId)])
  const preview = shipmentTrackingDryRun({ imported, tracking, customer, carrier, catalog, operatingHours, arrivalConfirmationSettings, now })
  const bundles = shipmentTrackingManualDispatchBundles(preview)
  const trackingRef = db.doc(`transportOrderTrackings/${orderId}`)
  let sent = 0
  let blocked = 0
  for (const bundle of bundles) {
    // Automatic transport-mail dispatch is deliberately available only in Dev
    // during the test phase. Production cannot send until explicitly enabled.
    if (externalEffectsEnvironment() !== 'development' || !isDevelopmentTrackingRecipientAllowed(bundle.recipient)) {
      await recordBlockedDelivery(trackingRef, bundle, externalEffectsEnvironment() === 'development' ? 'recipient-domain-not-allowed' : 'automatic-delivery-disabled')
      blocked += 1
      continue
    }
    const deliveryRef = trackingRef.collection('automaticMailDeliveries').doc(automaticTrackingDeliveryId(bundle.id))
    let claimed = false
    await db.runTransaction(async (transaction) => {
      const [trackingSnapshot, deliverySnapshot] = await Promise.all([transaction.get(trackingRef), transaction.get(deliveryRef)])
      const currentTracking = trackingSnapshot.exists ? trackingSnapshot.data() : null
      if (!currentTracking || currentTracking.lifecycleStatus !== 'active' || currentTracking.automationPaused === true) return
      if (storedCarrierRecipient(currentTracking).toLowerCase() !== bundle.recipient.toLowerCase()) return
      if (!isDevelopmentTrackingRecipientAllowed(bundle.recipient)) return
      if (deliverySnapshot.exists && ['sending', 'sent', 'delivered'].includes(deliverySnapshot.data()?.status)) return
      transaction.set(deliveryRef, {
        status: 'sending', recipient: bundle.recipient, templateId: bundle.templateId, ruleIds: bundle.ruleIds, topics: bundle.topics,
        scheduledAt: bundle.scheduledAt, attempts: (deliverySnapshot.data()?.attempts || 0) + 1, lockedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      claimed = true
    })
    if (!claimed) continue
    const beforeSend = await trackingRef.get()
    if (!beforeSend.exists || beforeSend.data()?.automationPaused === true) {
      await deliveryRef.set({ status: 'skipped', updatedAt: FieldValue.serverTimestamp(), lastError: 'automation-paused-before-send' }, { merge: true })
      continue
    }
    try {
      const delivered = await sendSystemMailTemplate({ recipient: bundle.recipient, templateId: bundle.templateId, values: templateValues(imported, externalNumber), allowDevelopment: true })
      if (!delivered) throw new Error('automatic-delivery-disabled')
      const eventRef = trackingRef.collection('events').doc()
      await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(trackingRef)
        if (!fresh.exists || fresh.data()?.lifecycleStatus !== 'active') return
        const dispatches = { ...(fresh.data()?.externalRuleDispatches || {}) }
        for (const ruleId of bundle.ruleIds) dispatches[ruleId] = { dispatchId: deliveryRef.id, templateId: bundle.templateId, recipient: bundle.recipient, sentAt: FieldValue.serverTimestamp() }
        transaction.update(trackingRef, { externalRuleDispatches: dispatches, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system', updatedByName: 'Sendungsverfolgungs-Automatik' })
        transaction.set(deliveryRef, { status: 'sent', sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete() }, { merge: true })
        transaction.create(eventRef, eventPayload('tracking_automatic_mail_sent', {}, { delivery: { recipient: bundle.recipient, templateId: bundle.templateId, ruleIds: bundle.ruleIds, topics: bundle.topics } }))
      })
      sent += 1
    } catch (error) {
      await deliveryRef.set({ status: 'failed', failedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: error instanceof Error ? error.message.slice(0, 240) : 'delivery-failed' }, { merge: true })
      logger.error('Automatische Tracking-Mail fehlgeschlagen.', { orderId, deliveryId: deliveryRef.id, error: error instanceof Error ? error.message : 'unknown' })
    }
  }
  return { sent, blocked }
}

/** Runs lifecycle creation/changes and Dev-only automatic carrier mails.
 * It does not alter imported orders, master data or unconfigured recipients. */
export async function runShipmentTrackingAutomation(now = new Date()) {
  const db = getFirestore()
  const [orderSnapshot, trackingSnapshot, catalogSnapshot, operatingHoursSnapshot, arrivalConfirmationSnapshot] = await Promise.all([
    db.collection('transportOrders').get(),
    db.collection('transportOrderTrackings').get(),
    db.doc(SHIPMENT_TRACKING_RULE_CATALOG_PATH).get(),
    db.doc(shipmentTrackingOperatingHoursPath).get(),
    db.doc(shipmentTrackingArrivalConfirmationPath).get(),
  ])
  const trackings = new Map(trackingSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data()]))
  const catalog = catalogSnapshot.exists ? catalogSnapshot.data() : null
  const operatingHours = operatingHoursSnapshot.exists ? operatingHoursSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS
  const arrivalConfirmationSettings = normalizeShipmentTrackingArrivalConfirmation(arrivalConfirmationSnapshot.exists ? arrivalConfirmationSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION)
  const result = { processed: 0, createdOrChanged: 0, mailsSent: 0, mailsBlocked: 0 }
  for (const order of orderSnapshot.docs) {
    const imported = order.data()?.imported || null
    const existingTracking = trackings.get(order.id) || null
    let activationRequired = false
    if (!existingTracking) {
      const lifecycle = shipmentTrackingLifecycle({ earliestLoading: imported?.loading?.window?.from, latestUnloading: imported?.unloading?.window?.until, operatingHours, now })
      if (lifecycle.phase === 'upcoming' && lifecycle.startAt) {
        const [customer, carrier] = await Promise.all([effectivePartner(db, imported?.customer?.partnerId), effectivePartner(db, imported?.carrier?.partnerId)])
        const preview = shipmentTrackingDryRun({ imported, tracking: null, customer, carrier, catalog, operatingHours, arrivalConfirmationSettings, now })
        activationRequired = shouldActivateShipmentTracking(lifecycle, preview, now)
      }
    }
    const synchronized = await synchronizeLifecycle(db, order, existingTracking, operatingHours, now, activationRequired)
    if (!synchronized.tracking) continue
    result.processed += 1
    if (synchronized.lifecycle.phase !== 'upcoming') result.createdOrChanged += 1
    const dispatched = await dispatchDueBundles(db, {
      orderId: order.id, imported, externalNumber: text(order.data()?.externalNumber), tracking: synchronized.tracking,
      catalog, operatingHours, arrivalConfirmationSettings, now,
    })
    result.mailsSent += dispatched.sent
    result.mailsBlocked += dispatched.blocked
    const arrivalConfirmation = await dispatchArrivalConfirmation(db, {
      orderId: order.id, imported, externalNumber: text(order.data()?.externalNumber), tracking: synchronized.tracking,
      operatingHours, settings: arrivalConfirmationSettings, now,
    })
    result.mailsSent += arrivalConfirmation.sent
    result.mailsBlocked += arrivalConfirmation.blocked
  }
  logger.info('Sendungsverfolgungs-Automatik abgeschlossen.', result)
  return result
}

export const scheduledShipmentTrackingAutomation = onSchedule({ region: 'europe-west3', schedule: 'every 5 minutes', timeZone: 'Europe/Berlin', secrets: [systemMailNotificationUrl] }, async () => runShipmentTrackingAutomation())
