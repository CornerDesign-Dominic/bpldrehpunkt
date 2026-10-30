import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { HttpsError } from 'firebase-functions/v2/https'
import { createMailboxActionHandlers } from './mailboxActions.js'
const hash = value => createHash('sha256').update(value).digest('hex')
const connectionId = 'a'.repeat(64)
const profile = { active: true, role: 'user', permissions: { mailboxes: 'edit', transportOrders: 'edit', masterData: 'view', agbChecker: 'view' } }
function database() {
  const records = new Map(); let queue = Promise.resolve()
  const doc = path => ({ id: path.split('/').at(-1), path, async get() { return { exists: records.has(path), data: () => structuredClone(records.get(path)), ref: doc(path) } }, async set(value) { records.set(path, structuredClone(value)) }, async update(value) { assert.ok(records.has(path)); records.set(path, { ...records.get(path), ...structuredClone(value) }) }, async create(value) { assert.equal(records.has(path), false); records.set(path, structuredClone(value)) } })
  const collection = path => { const constraints = []; const query = { doc: id => doc(`${path}/${id}`), where(field, operator, value) { constraints.push([field, operator, value]); return query }, limit() { return query }, async get() { return { docs: [...records].filter(([key, value]) => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/') && constraints.every(([field, operator, expected]) => operator === 'in' ? expected.includes(value[field]) : value[field] === expected)).map(([key, value]) => ({ ref: doc(key), id: key.split('/').at(-1), data: () => structuredClone(value) })) } } }; return query }
  return { records, doc, collection, runTransaction(fn) { const result = queue.then(() => fn({ get: ref => ref.get(), create: (ref, value) => ref.create(value), set: (ref, value) => ref.set(value), update: (ref, value) => ref.update(value) })); queue = result.catch(() => {}); return result } }
}
function fixture(options = {}) {
  const db = database(); const clock = { value: 1000 }; let permission = structuredClone(profile), calls = 0
  db.records.set(`mailboxConnections/${connectionId}`, { ownerId: 'owner', status: 'connected', tenantId: 'tenant', graphUserId: 'graph' })
  const defaults = Object.fromEntries(['previewMailboxOrder', 'previewMailboxTracking', 'analyzeMailboxAgb', 'reviewMailboxInvoices'].map(name => [name, async () => { calls++; return { label: name } }]))
  const handlers = createMailboxActionHandlers({ db, project: options.project || 'db-bpl-drehpunkt-dev', now: () => clock.value, requireProfile: async request => { if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Anmeldung erforderlich.'); return permission }, handlers: { ...defaults, ...options.handlers } })
  const request = (data = {}, uid = 'owner') => ({ auth: { uid }, data: { connectionId, messageId: 'message', kind: 'order', ...data } })
  return { db, clock, handlers, request, calls: () => calls, revoke() { permission = { ...profile, active: false } } }
}
const key = `mailboxActionScopes/${hash(`owner|${connectionId}`)}/actions/${hash('message|order')}`

test('job starts quickly, deduplicates concurrent starts and claims worker exactly once', async () => {
  const f = fixture()
  const [left, right] = await Promise.all([f.handlers.startMailboxAction(f.request()), f.handlers.startMailboxAction(f.request())])
  assert.equal(left.action.jobId, right.action.jobId); assert.equal(f.calls(), 0)
  await Promise.all([f.handlers.processMailboxActionRun(left.action.jobId), f.handlers.processMailboxActionRun(left.action.jobId)])
  assert.equal(f.calls(), 1)
  const result = (await f.handlers.getMailboxAction(f.request())).action
  assert.equal(result.state, 'review'); assert.deepEqual(result.result, { label: 'previewMailboxOrder' }); assert.equal(result.updatedAtMillis, f.clock.value)
})

test('independent kinds can run together; auto-completed reviews differ from confirmable actions', async () => {
  const f = fixture()
  const jobs = await Promise.all(['order', 'tracking', 'terms', 'invoice'].map(kind => f.handlers.startMailboxAction(f.request({ kind }))))
  assert.equal(new Set(jobs.map(job => job.action.jobId)).size, 4)
  await Promise.all(jobs.map(job => f.handlers.processMailboxActionRun(job.action.jobId)))
  const listed = (await f.handlers.listMailboxActions(f.request({ messageIds: ['message'] }))).actions
  assert.deepEqual(Object.fromEntries(listed.map(action => [action.kind, action.state])), { order: 'review', tracking: 'review', terms: 'completed', invoice: 'completed' })
  assert.ok(listed.every(action => !Object.hasOwn(action, 'result')))
})

test('production, foreign mailbox and revoked user are blocked before AI work', async () => {
  const production = fixture({ project: 'db-bpl-drehpunkt' })
  await assert.rejects(production.handlers.startMailboxAction(production.request()), { code: 'failed-precondition' })
  const f = fixture()
  await assert.rejects(f.handlers.startMailboxAction(f.request({}, 'foreign')), { code: 'permission-denied' })
  const { action } = await f.handlers.startMailboxAction(f.request()); f.revoke()
  await f.handlers.processMailboxActionRun(action.jobId)
  assert.equal(f.calls(), 0); assert.equal(f.db.records.get(key).state, 'failed')
})

test('failed worker provides a safe error and allows an explicit retry', async () => {
  const f = fixture({ handlers: { previewMailboxOrder: async () => { throw new Error('private-provider-response') } } })
  const first = await f.handlers.startMailboxAction(f.request())
  await f.handlers.processMailboxActionRun(first.action.jobId)
  const failed = await f.handlers.getMailboxAction(f.request())
  assert.equal(failed.action.state, 'failed'); assert.ok(!JSON.stringify(failed).includes('private-provider-response'))
  const second = await f.handlers.startMailboxAction(f.request())
  assert.notEqual(first.action.jobId, second.action.jobId)
})

test('discard is durable metadata, stale run updates fail, and restart gets a new run', async () => {
  const f = fixture(); const { action } = await f.handlers.startMailboxAction(f.request())
  await assert.rejects(f.handlers.updateMailboxAction(f.request({ action: 'discard', jobId: action.jobId })), { code: 'failed-precondition' })
  await f.handlers.processMailboxActionRun(action.jobId)
  const discarded = await f.handlers.updateMailboxAction(f.request({ action: 'discard', jobId: action.jobId }))
  assert.equal(discarded.action.state, 'discarded'); assert.equal(discarded.action.result, null)
  assert.equal((await f.handlers.listMailboxActions(f.request({ messageIds: ['message'] }))).actions[0].state, 'discarded')
  const next = await f.handlers.startMailboxAction(f.request())
  await assert.rejects(f.handlers.updateMailboxAction(f.request({ action: 'discard', jobId: action.jobId })), { code: 'aborted' })
  assert.notEqual(next.action.jobId, action.jobId)
})

test('worker binds persistent previews and cannot turn an unconfirmed order green', async () => {
  let f
  f = fixture({ handlers: { previewMailboxOrder: async () => { f.db.records.set('mailboxOrderPreviews/preview', { ownerId: 'owner', connectionId, messageId: 'message', graphUserId: 'graph', messageKey: hash('tenant|graph|message'), expiresAt: 1234 }); return { previewId: 'preview' } } } })
  const { action } = await f.handlers.startMailboxAction(f.request()); await f.handlers.processMailboxActionRun(action.jobId)
  const preview = f.db.records.get('mailboxOrderPreviews/preview')
  assert.equal(preview.expiresAt, Number.MAX_SAFE_INTEGER); assert.equal(preview.actionJobId, action.jobId)
  await assert.rejects(f.handlers.updateMailboxAction(f.request({ action: 'complete', jobId: action.jobId, previewId: 'preview' })), { code: 'failed-precondition' })
  f.db.records.set('mailboxOrderExports/preview', { ownerId: 'foreign', connectionId, previewId: 'preview', messageKey: preview.messageKey, exportId: 'export' })
  await assert.rejects(f.handlers.updateMailboxAction(f.request({ action: 'complete', jobId: action.jobId, previewId: 'preview' })), { code: 'failed-precondition' })
  f.db.records.set('mailboxOrderExports/preview', { ownerId: 'owner', connectionId, previewId: 'preview', messageKey: preview.messageKey, exportId: 'export', operationId: 'operation' })
  const complete = await f.handlers.updateMailboxAction(f.request({ action: 'complete', jobId: action.jobId, previewId: 'preview' }))
  assert.equal(complete.action.state, 'completed')
  const repeat = await f.handlers.startMailboxAction(f.request({ restart: true }))
  assert.equal(repeat.action.jobId, action.jobId)
})

test('tracking completion persists actual applied changes after a browser disappears', async () => {
  let f
  f = fixture({ handlers: { previewMailboxTracking: async () => { f.db.records.set('mailboxTrackingPreviews/preview', { ownerId: 'owner', connectionId, orderId: 'order', messageKey: hash('tenant|graph|message') }); return { previewId: 'preview', proposals: { driverName: 'AI' } } } } })
  const { action } = await f.handlers.startMailboxAction(f.request({ kind: 'tracking' })); await f.handlers.processMailboxActionRun(action.jobId)
  f.db.records.set(`personalMailTrackingApplications/${hash('tenant|graph|message')}`, { ownerId: 'owner', orderId: 'order', orderNumber: '260900001', appliedChanges: { driverName: 'Manuell' }, appliedTransitEntries: [] })
  const restored = await f.handlers.getMailboxAction(f.request({ kind: 'tracking' }))
  assert.equal(restored.action.state, 'completed'); assert.equal(restored.action.result.appliedChanges.driverName, 'Manuell')
})

test('a crashed worker becomes visibly retryable rather than spinning forever', async () => {
  const f = fixture(); const { action } = await f.handlers.startMailboxAction(f.request())
  f.db.records.set(key, { ...f.db.records.get(key), processingAt: f.clock.value })
  f.clock.value += 13 * 60_000
  const stale = await f.handlers.getMailboxAction(f.request())
  assert.equal(stale.action.state, 'failed'); assert.equal(stale.action.error.code, 'deadline-exceeded')
  await f.handlers.processMailboxActionRun(action.jobId)
  assert.equal(f.calls(), 0)
})

test('queued jobs are not mistaken for crashed workers before they can claim capacity', async () => {
  const f = fixture(); await f.handlers.startMailboxAction(f.request())
  f.clock.value += 13 * 60_000
  assert.equal((await f.handlers.getMailboxAction(f.request())).action.state, 'running')
  f.clock.value += 48 * 60_000
  assert.equal((await f.handlers.getMailboxAction(f.request())).action.state, 'failed')
})

test('completed AGB remains reusable and reflects separately persisted customer assignment', async () => {
  const f = fixture({ handlers: { analyzeMailboxAgb: async () => ({ historyId: 'history' }) } })
  const { action } = await f.handlers.startMailboxAction(f.request({ kind: 'terms' })); await f.handlers.processMailboxActionRun(action.jobId)
  f.db.records.set('agbCheckerHistory/history', { createdByUserId: 'owner', channel: 'personal_mailbox', customerAssignment: { debtorNumber: '12345' } })
  assert.equal((await f.handlers.getMailboxAction(f.request({ kind: 'terms' }))).action.result.customerAssignment.debtorNumber, '12345')
  const same = await f.handlers.startMailboxAction(f.request({ kind: 'terms' })); assert.equal(same.action.jobId, action.jobId)
  const restarted = await f.handlers.startMailboxAction(f.request({ kind: 'terms', force: true })); assert.notEqual(restarted.action.jobId, action.jobId)
})

test('a confirmation racing a restart or discard cannot be erased by a later UI request', async () => {
  for (const operation of ['restart', 'discard']) {
    let f
    f = fixture({ handlers: { previewMailboxOrder: async () => { f.db.records.set('mailboxOrderPreviews/race', { ownerId: 'owner', connectionId, messageId: 'message', messageKey: hash('tenant|graph|message') }); return { previewId: 'race' } } } })
    const { action } = await f.handlers.startMailboxAction(f.request()); await f.handlers.processMailboxActionRun(action.jobId)
    const transaction = f.db.runTransaction
    f.db.runTransaction = fn => transaction(async tx => {
      // The export commits after any outside reconciliation but before the UI
      // mutation's transaction reads. The transaction must inspect its receipt.
      f.db.records.set('mailboxOrderExports/race', { ownerId: 'owner', connectionId, previewId: 'race', messageKey: hash('tenant|graph|message'), exportId: 'confirmed-export', operationId: 'confirmed-operation' })
      return fn(tx)
    })
    if (operation === 'discard') await assert.rejects(f.handlers.updateMailboxAction(f.request({ action: 'discard', jobId: action.jobId })), { code: 'failed-precondition' })
    else {
      const restarted = await f.handlers.startMailboxAction(f.request({ restart: true }))
      assert.equal(restarted.action.state, 'completed'); assert.equal(restarted.action.jobId, action.jobId)
    }
    assert.notEqual(f.db.records.get(key).state, 'discarded')
  }
})

test('lost export response recovers completion even after temporary export receipt cleanup', async () => {
  let f
  f = fixture({ handlers: { previewMailboxOrder: async () => { f.db.records.set('mailboxOrderPreviews/lost', { ownerId: 'owner', connectionId, messageId: 'message', messageKey: hash('tenant|graph|message') }); return { previewId: 'lost' } } } })
  const { action } = await f.handlers.startMailboxAction(f.request()); await f.handlers.processMailboxActionRun(action.jobId)
  const ref = f.db.doc('mailboxOrderPreviews/lost')
  await ref.update({ exportedAt: 'server-time', exportId: 'confirmed-export' })
  const restored = await f.handlers.getMailboxAction(f.request())
  assert.equal(restored.action.state, 'completed'); assert.equal(restored.action.completion.exportId, 'confirmed-export')
})

test('a just-claimed worker is not failed by stale metadata read before its claim', async () => {
  const f = fixture(); await f.handlers.startMailboxAction(f.request()); f.clock.value += 61 * 60_000
  const transaction = f.db.runTransaction
  f.db.runTransaction = fn => transaction(tx => {
    f.db.records.set(key, { ...f.db.records.get(key), processingAt: f.clock.value })
    return fn(tx)
  })
  assert.equal((await f.handlers.getMailboxAction(f.request())).action.state, 'running')
})
