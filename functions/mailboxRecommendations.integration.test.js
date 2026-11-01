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
  let actor = profile, clock = at, count = 0
  const handlers = createRecommendationHandlers({ db, project: 'db-bpl-drehpunkt-dev', now: () => clock, requireProfile: async () => actor, classify: async () => { count++; return ['tracking'] }, readInbox: async () => ({ messages: [{ id: 'immutable', subject: 'Status', body: { contentType: 'text', content: 'Ankunft 18 Uhr' }, receivedDateTime: new Date(at + 1000).toISOString() }] }), ...overrides })
  return { db, uid, other, c1, c2, parent, personal, shared, handlers, scopeId: recommendationScope(shared), actor: value => { actor = value }, clock: value => { clock = value }, count: () => count, request: (data = {}, owner = uid) => ({ auth: { uid: owner }, data: { connectionId: c1, ...data } }), async close() { await db.recursiveDelete(db.doc(`mailboxRecommendationScopes/${recommendationScope(shared)}`)); for (const id of [parent, c1, c2, `${parent}-other`]) await db.doc(`mailboxConnections/${id}`).delete(); await db.terminate(); await deleteApp(app) } }
}
test('emulator: only admins toggle shared mailboxes; duplicate delegates see one durable classification', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await assert.rejects(f.handlers.setSettings(f.request({ enabled: true })), { code: 'permission-denied' })
    f.actor({ active: true, role: 'admin' })
    await f.handlers.setSettings(f.request({ enabled: true }))
    const listing = await f.handlers.listManaged(f.request())
    assert.equal(listing.mailboxes.filter(row => row.email === f.shared.email).length, 1)
    await Promise.all([f.handlers.process({ scopeId: f.scopeId }), f.handlers.process({ scopeId: f.scopeId })])
    f.actor(profile)
    const first = await f.handlers.list(f.request({ messageIds: ['immutable'] }))
    const second = await f.handlers.list(f.request({ connectionId: f.c2, messageIds: ['immutable'] }, f.other))
    assert.deepEqual(first, second); assert.deepEqual(first.recommendations.immutable, ['tracking'])
    await f.handlers.process({ scopeId: f.scopeId })
    assert.equal(f.count(), 1)
    await assert.rejects(f.handlers.list(f.request({ connectionId: f.c2, messageIds: ['immutable'] })), { code: 'permission-denied' })
  } finally { await f.close() }
})
test('emulator: personal opt-in is owned; admin cannot activate another personal account', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const own = await f.handlers.setSettings(f.request({ connectionId: f.parent, enabled: true }))
    assert.equal(own.enabled, true); assert.equal(own.managed, false)
    f.actor({ active: true, role: 'superadmin' })
    await assert.rejects(f.handlers.setSettings(f.request({ connectionId: f.parent, enabled: false }, f.other)), { code: 'permission-denied' })
    await f.db.recursiveDelete(f.db.doc(`mailboxRecommendationScopes/${recommendationScope(f.personal)}`))
  } finally { await f.close() }
})
test('emulator: disabling during an AI request prevents late recommendations being published', { skip: !enabled }, async () => {
  let release, started
  const ready = new Promise(resolve => { started = resolve })
  const pending = new Promise(resolve => { release = resolve })
  const f = await fixture({ classify: async () => { started(); await pending; return ['tracking'] } })
  try {
    f.actor({ active: true, role: 'admin' }); await f.handlers.setSettings(f.request({ enabled: true }))
    const work = f.handlers.process({ scopeId: f.scopeId }); await ready
    await f.handlers.setSettings(f.request({ enabled: false })); release(); await work
    f.actor(profile)
    assert.deepEqual(await f.handlers.list(f.request({ messageIds: ['immutable'] })), { enabled: false, recommendations: {} })
  } finally { release(); await f.close() }
})
test('emulator: shared worker falls back to another delegate without changing the central result', { skip: !enabled }, async () => {
  let reads = 0
  const f = await fixture({ readInbox: async () => { if (++reads === 1) throw new Error('Expired delegate'); return { messages: [] } } })
  try {
    f.actor({ active: true, role: 'admin' }); await f.handlers.setSettings(f.request({ enabled: true }))
    await f.handlers.process({ scopeId: f.scopeId })
    assert.equal(reads, 2)
    assert.equal((await f.db.doc(`mailboxRecommendationScopes/${f.scopeId}`).get()).data().state, 'active')
  } finally { await f.close() }
})
test('emulator: pre-activation mail is ignored; failed classification retries stop after three attempts', { skip: !enabled }, async () => {
  let attempts = 0
  const f = await fixture({ readInbox: async () => ({ messages: [{ id: 'old', receivedDateTime: new Date(at - 1).toISOString() }, { id: 'new', receivedDateTime: new Date(at + 1).toISOString() }] }), classify: async () => { attempts++; throw new Error('Synthetic provider failure') } })
  try {
    f.actor({ active: true, role: 'admin' }); await f.handlers.setSettings(f.request({ enabled: true }))
    for (let i = 0; i < 5; i++) await f.handlers.process({ scopeId: f.scopeId })
    assert.equal(attempts, 3)
    assert.equal((await f.db.doc(`mailboxRecommendationScopes/${f.scopeId}/messages/${hash('old')}`).get()).exists, false)
    f.actor(profile); assert.deepEqual((await f.handlers.list(f.request({ messageIds: ['new'] }))).recommendations.new, [])
  } finally { await f.close() }
})

test('emulator: pagination resumes and does not repeat successful AI work; reactivation starts a fresh window', { skip: !enabled }, async () => {
  let requests = []
  const f = await fixture({ readInbox: async ({ cursor }) => {
    requests.push(cursor)
    return cursor ? { messages: [{ id: 'second', receivedDateTime: new Date(at + 2000).toISOString() }], nextPath: null } : { messages: [{ id: 'first', receivedDateTime: new Date(at + 1000).toISOString() }], nextPath: '/me/mailFolders/inbox/messages?$skip=10' }
  } })
  try {
    f.actor({ active: true, role: 'admin' }); await f.handlers.setSettings(f.request({ enabled: true }))
    await f.handlers.process({ scopeId: f.scopeId }); await f.handlers.process({ scopeId: f.scopeId })
    assert.ok(requests[1].includes('$skip=10')); assert.equal(f.count(), 2)
    const after = (await f.db.doc(`mailboxRecommendationScopes/${f.scopeId}`).get()).data()
    assert.equal(after.watermark, at + 2000)
    await f.handlers.setSettings(f.request({ enabled: false }))
    const beforeReads = requests.length; await f.handlers.process({ scopeId: f.scopeId }); assert.equal(requests.length, beforeReads)
    f.clock(at + 4000); await f.handlers.setSettings(f.request({ enabled: true }))
    f.actor(profile)
    assert.deepEqual((await f.handlers.list(f.request({ messageIds: ['first', 'second'] }))).recommendations, { first: [], second: [] })
  } finally { await f.close() }
})
