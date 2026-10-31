import { loadEffectiveTrackingPartner as effectivePartner } from './partnerCluster.js'
import { createHash } from 'node:crypto'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onTaskDispatched } from 'firebase-functions/v2/tasks'
import { getFunctions } from 'firebase-admin/functions'
import { advanceBackgroundRebuild, backgroundWorkPageSize, relevantDocumentChanged, reportBackgroundFailure, requestBackgroundRebuild, withBackgroundDiagnostic } from './backgroundWork.js'
import { advanceTransportOrderListProjection, refreshTransportOrderListProjection } from './transportOrderListProjection.js'
import { externalEffectsEnvironment } from './externalEffects.js'
import { createShipmentTrackingDocument } from './shipmentTracking.js'
import { shipmentTrackingDryRun, shipmentTrackingBerlinLocal, shipmentTrackingBerlinIso, shipmentTrackingArrivalConfirmationRule } from './shared/shipmentTrackingDryRun.js'
import { shipmentTrackingManualDispatchBundles } from './shared/shipmentTrackingManualDispatch.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shared/shipmentTrackingOperatingHours.js'
import { SHIPMENT_TRACKING_RULE_CATALOG_PATH } from './shared/shipmentTrackingRuleCatalog.js'
import { isActiveShipmentTrackingPhase, shipmentTrackingLifecycle } from './shared/shipmentTrackingLifecycle.js'
import { shipmentTrackingOperatingHoursPath } from './shipmentTrackingOperatingHours.js'
import { DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION, normalizeShipmentTrackingArrivalConfirmation, shipmentTrackingArrivalConfirmationPath, shipmentTrackingArrivalConfirmationTemplateId } from './shipmentTrackingArrivalConfirmation.js'
import { sendSystemMailTemplate, shipmentTrackingMailNotificationUrl, systemMailNotificationUrl } from './systemMails.js'
import { areAutomaticMailsPaused } from './automaticMailDelivery.js'
import { shipmentTrackingMailTemplateValues } from './shipmentTrackingMailValues.js'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// The scheduler runs every five minutes.  Ten minutes give it one safe retry
// interval, but never turn an old, missed action into an automatic e-mail.
const AUTOMATIC_DISPATCH_WINDOW_MS = 10 * 60 * 1000
const trackingWorkCollection = 'shipmentTrackingWork'
const trackingRebuildName = 'shipment-tracking-v1'
const trackingPriorityRebuildName = 'shipment-tracking-priority-v1'
const trackingRebuildWorkerName = 'rebuildShipmentTrackingWork'

async function enqueueTrackingRebuild(token) {
  try {
    await getFunctions().taskQueue(`locations/europe-west3/functions/${trackingRebuildWorkerName}`).enqueue({}, { id: createHash('sha256').update(token).digest('hex'), dispatchDeadlineSeconds: 540 })
  } catch (error) { if (!['task-already-exists', 'functions/task-already-exists'].includes(error?.code)) throw error }
}

export async function requestShipmentTrackingRebuild(db, requestId, enqueue = enqueueTrackingRebuild) {
  await requestBackgroundRebuild(db, trackingPriorityRebuildName, requestId)
  await requestBackgroundRebuild(db, trackingRebuildName, requestId)
  await enqueue(`request:${requestId}`)
}

export async function rebuildShipmentTrackingWorkHandler(_request, { db = getFirestore(), enqueue = enqueueTrackingRebuild, now = new Date() } = {}) {
  const priority = await advanceBackgroundRebuild(db, trackingPriorityRebuildName, db.collection(trackingWorkCollection), (item) => refreshShipmentTrackingWork(db, item.id, now))
  if (priority.complete) await advanceShipmentTrackingWork(db, now)
  const [priorityState, sourceState] = await Promise.all([db.doc(`backgroundWorkState/${trackingPriorityRebuildName}`).get(), db.doc(`backgroundWorkState/${trackingRebuildName}`).get()])
  if (!priorityState.data()?.complete || !sourceState.data()?.complete) {
    const token = JSON.stringify([priorityState.data()?.generation || 0, priorityState.data()?.cursor || '', sourceState.data()?.generation || 0, sourceState.data()?.cursor || ''])
    await enqueue(`continue:${token}`)
  }
  return { priority: priorityState.data()?.complete === true, complete: sourceState.data()?.complete === true }
}

export const rebuildShipmentTrackingWork = onTaskDispatched({ region: 'europe-west3', timeoutSeconds: 540, maxInstances: 1, concurrency: 1, retryConfig: { maxAttempts: 10, minBackoffSeconds: 5 }, rateLimits: { maxConcurrentDispatches: 1 } }, async (request) => {
  const db = getFirestore()
  return withBackgroundDiagnostic(db, 'tracking-rebuild', () => rebuildShipmentTrackingWorkHandler(request, { db }))
})

export function nextShipmentTrackingWorkAt({ lifecycle, tracking, preview, now = new Date(), afterProcessing = false }) {
  if (tracking?.lifecycleStatus === 'completed') return null
  // Eligible before the next five-minute tick, despite small scheduler jitter.
  const immediate = new Date(now.getTime() + (afterProcessing ? 60 * 1000 : 0))
  if (lifecycle.phase === 'completed') return tracking && tracking.lifecyclePhase !== 'aftercare' ? immediate : null
  if (lifecycle.phase === 'in_progress') {
    if (tracking?.unloadingCompletedAt && tracking.lifecyclePhase === 'in_progress') return asDate(shipmentTrackingBerlinIso(lifecycle.completionAt))
    return immediate
  }
  if (tracking && tracking.lifecyclePhase !== 'upcoming' && tracking.trackingStartedEarly !== true) return immediate
  if (tracking?.lifecyclePhase === 'in_progress') return immediate // an early manual start remains active
  const startsAt = lifecycle.startAt ? asDate(shipmentTrackingBerlinIso(lifecycle.startAt)) : null
  const times = [startsAt, ...(preview?.rules || [])
    .filter((rule) => !tracking || (!['sent', 'notRequired', 'skipped'].includes(rule.status) && asDate(rule.scheduledAt)?.getTime() >= now.getTime() - AUTOMATIC_DISPATCH_WINDOW_MS))
    .map((rule) => asDate(rule.scheduledAt))].filter(Boolean)
  if (!times.length) return null
  const earliest = new Date(Math.min(...times.map((value) => value.getTime())))
  return earliest > now ? earliest : immediate
}

export async function refreshShipmentTrackingWork(db, orderId, now = new Date(), { afterProcessing = false } = {}) {
  const workRef = db.doc(`${trackingWorkCollection}/${orderId}`)
  await db.runTransaction(async (transaction) => {
    const [order, trackingSnapshot, hours, catalog, arrival] = await Promise.all([
      transaction.get(db.doc(`transportOrders/${orderId}`)), transaction.get(db.doc(`transportOrderTrackings/${orderId}`)),
      transaction.get(db.doc(shipmentTrackingOperatingHoursPath)), transaction.get(db.doc(SHIPMENT_TRACKING_RULE_CATALOG_PATH)), transaction.get(db.doc(shipmentTrackingArrivalConfirmationPath)),
    ])
    if (!order.exists) { transaction.delete(workRef); return }
    const tracking = trackingSnapshot.exists ? trackingSnapshot.data() : null
    const imported = order.data()?.imported || null
    const operatingHours = hours.exists ? hours.data() : DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS
    const lifecycle = shipmentTrackingLifecycle({ earliestLoading: imported?.loading?.window?.from, latestUnloading: imported?.unloading?.window?.until, operatingHours, now })
    let preview = null
    if (lifecycle.phase === 'upcoming' && tracking?.lifecycleStatus !== 'completed') {
      const reader = { doc: (path) => ({ get: () => transaction.get(db.doc(path)) }) }
      const [customer, carrier] = await Promise.all([effectivePartner(reader, imported?.customer?.partnerId), effectivePartner(reader, imported?.carrier?.partnerId)])
      preview = shipmentTrackingDryRun({ imported, tracking, customer, carrier, catalog: catalog.data() || null, operatingHours, arrivalConfirmationSettings: arrival.data() || DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION, now })
    }
    const nextAt = nextShipmentTrackingWorkAt({ lifecycle, tracking, preview, now, afterProcessing })
    if (!nextAt) transaction.delete(workRef)
    else transaction.set(workRef, { orderId, dueAt: Timestamp.fromDate(nextAt) })
  })
}

export function advanceShipmentTrackingWork(db, now = new Date()) {
  return advanceBackgroundRebuild(db, trackingRebuildName, db.collection('transportOrders'), (item) => refreshShipmentTrackingWork(db, item.id, now))
}

export const maintainShipmentTrackingOrderWork = onDocumentWritten({ region: 'europe-west3', document: 'transportOrders/{orderId}', retry: true, maxInstances: 3 }, async (event) => {
  if (!relevantDocumentChanged(event.data.before.data(), event.data.after.data(), ['listQuery'])) return
  const db = getFirestore()
  await withBackgroundDiagnostic(db, 'tracking-order-projection', async () => {
    await refreshTransportOrderListProjection(db, event.params.orderId)
    await refreshShipmentTrackingWork(db, event.params.orderId)
  })
})
export const maintainShipmentTrackingStateWork = onDocumentWritten({ region: 'europe-west3', document: 'transportOrderTrackings/{orderId}', retry: true, maxInstances: 3 }, async (event) => {
  if (!relevantDocumentChanged(event.data.before.data(), event.data.after.data(), ['currentForecast', 'attentionSummary', 'updatedAt', 'updatedBy', 'updatedByName'])) return
  const db = getFirestore()
  await withBackgroundDiagnostic(db, 'tracking-state-projection', () => refreshShipmentTrackingWork(db, event.params.orderId))
})
export const rebuildShipmentTrackingWorkOnSettings = onDocumentWritten({ region: 'europe-west3', document: 'systemSettings/{settingId}', retry: true, maxInstances: 1 }, async (event) => {
  if (!['shipmentTrackingOperatingHours', 'shipmentTrackingRuleCatalog', 'shipmentTrackingArrivalConfirmation'].includes(event.params.settingId)) return
  const db = getFirestore()
  if (relevantDocumentChanged(event.data.before.data(), event.data.after.data(), ['updatedAt', 'updatedBy', 'updatedByName'])) await withBackgroundDiagnostic(db, 'tracking-settings-rebuild', () => requestShipmentTrackingRebuild(db, event.id))
})
export const rebuildShipmentTrackingWorkOnPartner = onDocumentWritten({ region: 'europe-west3', document: 'businessPartners/{partnerId}', retry: true, maxInstances: 1 }, async (event) => {
  const fields = ['shipmentTrackingPolicy', 'mergedIntoPartnerId', 'status']
  const select = (value) => Object.fromEntries(fields.map((key) => [key, value?.[key] ?? null]))
  const db = getFirestore()
  if (relevantDocumentChanged(select(event.data.before.data()), select(event.data.after.data()))) await withBackgroundDiagnostic(db, 'tracking-partner-rebuild', () => requestShipmentTrackingRebuild(db, event.id))
})

function text(value) { return typeof value === 'string' ? value.trim() : '' }
function asDate(value) {
  const date = value?.toDate?.() || value
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date
  if (typeof date === 'string' && date) {
    const parsed = new Date(date)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}
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

export function isCurrentTrackingRecipient(tracking, recipient) {
  const current = storedCarrierRecipient(tracking)
  return tracking?.lifecycleStatus === 'active' && Boolean(current) && current.toLowerCase() === text(recipient).toLowerCase()
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

export function isTrackingRecipientAllowed(recipient) {
  return emailPattern.test(text(recipient))
}

/** Automatic mails are a production feature. The development project keeps
 * lifecycle synchronization available without permitting external delivery. */
export function automaticTrackingDeliveryAllowed(environment) {
  return externalEffectsEnvironment(environment) === 'production'
}

export function automaticTrackingDeliveryId(bundleId) {
  return `automatic-${createHash('sha256').update(bundleId).digest('hex')}`
}

/** Only a currently due action may leave automatically. Older actions stay
 * visible as missed and can exclusively be triggered by a person. */
export function isAutomaticTrackingDispatchDue(scheduledAt, now = new Date()) {
  const scheduled = asDate(scheduledAt)
  const clock = asDate(now) || new Date()
  if (!scheduled) return false
  const elapsedMs = clock.getTime() - scheduled.getTime()
  return elapsedMs >= 0 && elapsedMs <= AUTOMATIC_DISPATCH_WINDOW_MS
}

/** Calculates the one short-notice arrival confirmation without looking at
 * existing rule-catalogue steps. A small scheduler tolerance avoids sending a
 * stale mail when an order is first seen long after the intended point. */
export function shipmentTrackingArrivalConfirmationPlan({ imported, tracking, carrier, settings, operatingHours, now }) {
  const rule = shipmentTrackingArrivalConfirmationRule({ imported, tracking, carrier, settings, operatingHours, now })
  if (!rule || rule.status !== 'due' || rule.withinDispatchWindow !== true) return null
  const automaticResumeAfter = asDate(tracking?.automationAutomaticResumeAfter)
  if (automaticResumeAfter && asDate(rule.scheduledAt)?.getTime() < automaticResumeAfter.getTime()) return null
  return { scheduledAt: rule.scheduledAt, scheduled: shipmentTrackingBerlinLocal(rule.scheduledAt), offsetWorkingHours: normalizeShipmentTrackingArrivalConfirmation(settings).offsetWorkingHours }
}

function templateValues(imported, externalNumber) { return shipmentTrackingMailTemplateValues(imported, externalNumber) }

export function trackingOrderSourceMatches(snapshot, imported, externalNumber) {
  return snapshot.exists && text(snapshot.data()?.externalNumber) === text(externalNumber)
    && JSON.stringify(snapshot.data()?.imported || null) === JSON.stringify(imported || null)
}

export function trackingDispatchAllowed(tracking, recipient) {
  return isCurrentTrackingRecipient(tracking, recipient)
    && ['upcoming', 'in_progress'].includes(tracking.lifecyclePhase || 'in_progress')
    && tracking.automationPaused !== true && !tracking.unloadingCompletedAt
    && storedCarrierRecipient(tracking).toLowerCase() === recipient.toLowerCase()
}

export function claimAutomaticTrackingDelivery(db, { trackingRef, deliveryRef, delivery, allow }) {
  // Only the successful transaction attempt can grant the claim. Mutable
  // outer flags survive Firestore retries and can otherwise grant two senders.
  return db.runTransaction(async (transaction) => {
    const [trackingSnapshot, deliverySnapshot] = await Promise.all([transaction.get(trackingRef), transaction.get(deliveryRef)])
    const tracking = trackingSnapshot.exists ? trackingSnapshot.data() : null
    if (!tracking || !allow(tracking) || ['sending', 'sent', 'delivered'].includes(deliverySnapshot.data()?.status)) return false
    transaction.set(deliveryRef, { ...delivery, status: 'sending', attempts: (deliverySnapshot.data()?.attempts || 0) + 1, lockedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return true
  })
}

export async function finalizeAcceptedTrackingDelivery(db, { trackingRef, deliveryRef, trackingUpdate, event }) {
  const eventRef = trackingRef.collection('events').doc()
  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(trackingRef)
    transaction.set(deliveryRef, { status: 'sent', sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete() }, { merge: true })
    if (!fresh.exists) return
    if (fresh.data()?.lifecycleStatus === 'active') transaction.update(trackingRef, { ...trackingUpdate(fresh.data()), updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system', updatedByName: 'Sendungsverfolgungs-Automatik' })
    transaction.create(eventRef, event)
  })
}

export async function synchronizeShipmentTrackingLifecycle(db, orderSnapshot, currentTracking, operatingHours, now, activationRequired = false) {
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

  if (currentTracking?.lifecycleStatus === 'completed') return { tracking: currentTracking, lifecycle }
  if (!currentTracking && !isActiveShipmentTrackingPhase(lifecycle.phase) && !activationRequired) return { tracking: null, lifecycle }
  const sourceUnchanged = await db.runTransaction(async (transaction) => {
    const [snapshot, freshOrder] = await Promise.all([transaction.get(trackingRef), transaction.get(orderSnapshot.ref)])
    if (!trackingOrderSourceMatches(freshOrder, imported, orderSnapshot.data()?.externalNumber)) return false
    const tracking = snapshot.exists ? snapshot.data() : null
    if (!tracking) {
      if (!isActiveShipmentTrackingPhase(lifecycle.phase) && !activationRequired) return false
      const next = createShipmentTrackingDocument(orderId, 'system', 'Sendungsverfolgungs-Automatik', {
        trackingMode: 'automatic',
        lifecyclePhase: lifecycle.phase,
        carrierRecipientEmail: imported?.dispatch?.sentTo,
        importedLicensePlate: imported?.shipment?.licensePlate,
      })
      transaction.create(trackingRef, next)
      transaction.create(eventRef, eventPayload('tracking_started', {}, { lifecycleStatus: 'active', lifecyclePhase: lifecycle.phase, trackingMode: 'automatic', ...(next.licensePlate ? { licensePlate: next.licensePlate } : {}) }))
      return true
    }
    if (tracking.lifecycleStatus === 'completed') return false
    // The schedule's end is an automation boundary, not a data lock.  The
    // transport may already be done, while users and the mailbox still need
    // to add or correct preparation, tracking, and rating information.
    const nextLifecyclePhase = lifecycle.phase === 'completed' ? 'aftercare' : lifecycle.phase
    if (tracking.lifecyclePhase !== nextLifecyclePhase && !(tracking.trackingStartedEarly === true && nextLifecyclePhase === 'upcoming')) {
      transaction.update(trackingRef, {
        lifecyclePhase: nextLifecyclePhase, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system', updatedByName: 'Sendungsverfolgungs-Automatik',
      })
      transaction.create(eventRef, eventPayload('tracking_phase_changed', { lifecyclePhase: tracking.lifecyclePhase || 'in_progress' }, { lifecyclePhase: nextLifecyclePhase }))
    }
    return true
  })
  if (!sourceUnchanged) return { tracking: null, lifecycle }
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

/** A pause freezes the current plan. Only a rule whose own scheduled instant
 * occurs while the pause is active becomes a durable "skipped" action. */
async function recordRulesSkippedDuringPause(db, trackingRef, tracking, rules, now) {
  const pausedAt = asDate(tracking?.automationPausedAt)
  const clock = asDate(now) || new Date()
  if (!pausedAt) return
  const dueRules = (rules || []).filter((rule) => {
    const scheduledAt = asDate(rule?.scheduledAt)
    const hasConfiguredRecipient = rule?.kind !== 'external' || rule?.recipient?.state === 'configured'
    const etaWouldDispatch = rule?.arrivalConfirmation !== true || rule?.withinDispatchWindow === true
    return rule?.status === 'due' && hasConfiguredRecipient && etaWouldDispatch && isAutomaticTrackingDispatchDue(scheduledAt, clock) && scheduledAt && scheduledAt.getTime() >= pausedAt.getTime() && scheduledAt.getTime() <= clock.getTime()
  })
  if (!dueRules.length) return
  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(trackingRef)
    const current = fresh.exists ? fresh.data() : null
    const currentPausedAt = asDate(current?.automationPausedAt)
    if (!current || current.automationPaused !== true || !currentPausedAt) return
    const skippedRules = { ...(current.automationSkippedRules || {}) }
    const newlySkipped = dueRules.filter((rule) => {
      const scheduledAt = text(rule.scheduledAt)
      return scheduledAt && skippedRules[rule.ruleId]?.scheduledAt !== scheduledAt && asDate(rule.scheduledAt)?.getTime() >= currentPausedAt.getTime()
    })
    if (!newlySkipped.length) return
    for (const rule of newlySkipped) skippedRules[rule.ruleId] = { scheduledAt: rule.scheduledAt, pausedAt: currentPausedAt.toISOString(), skippedAt: clock.toISOString() }
    transaction.update(trackingRef, { automationSkippedRules: skippedRules, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system', updatedByName: 'Sendungsverfolgungs-Automatik' })
    transaction.create(trackingRef.collection('events').doc(), eventPayload('tracking_automation_rules_skipped', {}, { ruleIds: newlySkipped.map((rule) => rule.ruleId), reason: 'automation-paused' }))
  })
}

async function dispatchArrivalConfirmation(db, { orderId, imported, externalNumber, tracking, operatingHours, settings, now }) {
  if (!tracking || tracking.lifecycleStatus !== 'active' || !['upcoming', 'in_progress'].includes(tracking.lifecyclePhase || 'in_progress')) return { sent: 0, blocked: 0 }
  if (tracking.automationPaused === true || tracking.actualArrivalLoadingAt || tracking.unloadingCompletedAt) return { sent: 0, blocked: 0 }
  const carrier = await effectivePartner(db, imported?.carrier?.partnerId)
  const plan = shipmentTrackingArrivalConfirmationPlan({ imported, tracking, carrier, settings, operatingHours, now })
  const recipient = storedCarrierRecipient(tracking)
  if (!plan || !recipient) return { sent: 0, blocked: 0 }
  const trackingRef = db.doc(`transportOrderTrackings/${orderId}`)
  const deliveryRef = trackingRef.collection('automaticMailDeliveries').doc(automaticTrackingDeliveryId(`actual-arrival-confirmation:${orderId}:${plan.scheduledAt}:${recipient.toLowerCase()}`))
  const deliveryData = {
    kind: 'actual-arrival-confirmation', recipient, templateId: shipmentTrackingArrivalConfirmationTemplateId,
    ruleIds: ['actualArrivalConfirmation'], topics: ['loadingSite'], scheduledAt: plan.scheduledAt,
  }
  if (!automaticTrackingDeliveryAllowed() || !isTrackingRecipientAllowed(recipient)) {
    await deliveryRef.set({ ...deliveryData, status: 'blocked', lastError: automaticTrackingDeliveryAllowed() ? 'recipient-invalid' : 'automatic-delivery-disabled', updatedAt: FieldValue.serverTimestamp(), blockedAt: FieldValue.serverTimestamp() }, { merge: true })
    return { sent: 0, blocked: 1 }
  }
  const claimed = await claimAutomaticTrackingDelivery(db, { trackingRef, deliveryRef, delivery: deliveryData,
    allow: (current) => trackingDispatchAllowed(current, recipient) && !current.actualArrivalLoadingAt && !current.actualArrivalConfirmationDispatch?.dispatchId,
  })
  if (!claimed) return { sent: 0, blocked: 0 }
  const [beforeSend, beforeSendOrder] = await Promise.all([trackingRef.get(), db.doc(`transportOrders/${orderId}`).get()])
  if (!trackingOrderSourceMatches(beforeSendOrder, imported, externalNumber) || !beforeSend.exists || !trackingDispatchAllowed(beforeSend.data(), recipient) || beforeSend.data()?.actualArrivalLoadingAt || beforeSend.data()?.actualArrivalConfirmationDispatch?.dispatchId || !isAutomaticTrackingDispatchDue(plan.scheduledAt, new Date())) {
    await deliveryRef.set({ status: 'skipped', updatedAt: FieldValue.serverTimestamp(), lastError: 'tracking-or-order-changed-or-dispatch-window-expired-before-send' }, { merge: true })
    return { sent: 0, blocked: 0 }
  }
  let deliveryAccepted = false
  try {
    const delivered = await sendSystemMailTemplate({ recipient, templateId: shipmentTrackingArrivalConfirmationTemplateId, values: templateValues(imported, externalNumber), automatic: true })
    if (!delivered) {
      await deliveryRef.set({ status: 'paused', pausedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: 'automatic-mail-delivery-paused' }, { merge: true })
      return { sent: 0, blocked: 0, paused: 1 }
    }
    deliveryAccepted = true
    await deliveryRef.set({ status: 'delivered', deliveredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    await finalizeAcceptedTrackingDelivery(db, { trackingRef, deliveryRef,
      trackingUpdate: () => ({ actualArrivalConfirmationDispatch: { dispatchId: deliveryRef.id, templateId: shipmentTrackingArrivalConfirmationTemplateId, recipient, sentAt: FieldValue.serverTimestamp() } }),
      event: eventPayload('tracking_actual_arrival_confirmation_sent', {}, { delivery: deliveryData }),
    })
    return { sent: 1, blocked: 0 }
  } catch (error) {
    await deliveryRef.set({ status: deliveryAccepted ? 'delivered' : 'failed', updatedAt: FieldValue.serverTimestamp(), lastError: deliveryAccepted ? 'accepted-history-incomplete' : 'delivery-failed' }, { merge: true }).catch(() => {})
    await reportBackgroundFailure(db, 'tracking-arrival-dispatch', error)
    return { sent: 0, blocked: 0 }
  }
}

async function dispatchDueBundles(db, { orderId, imported, externalNumber, tracking, catalog, operatingHours, arrivalConfirmationSettings, now }) {
  if (!tracking || tracking.lifecycleStatus !== 'active' || !['upcoming', 'in_progress'].includes(tracking.lifecyclePhase || 'in_progress')) return { sent: 0, blocked: 0 }
  if (tracking.unloadingCompletedAt) return { sent: 0, blocked: 0 }
  const [customer, carrier] = await Promise.all([effectivePartner(db, imported?.customer?.partnerId), effectivePartner(db, imported?.carrier?.partnerId)])
  const preview = shipmentTrackingDryRun({ imported, tracking, customer, carrier, catalog, operatingHours, arrivalConfirmationSettings, now })
  const trackingRef = db.doc(`transportOrderTrackings/${orderId}`)
  if (tracking.automationPaused === true) {
    await recordRulesSkippedDuringPause(db, trackingRef, tracking, preview.rules, now)
    return { sent: 0, blocked: 0 }
  }
  const automaticResumeAfter = asDate(tracking.automationAutomaticResumeAfter)
  const bundles = shipmentTrackingManualDispatchBundles(preview).filter((bundle) =>
    (!automaticResumeAfter || asDate(bundle.scheduledAt)?.getTime() >= automaticResumeAfter.getTime())
    && isAutomaticTrackingDispatchDue(bundle.scheduledAt, now),
  )
  let sent = 0
  let blocked = 0
  for (const bundle of bundles) {
    if (!automaticTrackingDeliveryAllowed() || !isTrackingRecipientAllowed(bundle.recipient)) {
      await recordBlockedDelivery(trackingRef, bundle, automaticTrackingDeliveryAllowed() ? 'recipient-invalid' : 'automatic-delivery-disabled')
      blocked += 1
      continue
    }
    const deliveryRef = trackingRef.collection('automaticMailDeliveries').doc(automaticTrackingDeliveryId(bundle.id))
    const claimed = await claimAutomaticTrackingDelivery(db, { trackingRef, deliveryRef,
      delivery: { recipient: bundle.recipient, templateId: bundle.templateId, ruleIds: bundle.ruleIds, topics: bundle.topics, scheduledAt: bundle.scheduledAt },
      allow: (current) => trackingDispatchAllowed(current, bundle.recipient) && isTrackingRecipientAllowed(bundle.recipient),
    })
    if (!claimed) continue
    const [beforeSend, beforeSendOrder] = await Promise.all([trackingRef.get(), db.doc(`transportOrders/${orderId}`).get()])
    if (!trackingOrderSourceMatches(beforeSendOrder, imported, externalNumber) || !beforeSend.exists || !trackingDispatchAllowed(beforeSend.data(), bundle.recipient) || !isAutomaticTrackingDispatchDue(bundle.scheduledAt, new Date())) {
      await deliveryRef.set({ status: 'skipped', updatedAt: FieldValue.serverTimestamp(), lastError: 'tracking-or-order-changed-or-dispatch-window-expired-before-send' }, { merge: true })
      continue
    }
    let deliveryAccepted = false
    try {
      const delivered = await sendSystemMailTemplate({ recipient: bundle.recipient, templateId: bundle.templateId, values: templateValues(imported, externalNumber), automatic: true })
      if (!delivered) {
        await deliveryRef.set({ status: 'paused', pausedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: 'automatic-mail-delivery-paused' }, { merge: true })
        continue
      }
      deliveryAccepted = true
      await deliveryRef.set({ status: 'delivered', deliveredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      await finalizeAcceptedTrackingDelivery(db, { trackingRef, deliveryRef,
        trackingUpdate: (fresh) => {
          const dispatches = { ...(fresh.externalRuleDispatches || {}) }
          for (const ruleId of bundle.ruleIds) dispatches[ruleId] = { dispatchId: deliveryRef.id, templateId: bundle.templateId, recipient: bundle.recipient, sentAt: FieldValue.serverTimestamp() }
          return { externalRuleDispatches: dispatches }
        },
        event: eventPayload('tracking_automatic_mail_sent', {}, { delivery: { recipient: bundle.recipient, templateId: bundle.templateId, ruleIds: bundle.ruleIds, topics: bundle.topics } }),
      })
      sent += 1
    } catch (error) {
      await deliveryRef.set({ status: deliveryAccepted ? 'delivered' : 'failed', updatedAt: FieldValue.serverTimestamp(), lastError: deliveryAccepted ? 'accepted-history-incomplete' : 'delivery-failed' }, { merge: true }).catch(() => {})
      await reportBackgroundFailure(db, 'tracking-mail-dispatch', error)
    }
  }
  return { sent, blocked }
}

/** Runs lifecycle creation/changes and production automatic carrier mails.
 * It does not alter imported orders, master data or unconfigured recipients. */
export async function runShipmentTrackingAutomation(now = new Date(), { db = getFirestore() } = {}) {
  await advanceTransportOrderListProjection(db)
  const rebuild = await advanceShipmentTrackingWork(db, now)
  const [catalogSnapshot, operatingHoursSnapshot, arrivalConfirmationSnapshot, automaticMailsPaused] = await Promise.all([
    db.doc(SHIPMENT_TRACKING_RULE_CATALOG_PATH).get(),
    db.doc(shipmentTrackingOperatingHoursPath).get(),
    db.doc(shipmentTrackingArrivalConfirmationPath).get(),
    areAutomaticMailsPaused(db),
  ])
  const catalog = catalogSnapshot.exists ? catalogSnapshot.data() : null
  const operatingHours = operatingHoursSnapshot.exists ? operatingHoursSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS
  const arrivalConfirmationSettings = normalizeShipmentTrackingArrivalConfirmation(arrivalConfirmationSnapshot.exists ? arrivalConfirmationSnapshot.data() : DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION)
  const result = { processed: 0, createdOrChanged: 0, mailsSent: 0, mailsBlocked: 0, automaticMailsPaused, rebuild }
  let cursor = null
  while (true) {
    let query = db.collection(trackingWorkCollection).where('dueAt', '<=', Timestamp.fromDate(now)).orderBy('dueAt').limit(backgroundWorkPageSize)
    if (cursor) query = query.startAfter(cursor)
    const jobs = await query.get()
    for (const job of jobs.docs) {
      const [order, trackingSnapshot] = await Promise.all([db.doc(`transportOrders/${job.id}`).get(), db.doc(`transportOrderTrackings/${job.id}`).get()])
      if (!order.exists) { await refreshShipmentTrackingWork(db, job.id, now, { afterProcessing: true }); continue }
      const imported = order.data()?.imported || null
      const existingTracking = trackingSnapshot.exists ? trackingSnapshot.data() : null
      let activationRequired = false
      if (!existingTracking) {
        const lifecycle = shipmentTrackingLifecycle({ earliestLoading: imported?.loading?.window?.from, latestUnloading: imported?.unloading?.window?.until, operatingHours, now })
        if (lifecycle.phase === 'upcoming' && lifecycle.startAt) {
          const [customer, carrier] = await Promise.all([effectivePartner(db, imported?.customer?.partnerId), effectivePartner(db, imported?.carrier?.partnerId)])
          const preview = shipmentTrackingDryRun({ imported, tracking: null, customer, carrier, catalog, operatingHours, arrivalConfirmationSettings, now })
          activationRequired = shouldActivateShipmentTracking(lifecycle, preview, now)
        }
      }
      const synchronized = await synchronizeShipmentTrackingLifecycle(db, order, existingTracking, operatingHours, now, activationRequired)
      if (!synchronized.tracking) { await refreshShipmentTrackingWork(db, order.id, now, { afterProcessing: true }); continue }
      result.processed += 1
      if (synchronized.lifecycle.phase !== 'upcoming') result.createdOrChanged += 1
      if (!automaticMailsPaused) {
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
      await refreshShipmentTrackingWork(db, order.id, now, { afterProcessing: true })
    }
    cursor = jobs.docs.at(-1) || null
    if (!cursor || jobs.size < backgroundWorkPageSize) break
  }
  logger.info('Sendungsverfolgungs-Automatik abgeschlossen.', result)
  return result
}

export const scheduledShipmentTrackingAutomation = onSchedule({ region: 'europe-west3', schedule: 'every 5 minutes', timeZone: 'Europe/Berlin', maxInstances: 1, timeoutSeconds: 540, secrets: [systemMailNotificationUrl, shipmentTrackingMailNotificationUrl] }, async () => {
  try { return await runShipmentTrackingAutomation() } catch (error) { await reportBackgroundFailure(getFirestore(), 'shipment-tracking', error); throw error }
})
