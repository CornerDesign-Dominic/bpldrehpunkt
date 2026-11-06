import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomUUID, createHash } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createMailboxLearningHandlers, mailboxLearningScope } from './mailboxLearning.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const hash = value => createHash('sha256').update(value).digest('hex')
const at = Date.parse('2026-11-06T12:00:00Z')
async function fixture(overrides = {}) {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-mail-learning'
  assert.ok(projectId.startsWith('demo-'), 'Never run this integration against real Firebase')
  const suffix = randomUUID(), owner = `owner-${suffix}`, peer = `peer-${suffix}`, parent = hash(`parent-${suffix}`), connectionId = hash(`shared-${suffix}`), peerConnection = hash(`peer-${suffix}`)
  const app = initializeApp({ projectId }, suffix), db = getFirestore(app)
  const personal = { ownerId: owner, kind: 'personal', status: 'connected', graphUserId: `graph-${suffix}`, tenantId: 'tenant', email: `${suffix}@example.invalid` }
  const shared = { ownerId: owner, kind: 'shared', status: 'connected', graphUserId: `team-${suffix}@example.invalid`, tenantId: 'tenant', email: `team-${suffix}@example.invalid`, canonicalMailboxId: suffix, parentConnectionId: parent }
  await db.doc(`mailboxConnections/${parent}`).set(personal)
  await db.doc(`mailboxConnections/${connectionId}`).set(shared)
  await db.doc(`mailboxConnections/${peerConnection}`).set({ ...shared, ownerId: peer, parentConnectionId: `${parent}-peer` })
  await db.doc(`mailboxConnections/${parent}-peer`).set({ ...personal, ownerId: peer })
  await db.doc(`users/${owner}`).set({ active: true, role: 'user', permissions: { mailboxes: 'edit' } })
  await db.doc(`users/${peer}`).set({ active: true, role: 'user', permissions: { mailboxes: 'edit' } })
  const reply = { id: `reply-${suffix}`, internetMessageId: `<reply-${suffix}@example.invalid>`, from: { emailAddress: { address: shared.email } }, parentFolderId: 'sent-folder', isDraft: false, sentDateTime: new Date(at + 1000).toISOString(), body: { content: 'Das Fahrzeug kommt morgen um 14 Uhr.' }, internetMessageHeaders: [{ name: 'In-Reply-To', value: `<incoming-${suffix}@example.invalid>` }] }
  const incoming = { id: `incoming-${suffix}`, internetMessageId: `<incoming-${suffix}@example.invalid>`, parentFolderId: 'inbox-folder', isDraft: false, receivedDateTime: new Date(at - 1000).toISOString(), body: { content: 'Wann kommt das Fahrzeug?' } }
  let clock = at, captures = 0, actor = { active: true, role: 'admin' }
  const subscriptions = new Map(), calls = []
  const handlers = createMailboxLearningHandlers({ db, now: () => clock, project: 'db-bpl-drehpunkt-dev', tenantId: 'tenant', requireProfile: async () => actor, diagnostic: async () => {}, capture: async input => { captures++; assert.equal(input.incoming.id, incoming.id); assert.equal(input.reply.internetMessageId, reply.internetMessageId); return { captured: true } }, graph: async input => {
    calls.push(input)
    if (input.operation === 'learning-create') { const sub = randomUUID(); subscriptions.set(sub, input.data.clientState); return { id: sub, expirationDateTime: input.data.expirationDateTime } }
    if (input.operation === 'renew') return { id: input.subscriptionId, expirationDateTime: input.data.expirationDateTime }
    if (input.operation === 'delete') return null
    if (input.operation === 'learning-sent') return { message: { ...reply, id: input.messageId }, sentFolderId: 'sent-folder' }
    if (input.operation === 'learning-parents') return { value: [incoming] }
    throw new Error('Unexpected mailbox scan')
  }, ...overrides })
  const scopeId = mailboxLearningScope(shared)
  const request = data => ({ auth: { uid: owner }, data: { connectionId, ...data } })
  const deliver = async (messageId = reply.id) => {
    const saved = (await db.doc(`mailboxLearningScopes/${scopeId}`).get()).data()
    const response = { code: 0, set() { return this }, status(code) { this.code = code; return this }, send() { return this } }
    await handlers.webhook({ method: 'POST', query: {}, body: { value: [{ subscriptionId: saved.subscriptionId, clientState: subscriptions.get(saved.subscriptionId), tenantId: 'tenant', changeType: 'created', resourceData: { id: messageId } }] } }, response)
    return response
  }
  const runs = async () => (await db.collection('mailboxLearningRuns').where('scopeId', '==', scopeId).get()).docs.map(item => item.data())
  return { db, scopeId, connectionId, peerConnection, handlers, request, reply, calls, runs, deliver, captures: () => captures, actor: value => { actor = value }, clock: value => { clock = value }, async close() {
    await db.recursiveDelete(db.doc(`mailboxLearningScopes/${scopeId}`))
    const runDocs = await db.collection('mailboxLearningRuns').where('scopeId', '==', scopeId).get()
    for (const item of runDocs.docs) await item.ref.delete()
    const subDocs = await db.collection('mailboxLearningSubscriptions').where('scopeId', '==', scopeId).get()
    for (const item of subDocs.docs) await item.ref.delete()
    await Promise.all([parent, `${parent}-peer`, connectionId, peerConnection].map(id => db.doc(`mailboxConnections/${id}`).delete()))
    await Promise.all([owner, peer].map(id => db.doc(`users/${id}`).delete()))
    await db.terminate(); await deleteApp(app)
  } }
}

test('emulator: shared SentItems opt-in is independent and concurrent deliveries capture one reply across delegates', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await f.handlers.setSettings(f.request({ enabled: true }))
    await f.handlers.setSettings(f.request({ connectionId: f.peerConnection, enabled: true }))
    assert.equal(f.calls.filter(call => call.operation === 'learning-create').length, 1)
    f.clock(at + 2000)
    await Promise.all([f.deliver(), f.deliver()])
    const runs = await f.runs(); assert.equal(runs.length, 1)
    await Promise.all([f.handlers.process(runs[0]), f.handlers.process(runs[0])])
    assert.equal(f.captures(), 1)
    // Same RFC sent message copied under another Graph ID is not a second case.
    await f.deliver(`copy-${f.reply.id}`); await Promise.all((await f.runs()).map(f.handlers.process))
    assert.equal(f.captures(), 1)
    assert.equal((await f.handlers.getSettings(f.request())).lastCapturedAt, at + 2000)
    assert.equal((await f.db.collection('mailboxRecommendationScopes').where('connectionId', '==', f.connectionId).get()).size, 0)
  } finally { await f.close() }
})

test('emulator: disabled learning invalidates queued new replies without scanning or collecting old mail', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await f.handlers.setSettings(f.request({ enabled: true })); f.clock(at + 2000); await f.deliver()
    const [run] = await f.runs()
    await f.handlers.setSettings(f.request({ enabled: false }))
    await f.handlers.process(run)
    assert.equal(f.captures(), 0)
    assert.ok(f.calls.every(call => ['learning-create', 'delete'].includes(call.operation)))
    f.actor({ active: true, role: 'user', permissions: { mailboxes: 'edit' } })
    await assert.rejects(f.handlers.setSettings(f.request({ enabled: true })), { code: 'permission-denied' })
  } finally { await f.close() }
})
