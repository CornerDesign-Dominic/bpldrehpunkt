import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { automaticTrackingDeliveryAllowed, automaticTrackingDeliveryId, claimAutomaticTrackingDelivery, isCurrentTrackingRecipient, isAutomaticTrackingDispatchDue, isTrackingRecipientAllowed, nextShipmentTrackingWorkAt, shipmentTrackingArrivalConfirmationPlan, shouldActivateShipmentTracking, trackingDispatchAllowed } from './shipmentTrackingAutomation.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shared/shipmentTrackingOperatingHours.js'

test('automatic tracking mails are production-only, accept every valid recipient and retain stable deduplication ids', () => {
  assert.equal(automaticTrackingDeliveryAllowed({ GCLOUD_PROJECT: 'db-bpl-drehpunkt' }), true)
  assert.equal(automaticTrackingDeliveryAllowed({ GCLOUD_PROJECT: 'db-bpl-drehpunkt-dev' }), false)
  assert.equal(automaticTrackingDeliveryAllowed({ GCLOUD_PROJECT: 'unknown-project' }), false)
  assert.equal(isTrackingRecipientAllowed('test@brennpunkt-logistik.de'), true)
  assert.equal(isTrackingRecipientAllowed('test@external.example'), true)
  assert.equal(isTrackingRecipientAllowed('not-an-email'), false)
  assert.equal(automaticTrackingDeliveryId('same-due-bundle'), automaticTrackingDeliveryId('same-due-bundle'))
  assert.notEqual(automaticTrackingDeliveryId('first'), automaticTrackingDeliveryId('second'))
})

test('automatic tracking dispatches only at the planned moment, never retroactively', () => {
  const scheduledAt = '2026-12-08T08:00:00.000Z'
  assert.equal(isAutomaticTrackingDispatchDue(scheduledAt, '2026-12-08T08:00:00.000Z'), true)
  assert.equal(isAutomaticTrackingDispatchDue(scheduledAt, '2026-12-08T08:10:00.000Z'), true)
  assert.equal(isAutomaticTrackingDispatchDue(scheduledAt, '2026-12-08T08:10:01.000Z'), false)
  assert.equal(isAutomaticTrackingDispatchDue(scheduledAt, '2026-12-08T07:59:59.000Z'), false)
})

test('an already prepared dispatch is rejected when its current recipient changes or is cleared before delivery', () => {
  const tracking = { lifecycleStatus: 'active', recipients: { carrier: { email: 'old@example.test', source: 'transport-order-import' } } }
  assert.equal(isCurrentTrackingRecipient(tracking, 'OLD@example.test'), true)
  assert.equal(isCurrentTrackingRecipient({ ...tracking, recipients: { carrier: { email: 'new@example.test', source: 'transport-order-import' } } }, 'old@example.test'), false)
  assert.equal(isCurrentTrackingRecipient({ ...tracking, recipients: { carrier: { email: '', source: 'transport-order-import' } } }, 'old@example.test'), false)
  assert.equal(isCurrentTrackingRecipient({ ...tracking, lifecycleStatus: 'completed' }, 'old@example.test'), false)
  assert.equal(isCurrentTrackingRecipient({ lifecycleStatus: 'active', recipients: { carrier: { email: 'old@example.test' } } }, 'old@example.test'), false)
})

test('the final send gate rejects concurrent closure, phase, recipient, pause and unloading changes', () => {
  const tracking = { lifecycleStatus: 'active', lifecyclePhase: 'in_progress', recipients: { carrier: { email: 'carrier@example.test', source: 'manual' } } }
  assert.equal(trackingDispatchAllowed(tracking, 'CARRIER@example.test'), true)
  for (const change of [{ lifecycleStatus: 'completed' }, { lifecyclePhase: 'aftercare' }, { automationPaused: true }, { unloadingCompletedAt: '2026-10-01T10:00Z' }, { recipients: { carrier: { email: 'changed@example.test' } } }]) {
    assert.equal(trackingDispatchAllowed({ ...tracking, ...change }, 'carrier@example.test'), false)
  }
})

test('a retried tracking transaction never retains a claim from an aborted earlier attempt', async () => {
  const trackingRef = { path: 'transportOrderTrackings/order-1' }
  const deliveryRef = { path: `${trackingRef.path}/automaticMailDeliveries/delivery` }
  let writes = 0
  const db = { runTransaction: async (operation) => {
    const attempt = (status) => operation({
      get: async (ref) => ref === trackingRef ? { exists: true, data: () => ({ lifecycleStatus: 'active' }) } : { exists: Boolean(status), data: () => status ? { status } : undefined },
      set: () => { writes += 1 },
    })
    assert.equal(await attempt(null), true) // aborted by Firestore after callback
    return attempt('sending') // a concurrent worker committed the reservation
  } }
  assert.equal(await claimAutomaticTrackingDelivery(db, { trackingRef, deliveryRef, delivery: {}, allow: () => true }), false)
  assert.equal(writes, 1)
})

test('a rule due before the lifecycle start provisions tracking early but retains the upcoming lifecycle phase', () => {
  const lifecycle = { phase: 'upcoming', startAt: { date: '2026-10-01', time: '07:00' } }
  assert.equal(shouldActivateShipmentTracking(lifecycle, { rules: [{ scheduledAt: '2026-09-30T09:00:00.000Z' }] }, '2026-09-30T09:01:00.000Z'), true)
  assert.equal(shouldActivateShipmentTracking(lifecycle, { rules: [] }, '2026-09-30T09:01:00.000Z'), false)
})

test('work projection preserves early rules and manual starts while retiring completed and settled aftercare', () => {
  const now = new Date('2026-09-30T07:00:00Z')
  const lifecycle = { phase: 'upcoming', startAt: { date: '2026-10-01', time: '07:00' } }
  const preview = { rules: [{ scheduledAt: '2026-09-30T09:00:00Z', status: 'upcoming' }] }
  assert.equal(nextShipmentTrackingWorkAt({ lifecycle, preview, now }).toISOString(), '2026-09-30T09:00:00.000Z')
  assert.equal(nextShipmentTrackingWorkAt({ lifecycle, preview, tracking: { lifecycleStatus: 'active', lifecyclePhase: 'in_progress' }, now }).toISOString(), now.toISOString())
  assert.equal(nextShipmentTrackingWorkAt({ lifecycle, preview, tracking: { lifecycleStatus: 'completed' }, now }), null)
  assert.equal(nextShipmentTrackingWorkAt({ lifecycle: { phase: 'completed' }, tracking: null, now }), null)
  assert.equal(nextShipmentTrackingWorkAt({ lifecycle: { phase: 'completed' }, tracking: { lifecycleStatus: 'active', lifecyclePhase: 'aftercare' }, now }), null)
  assert.equal(nextShipmentTrackingWorkAt({ lifecycle: { phase: 'completed' }, tracking: { lifecycleStatus: 'active', lifecyclePhase: 'in_progress' }, now }).toISOString(), now.toISOString())
  assert.equal(nextShipmentTrackingWorkAt({ lifecycle, preview, tracking: { lifecycleStatus: 'active', lifecyclePhase: 'aftercare' }, now }).getTime(), now.getTime())
  assert.equal(nextShipmentTrackingWorkAt({ lifecycle: { phase: 'in_progress' }, tracking: { lifecycleStatus: 'active' }, now, afterProcessing: true }).getTime(), now.getTime() + 60_000)
})

test('the ETA confirmation is due two working hours before the loading ETA and never after an actual arrival', () => {
  const input = {
    imported: { loading: { window: { from: '2026-12-08T10:00' } } },
    tracking: { estimatedArrivalLoadingAt: '2026-12-08 10:00', estimatedArrivalLoadingRecordedAt: '2026-12-08T06:00:00.000Z' },
    carrier: { shipmentTrackingPolicy: { carrier: { actualArrivalConfirmationEnabled: true } } },
    settings: { enabled: true, offsetWorkingHours: 2 },
    operatingHours: DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS,
    now: '2026-12-08T07:05:00.000Z',
  }
  const plan = shipmentTrackingArrivalConfirmationPlan(input)
  assert.deepEqual(plan?.scheduled, { date: '2026-12-08', time: '08:00' })
  assert.equal(plan?.offsetWorkingHours, 2)
  assert.equal(shipmentTrackingArrivalConfirmationPlan({ ...input, tracking: { ...input.tracking, actualArrivalLoadingAt: '2026-12-08T08:01:00.000Z' } }), null)
  assert.equal(shipmentTrackingArrivalConfirmationPlan({ ...input, tracking: { estimatedArrivalLoadingAt: '2026-12-08 10:00', estimatedArrivalLoadingRecordedAt: '2026-12-08T08:01:00.000Z' }, now: '2026-12-08T08:05:00.000Z' }), null)
  assert.equal(shipmentTrackingArrivalConfirmationPlan({ ...input, tracking: { ...input.tracking, automationAutomaticResumeAfter: new Date('2026-12-08T08:01:00.000Z') }, now: '2026-12-08T08:05:00.000Z' }), null)
  assert.equal(shipmentTrackingArrivalConfirmationPlan({ ...input, carrier: { shipmentTrackingPolicy: { carrier: { actualArrivalConfirmationEnabled: false } } } }), null)
  assert.equal(shipmentTrackingArrivalConfirmationPlan({ ...input, now: '2026-12-08T08:20:00.000Z' }), null)
})

test('scheduled tracking automation creates lifecycle states and permits production-only dispatches', async () => {
  const [source, index] = await Promise.all([
    readFile(new URL('./shipmentTrackingAutomation.js', import.meta.url), 'utf8'),
    readFile(new URL('./index.js', import.meta.url), 'utf8'),
  ])
  assert.match(source, /shipmentTrackingLifecycle/)
  assert.match(source, /createShipmentTrackingDocument/)
  assert.match(source, /lifecycle\.phase === 'completed' \? 'aftercare'/)
  assert.doesNotMatch(source, /lifecycleStatus: 'completed', lifecyclePhase: 'completed'/)
  assert.match(source, /automaticTrackingDeliveryAllowed/)
  assert.match(source, /isTrackingRecipientAllowed/)
  assert.match(source, /shipmentTrackingMailNotificationUrl/)
  assert.doesNotMatch(source, /brennpunkt-logistik\.de/)
  assert.doesNotMatch(source, /allowDevelopment: true/)
  assert.match(source, /dispatchArrivalConfirmation/)
  assert.match(source, /onSchedule\(\{ region: 'europe-west3', schedule: 'every 5 minutes'/)
  assert.match(index, /scheduledShipmentTrackingAutomation/)
})
