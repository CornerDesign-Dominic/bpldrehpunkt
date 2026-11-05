import test from 'node:test'
import assert from 'node:assert/strict'
import { Timestamp } from 'firebase-admin/firestore'
import { explicitRemainingDistance, planStatusMailAiChanges, processStatusMailAi, statusMailPromptContext, statusMailTrackingEventTime, validateStatusMailAiResult, validateStatusMailTransitUpdates, validateStatusMailPauseUpdates } from './statusMailAi.js'

const receivedAt = Timestamp.fromDate(new Date('2026-10-01T10:00:00Z'))
const mail = {
  source: 'powerAutomate', mailbox: 'status@brennpunkt-logistik.de', transportOrderId: 'order-1',
  subject: 'TA 260900123', bodyText: 'ETA Entladestelle heute 15:30 Uhr. Kennzeichen: HH-AB 123.', receivedAt,
}

test('closed tracking skips inference and context reads, persisting the reason transactionally', async () => {
  const documents = new Map([
    ['transportOrders/order-1', { imported: {} }],
    ['transportOrderTrackings/order-1', { lifecycleStatus: 'completed' }],
    ['transportOrders/order-1/receivedMails/closed-mail', mail],
  ])
  const reads = []
  const snapshot = (path) => ({ exists: documents.has(path), data: () => documents.get(path) })
  const ref = (path) => ({ path, get: async () => { reads.push(path); return snapshot(path) }, collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }) })
  const db = { doc: ref, runTransaction: async (operation) => operation({ get: async (reference) => snapshot(reference.path), update: (reference, data) => documents.set(reference.path, { ...documents.get(reference.path), ...data }) }) }
  const infer = () => { throw new Error('Inference must not run for closed tracking') }
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'closed-mail', infer }), 'skipped')
  assert.equal(documents.get('transportOrders/order-1/receivedMails/closed-mail').ai.reason, 'tracking_completed')
  assert(!reads.some((path) => path.startsWith('transportOrderRoutes/')))
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'closed-mail', infer }), 'skipped')
})

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


test('relative arrival is computed on the server and requires explicit user confirmation', () => {
  const current = { ...mail, bodyText: 'Gerade an der Entladestelle angekommen.', receivedAt: Timestamp.fromDate(new Date('2026-11-05T13:12:49Z')) }
  const result = validateStatusMailAiResult({ isStatusUpdate: true, updates: [{ field: 'actualArrivalUnloadingAt', value: 'model value is ignored', evidence: current.bodyText, confidence: 'medium', timeBasis: 'mail_just_arrived', stationBasis: 'explicit', contextFields: [] }] }, current)
  assert.equal(result[0].value, '2026-11-05T13:10:00.000Z')
  assert.equal(result[0].requiresConfirmation, true)
  assert.equal(result[0].derivation.timingApproximate, true)
  assert.deepEqual(planStatusMailAiChanges({}, result, current.receivedAt), { changes: {}, applied: [] })
})

test('an explicitly timed arrival keeps its exact time while inferred station remains reviewable', () => {
  const current = { ...mail, bodyText: 'Angekommen heute um 11:35 Uhr.' }
  const tracking = { actualDepartureLoadingAt: Timestamp.fromDate(new Date('2026-10-01T07:00:00Z')) }
  const result = validateStatusMailAiResult({ isStatusUpdate: true, updates: [{ field: 'actualArrivalUnloadingAt', value: '2026-10-01T11:35:00+02:00', evidence: current.bodyText, confidence: 'medium', timeBasis: 'explicit', stationBasis: 'tracking_context', contextFields: ['actualDepartureLoadingAt'] }] }, current, { tracking })
  assert.equal(result[0].value, '2026-10-01T09:35:00.000Z')
  assert.equal(result[0].derivation.timingApproximate, false)
  assert.equal(result[0].requiresConfirmation, true)
})

test('automatic status ingest stores a derived proposal without changing tracking or its history', async () => {
  const current = { ...mail, bodyText: 'Ist bereits an der Entladestelle angekommen.' }
  const documents = new Map([
    ['transportOrders/order-1', { imported: {} }],
    ['transportOrders/order-1/receivedMails/derived-arrival', current],
  ])
  const ref = path => ({ path, collection(name) { return { doc(id) { return ref(`${path}/${name}/${id}`) } } }, get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }) })
  const db = { doc: ref, runTransaction: async callback => callback({
    get: async reference => ({ exists: documents.has(reference.path), data: () => documents.get(reference.path) }),
    create: (reference, data) => documents.set(reference.path, data),
    update: (reference, data) => documents.set(reference.path, { ...documents.get(reference.path), ...data }),
  }) }
  const infer = async () => ({ isStatusUpdate: true, reviewRequired: false, reviewReason: '', updates: [{ field: 'actualArrivalUnloadingAt', value: '', evidence: current.bodyText, confidence: 'medium', timeBasis: 'mail_already_arrived', stationBasis: 'explicit', contextFields: [] }], transitUpdates: [], pauseUpdates: [] })
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'derived-arrival', infer }), 'needs_review')
  const result = documents.get('transportOrders/order-1/receivedMails/derived-arrival').ai
  assert.equal(result.reviewRequired, true)
  assert.equal(result.updates[0].requiresConfirmation, true)
  assert.equal(result.updates[0].applied, false)
  assert.equal(documents.has('transportOrderTrackings/order-1'), false)
})


test('an exact clock in an old quoted reply cannot become a new status fact', () => {
  const current = { ...mail, bodyText: 'Danke für die Information.\nFrom: Dispatch\nAnkunft Entladestelle heute 11:35 Uhr.' }
  assert.deepEqual(validateStatusMailAiResult({ isStatusUpdate: true, updates: [{ field: 'actualArrivalUnloadingAt', value: '2026-10-01T11:35:00+02:00', evidence: 'Ankunft Entladestelle heute 11:35 Uhr', confidence: 'high' }] }, current), [])
})


test('a later exact arrival preserves the previous surrogate derivation in history and clears it on the current value', async () => {
  const oldDerivation = { timeBasis: 'mail_already_arrived', stationBasis: 'explicit', basedOnFields: [], mailReceivedAt: '2026-10-01T09:02:00.000Z', timingApproximate: true, ruleVersion: 1 }
  const documents = new Map([
    ['transportOrders/order-1', { imported: {} }],
    ['transportOrders/order-1/receivedMails/precise-arrival', { ...mail, bodyText: 'Ankunft Entladestelle heute 11:35 Uhr.' }],
    ['transportOrderTrackings/order-1', { lifecycleStatus: 'active', stageId: 'unloading', actualArrivalUnloadingAt: Timestamp.fromDate(new Date('2026-10-01T09:00:00Z')), fieldSources: { actualArrivalUnloadingAt: { source: 'ai_mail', receivedAt: Timestamp.fromDate(new Date('2026-10-01T09:02:00Z')), confirmedBy: 'reviewer', derivation: oldDerivation } } }],
  ])
  const ref = path => ({ path, collection(name) { return { doc(id) { return ref(`${path}/${name}/${id}`) } } }, get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }) })
  const db = { doc: ref, runTransaction: async callback => callback({
    get: async reference => ({ exists: documents.has(reference.path), data: () => documents.get(reference.path) }),
    create: (reference, data) => documents.set(reference.path, data),
    update: (reference, data) => documents.set(reference.path, { ...documents.get(reference.path), ...data }),
  }) }
  const infer = async () => ({ isStatusUpdate: true, reviewRequired: false, reviewReason: '', updates: [{ field: 'actualArrivalUnloadingAt', value: '2026-10-01T11:35:00+02:00', evidence: 'Ankunft Entladestelle heute 11:35 Uhr', confidence: 'high' }], transitUpdates: [], pauseUpdates: [] })
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'precise-arrival', infer }), 'applied')
  const event = documents.get('transportOrderTrackings/order-1/events/ai-precise-arrival')
  assert.deepEqual(event.oldDerivations.actualArrivalUnloadingAt, oldDerivation)
  assert.equal(event.mailReceivedAt, receivedAt)
  assert.equal(documents.get('transportOrderTrackings/order-1').fieldSources.actualArrivalUnloadingAt.derivation, undefined)
})


function replyMail(answer, question) {
  return { ...mail, bodyText: answer, transportOrderNumber: '123456789', receivedAt: Timestamp.fromDate(new Date('2026-11-05T13:12:37Z')), quotedContext: `From: Dispatch <dispatch@example.invalid>\nSent: Thu, 5 Nov 2026 13:00:00 +0100\nTo: Carrier <carrier@example.invalid>\nSubject: TA 123456789\n\n${question}` }
}
const loadingArrivalQuestion = 'Ist das Fahrzeug an der Ladestelle?\n\nIs the vehicle at the loading place?'

test('a literal Yes to one quoted arrival question survives a missed model classification and outranks the transport phase', () => {
  const current = replyMail('Ja.', loadingArrivalQuestion)
  const accepted = validateStatusMailAiResult({ isStatusUpdate: false, updates: [] }, current, { tracking: { stageId: 'unloading', actualDepartureLoadingAt: Timestamp.fromDate(new Date('2026-11-05T10:00:00Z')) } })
  assert.deepEqual(accepted.map(item => item.field), ['actualArrivalLoadingAt'])
  assert.equal(accepted[0].value, '2026-11-05T13:10:00.000Z')
  assert.equal(accepted[0].derivation.stationBasis, 'reply_context')
  assert.equal(accepted[0].derivation.questionKind, 'loading_arrival')
  assert.equal(accepted[0].requiresConfirmation, true)
  assert.deepEqual(planStatusMailAiChanges({}, accepted, current.receivedAt), { changes: {}, applied: [] })
  assert.equal(JSON.stringify(accepted).includes('Ist das Fahrzeug'), false)
})

test('a compound Yes never confirms arrival, and an explicit clock is not replaced by rounded mail time', () => {
  const compound = replyMail('Ja.', 'Läuft alles nach Plan? Habt Ihr bereits eine Ankunftszeit für uns?\nLadestelle / Loading site: Hamburg')
  assert.deepEqual(validateStatusMailAiResult({ isStatusUpdate: true, updates: [] }, compound), [])
  const exact = replyMail('Ja, um 13:30 Uhr.', loadingArrivalQuestion)
  assert.deepEqual(validateStatusMailAiResult({ isStatusUpdate: true, updates: [] }, exact), [])
})

test('current arrival statement follows its answered loading question instead of a conflicting unloading guess', () => {
  const current = replyMail('LKW ist da.', loadingArrivalQuestion)
  const accepted = validateStatusMailAiResult({ isStatusUpdate: true, updates: [{ field: 'actualArrivalUnloadingAt', value: '', evidence: current.bodyText, confidence: 'medium', timeBasis: 'mail_already_arrived', stationBasis: 'tracking_context', contextFields: ['actualDepartureLoadingAt'] }] }, current, { tracking: { actualDepartureLoadingAt: Timestamp.fromDate(new Date('2026-11-05T10:00:00Z')) } })
  assert.deepEqual(accepted.map(item => item.field), ['actualArrivalLoadingAt'])
  const named = replyMail('Bereits an der Entladestelle angekommen.', loadingArrivalQuestion)
  const explicit = validateStatusMailAiResult({ isStatusUpdate: true, updates: [{ field: 'actualArrivalUnloadingAt', value: '', evidence: named.bodyText, confidence: 'medium', timeBasis: 'mail_already_arrived', stationBasis: 'reply_context', contextFields: [] }] }, named)
  assert.equal(explicit[0].field, 'actualArrivalUnloadingAt')
  assert.equal(explicit[0].derivation.stationBasis, 'explicit')
})

test('a clock-only ETA reply keeps its literal time and exposes original question only transiently in prompt context', () => {
  const current = replyMail('15:00 Uhr.', 'Wann kommt Ihr etwa an der Ladestelle an?')
  const accepted = validateStatusMailAiResult({ isStatusUpdate: true, updates: [{ field: 'estimatedArrivalLoadingAt', value: '2026-11-05T15:00:00+01:00', evidence: current.bodyText, confidence: 'high', timeBasis: 'explicit', stationBasis: 'explicit', contextFields: [] }] }, current)
  assert.equal(accepted[0].value, '2026-11-05T14:00:00.000Z')
  assert.equal(accepted[0].derivation.stationBasis, 'reply_context')
  assert.equal(accepted[0].derivation.timingApproximate, false)
  assert.equal(accepted[0].requiresConfirmation, true)
  const context = statusMailPromptContext({ mail: current, order: {}, tracking: {}, route: null })
  assert.match(context.replyContext.questionText, /Wann kommt/)
  assert.equal(JSON.stringify(accepted).includes('Wann kommt'), false)
})

test('unitless remaining distance uses only a unique quoted kilometer question and remains reviewable', () => {
  const current = replyMail('80', 'Wie viel Kilometer sind noch bis zur Entladestelle?\nHow many kilometers are left until the unloading point?')
  const accepted = validateStatusMailTransitUpdates({ transitUpdates: [] }, current, 300)
  assert.equal(accepted[0].kilometersToDestination, 80)
  assert.equal(accepted[0].requiresConfirmation, true)
  assert.equal(accepted[0].derivation.questionKind, 'unloading_distance')
  assert.deepEqual(validateStatusMailTransitUpdates({ transitUpdates: [] }, { ...current, quotedContext: '' }, 300), [])
  assert.deepEqual(validateStatusMailTransitUpdates({ transitUpdates: [{ kind: 'kilometers_to_unloading', value: 80, evidence: '80', confidence: 'medium' }] }, { ...current, bodyText: 'Danke.' }, 300), [])
})

test('automatic ingestion saves inferred distance for review and creates neither tracking nor a position event', async () => {
  const current = replyMail('80', 'Wie viel Kilometer sind noch bis zur Entladestelle?')
  const documents = new Map([
    ['transportOrders/order-1', { externalNumber: '123456789', imported: {} }],
    ['transportOrders/order-1/receivedMails/reply-distance', current],
    ['transportOrderRoutes/order-1', { roundedDistanceKm: 300 }],
  ])
  const ref = path => ({ path, collection(name) { return { doc(id) { return ref(`${path}/${name}/${id}`) } } }, get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }) })
  const db = { doc: ref, runTransaction: async callback => callback({
    get: async reference => ({ exists: documents.has(reference.path), data: () => documents.get(reference.path) }),
    create: (reference, data) => documents.set(reference.path, data),
    update: (reference, data) => documents.set(reference.path, { ...documents.get(reference.path), ...data }),
  }) }
  const infer = async () => ({ isStatusUpdate: false, reviewRequired: false, reviewReason: '', updates: [], transitUpdates: [], pauseUpdates: [] })
  assert.equal(await processStatusMailAi({ db, orderId: 'order-1', mailId: 'reply-distance', infer }), 'needs_review')
  const stored = documents.get('transportOrders/order-1/receivedMails/reply-distance').ai
  assert.equal(stored.reviewRequired, true)
  assert.equal(stored.transitUpdates[0].kilometersToDestination, 80)
  assert.equal(stored.transitUpdates[0].applied, false)
  assert.equal(documents.has('transportOrderTrackings/order-1'), false)
})


test('an old reply subject clock is not evidence of a new arrival time', () => {
  const current = { ...replyMail('Ja.', loadingArrivalQuestion), subject: 'RE: Ankunft Ladestelle heute 14:00 Uhr.' }
  const accepted = validateStatusMailAiResult({ isStatusUpdate: true, updates: [{ field: 'actualArrivalLoadingAt', value: '2026-11-05T14:00:00+01:00', evidence: 'Ankunft Ladestelle heute 14:00 Uhr.', confidence: 'high', timeBasis: 'explicit', stationBasis: 'explicit', contextFields: [] }] }, current)
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].value, '2026-11-05T13:10:00.000Z')
  assert.equal(accepted[0].derivation.timeBasis, 'mail_already_arrived')
})

test('an actual arrival is not erased by a negative statement about later departure', () => {
  const current = replyMail('Ja, LKW ist da, aber noch nicht abgefahren.', loadingArrivalQuestion)
  const accepted = validateStatusMailAiResult({ isStatusUpdate: false, updates: [] }, current)
  assert.equal(accepted[0].field, 'actualArrivalLoadingAt')
  assert.equal(accepted[0].derivation.timeBasis, 'mail_already_arrived')
})


test('explicit units do not turn a loading reply into an unloading distance, and a question-derived destination remains reviewable', () => {
  const item = { kind: 'kilometers_to_unloading', value: 80, evidence: '80 km', confidence: 'high' }
  assert.deepEqual(validateStatusMailTransitUpdates({ transitUpdates: [item] }, replyMail('80 km', 'Wann kommt Ihr etwa an der Ladestelle an?'), 300), [])
  const accepted = validateStatusMailTransitUpdates({ transitUpdates: [item] }, replyMail('80 km', 'Wie viele Kilometer sind noch bis zur Entladestelle?'), 300)
  assert.equal(accepted[0].requiresConfirmation, true)
  assert.equal(accepted[0].derivation.stationBasis, 'reply_context')
  const explicit = replyMail('Noch 80 km zur Entladestelle.', 'Wann kommt Ihr etwa an der Ladestelle an?')
  assert.equal(validateStatusMailTransitUpdates({ transitUpdates: [{ ...item, evidence: explicit.bodyText }] }, explicit, 300)[0].kilometersToDestination, 80)
})


test('the model cannot bypass the answered stop or ETA meaning by calling a clock-only reply explicit', () => {
  const current = replyMail('15:00 Uhr.', 'Wann kommt Ihr etwa an der Ladestelle an?')
  const candidate = { value: '2026-11-05T15:00:00+01:00', evidence: current.bodyText, confidence: 'high', timeBasis: 'explicit', stationBasis: 'explicit', contextFields: [] }
  assert.deepEqual(validateStatusMailAiResult({ isStatusUpdate: true, updates: [{ ...candidate, field: 'estimatedArrivalUnloadingAt' }] }, current), [])
  assert.deepEqual(validateStatusMailAiResult({ isStatusUpdate: true, updates: [{ ...candidate, field: 'actualArrivalLoadingAt' }] }, current), [])
})


test('a negative arrival answer with a clock cannot bypass reply routing as a high-confidence explicit actual time', () => {
  for (const answer of ['Nein, um 14 Uhr.', 'No, at 14:00.', 'Nein, an der Ladestelle um 14 Uhr.']) {
    const current = replyMail(answer, loadingArrivalQuestion)
    const accepted = validateStatusMailAiResult({ isStatusUpdate: true, updates: [{ field: 'actualArrivalLoadingAt', value: '2026-11-05T14:00:00+01:00', evidence: answer, confidence: 'high', timeBasis: 'explicit', stationBasis: 'explicit', contextFields: [] }] }, current)
    assert.deepEqual(accepted, [], answer)
  }
})


test('a negative arrival confirmation with an explicit clock may propose ETA, not actual arrival', () => {
  const current = replyMail('Noch nicht, um 15 Uhr.', loadingArrivalQuestion)
  const accepted = validateStatusMailAiResult({ isStatusUpdate: true, updates: [{ field: 'estimatedArrivalLoadingAt', value: '2026-11-05T15:00:00+01:00', evidence: current.bodyText, confidence: 'medium', timeBasis: 'explicit', stationBasis: 'reply_context', contextFields: [] }] }, current)
  assert.equal(accepted[0].field, 'estimatedArrivalLoadingAt')
  assert.equal(accepted[0].requiresConfirmation, true)
  assert.equal(accepted[0].value, '2026-11-05T14:00:00.000Z')
})


test('a rejected model distance cannot erase a literal numeric reply to the kilometer question', () => {
  const current = replyMail('80', 'Wie viele Kilometer sind noch bis zur Entladestelle?')
  const accepted = validateStatusMailTransitUpdates({ transitUpdates: [{ kind: 'kilometers_to_unloading', value: 800, evidence: '80', confidence: 'high' }] }, current, 300)
  assert.equal(accepted[0].kilometersToDestination, 80)
  assert.equal(accepted[0].requiresConfirmation, true)
})


test('lowercase unloading process fields retain their own stop with explicit and replied completion times', () => {
  const current = replyMail('Entladung fertig um 14 Uhr.', 'Bitte um kurzes Update zur Entladung.\nEntladestelle / Unloading site: Berlin')
  const result = { isStatusUpdate: true, updates: [{ field: 'unloadingCompletedAt', value: '2026-11-05T14:00:00+01:00', evidence: current.bodyText, confidence: 'high', timeBasis: 'explicit', stationBasis: 'explicit', contextFields: [] }] }
  assert.equal(validateStatusMailAiResult(result, current)[0].field, 'unloadingCompletedAt')
  const replied = { ...current, bodyText: 'Fertig um 14 Uhr.' }
  const proposed = validateStatusMailAiResult({ ...result, updates: [{ ...result.updates[0], evidence: replied.bodyText }] }, replied)
  assert.equal(proposed[0].derivation.stationBasis, 'reply_context')
  assert.equal(proposed[0].requiresConfirmation, true)
})
