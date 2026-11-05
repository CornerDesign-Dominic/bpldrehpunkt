import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { previewPersonalMailTracking, applyPersonalMailTracking } from './personalMailTracking.js'
import { processStatusMailAi } from './statusMailAi.js'
import { updateManualShipmentTrackingHandler } from './shipmentTracking.js'

test('emulator: derived arrival survives preview reload and confirmation; later correction preserves its three timestamps and provenance', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-tracking-time-history'
  assert.ok(projectId.startsWith('demo-'), 'Never run against real Firebase')
  const app = initializeApp({ projectId }), db = getFirestore(app)
  const uid = `time-${randomUUID()}`, orderId = uid, connectionId = uid, orderNumber = '899991234'
  const profile = { active: true, role: 'user', firstName: 'Synthetic', permissions: { transportOrders: 'edit', mailboxes: 'edit' } }
  const connection = { ownerId: uid, status: 'connected', graphUserId: uid, tenantId: 'synthetic' }
  const context = { uid, profile, connectionId, connection, ref: db.doc(`mailboxConnections/${connectionId}`) }
  const mail = { id: uid, subject: `TA ${orderNumber}`, receivedDateTime: '2026-10-29T10:02:31.000Z', body: { contentType: 'text', content: `TA ${orderNumber}: Bereits an der Entladestelle angekommen.` } }
  try {
    await Promise.all([db.doc(`users/${uid}`).set(profile), context.ref.set(connection), db.doc(`transportOrders/${orderId}`).set({ externalNumber: orderNumber, imported: { loading: { city: 'Hamburg' }, unloading: { city: 'Berlin' } } })])
    const preview = await previewPersonalMailTracking({ db, context, mail, orderNumber, now: 1000, infer: async () => ({ isStatusUpdate: true, reviewRequired: false, updates: [{ field: 'actualArrivalUnloadingAt', value: mail.receivedDateTime, evidence: 'Bereits an der Entladestelle angekommen.', confidence: 'medium', timeBasis: 'mail_already_arrived', stationBasis: 'explicit', contextFields: [] }], transitUpdates: [], pauseUpdates: [] }) })
    const storedPreview = (await db.doc(`mailboxTrackingPreviews/${preview.previewId}`).get()).data()
    assert.equal((await db.doc(`transportOrderTrackings/${orderId}`).get()).exists, false)
    assert.equal(storedPreview.proposalDetails.actualArrivalUnloadingAt.requiresConfirmation, true)
    const input = { db, context, previewId: preview.previewId, changes: storedPreview.proposals, now: 2000 }
    const applied = await applyPersonalMailTracking(input)
    assert.equal(applied.ok, true)
    assert.equal((await applyPersonalMailTracking(input)).alreadyApplied, true)
    const trackingRef = db.doc(`transportOrderTrackings/${orderId}`)
    const before = (await trackingRef.get()).data()
    assert.equal(before.actualArrivalUnloadingAt.toDate().toISOString(), '2026-10-29T10:00:00.000Z')
    assert.equal(before.fieldSources.actualArrivalUnloadingAt.derivation.timingApproximate, true)
    const beforeEvents = (await trackingRef.collection('events').get()).docs.map(doc => doc.data())
    const event = beforeEvents.find(entry => entry.changedFields.includes('actualArrivalUnloadingAt'))
    assert.equal(event.eventTime.toDate().toISOString(), '2026-10-29T10:00:00.000Z')
    assert.equal(event.mailReceivedAt.toDate().toISOString(), mail.receivedDateTime)
    assert.ok(event.recordedAt.toMillis())
    await updateManualShipmentTrackingHandler({ auth: { uid }, data: { orderId, action: 'update', changes: { actualArrivalUnloadingAt: '2026-10-29T09:50:00.000Z' } } })
    const after = (await trackingRef.get()).data()
    assert.equal(after.fieldSources.actualArrivalUnloadingAt, undefined)
    const events = (await trackingRef.collection('events').get()).docs.map(doc => doc.data())
    const correction = events.find(entry => entry.oldDerivations)
    assert.equal(correction.oldValue.actualArrivalUnloadingAt.toDate().toISOString(), '2026-10-29T10:00:00.000Z')
    assert.equal(correction.newValue.actualArrivalUnloadingAt.toDate().toISOString(), '2026-10-29T09:50:00.000Z')
    assert.equal(correction.oldDerivations.actualArrivalUnloadingAt.timeBasis, 'mail_already_arrived')
    assert.equal(correction.source, 'manual')
    assert.equal(events.length, 3)
    await assert.rejects(updateManualShipmentTrackingHandler({ data: { orderId, action: 'update', changes: { actualArrivalUnloadingAt: null } } }), { code: 'unauthenticated' })
  } finally {
    await db.terminate(); await deleteApp(app)
  }
})


test('emulator: automatic status-mail ingestion retains a derived arrival for review without creating tracking or events', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-tracking-time-history'
  assert.ok(projectId.startsWith('demo-'))
  const app = initializeApp({ projectId }, `automatic-time-${randomUUID()}`), db = getFirestore(app)
  const orderId = `time-${randomUUID()}`, order = db.doc(`transportOrders/${orderId}`), tracking = db.doc(`transportOrderTrackings/${orderId}`), message = order.collection('receivedMails').doc('arrival')
  const { Timestamp } = await import('firebase-admin/firestore')
  try {
    await order.set({ imported: { loading: { city: 'Hamburg' }, unloading: { city: 'Berlin' } } })
    await message.set({ source: 'powerAutomate', mailbox: 'status@brennpunkt-logistik.de', transportOrderId: orderId, receivedAt: Timestamp.fromDate(new Date('2026-11-05T13:12:37.000Z')), bodyText: 'Gerade an der Entladestelle angekommen.', ai: { status: 'pending' } })
    const result = await processStatusMailAi({ db, orderId, mailId: 'arrival', infer: async () => ({ isStatusUpdate: true, reviewRequired: false, updates: [{ field: 'actualArrivalUnloadingAt', value: '', evidence: 'Gerade an der Entladestelle angekommen.', confidence: 'medium', timeBasis: 'mail_just_arrived', stationBasis: 'explicit', contextFields: [] }], transitUpdates: [], pauseUpdates: [] }) })
    assert.equal(result, 'needs_review')
    const stored = (await message.get()).data()
    assert.equal(stored.ai.reviewRequired, true)
    assert.equal(stored.ai.updates[0].requiresConfirmation, true)
    assert.equal(stored.ai.updates[0].value, '2026-11-05T13:10:00.000Z')
    assert.equal(stored.ai.updates[0].applied, false)
    assert.equal((await tracking.get()).exists, false)
    assert.equal((await tracking.collection('events').get()).empty, true)
  } finally { await db.terminate(); await deleteApp(app) }
})
