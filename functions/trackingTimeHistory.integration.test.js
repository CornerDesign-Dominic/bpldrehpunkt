import { refreshAutomaticShipmentTrackingForecast, shipmentTrackingForecastRefreshKind } from './shipmentTrackingForecast.js'
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


test('emulator: reply-grounded arrival and distance survive reload and retain only bounded provenance', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-tracking-reply-context'
  assert.ok(projectId.startsWith('demo-'))
  const app = initializeApp({ projectId }, `reply-time-${randomUUID()}`), db = getFirestore(app)
  const uid = `reply-${randomUUID()}`, orderId = uid, connectionId = uid, number = '899991235'
  const profile = { active: true, role: 'user', firstName: 'Synthetic', permissions: { transportOrders: 'edit', mailboxes: 'edit' } }
  const connection = { ownerId: uid, status: 'connected', graphUserId: uid, tenantId: 'synthetic' }
  const context = { uid, profile, connectionId, connection, ref: db.doc(`mailboxConnections/${connectionId}`) }
  const quoted = question => `\n\nFrom: Team <team@example.invalid>\nSent: Thursday, 5 November 2026 13:00\nTo: Driver <driver@example.invalid>\nSubject: TA ${number}\n\n${question}`
  try {
    await Promise.all([db.doc(`users/${uid}`).set(profile), context.ref.set(connection), db.doc(`transportOrders/${orderId}`).set({ externalNumber: number, imported: { loading: { city: 'Hamburg' }, unloading: { city: 'Berlin' } } })])
    const firstMail = { id: `${uid}-arrival`, subject: `TA ${number}`, receivedDateTime: '2026-11-05T13:12:37.000Z', body: { contentType: 'text', content: `Yes.${quoted('Is the vehicle at the loading place?')}` } }
    const emptyModel = async () => ({ isStatusUpdate: false, reviewRequired: false, updates: [], transitUpdates: [], pauseUpdates: [] })
    const preview = await previewPersonalMailTracking({ db, context, mail: firstMail, orderNumber: number, now: 1000, infer: emptyModel })
    assert.equal(preview.proposals.actualArrivalLoadingAt, '2026-11-05T13:10:00.000Z')
    const persisted = (await db.doc(`mailboxTrackingPreviews/${preview.previewId}`).get()).data()
    assert.equal(JSON.stringify(persisted).includes('Is the vehicle'), false)
    await applyPersonalMailTracking({ db, context, previewId: preview.previewId, changes: persisted.proposals, now: 2000 })
    const tracking = db.doc(`transportOrderTrackings/${orderId}`)
    const stored = (await tracking.get()).data()
    assert.equal(stored.stageId, 'loading')
    assert.equal(stored.fieldSources.actualArrivalLoadingAt.derivation.stationBasis, 'reply_context')
    assert.equal(stored.fieldSources.actualArrivalLoadingAt.derivation.questionKind, 'loading_arrival')
    const distanceMail = { ...firstMail, id: `${uid}-distance`, receivedDateTime: '2026-11-05T14:00:00.000Z', body: { contentType: 'text', content: `80${quoted('How many kilometers are left until the unloading point?')}` } }
    const distance = await previewPersonalMailTracking({ db, context, mail: distanceMail, orderNumber: number, now: 3000, infer: emptyModel })
    assert.equal(distance.transitProposals[0].kilometersToDestination, 80)
    await applyPersonalMailTracking({ db, context, previewId: distance.previewId, changes: {}, transitEntries: [{ ...distance.transitProposals[0], proposalIndex: 0 }], now: 4000 })
    const events = (await tracking.collection('events').get()).docs.map(doc => doc.data())
    const position = events.find(event => event.eventType === 'transit_position_reported')
    assert.equal(position.source, 'ai_mail')
    assert.equal(position.derivation.questionKind, 'unloading_distance')
    assert.equal(position.newValue.transitEntry.kilometersToDestination, 80)
    assert.equal(JSON.stringify(events).includes('How many kilometers'), false)
  } finally { await db.terminate(); await deleteApp(app) }
})


test('emulator: a unitless distance reply remains pending in automatic ingestion with no copied question in AI output', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-tracking-reply-context'
  assert.ok(projectId.startsWith('demo-'))
  const app = initializeApp({ projectId }, `reply-distance-${randomUUID()}`), db = getFirestore(app)
  const orderId = `distance-${randomUUID()}`, number = '899991236'
  const order = db.doc(`transportOrders/${orderId}`), message = order.collection('receivedMails').doc('remaining'), tracking = db.doc(`transportOrderTrackings/${orderId}`)
  const { Timestamp } = await import('firebase-admin/firestore')
  const question = 'How many kilometers are left until the unloading point?'
  try {
    await order.set({ externalNumber: number, imported: { loading: { city: 'Hamburg' }, unloading: { city: 'Berlin' } } })
    await message.set({ source: 'powerAutomate', mailbox: 'status@brennpunkt-logistik.de', transportOrderId: orderId, receivedAt: Timestamp.fromDate(new Date('2026-11-05T14:00:00Z')), bodyText: `80\n\nFrom: Team <team@example.invalid>\nSent: Thursday, 5 November 2026 13:00\nTo: Driver <driver@example.invalid>\nSubject: TA ${number}\n\n${question}`, ai: { status: 'pending' } })
    const result = await processStatusMailAi({ db, orderId, mailId: 'remaining', infer: async () => ({ isStatusUpdate: false, reviewRequired: false, updates: [], transitUpdates: [], pauseUpdates: [] }) })
    assert.equal(result, 'needs_review')
    const stored = (await message.get()).data().ai
    assert.equal(stored.transitUpdates[0].kilometersToDestination, 80)
    assert.equal(stored.transitUpdates[0].requiresConfirmation, true)
    assert.equal(stored.transitUpdates[0].applied, false)
    assert.equal(stored.transitUpdates[0].derivation.questionKind, 'unloading_distance')
    assert.equal(JSON.stringify(stored).includes(question), false)
    assert.equal((await tracking.get()).exists, false)
    assert.equal((await tracking.collection('events').get()).empty, true)
  } finally { await db.terminate(); await deleteApp(app) }
})


test('emulator: approximate loading clears a stored numeric forecast and same-clock exact correction removes approximation', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-tracking-precision-release'
  assert.ok(projectId.startsWith('demo-'))
  const app = initializeApp({ projectId }), db = getFirestore(app)
  const orderId = `precision-${randomUUID()}`, trackingRef = db.doc(`transportOrderTrackings/${orderId}`)
  try {
    await db.doc(`transportOrders/${orderId}`).set({ imported: { loading: { window: { from: '2026-11-05T12:00:00Z', until: '2026-11-05T14:00:00Z' } }, unloading: { window: { from: '2026-11-05T16:00:00Z', until: '2026-11-05T17:00:00Z' } } } })
    await db.doc(`transportOrderRoutes/${orderId}`).set({ roundedDistanceKm: 100 })
    await trackingRef.set({ lifecycleStatus: 'active', stageId: 'loading', actualArrivalLoadingAt: '2026-11-05T13:10:00Z', fieldSources: { actualArrivalLoadingAt: { derivation: { timingApproximate: true } } }, currentForecast: { kind: 'forecast', state: 'green', onTimeSharePercent: 100, oldNumericField: 42 } })
    await refreshAutomaticShipmentTrackingForecast(orderId)
    const before = (await trackingRef.get()).data()
    assert.equal(before.currentForecast.kind, 'none')
    assert.equal(before.currentForecast.state, 'unknown')
    assert.equal(before.currentForecast.onTimeSharePercent, undefined)
    assert.equal(before.currentForecast.oldNumericField, undefined)
    assert.equal(before.currentForecast.arrivalTimeApproximate, true)
    await trackingRef.update({ fieldSources: {} })
    const exact = (await trackingRef.get()).data()
    assert.equal(shipmentTrackingForecastRefreshKind(before, exact), 'forecast')
    await refreshAutomaticShipmentTrackingForecast(orderId)
    const after = (await trackingRef.get()).data()
    assert.equal(after.currentForecast.kind, 'forecast')
    assert.equal(after.currentForecast.arrivalTimeApproximate, undefined)
    assert.equal(after.currentForecast.oldNumericField, undefined)
    assert.equal(shipmentTrackingForecastRefreshKind(exact, after), null)
  } finally { await db.terminate(); await deleteApp(app) }
})
