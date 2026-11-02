import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { advanceBackgroundRebuild, requestBackgroundRebuild } from './backgroundWork.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shared/shipmentTrackingOperatingHours.js'
import { DEFAULT_SHIPMENT_TRACKING_RULE_CATALOG } from './shared/shipmentTrackingRuleCatalog.js'
import { shipmentTrackingLifecycle } from './shared/shipmentTrackingLifecycle.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const app = enabled ? initializeApp({ projectId: 'demo-drehpunkt-cost-background' }) : null
const db = enabled ? getFirestore(app) : null
const { finalizeAcceptedTrackingDelivery, maintainShipmentTrackingOrderWork, nextShipmentTrackingWorkAt, rebuildShipmentTrackingWorkHandler, refreshShipmentTrackingWork, requestShipmentTrackingRebuild, runShipmentTrackingAutomation, synchronizeShipmentTrackingLifecycle } = await import('./shipmentTrackingAutomation.js')
const { refreshShipmentTrackingAttentionSummary, shipmentTrackingMailAttentionChanged } = await import('./shipmentTrackingForecast.js')
if (enabled) {
  test.before(async () => { for (const collection of await db.listCollections()) await db.recursiveDelete(collection) })
  test.after(async () => { await db.terminate() })
}

test('Firestore emulator: bounded migration reaches >500 sources, resumes after failure and retains concurrent restart', { skip: !enabled }, async () => {
  const source = db.collection('backgroundWorkTestSources')
  for (let offset = 0; offset < 501; offset += 200) {
    const batch = db.batch()
    for (let index = offset; index < Math.min(offset + 200, 501); index++) batch.set(source.doc(String(index).padStart(4, '0')), { index })
    await batch.commit()
  }
  const visited = new Set()
  const refresh = async (snapshot) => { visited.add(snapshot.id) }
  assert.equal((await advanceBackgroundRebuild(db, 'test-rebuild', source, refresh)).scanned, 200)
  await assert.rejects(advanceBackgroundRebuild(db, 'test-rebuild', source, () => { throw new Error('synthetic interruption') }))
  assert.equal((await advanceBackgroundRebuild(db, 'test-rebuild', source, refresh)).scanned, 200)
  assert.equal((await advanceBackgroundRebuild(db, 'test-rebuild', source, refresh)).scanned, 101)
  assert.equal(visited.size, 501)
  assert.equal((await advanceBackgroundRebuild(db, 'test-rebuild', source, refresh)).scanned, 0)
  await requestBackgroundRebuild(db, 'test-rebuild')
  let restarted = false
  await advanceBackgroundRebuild(db, 'test-rebuild', source, async () => {
    if (!restarted) { restarted = true; await requestBackgroundRebuild(db, 'test-rebuild') }
  })
  const state = (await db.doc('backgroundWorkState/test-rebuild').get()).data()
  assert.equal(state.cursor, null)
  assert.equal(state.complete, false)
  await requestBackgroundRebuild(db, 'test-rebuild', 'event-A')
  await requestBackgroundRebuild(db, 'test-rebuild', 'event-B')
  await advanceBackgroundRebuild(db, 'test-rebuild', source, refresh)
  const progressed = (await db.doc('backgroundWorkState/test-rebuild').get()).data()
  await requestBackgroundRebuild(db, 'test-rebuild', 'event-A')
  const duplicate = (await db.doc('backgroundWorkState/test-rebuild').get()).data()
  assert.equal(duplicate.cursor, progressed.cursor)
  assert.equal(duplicate.generation, progressed.generation)
})

test('Firestore emulator: tracking queue starts automatically, retires aftercare/completed and reactivates changed orders and manual starts', { skip: !enabled }, async () => {
  await db.doc('systemSettings/automaticMailDelivery').set({ paused: true })
  await db.doc('systemSettings/shipmentTrackingOperatingHours').set(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS)
  await db.doc('systemSettings/shipmentTrackingRuleCatalog').set(DEFAULT_SHIPMENT_TRACKING_RULE_CATALOG)
  const now = new Date('2026-09-30T10:00:00Z')
  const order = db.doc('transportOrders/queue-active')
  await order.set({ imported: { loading: { window: { from: '2026-09-30T14:00' } }, unloading: { window: { until: '2026-09-30T16:00' } } } })
  const stale = await order.get()
  await refreshShipmentTrackingWork(db, order.id, now)
  assert((await db.doc(`shipmentTrackingWork/${order.id}`).get()).exists)
  await runShipmentTrackingAutomation(now, { db })
  assert.equal((await db.doc(`transportOrderTrackings/${order.id}`).get()).data().lifecycleStatus, 'active')
  await runShipmentTrackingAutomation(new Date('2026-10-01T06:00:00Z'), { db })
  assert.equal((await db.doc(`transportOrderTrackings/${order.id}`).get()).data().lifecyclePhase, 'aftercare')
  assert.equal((await db.doc(`shipmentTrackingWork/${order.id}`).get()).exists, false)
  await order.update({ 'imported.loading.window.from': '2026-10-08T12:00', 'imported.unloading.window.until': '2026-10-08T16:00' })
  await refreshShipmentTrackingWork(db, order.id, new Date('2026-10-01T06:00:00Z'))
  assert.equal((await db.doc(`shipmentTrackingWork/${order.id}`).get()).data().dueAt.toMillis(), Date.parse('2026-10-01T06:00:00Z'))
  await runShipmentTrackingAutomation(new Date('2026-10-01T06:00:00Z'), { db })
  assert.equal((await db.doc(`transportOrderTrackings/${order.id}`).get()).data().lifecyclePhase, 'upcoming')
  assert((await db.doc(`shipmentTrackingWork/${order.id}`).get()).data().dueAt.toDate() > new Date('2026-10-01T06:00:00Z'))
  await order.update({ 'imported.loading.window.from': '2026-09-30T14:00', 'imported.unloading.window.until': '2026-10-02T16:00' })
  await refreshShipmentTrackingWork(db, order.id, new Date('2026-10-01T06:00:00Z'))
  await runShipmentTrackingAutomation(new Date('2026-10-01T06:00:00Z'), { db })
  assert.equal((await db.doc(`transportOrderTrackings/${order.id}`).get()).data().lifecyclePhase, 'in_progress')
  await db.doc(`transportOrderTrackings/${order.id}`).update({ lifecycleStatus: 'completed', lifecyclePhase: 'completed' })
  await refreshShipmentTrackingWork(db, order.id, now)
  assert.equal((await db.doc(`shipmentTrackingWork/${order.id}`).get()).exists, false)
  // Deliver an old order event after closure: it must read fresh tracking and
  // must neither restore the job nor overwrite closure.
  await maintainShipmentTrackingOrderWork.run({ params: { orderId: order.id }, data: { before: { data: () => undefined }, after: stale } })
  assert.equal((await db.doc(`shipmentTrackingWork/${order.id}`).get()).exists, false)
  await db.doc('transportOrders/manual-future').set({ imported: { loading: { window: { from: '2026-10-30T12:00' } }, unloading: { window: { until: '2026-10-30T16:00' } } } })
  await db.doc('transportOrderTrackings/manual-future').set({ lifecycleStatus: 'active', lifecyclePhase: 'in_progress', trackingStartedEarly: true })
  await refreshShipmentTrackingWork(db, 'manual-future', now)
  assert.equal((await db.doc('shipmentTrackingWork/manual-future').get()).data().dueAt.toDate().getTime(), now.getTime())
  await db.doc('transportOrders/manual-future').delete()
  await refreshShipmentTrackingWork(db, 'manual-future', now)
  assert.equal((await db.doc('shipmentTrackingWork/manual-future').get()).exists, false)
})

test('settings shift lifecycle activation without relying on the old queue timestamp', () => {
  const now = new Date('2026-09-30T10:00:00Z')
  const input = { earliestLoading: '2026-10-02T12:00', latestUnloading: '2026-10-02T16:00', now }
  const original = shipmentTrackingLifecycle({ ...input, operatingHours: DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS })
  const changed = shipmentTrackingLifecycle({ ...input, operatingHours: { ...DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, exceptions: { '2026-10-01': { isOpen: false, from: null, to: null } } } })
  assert(nextShipmentTrackingWorkAt({ lifecycle: original, now }) > now)
  assert.equal(nextShipmentTrackingWorkAt({ lifecycle: changed, now }).getTime(), now.getTime())
})

test('Firestore emulator: configuration rebuild prioritizes >400 queued jobs and enqueues continuations without resetting duplicate requests', { skip: !enabled }, async () => {
  const now = new Date('2026-09-30T10:00:00Z')
  await db.doc('systemSettings/shipmentTrackingOperatingHours').set({ ...DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, exceptions: { '2026-10-01': { isOpen: false, from: null, to: null } } })
  for (let offset = 0; offset < 405; offset += 200) {
    const batch = db.batch()
    for (let index = offset; index < Math.min(offset + 200, 405); index++) {
      const id = `z-priority-${String(index).padStart(4, '0')}`
      batch.set(db.doc(`transportOrders/${id}`), { imported: { loading: { window: { from: '2026-10-02T12:00' } }, unloading: { window: { until: '2026-10-02T16:00' } } } })
      batch.set(db.doc(`shipmentTrackingWork/${id}`), { orderId: id, dueAt: Timestamp.fromDate(new Date('2026-10-01T05:00:00Z')) })
    }
    await batch.commit()
  }
  const enqueued = []
  const enqueue = async (token) => enqueued.push(token)
  await requestShipmentTrackingRebuild(db, 'config-event-1', enqueue)
  await rebuildShipmentTrackingWorkHandler({}, { db, enqueue, now })
  const cursor = (await db.doc('backgroundWorkState/shipment-tracking-priority-v1').get()).data().cursor
  assert(cursor)
  await requestShipmentTrackingRebuild(db, 'config-event-1', enqueue)
  assert.equal((await db.doc('backgroundWorkState/shipment-tracking-priority-v1').get()).data().cursor, cursor)
  let result
  for (let attempt = 0; attempt < 10; attempt++) {
    result = await rebuildShipmentTrackingWorkHandler({}, { db, enqueue, now })
    if (result.complete && result.priority) break
  }
  assert.equal(result.complete, true)
  assert.equal(result.priority, true)
  assert(enqueued.length > 2)
  assert((await db.doc('shipmentTrackingWork/z-priority-0404').get()).data().dueAt.toDate() <= now)
})

test('Firestore emulator: mail review summary reacts to statuses/deletions and does not rewrite unchanged results', { skip: !enabled }, async () => {
  const orderId = 'mail-review-cost'
  await db.doc(`transportOrders/${orderId}`).set({ imported: {} })
  await db.doc(`transportOrderTrackings/${orderId}`).set({ lifecycleStatus: 'active' })
  const mail = db.doc(`transportOrders/${orderId}/receivedMails/one`)
  await mail.set({ receivedAt: Timestamp.fromDate(new Date()), ai: { status: 'error', reviewRequired: false } })
  await refreshShipmentTrackingAttentionSummary(orderId, { db })
  const first = await db.doc(`transportOrderTrackings/${orderId}`).get()
  assert.equal(first.data().attentionSummary.manualReviewOpen, true)
  await refreshShipmentTrackingAttentionSummary(orderId, { db })
  const second = await db.doc(`transportOrderTrackings/${orderId}`).get()
  assert.equal(second.updateTime.toMillis(), first.updateTime.toMillis())
  // Newer Dev deliberately retains the raw mail-review summary even when
  // closed tracking suppresses its operational presentation.
  await db.doc(`transportOrderTrackings/${orderId}`).update({ lifecycleStatus: 'completed' })
  const closedAttention = await refreshShipmentTrackingAttentionSummary(orderId, { db })
  assert.equal(closedAttention.items.length, 0)
  assert.equal((await db.doc(`transportOrderTrackings/${orderId}`).get()).data().attentionSummary.manualReviewOpen, true)
  const before = await mail.get()
  await mail.delete()
  const after = await mail.get()
  assert.equal(shipmentTrackingMailAttentionChanged(before, after), true)
  await refreshShipmentTrackingAttentionSummary(orderId, { db })
  assert.equal((await db.doc(`transportOrderTrackings/${orderId}`).get()).data().attentionSummary.manualReviewOpen, false)
  const snap = (status) => ({ exists: true, data: () => ({ ai: { status } }) })
  assert.equal(shipmentTrackingMailAttentionChanged(snap('pending'), snap('error')), true)
  assert.equal(shipmentTrackingMailAttentionChanged(snap('pending'), snap('applied')), false)
})

test('Firestore emulator: accepted tracking mail receives a sent receipt after concurrent closure without reopening tracking', { skip: !enabled }, async () => {
  const trackingRef = db.doc('transportOrderTrackings/concurrent-close')
  const deliveryRef = trackingRef.collection('automaticMailDeliveries').doc('accepted')
  await trackingRef.set({ lifecycleStatus: 'completed', lifecyclePhase: 'completed' })
  await deliveryRef.set({ status: 'delivered' })
  await finalizeAcceptedTrackingDelivery(db, {
    trackingRef, deliveryRef, trackingUpdate: () => { throw new Error('closed tracking must not be updated') },
    event: { eventType: 'tracking_automatic_mail_sent', delivery: { recipient: 'carrier@example.test' } },
  })
  assert.equal((await deliveryRef.get()).data().status, 'sent')
  assert.deepEqual((await trackingRef.get()).data(), { lifecycleStatus: 'completed', lifecyclePhase: 'completed' })
  assert.equal((await trackingRef.collection('events').get()).size, 1)
})

test('Firestore emulator: a stale order snapshot cannot create tracking after rescheduling or deleting the source', { skip: !enabled }, async () => {
  const now = new Date('2026-09-30T10:00:00Z')
  for (const mode of ['rescheduled', 'deleted']) {
    const order = db.doc(`transportOrders/stale-${mode}`)
    await order.set({ imported: { loading: { window: { from: '2026-09-30T14:00' } }, unloading: { window: { until: '2026-09-30T16:00' } } } })
    const stale = await order.get()
    if (mode === 'rescheduled') await order.update({ 'imported.loading.window.from': '2026-12-15T14:00' })
    else await order.delete()
    const result = await synchronizeShipmentTrackingLifecycle(db, stale, null, DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, now)
    assert.equal(result.tracking, null)
    assert.equal((await db.doc(`transportOrderTrackings/${order.id}`).get()).exists, false)
  }
})
