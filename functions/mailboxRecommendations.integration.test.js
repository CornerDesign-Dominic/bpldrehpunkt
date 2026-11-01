import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomUUID, createHash } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createRecommendationHandlers, recommendationScope } from './mailboxRecommendations.js'
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const hash = value => createHash('sha256').update(value).digest('hex')
const profile = { active: true, role: 'user', permissions: { mailboxes: 'edit' } }
const at = Date.parse('2026-11-01T12:00:00Z')
function reply() { return { code: 0, text: '', set() { return this }, type() { return this }, status(value) { this.code = value; return this }, send(value) { this.text = value; return this } } }
async function fixture(overrides = {}) {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-mail-recommendations'
  assert.ok(projectId.startsWith('demo-'))
  const suffix = randomUUID(), uid = `owner-${suffix}`, other = `other-${suffix}`, parent = hash(`parent-${suffix}`), c1 = hash(`one-${suffix}`), c2 = hash(`two-${suffix}`)
  const app = initializeApp({ projectId }, suffix), db = getFirestore(app)
  const personal = { ownerId: uid, status: 'connected', kind: 'personal', tenantId: 'tenant', email: `${suffix}@example.invalid`, graphUserId: `graph-${suffix}` }
  const shared = { ownerId: uid, status: 'connected', kind: 'shared', tenantId: 'tenant', canonicalMailboxId: `folder-${suffix}`, email: `team-${suffix}@example.invalid`, parentConnectionId: parent }
  await db.doc(`mailboxConnections/${parent}`).set(personal)
  await db.doc(`mailboxConnections/${c1}`).set(shared)
  await db.doc(`mailboxConnections/${c2}`).set({ ...shared, ownerId: other, parentConnectionId: `${parent}-other` })
  await db.doc(`mailboxConnections/${parent}-other`).set({ ...personal, ownerId: other })
  let actor = profile, clock = at, classifications = 0
  const calls = [], clientStates = new Map(), subscriptions = new Map()
  const graph = async input => {
    calls.push(input)
    if (input.operation === 'create') {
      const id = randomUUID(), value = { id, expirationDateTime: input.data.expirationDateTime }
      clientStates.set(id, input.data.clientState); subscriptions.set(id, value); return value
    }
    if (input.operation === 'renew') return { ...subscriptions.get(input.subscriptionId), expirationDateTime: input.data.expirationDateTime }
    if (input.operation === 'delete') { subscriptions.delete(input.subscriptionId); return null }
    if (input.operation === 'message') return { id: input.messageId, subject: 'Status', body: { contentType: 'text', content: 'Ankunft 18 Uhr' }, receivedDateTime: new Date(at + 1000).toISOString() }
    throw new Error('An inbox scan is forbidden')
  }
  const handlers = createRecommendationHandlers({ db, project: 'db-bpl-drehpunkt-dev', tenantId: 'tenant', now: () => clock, requireProfile: async () => actor, classify: async () => { classifications++; return ['tracking'] }, graph, ...overrides })
  const scopeId = recommendationScope(shared)
  const request = (data = {}, owner = uid) => ({ auth: { uid: owner }, data: { connectionId: c1, ...data } })
  const deliver = async (extra = {}) => {
    const scope = (await db.doc(`mailboxRecommendationScopes/${scopeId}`).get()).data()
    const notification = { subscriptionId: scope.subscriptionId, tenantId: 'tenant', clientState: clientStates.get(scope.subscriptionId), changeType: 'created', resourceData: { id: 'immutable' }, ...extra }
    const response = reply(); await handlers.webhook({ method: 'POST', query: {}, body: { value: [notification] } }, response); return response
  }
  const runs = async () => (await db.collection('mailboxRecommendationRuns').where('scopeId', '==', scopeId).get()).docs.map(doc => doc.data())
  const activate = async () => { actor = { active: true, role: 'admin' }; await handlers.setSettings(request({ enabled: true })) }
  return { db, uid, other, c1, c2, parent, personal, shared, handlers, scopeId, request, deliver, runs, activate, calls, count: () => classifications, clock: value => { clock = value }, actor: value => { actor = value }, async close() {
    await db.recursiveDelete(db.doc(`mailboxRecommendationScopes/${scopeId}`))
    for (const id of [parent, c1, c2, `${parent}-other`]) { await db.doc(`mailboxConnections/${id}`).delete(); await db.doc(`mailboxRecommendationSignals/${id}`).delete() }
    await db.terminate(); await deleteApp(app)
  } }
}
test('emulator: shared admin activation creates one subscription and duplicate notifications classify once for all delegates', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await assert.rejects(f.handlers.setSettings(f.request({ enabled: true })), { code: 'permission-denied' })
    await f.activate(); await f.handlers.setSettings(f.request({ connectionId: f.c2, enabled: true }))
    assert.equal(f.calls.filter(call => call.operation === 'create').length, 1)
    assert.equal((await f.deliver()).code, 202); await f.deliver()
    const runs = await f.runs(); assert.equal(runs.length, 1)
    await Promise.all([f.handlers.process(runs[0]), f.handlers.process(runs[0])])
    assert.equal(f.count(), 1)
    f.actor(profile)
    const first = await f.handlers.list(f.request({ messageIds: ['immutable'] }))
    const other = await f.handlers.list(f.request({ connectionId: f.c2, messageIds: ['immutable'] }, f.other))
    assert.deepEqual(first, other); assert.deepEqual(first.recommendations.immutable, ['tracking'])
    assert.equal((await f.db.doc(`mailboxRecommendationSignals/${f.c2}`).get()).data().ownerId, f.other)
    await assert.rejects(f.handlers.list(f.request({ connectionId: f.c2, messageIds: ['immutable'] })), { code: 'permission-denied' })
  } finally { await f.close() }
})
test('emulator: webhook validation is plain text; forged, wrong-tenant and unknown notifications cannot enqueue work', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const response = reply(); await f.handlers.webhook({ method: 'POST', query: { validationToken: 'opaque-validation' } }, response)
    assert.equal(response.code, 200); assert.equal(response.text, 'opaque-validation')
    await f.activate()
    await f.deliver({ clientState: 'forged' }); await f.deliver({ tenantId: 'foreign' }); await f.deliver({ subscriptionId: 'unknown' }); await f.deliver({ changeType: 'updated' })
    assert.equal((await f.runs()).length, 0)
  } finally { await f.close() }
})
test('emulator: only the indicated new mail is read; old arrivals and delayed AI results are skipped', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await f.activate(); await f.deliver(); const [run] = await f.runs()
    f.clock(at + 302000); await f.handlers.process({ ...run, createdAt: at + 302000 })
    assert.equal(f.count(), 0)
    assert.equal(f.calls.filter(call => call.operation === 'message').length, 1)
    f.actor(profile); assert.deepEqual((await f.handlers.list(f.request({ messageIds: ['immutable'] }))).recommendations.immutable, [])
  } finally { await f.close() }
  let late
  const g = await fixture({ classify: async () => { late.clock(at + 302000); return ['tracking'] } }); late = g
  try {
    await g.activate(); await g.deliver(); await g.handlers.process((await g.runs())[0]); g.actor(profile)
    assert.deepEqual((await g.handlers.list(g.request({ messageIds: ['immutable'] }))).recommendations.immutable, [])
  } finally { await g.close() }
})
test('emulator: missed events and subscription maintenance never recover or list mailbox contents', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await f.activate(); await f.deliver({ lifecycleEvent: 'missed' })
    assert.equal((await f.runs()).length, 0)
    assert.equal((await f.db.doc(`mailboxRecommendationScopes/${f.scopeId}`).get()).data().state, 'missed')
    f.clock(at + 2.5 * 86400000); await f.handlers.maintain()
    assert.ok(f.calls.some(call => call.operation === 'renew'))
    assert.ok(f.calls.every(call => ['create', 'renew'].includes(call.operation)))
    await f.deliver({ lifecycleEvent: 'subscriptionRemoved' }); const [run] = await f.runs()
    assert.equal(run.type, 'renew'); await f.handlers.process(run)
    assert.equal(f.count(), 0); assert.ok(f.calls.every(call => ['create', 'renew'].includes(call.operation)))
  } finally { await f.close() }
})
test('emulator: disable invalidates notifications, deletes the subscription and blocks late results', { skip: !enabled }, async () => {
  let release, start
  const ready = new Promise(resolve => { start = resolve }), waiting = new Promise(resolve => { release = resolve })
  const f = await fixture({ classify: async () => { start(); await waiting; return ['tracking'] } })
  try {
    await f.activate(); await f.deliver(); const work = f.handlers.process((await f.runs())[0]); await ready
    await f.handlers.setSettings(f.request({ enabled: false })); release(); await work
    assert.ok(f.calls.some(call => call.operation === 'delete'))
    f.actor(profile); assert.deepEqual((await f.handlers.list(f.request({ messageIds: ['immutable'] }))).recommendations, {})
  } finally { release(); await f.close() }
})
test('emulator: already handled actions suppress an otherwise valid recommendation', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await f.activate(); await f.deliver()
    await f.db.doc(`mailboxActionScopes/${hash(`${f.other}|${f.c2}`)}/actions/${hash('immutable|tracking')}`).set({ state: 'completed' })
    await f.handlers.process((await f.runs())[0]); f.actor(profile)
    assert.deepEqual((await f.handlers.list(f.request({ messageIds: ['immutable'] }))).recommendations.immutable, [])
  } finally { await f.close() }
})
test('emulator: personal activation stays owned; missing shared application permission is visible', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const settings = await f.handlers.setSettings(f.request({ connectionId: f.parent, enabled: true }))
    assert.equal(settings.state, 'active'); assert.equal(settings.managed, false)
    f.actor({ active: true, role: 'superadmin' })
    await assert.rejects(f.handlers.setSettings(f.request({ connectionId: f.parent, enabled: false }, f.other)), { code: 'permission-denied' })
    await f.handlers.setSettings(f.request({ connectionId: f.parent, enabled: false }))
    await f.db.recursiveDelete(f.db.doc(`mailboxRecommendationScopes/${recommendationScope(f.personal)}`))
  } finally { await f.close() }
  const g = await fixture({ graph: async () => { const error = new Error('denied'); error.code = 'permission-denied'; throw error } })
  try { await g.activate(); g.actor(profile); assert.equal((await g.handlers.getSettings(g.request())).state, 'permission_required') }
  finally { await g.close() }
})
