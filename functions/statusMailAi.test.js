import test from 'node:test'
import assert from 'node:assert/strict'
import { Timestamp } from 'firebase-admin/firestore'
import { planStatusMailAiChanges, processStatusMailAi, validateStatusMailAiResult } from './statusMailAi.js'

const receivedAt = Timestamp.fromDate(new Date('2026-10-01T10:00:00Z'))
const mail = {
  source: 'powerAutomate', mailbox: 'status@brennpunkt-logistik.de', transportOrderId: 'order-1',
  subject: 'TA 260900123', bodyText: 'ETA Entladestelle heute 15:30 Uhr. Kennzeichen: HH-AB 123.', receivedAt,
}

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
