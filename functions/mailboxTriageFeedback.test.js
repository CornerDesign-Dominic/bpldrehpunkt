import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createMailboxTriageFeedbackHandlers, sanitizeMailboxTriageDecision } from './mailboxTriageFeedback.js'
import { recommendationScope } from './mailboxRecommendations.js'

const hash = value => createHash('sha256').update(value).digest('hex')
const connectionId = 'a'.repeat(64), messageId = 'opaque-original-message'
const connection = { ownerId: 'owner', status: 'connected', kind: 'personal', tenantId: 'tenant', graphUserId: 'graph-owner', email: 'owner@example.invalid' }
const scopeId = recommendationScope(connection)
const profile = { active: true, role: 'user', permissions: { mailboxes: 'edit', todos: 'edit', damages: 'edit', transportOrders: 'edit', masterData: 'view', agbChecker: 'view', calendar: 'view', mailTriageQuality: 'edit', mailTriageCleanup: 'edit' } }
const decision = { id: 'd'.repeat(64), version: 1, status: 'actionable', answers: [{ key: 'requiredAction', value: 'Unterlagen senden', sourceId: 'body', quote: 'Bitte Unterlagen senden.' }], actions: [{ kind: 'todo', confidence: 'high', reason: 'Konkrete Aufgabe', sourceId: 'body', quote: 'Bitte Unterlagen senden.' }], coverage: { mail: true, forwarded: false, attachments: 'not_present', documentNames: [], unreadable: [] } }
const request = data => ({ auth: { uid: 'owner' }, data })
const submission = extra => request({ connectionId, messageId, kind: 'todo', outcome: 'rejected', reason: 'no_action', decisionId: decision.id, ...extra })

function fakeDb() {
  const values = new Map()
  const snapshot = path => ({ id: path.split('/').at(-1), ref: ref(path), exists: values.has(path), data: () => values.get(path) })
  const ref = path => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path), collection: name => collection(`${path}/${name}`) })
  const collection = path => {
    let after = '', size = 10000
    const query = { doc: id => ref(`${path}/${id}`), orderBy: () => query, startAfter: id => { after = id; return query }, limit: count => { size = count; return query }, get: async () => ({ docs: [...values.keys()].filter(key => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1 && key.split('/').at(-1) > after).sort().slice(0, size).map(snapshot) }) }
    return query
  }
  let queue = Promise.resolve()
  return { values, doc: ref, collection, runTransaction(fn) {
    const task = queue.then(async () => {
      const writes = []
      const result = await fn({ get: async target => { assert.equal(writes.length, 0, 'all reads precede writes'); return snapshot(target.path) }, create: (target, value) => { assert.ok(!values.has(target.path)); writes.push(['set', target.path, value]) }, set: (target, value) => writes.push(['set', target.path, value]), update: (target, patch) => writes.push(['update', target.path, patch]), delete: target => writes.push(['delete', target.path]) })
      for (const [mode, path, value] of writes) if (mode === 'delete') values.delete(path); else values.set(path, mode === 'update' ? { ...values.get(path), ...value } : value)
      return result
    })
    queue = task.catch(() => {})
    return task
  } }
}
function setup() {
  const db = fakeDb()
  db.values.set('users/owner', structuredClone(profile))
  db.values.set(`mailboxConnections/${connectionId}`, connection)
  db.values.set(`mailboxRecommendationScopes/${scopeId}`, { enabled: true, generation: 'generation-one' })
  db.values.set(`mailboxRecommendationScopes/${scopeId}/messages/${hash(messageId)}`, { generation: 'generation-one', state: 'completed', kinds: ['todo'], subject: 'Unterlagen', decision: { ...decision, rawMail: 'NEVER COPY', messageId } })
  const diagnostics = []
  const handlers = createMailboxTriageFeedbackHandlers({ db, project: 'db-bpl-drehpunkt-dev', now: () => Date.UTC(2026, 10, 4, 23, 30), requireProfile: async req => db.values.get(`users/${req.auth.uid}`), graph: async input => ({ id: input.messageId, body: 'DO NOT RETAIN' }), diagnostic: async value => diagnostics.push(value) })
  return { db, handlers, diagnostics }
}

test('rejection stores only server classification, suppresses only this users action and is idempotent', async () => {
  const { db, handlers } = setup()
  const args = submission({ comment: 'Keine Bearbeitung erforderlich', decision: { rawMail: 'forged-client' } })
  const [first, second] = await Promise.all([handlers.submit(args), handlers.submit(args)])
  assert.deepEqual(first, second)
  assert.equal(first.suppressed, true)
  const feedback = db.values.get(`mailboxTriageFeedback/${first.feedbackId}`)
  assert.equal(feedback.subject, 'Unterlagen')
  assert.equal(feedback.decision.id, decision.id)
  assert.equal(feedback.createdBy, 'owner')
  assert.equal(JSON.stringify(feedback).includes(messageId), false)
  assert.equal(JSON.stringify(feedback).includes('rawMail'), false)
  assert.equal(JSON.stringify(feedback).includes('forged-client'), false)
  const state = db.values.get(`mailboxTriageFeedbackStates/${hash(`owner|${connectionId}|${messageId}`)}`)
  assert.deepEqual(state.dismissedKinds, ['todo'])
  assert.deepEqual(Object.keys(state.submittedIds), ['todo_rejected'])
  assert.equal([...db.values.keys()].filter(path => path.startsWith('mailboxTriageFeedback/')).length, 1)
})

test('missing recommendations may be reported for manual actions but do not suppress them', async () => {
  const { db, handlers } = setup()
  db.values.delete(`mailboxRecommendationScopes/${scopeId}/messages/${hash(messageId)}`)
  await assert.rejects(handlers.submit(submission({ decisionId: undefined })), error => error.code === 'failed-precondition')
  const result = await handlers.submit(submission({ outcome: 'missed', reason: 'other_action', correctKind: 'todo', comment: 'Die Aufgabe wurde übersehen', decisionId: undefined }))
  assert.equal(result.suppressed, false)
  assert.equal(db.values.get(`mailboxTriageFeedback/${result.feedbackId}`).decision, null)
  assert.equal(JSON.stringify(db.values.get(`mailboxTriageFeedback/${result.feedbackId}`)).includes('DO NOT RETAIN'), false)
  assert.deepEqual(db.values.get(`mailboxTriageFeedbackStates/${hash(`owner|${connectionId}|${messageId}`)}`).dismissedKinds, [])
})

test('mailbox ownership, live user permissions and classification version are mandatory', async () => {
  const { db, handlers } = setup()
  await assert.rejects(handlers.submit({ data: submission().data }), error => error.code === 'unauthenticated')
  await assert.rejects(handlers.submit(submission({ decisionId: 'e'.repeat(64) })), error => error.code === 'aborted')
  await assert.rejects(handlers.submit(submission({ decisionVersion: 2 })), error => error.code === 'aborted')
  await assert.rejects(handlers.submit(submission({ reason: 'other_action' })), error => error.code === 'invalid-argument')
  db.values.set(`mailboxConnections/${connectionId}`, { ...connection, ownerId: 'someone-else' })
  await assert.rejects(handlers.submit(submission()), error => error.code === 'permission-denied')
  db.values.set(`mailboxConnections/${connectionId}`, connection)
  db.values.set('users/owner', { ...profile, permissions: { ...profile.permissions, todos: 'view' } })
  await assert.rejects(handlers.submit(submission()), error => error.code === 'permission-denied')
  assert.equal([...db.values.keys()].filter(path => path.startsWith('mailboxTriageFeedback/')).length, 0)
})

test('shared delegates cannot use a disconnected parent even with a still connected child', async () => {
  const { db, handlers } = setup()
  const shared = { ...connection, kind: 'shared', canonicalMailboxId: 'canonical-mailbox', parentConnectionId: 'b'.repeat(64) }
  db.values.set(`mailboxConnections/${connectionId}`, shared)
  db.values.set(`mailboxConnections/${shared.parentConnectionId}`, { ...connection, status: 'disconnected' })
  await assert.rejects(handlers.submit(submission()), error => error.code === 'permission-denied')
})

test('quality reading, editing and cleanup are separate rights and admin has no implicit override', async () => {
  const { db, handlers } = setup()
  const { feedbackId } = await handlers.submit(submission())
  db.values.set('users/owner', { ...profile, role: 'admin', permissions: { mailboxes: 'edit' } })
  await assert.rejects(handlers.list(request({})), error => error.code === 'permission-denied')
  db.values.set('users/owner', { ...profile, permissions: { mailTriageQuality: 'view' } })
  assert.equal((await handlers.list(request({}))).items.length, 1)
  await assert.rejects(handlers.update(request({ id: feedbackId, revision: 1, status: 'verified', reviewNote: '' })), error => error.code === 'permission-denied')
  await assert.rejects(handlers.remove(request({ items: [{ id: feedbackId, revision: 1 }] })), error => error.code === 'permission-denied')
  db.values.set('users/owner', { ...profile, permissions: { mailTriageCleanup: 'edit' } })
  await assert.rejects(handlers.remove(request({ items: [{ id: feedbackId, revision: 1 }] })), error => error.code === 'permission-denied')
})

test('review updates reject stale versions; cleanup leaves dismissal and retry tombstones intact', async () => {
  const { db, handlers } = setup()
  const { feedbackId } = await handlers.submit(submission())
  const changed = await handlers.update(request({ id: feedbackId, revision: 1, status: 'verified', reviewNote: 'Mit Testfall verbessert' }))
  assert.equal(changed.item.revision, 2)
  assert.equal(changed.item.status, 'verified')
  await assert.rejects(handlers.update(request({ id: feedbackId, revision: 1, status: 'new', reviewNote: '' })), error => error.code === 'aborted')
  await assert.rejects(handlers.remove(request({ items: [{ id: feedbackId, revision: 1 }] })), error => error.code === 'aborted')
  assert.equal(db.values.has(`mailboxTriageFeedback/${feedbackId}`), true)
  assert.deepEqual(await handlers.remove(request({ items: [{ id: feedbackId, revision: 2 }] })), { deletedIds: [feedbackId] })
  assert.equal(db.values.has(`mailboxTriageFeedback/${feedbackId}`), false)
  const repeated = await handlers.submit(submission())
  assert.equal(repeated.feedbackId, feedbackId)
  assert.equal(db.values.has(`mailboxTriageFeedback/${feedbackId}`), false, 'cleanup is not undone by an identical retry')
  assert.deepEqual(db.values.get(`mailboxTriageFeedbackStates/${hash(`owner|${connectionId}|${messageId}`)}`).dismissedKinds, ['todo'])
})

test('bounded list pages expose continuation even if filters match no record; dates are Berlin inclusive', async () => {
  const { db, handlers } = setup()
  const { feedbackId } = await handlers.submit(submission())
  const stored = db.values.get(`mailboxTriageFeedback/${feedbackId}`)
  for (let index = 0; index < 55; index++) db.values.set(`mailboxTriageFeedback/${index.toString(16).padStart(64, '0')}`, { ...stored, kind: 'damage' })
  const first = await handlers.list(request({ kind: 'calendar' }))
  assert.deepEqual(first.items, [])
  assert.equal(first.hasMore, true)
  assert.equal(first.scannedCount, 50)
  const second = await handlers.list(request({ cursor: first.nextCursor, dateFrom: '2026-11-05', dateUntil: '2026-11-05' }))
  assert.ok(second.items.length > 0)
  assert.equal(second.hasMore, false)
  assert.equal((await handlers.list(request({ cursor: first.nextCursor, dateUntil: '2026-11-04' }))).items.length, 0)
  await assert.rejects(handlers.list(request({ dateFrom: '2026-02-30' })), error => error.code === 'invalid-argument')
})

test('sanitization strips raw content and malformed metadata, diagnostics contain no feedback content', async () => {
  const clean = sanitizeMailboxTriageDecision({ ...decision, body: 'PRIVATE BODY', attachments: ['PRIVATE FILE'], answers: [{ key: 'unknown', value: 'discard' }], actions: [{ ...decision.actions[0], raw: 'PRIVATE' }] })
  assert.equal(JSON.stringify(clean).includes('PRIVATE'), false)
  assert.deepEqual(clean.answers, [])
  const { db, handlers, diagnostics } = setup()
  const original = db.collection
  db.collection = () => { throw Error('PRIVATE BODY') }
  await assert.rejects(handlers.list(request({})))
  assert.equal(diagnostics.length, 1)
  assert.equal(diagnostics[0].stage, 'triage-quality')
  assert.equal(JSON.stringify(diagnostics).includes('PRIVATE'), false)
  db.collection = original
})
