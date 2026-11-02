import test from 'node:test'
import assert from 'node:assert/strict'
import { Timestamp } from 'firebase-admin/firestore'
import { previewPersonalMailTracking, applyPersonalMailTracking, currentPersonalMailText, validatedOrderNumbers, validatePersonalStatusResult } from './personalMailTracking.js'

function database() {
  const records = new Map()
  const snapshot = path => ({ exists: records.has(path), id: path.split('/').at(-1), data: () => records.get(path) })
  const doc = path => ({ path, get: async () => snapshot(path), create: async value => { assert.ok(!records.has(path)); records.set(path, value) }, collection: key => ({ doc: key2 => doc(`${path}/${key}/${key2}`) }) })
  let queue = Promise.resolve()
  return { records, doc,
    collection(path) {
      return { where(field, op, value) {
        return { limit: count => ({ get: async () => ({ docs: [...records].filter(([key, data]) => key.startsWith(`${path}/`) && key.split('/').length === 2 && (op === '==' ? data[field] === value : data[field] < value)).slice(0, count).map(([key]) => snapshot(key)) }) }) }
      } }
    },
    runTransaction(fn) {
      const promise = queue.then(async () => {
        const writes = []
        const result = await fn({ get: async ref => { assert.equal(writes.length, 0, 'all reads precede writes'); return snapshot(ref.path) }, set: (ref, value) => writes.push(['set', ref, value]), create: (ref, value) => writes.push(['create', ref, value]), update: (ref, value) => writes.push(['update', ref, value]) })
        for (const [kind, ref] of writes) { if (kind === 'create') assert.ok(!records.has(ref.path)); if (kind === 'update') assert.ok(records.has(ref.path)) }
        for (const [kind, ref, value] of writes) records.set(ref.path, kind === 'update' ? { ...records.get(ref.path), ...value } : value)
        return result
      })
      queue = promise.catch(() => {})
      return promise
    },
  }
}
const received = '2026-10-29T10:00:00.000Z'
const proposal = '2026-10-29T13:30:00.000Z'
const mail = { id: 'immutable-1', internetMessageId: '<private-id@example.com>', subject: 'Privater Betreff TA 123456789', from: { emailAddress: { address: 'private@example.com' } }, receivedDateTime: received, body: { contentType: 'text', content: 'TA 123456789: Wir erreichen die Entladestelle heute um 14:30 Uhr. Kennzeichen W-AB 123. Noch 20 km bis zur Entladestelle.\n\nVon: Alt\nGesendet: gestern\nAn: Test\nBetreff: TA 987654321\n\nAlte vertrauliche Aussage.' } }
const result = { isStatusUpdate: true, reviewRequired: false, reviewReason: '', updates: [{ field: 'estimatedArrivalUnloadingAt', value: proposal.replace('.000Z', 'Z'), evidence: 'Wir erreichen die Entladestelle heute um 14:30 Uhr.', confidence: 'high' }, { field: 'licensePlate', value: 'W-AB 123', evidence: 'Kennzeichen W-AB 123', confidence: 'high' }], transitUpdates: [{ kind: 'kilometers_to_unloading', value: 20, location: '', evidence: 'Noch 20 km bis zur Entladestelle.', confidence: 'high' }], pauseUpdates: [] }
function fixture(options = {}) {
  const db = database()
  db.records.set('transportOrders/order-1', { externalNumber: '123456789', imported: { loading: { city: 'Hamburg' }, unloading: { city: 'Berlin' } } })
  db.records.set('mailboxConnections/connection', { ownerId: 'owner', status: 'connected' })
  if (options.tracking) db.records.set('transportOrderTrackings/order-1', options.tracking)
  const context = { uid: 'owner', profile: { active: true, firstName: 'Test', permissions: { transportOrders: 'edit' } }, connectionId: 'connection', connection: { graphUserId: 'graph-owner' }, ref: db.doc('mailboxConnections/connection') }
  const args = { db, context, mail, now: 1000, inferOrder: async () => ({ candidates: [{ number: '123456789', evidence: 'TA 123456789' }] }), infer: async () => result }
  const apply = (preview, changes = preview.proposals, entries = preview.transitProposals) => applyPersonalMailTracking({ db, context, previewId: preview.previewId, changes, transitEntries: entries, now: 2000 })
  return { db, context, args, apply }
}

test('preview reads newest message, validates order and creates no order/tracking writes or mail copies', async () => {
  const f = fixture()
  let seen
  const preview = await previewPersonalMailTracking({ ...f.args, infer: async input => { seen = input; return result } })
  assert.equal(preview.order.number, '123456789')
  assert.equal(preview.proposals.estimatedArrivalUnloadingAt, proposal)
  assert.equal(preview.transitProposals[0].kilometersToDestination, 20)
  assert.equal(f.db.records.has('transportOrderTrackings/order-1'), false)
  assert.ok(!seen.mail.bodyText.includes('Alte vertrauliche'))
  assert.deepEqual(seen.history, [])
  const storage = JSON.stringify([...f.db.records])
  for (const value of ['Privater Betreff', 'private@example.com', 'Alte vertrauliche', 'Wir erreichen', '<private-id']) assert.ok(!storage.includes(value))
})

test('confirmation starts tracking, retains AI origins and corrections, with minimal provenance and no duplicates', async () => {
  const f = fixture()
  const preview = await previewPersonalMailTracking(f.args)
  const [first, replay] = await Promise.all([f.apply(preview, { ...preview.proposals, estimatedArrivalUnloadingAt: '2026-10-29T14:00:00.000Z' }), f.apply(preview)])
  assert.equal(first.ok, true)
  assert.equal(replay.alreadyApplied, true)
  const tracking = f.db.records.get('transportOrderTrackings/order-1')
  assert.equal(tracking.lifecycleStatus, 'active')
  assert.equal(tracking.fieldSources.licensePlate.source, 'ai_mail')
  assert.equal(tracking.fieldSources.estimatedArrivalUnloadingAt.source, 'manual')
  assert.equal(tracking.fieldSources.estimatedArrivalUnloadingAt.originalAiValue, proposal)
  assert.equal(tracking.fieldSources.licensePlate.confirmedBy, 'owner')
  assert.equal(tracking.fieldSources.licensePlate.channel, 'personal_mailbox')
  const events = [...f.db.records].filter(([key]) => key.includes('/events/')).map(([, value]) => value)
  assert.equal(events.length, 4)
  assert.equal(events.find(entry => entry.eventType === 'transit_position_reported').source, 'ai_mail')
  assert.ok(!JSON.stringify(events).includes('Privater Betreff'))
  assert.ok(![...f.db.records.keys()].some(key => key.includes('receivedMails')))
  const next = await previewPersonalMailTracking({ ...f.args, infer: async () => { throw new Error('must not call provider again') } })
  assert.equal(next.alreadyApplied, true)
})

test('missing or ambiguous order opens assignment, valid manual TA skips automatic matching', async () => {
  const f = fixture()
  const unknownMail = { ...mail, body: { contentType: 'text', content: 'Keine Nummer vorhanden.' }, subject: 'Status' }
  assert.equal((await previewPersonalMailTracking({ ...f.args, mail: unknownMail, inferOrder: async () => ({ candidates: [] }) })).needsAssignment, true)
  const explicit = await previewPersonalMailTracking({ ...f.args, mail: unknownMail, orderNumber: '123456789', inferOrder: async () => { throw new Error('no auto assignment') }, infer: async () => ({ ...result, isStatusUpdate: false }) })
  assert.equal(explicit.order.id, 'order-1')
  assert.deepEqual(explicit.proposals, {})
  assert.equal((await previewPersonalMailTracking({ ...f.args, orderNumber: '999999999' })).needsAssignment, true)
  await assert.rejects(previewPersonalMailTracking({ ...f.args, orderNumber: '../123' }), { code: 'invalid-argument' })
  const ambiguous = { ...unknownMail, body: { contentType: 'text', content: 'TA 123456789 und TA 999999999 betreffen diese Meldung.' } }
  assert.equal((await previewPersonalMailTracking({ ...f.args, mail: ambiguous })).needsAssignment, true)
})

test('newest explicit TA overrides an old quoted candidate; quoted-only status evidence is rejected', async () => {
  const f = fixture()
  f.db.records.set('transportOrders/old-order', { externalNumber: '987654321' })
  const preview = await previewPersonalMailTracking({ ...f.args, inferOrder: async () => ({ candidates: [{ number: '987654321', evidence: 'TA 987654321' }] }), infer: async () => ({ ...result, updates: [{ field: 'licensePlate', value: 'ALT-123', evidence: 'Alte vertrauliche Aussage.', confidence: 'high' }], transitUpdates: [] }) })
  assert.equal(preview.order.id, 'order-1')
  assert.deepEqual(preview.proposals, {})
  assert.deepEqual(validatedOrderNumbers({ candidates: [{ number: '123456789', evidence: 'erfunden' }] }, 'TA 123456789'), [])
  assert.equal(currentPersonalMailText('Aktuell\n> Alt'), 'Aktuell')
  assert.equal(currentPersonalMailText('Von: Alt\nGesendet: gestern\nAn: Test\nBetreff: Status\nAlt'), '')
  assert.equal(currentPersonalMailText('On Wed, Example wrote:\n> ETA 14:30'), '')
})

test('manual values and newer AI values are flagged, concurrent changes and completed tracking block confirmation', async () => {
  const f = fixture({ tracking: { lifecycleStatus: 'active', stageId: 'unloading', estimatedArrivalUnloadingAt: Timestamp.fromDate(new Date('2026-10-29T12:00:00Z')), licensePlate: 'MANUAL', fieldSources: { licensePlate: { source: 'manual' }, estimatedArrivalUnloadingAt: { source: 'ai_mail', receivedAt: Timestamp.fromDate(new Date('2026-10-30T12:00:00Z')) } } } })
  const preview = await previewPersonalMailTracking(f.args)
  assert.deepEqual(preview.conflicts.sort(), ['estimatedArrivalUnloadingAt', 'licensePlate'])
  f.db.records.set('transportOrderTrackings/order-1', { ...f.db.records.get('transportOrderTrackings/order-1'), driverName: 'Concurrent change' })
  await assert.rejects(f.apply(preview), { code: 'aborted' })
  f.db.records.set('transportOrderTrackings/order-1', { lifecycleStatus: 'completed' })
  await assert.rejects(previewPersonalMailTracking(f.args), { code: 'failed-precondition' })
})

test('owner, mailbox connection, edit permission, expiry and payload validation are enforced', async () => {
  const f = fixture()
  const preview = await previewPersonalMailTracking(f.args)
  for (const context of [{ ...f.context, uid: 'foreign' }, { ...f.context, connectionId: 'foreign' }]) await assert.rejects(applyPersonalMailTracking({ db: f.db, context, previewId: preview.previewId, changes: preview.proposals }), { code: 'permission-denied' })
  const viewer = { ...f.context, profile: { permissions: { transportOrders: 'view' } } }
  await assert.rejects(previewPersonalMailTracking({ ...f.args, context: viewer }), { code: 'permission-denied' })
  await assert.rejects(applyPersonalMailTracking({ db: f.db, context: f.context, previewId: preview.previewId, changes: preview.proposals, now: 4000000 }), { code: 'failed-precondition' })
  await assert.rejects(f.apply(preview, { inventedField: 'bad' }), { code: 'invalid-argument' })
  await assert.rejects(f.apply(preview, {} , [{ kind: 'position', at: 'nonsense', kilometersToDestination: -2, location: '' }]), { code: 'invalid-argument' })
  f.db.records.set('mailboxConnections/connection', { ownerId: 'owner', status: 'disconnecting' })
  await assert.rejects(f.apply(preview), { code: 'permission-denied' })
})

test('corrected transit proposal preserves its original AI value without claiming AI authorship', async () => {
  const f = fixture()
  const preview = await previewPersonalMailTracking(f.args)
  await f.apply(preview, {}, [{ ...preview.transitProposals[0], kilometersToDestination: 25, proposalIndex: 0 }])
  const event = [...f.db.records.values()].find(value => value.eventType === 'transit_position_reported')
  assert.equal(event.source, 'manual')
  assert.equal(event.originalAiValue.kilometersToDestination, 20)
})

test('driver details require explicit newest-mail evidence, not sender signatures', () => {
  const bodyText = 'Fahrer Max Mustermann, Fahrertelefon +49 170 1234567. Es fahren 2 Fahrer.\nSignatur: +49 202 7654321'
  const updates = [
    { field: 'driverName', value: 'Max Mustermann', evidence: 'Fahrer Max Mustermann', confidence: 'high' },
    { field: 'driverPhone', value: '+49 170 1234567', evidence: 'Fahrertelefon +49 170 1234567', confidence: 'high' },
    { field: 'driverCount', value: '2', evidence: '2 Fahrer', confidence: 'high' },
  ]
  // "Fahrertelefon" is an explicit driver label as well.
  const accepted = validatePersonalStatusResult({ ...result, updates }, { bodyText, receivedAt: Timestamp.fromDate(new Date(received)) })
  assert.equal(accepted.find(item => item.field === 'driverName').value, 'Max Mustermann')
  assert.equal(accepted.find(item => item.field === 'driverPhone').value, '+49 170 1234567')
  assert.equal(accepted.find(item => item.field === 'driverCount').value, 2)
  assert.equal(validatePersonalStatusResult({ ...result, updates: [{ field: 'driverPhone', value: '+49 202 7654321', evidence: 'Signatur: +49 202 7654321', confidence: 'high' }] }, { bodyText, receivedAt: Timestamp.fromDate(new Date(received)) }).length, 0)
})

test('manual plate aliases are protected and repeated inference is bounded', async () => {
  const f = fixture({ tracking: { lifecycleStatus: 'active', tractorLicensePlate: 'MANUAL', fieldSources: { tractorLicensePlate: { source: 'manual' } } } })
  const preview = await previewPersonalMailTracking(f.args)
  assert.ok(preview.conflicts.includes('licensePlate'))
  f.db.records.set('mailboxTrackingQuotas/owner', { start: 1000, count: 120 })
  await assert.rejects(previewPersonalMailTracking(f.args), { code: 'resource-exhausted' })
})


test('job-bound tracking preview cannot apply after discard or replacement', async () => {
  for (const state of ['discarded', 'running']) {
    const f = fixture(); const preview = await previewPersonalMailTracking(f.args)
    const stored = f.db.records.get(`mailboxTrackingPreviews/${preview.previewId}`)
    f.db.records.set(`mailboxTrackingPreviews/${preview.previewId}`, { ...stored, actionJobId: 'original-job', actionSlotPath: 'mailboxActionScopes/scope/actions/slot' })
    f.db.records.set('mailboxActionScopes/scope/actions/slot', { state, jobId: state === 'running' ? 'replacement-job' : 'original-job' })
    await assert.rejects(f.apply(preview), { code: 'aborted' })
    assert.equal(f.db.records.has('transportOrderTrackings/order-1'), false)
  }
})
