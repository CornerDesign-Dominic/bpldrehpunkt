import test from 'node:test'
import assert from 'node:assert/strict'
import { Timestamp } from 'firebase-admin/firestore'
import { explicitRemainingDistance, planStatusMailAiChanges, processStatusMailAi, statusMailPromptContext, statusMailTrackingEventTime, validateStatusMailAiResult, validateStatusMailTransitUpdates, validateStatusMailPauseUpdates } from './statusMailAi.js'

const receivedAt = Timestamp.fromDate(new Date('2026-10-01T10:00:00Z'))
const mail = {
  source: 'powerAutomate', mailbox: 'status@brennpunkt-logistik.de', transportOrderId: 'order-1',
  subject: 'TA 260900123', bodyText: 'ETA Entladestelle heute 15:30 Uhr. Kennzeichen: HH-AB 123.', receivedAt,
}

test('converts an explicit remaining drive time using the route planning speed', () => {
  const current = { ...mail, bodyText: 'Der LKW hat noch 45 min zur Entladestelle.' }
  assert.deepEqual(validateStatusMailTransitUpdates({ transitUpdates: [{ kind: 'minutes_to_unloading', value: 45, evidence: 'noch 45 min zur Entladestelle', confidence: 'high' }] }, current, 290).map(({ kilometersToDestination }) => kilometersToDestination), [53])
  assert.deepEqual(validateStatusMailTransitUpdates({ transitUpdates: [{ kind: 'minutes_to_unloading', value: 45, evidence: 'nicht in der Mail', confidence: 'high' }] }, current, 290), [])
  assert.deepEqual(validateStatusMailTransitUpdates({ transitUpdates: [{ kind: 'minutes_to_unloading', value: 45, evidence: 'noch 45 min zur Entladestelle', confidence: 'high' }] }, current, 30), [])
  const located = { ...mail, bodyText: 'Der LKW ist bei Kassel und hat noch 45 min zur Entladestelle.' }
  assert.equal(validateStatusMailTransitUpdates({ transitUpdates: [{ kind: 'minutes_to_unloading', value: 45, location: 'Kassel', evidence: 'bei Kassel und hat noch 45 min zur Entladestelle', confidence: 'high' }] }, located, 290)[0].location, 'Kassel')
  assert.deepEqual(validateStatusMailTransitUpdates({ transitUpdates: [{ kind: 'minutes_to_unloading', value: 45, location: 'Hamburg', evidence: 'bei Kassel und hat noch 45 min zur Entladestelle', confidence: 'high' }] }, located, 290), [])
})

test('keeps a literal remaining-distance report when the model misses it', () => {
  const first = { ...mail, bodyText: 'Hallo,\nDer LKW hat noch 850km bis zu entladestelle, beladung hat 1,5h gedauert.\n\nMit freundlichen Grüßen\n850 km' }
  const second = { ...mail, bodyText: 'Hallo,\nDer LKW hat noch etwa 850km zur Entladestelle. Also voraussichtlich pünktlich.' }
  assert.equal(explicitRemainingDistance(first, 1400)[0]?.kilometersToDestination, 850)
  assert.equal(explicitRemainingDistance(second, 1400)[0]?.kilometersToDestination, 850)
  assert.deepEqual(explicitRemainingDistance({ ...mail, bodyText: 'Hallo,\nKein Status.\n\nVon: Spedition\nDer LKW hat noch 850km zur Entladestelle.' }, 1400), [])
  assert.deepEqual(explicitRemainingDistance(second, 400), [])
  assert.deepEqual(validateStatusMailTransitUpdates({ transitUpdates: [{ kind: 'kilometers_to_unloading', value: 850, location: '', evidence: 'noch 850km bis zu entladestelle', confidence: 'high' }] }, first, 1400).map((entry) => entry.kilometersToDestination), [850])
})

test('an explicit distance reaches tracking without turning loading duration into a status fact', async () => {
  const current = { ...mail, bodyText: 'Hallo,\nDer LKW hat noch 850km bis zu entladestelle, beladung hat 1,5h gedauert.' }
  const documents = new Map([
    ['transportOrders/order-1', { imported: {} }],
    ['transportOrders/order-1/receivedMails/mail-distance', current],
    ['transportOrderRoutes/order-1', { roundedDistanceKm: 1400 }],
  ])
  const ref = (path) => ({ path, collection(name) { return { doc(id) { return ref(`${path}/${name}/${id}`) } } }, get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }) })
  const db = { doc: ref, runTransaction: async (callback) => callback({
    get: async (reference) => ({ exists: documents.has(reference.path), data: () => documents.get(reference.path) }),
    create: (reference, data) => { assert.equal(documents.has(reference.path), false); documents.set(reference.path, data) },
    update: (reference, data) => documents.set(reference.path, { ...documents.get(reference.path), ...data }),
  }) }
  const infer = async () => ({ isStatusUpdate: true, reviewRequired: false, reviewReason: '', updates: [], transitUpdates: [], pauseUpdates: [] })
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'mail-distance', infer }), 'applied')
  assert.equal(documents.get('transportOrderTrackings/order-1/events/ai-position-mail-distance').newValue.transitEntry.kilometersToDestination, 850)
  assert.equal(documents.has('transportOrderTrackings/order-1/events/ai-loading-duration-mail-distance'), false)
  assert.equal(documents.get('transportOrders/order-1/receivedMails/mail-distance').ai.reviewRequired, false)
})

test('requires a grounded pause start and duration', () => {
  const pauseMail = { ...mail, bodyText: 'Pause begann heute 11:00 Uhr für 45 Minuten.' }
  const accepted = validateStatusMailPauseUpdates({ pauseUpdates: [{ startAt: '2026-10-01T11:00:00+02:00', durationMinutes: 45, evidence: 'Pause begann heute 11:00 Uhr für 45 Minuten', confidence: 'high' }] }, pauseMail)
  assert.equal(accepted[0].at.toDate().toISOString(), '2026-10-01T09:00:00.000Z')
  assert.equal(accepted[0].durationMinutes, 45)
  assert.deepEqual(validateStatusMailPauseUpdates({ pauseUpdates: [{ startAt: '2026-10-01T11:00:00+02:00', durationMinutes: 60, evidence: 'Pause begann heute 11:00 Uhr für 45 Minuten', confidence: 'high' }] }, pauseMail), [])
})

test('the prompt context contains route, prior request and tracking while keeping current mail separate', () => {
  const context = statusMailPromptContext({ mail, order: { imported: { unloading: { city: 'Berlin' } } }, tracking: { stageId: 'in_transit', estimatedArrivalUnloadingAt: receivedAt }, route: { roundedDistanceKm: 290 }, history: [{ receivedAt: Timestamp.fromDate(new Date('2026-10-01T09:00:00Z')), subject: 'TA 260900123', bodyText: 'Vorherige Mail' }], sentRequests: [{ status: 'sent', sentAt: Timestamp.fromDate(new Date('2026-10-01T08:00:00Z')), templateId: 'shipment_tracking_unloading_eta_request', message: 'Wie weit bis zur Entladestelle?' }] })
  assert.equal(context.routeDistanceKm, 290)
  assert.equal(context.tracking.stage, 'in_transit')
  assert.equal(context.precedingMails.length, 1)
  assert.equal(context.sentRequests[0].templateId, 'shipment_tracking_unloading_eta_request')
})

test('accepts only high-confidence updates backed by literal mail evidence', () => {
  const result = validateStatusMailAiResult({ isStatusUpdate: true, updates: [
    { field: 'estimatedArrivalUnloadingAt', value: '2026-10-01T15:30:00+02:00', evidence: 'ETA Entladestelle heute 15:30 Uhr', confidence: 'high' },
    { field: 'licensePlate', value: 'HH-AB 123', evidence: 'Kennzeichen: HH-AB 123', confidence: 'high' },
    { field: 'actualArrivalUnloadingAt', value: '2026-10-01T15:30:00+02:00', evidence: 'nicht im Text', confidence: 'high' },
    { field: 'actualDepartureLoadingAt', value: '2026-10-01T15:30:00+02:00', evidence: 'ETA Entladestelle heute 15:30 Uhr', confidence: 'medium' },
  ] }, mail)
  assert.deepEqual(result.map(({ field, value }) => ({ field, value })), [
    { field: 'estimatedArrivalUnloadingAt', value: '2026-10-01T13:30:00.000Z' },
    { field: 'licensePlate', value: 'HH-AB 123' },
  ])
})

test('accepts a clearly paired tractor and trailer license plate from one mail excerpt', () => {
  const plateMail = { ...mail, bodyText: 'Kennzeichen: WGM5763J / WGM8765K\nETA: 15:00 Uhr' }
  const result = validateStatusMailAiResult({ isStatusUpdate: true, updates: [
    { field: 'tractorLicensePlate', value: 'WGM5763J', evidence: 'Kennzeichen: WGM5763J / WGM8765K', confidence: 'high' },
    { field: 'trailerLicensePlate', value: 'WGM8765K', evidence: 'Kennzeichen: WGM5763J / WGM8765K', confidence: 'high' },
  ] }, plateMail)
  assert.deepEqual(result.map(({ field, value }) => ({ field, value })), [
    { field: 'tractorLicensePlate', value: 'WGM5763J' },
    { field: 'trailerLicensePlate', value: 'WGM8765K' },
  ])
})

test('rejects future actual events and time values without a time in evidence', () => {
  const updates = validateStatusMailAiResult({ isStatusUpdate: true, updates: [
    { field: 'actualArrivalUnloadingAt', value: '2026-10-02T15:30:00+02:00', evidence: 'ETA Entladestelle heute 15:30 Uhr', confidence: 'high' },
    { field: 'estimatedArrivalLoadingAt', value: '2026-10-01T15:30:00+02:00', evidence: 'Kennzeichen: HH-AB 123', confidence: 'high' },
  ] }, mail)
  assert.deepEqual(updates, [])
})

test('accepts whole-hour ETA and actual arrival on the uniquely planned loading day', () => {
  const statusMail = {
    ...mail,
    bodyText: 'ETA war am 30.09 um 12 uhr. Tatsächlich angekommen um 14 Uhr',
    receivedAt: Timestamp.fromDate(new Date('2026-09-30T22:32:59Z')),
  }
  const result = validateStatusMailAiResult({ isStatusUpdate: true, updates: [
    { field: 'estimatedArrivalLoadingAt', value: '2026-09-30T12:00:00+02:00', evidence: 'ETA war am 30.09 um 12 uhr', confidence: 'high' },
    { field: 'actualArrivalLoadingAt', value: '2026-09-30T14:00:00+02:00', evidence: 'ETA war am 30.09 um 12 uhr. Tatsächlich angekommen um 14 Uhr', confidence: 'high' },
  ] }, statusMail)
  assert.deepEqual(result.map(({ field, value }) => ({ field, value })), [
    { field: 'estimatedArrivalLoadingAt', value: '2026-09-30T10:00:00.000Z' },
    { field: 'actualArrivalLoadingAt', value: '2026-09-30T12:00:00.000Z' },
  ])
})

test('history uses actual arrival time instead of mail receipt time', () => {
  const changes = {
    estimatedArrivalLoadingAt: Timestamp.fromDate(new Date('2026-09-30T10:00:00Z')),
    actualArrivalLoadingAt: Timestamp.fromDate(new Date('2026-09-30T12:00:00Z')),
  }
  assert.equal(statusMailTrackingEventTime([
    { field: 'estimatedArrivalLoadingAt' }, { field: 'actualArrivalLoadingAt' },
  ], changes, receivedAt).toDate().toISOString(), '2026-09-30T12:00:00.000Z')
  assert.equal(statusMailTrackingEventTime([{ field: 'estimatedArrivalLoadingAt' }], changes, receivedAt), receivedAt)
})

test('manual values take priority and newer AI mail can replace older AI ETA', () => {
  const updates = [
    { field: 'licensePlate', value: 'HH-AB 123' },
    { field: 'estimatedArrivalUnloadingAt', value: '2026-10-01T13:30:00.000Z' },
  ]
  const tracking = {
    licensePlate: 'HH-CD 456', estimatedArrivalUnloadingAt: Timestamp.fromDate(new Date('2026-10-01T14:00:00Z')),
    fieldSources: { estimatedArrivalUnloadingAt: { source: 'ai_mail', receivedAt: Timestamp.fromDate(new Date('2026-10-01T09:00:00Z')) } },
  }
  const planned = planStatusMailAiChanges(tracking, updates, receivedAt)
  assert.deepEqual(planned.applied.map(({ field }) => field), ['estimatedArrivalUnloadingAt'])
  assert.equal(planned.changes.estimatedArrivalUnloadingAt.toDate().toISOString(), '2026-10-01T13:30:00.000Z')
  assert.deepEqual(planStatusMailAiChanges(tracking, updates, Timestamp.fromDate(new Date('2026-10-01T08:00:00Z'))).applied, [])
})

test('applies an assigned status mail once and records its AI source', async () => {
  const stored = new Map([
    ['transportOrders/order-1', { imported: { loading: { window: { from: '2026-10-01T08:00' } }, unloading: { window: { until: '2026-10-01T18:00' } } } }],
    ['transportOrders/order-1/receivedMails/mail-1', mail],
  ])
  const ref = (path) => ({ path, collection(name) { return { doc(id) { return ref(`${path}/${name}/${id}`) } } }, get: async () => ({ exists: stored.has(path), data: () => stored.get(path) }) })
  const db = {
    doc: ref,
    runTransaction: async (callback) => callback({
      get: async (reference) => ({ exists: stored.has(reference.path), data: () => stored.get(reference.path) }),
      create: (reference, data) => { assert.equal(stored.has(reference.path), false); stored.set(reference.path, data) },
      update: (reference, data) => stored.set(reference.path, { ...stored.get(reference.path), ...data }),
    }),
  }
  let calls = 0
  const infer = async () => { calls += 1; return { isStatusUpdate: true, updates: [{ field: 'estimatedArrivalUnloadingAt', value: '2026-10-01T15:30:00+02:00', evidence: 'ETA Entladestelle heute 15:30 Uhr', confidence: 'high' }] } }
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'mail-1', infer }), 'applied')
  const tracking = stored.get('transportOrderTrackings/order-1')
  assert.equal(tracking.estimatedArrivalUnloadingAt.toDate().toISOString(), '2026-10-01T13:30:00.000Z')
  assert.equal(tracking.fieldSources.estimatedArrivalUnloadingAt.source, 'ai_mail')
  assert.equal(stored.get('transportOrders/order-1/receivedMails/mail-1').ai.status, 'applied')
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'mail-1', infer }), 'applied')
  assert.equal(calls, 1)
})

test('an existing no-change mail can be retried while an applied mail stays idempotent', async () => {
  const documents = new Map([
    ['transportOrders/order-1', { imported: {} }],
    ['transportOrders/order-1/receivedMails/mail-2', { ...mail, ai: { status: 'no_change', updates: [] } }],
  ])
  const ref = (path) => ({ path, collection(name) { return { doc(id) { return ref(`${path}/${name}/${id}`) } } }, get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }) })
  const db = {
    doc: ref,
    runTransaction: async (callback) => callback({
      get: async (reference) => ({ exists: documents.has(reference.path), data: () => documents.get(reference.path) }),
      create: (reference, data) => documents.set(reference.path, data),
      update: (reference, data) => documents.set(reference.path, { ...documents.get(reference.path), ...data }),
    }),
  }
  let calls = 0
  const infer = async () => { calls += 1; return { isStatusUpdate: true, updates: [{ field: 'licensePlate', value: 'HH-AB 123', evidence: 'Kennzeichen: HH-AB 123', confidence: 'high' }] } }
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'mail-2', infer }), 'no_change')
  assert.equal(calls, 0)
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'mail-2', infer, retry: true }), 'applied')
  assert.equal(calls, 1)
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'mail-2', infer, retry: true }), 'applied')
  assert.equal(calls, 1)
})

test('a clear 45-minute reply creates a dated AI transit report', async () => {
  const transitMail = { ...mail, bodyText: 'Der LKW hat noch 45 min zur Entladestelle.' }
  const documents = new Map([
    ['transportOrders/order-1', { imported: { loading: { window: { from: '2026-10-01T08:00' } }, unloading: { window: { until: '2026-10-01T18:00' } } } }],
    ['transportOrders/order-1/receivedMails/mail-3', transitMail],
    ['transportOrderRoutes/order-1', { roundedDistanceKm: 290 }],
  ])
  const ref = (path) => ({ path, collection(name) { return { doc(id) { return ref(`${path}/${name}/${id}`) } } }, get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }) })
  const db = { doc: ref, runTransaction: async (callback) => callback({
    get: async (reference) => ({ exists: documents.has(reference.path), data: () => documents.get(reference.path) }),
    create: (reference, data) => { assert.equal(documents.has(reference.path), false); documents.set(reference.path, data) },
    update: (reference, data) => documents.set(reference.path, { ...documents.get(reference.path), ...data }),
  }) }
  const infer = async () => ({ isStatusUpdate: true, reviewRequired: false, reviewReason: '', updates: [], transitUpdates: [{ kind: 'minutes_to_unloading', value: 45, evidence: 'noch 45 min zur Entladestelle', confidence: 'high' }] })
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'mail-3', infer }), 'applied')
  const event = documents.get('transportOrderTrackings/order-1/events/ai-position-mail-3')
  assert.equal(event.newValue.transitEntry.kilometersToDestination, 53)
  assert.equal(event.eventTime.toDate().toISOString(), receivedAt.toDate().toISOString())
  assert.equal(event.source, 'ai_mail')
  assert.equal(documents.get('transportOrderTrackings/order-1').stageId, 'in_transit')
  assert.equal(documents.get('transportOrderTrackings/order-1').lifecyclePhase, 'in_progress')
  assert.equal(documents.get('transportOrders/order-1/receivedMails/mail-3').ai.reviewRequired, false)
  documents.set('transportOrders/order-1/receivedMails/mail-5', { ...mail, bodyText: 'ETA Entladestelle heute 17:00 Uhr.', receivedAt: Timestamp.fromDate(new Date('2026-10-01T11:00:00Z')) })
  const inferEta = async () => ({ isStatusUpdate: true, reviewRequired: false, reviewReason: '', updates: [{ field: 'estimatedArrivalUnloadingAt', value: '2026-10-01T17:00:00+02:00', evidence: 'ETA Entladestelle heute 17:00 Uhr', confidence: 'high' }], transitUpdates: [], pauseUpdates: [] })
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'mail-5', infer: inferEta }), 'applied')
  assert.equal(documents.get('transportOrderTrackings/order-1').stageId, 'in_transit')
})

test('ambiguous tracking information is marked for manual review', async () => {
  const documents = new Map([
    ['transportOrders/order-1', { imported: {} }],
    ['transportOrders/order-1/receivedMails/mail-4', { ...mail, bodyText: 'Wir kommen heute später.' }],
  ])
  const ref = (path) => ({ path, collection(name) { return { doc(id) { return ref(`${path}/${name}/${id}`) } } }, get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }), update: async (data) => documents.set(path, { ...documents.get(path), ...data }) })
  const db = { doc: ref, runTransaction: async (callback) => callback({
    get: async (reference) => ({ exists: documents.has(reference.path), data: () => documents.get(reference.path) }),
    update: (reference, data) => documents.set(reference.path, { ...documents.get(reference.path), ...data }),
  }) }
  const infer = async () => ({ isStatusUpdate: true, reviewRequired: true, reviewReason: 'Unklar, welche Station gemeint ist.', updates: [], transitUpdates: [] })
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'mail-4', infer }), 'needs_review')
  assert.equal(documents.get('transportOrders/order-1/receivedMails/mail-4').ai.reviewRequired, true)
  assert.equal(documents.has('transportOrderTrackings/order-1'), false)
})
