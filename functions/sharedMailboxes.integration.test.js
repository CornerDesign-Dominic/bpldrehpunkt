import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomUUID, createHash } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createMailboxHandlers } from './mailboxes.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const hash = value => createHash('sha256').update(value).digest('hex')
const email = 'synthetic-shared@brennpunkt-logistik.de'
async function fixture(overrides = {}) {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-shared-mailboxes'
  assert.ok(projectId.startsWith('demo-'), 'Never run against a real Firebase project')
  const uid = randomUUID(), connectionId = hash(uid)
  const app = initializeApp({ projectId }, uid), db = getFirestore(app)
  const parent = db.doc(`mailboxConnections/${connectionId}`)
  await parent.set({ ownerId: uid, kind: 'personal', status: 'connected', sharedAccess: true, email: 'synthetic-user@brennpunkt-logistik.de', secretName: 'synthetic-secret', secretVersion: 'synthetic/v1' })
  const removed = []
  const deps = { db, config: { project: 'db-bpl-drehpunkt-dev', secret: 'synthetic' }, requireProfile: async () => ({ active: true, role: 'user', permissions: { mailboxes: 'edit' } }), diagnostic: async () => {}, secrets: { read: async () => ({ accessToken: 'synthetic', expiresAt: Date.now() + 1000000 }), remove: async name => removed.push(name) }, fetch: async () => ({ ok: true, status: 200, json: async () => ({ id: 'inbox' }) }), ...overrides }
  return { uid, connectionId, db, parent, removed, deps, handlers: createMailboxHandlers(deps), request: data => ({ auth: { uid }, data: { connectionId, ...data } }), async close() { await db.terminate(); await deleteApp(app) } }
}

test('emulator: duplicate additions persist one child and parent disconnect atomically disables only its own children', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const added = await Promise.all([f.handlers.addSharedMailbox(f.request({ email })), f.handlers.addSharedMailbox(f.request({ email }))])
    assert.equal(added[0].connectionId, added[1].connectionId)
    const childRef = f.db.doc(`mailboxConnections/${added[0].connectionId}`)
    assert.equal((await childRef.get()).data().secretVersion, undefined)
    const unrelated = f.db.doc(`mailboxConnections/${hash('other-' + f.uid)}`)
    await unrelated.set({ ownerId: 'someone-else', kind: 'personal', status: 'connected' })
    await f.handlers.disconnectMailbox(f.request({}))
    assert.equal((await f.parent.get()).data().status, 'disconnected')
    assert.equal((await childRef.get()).data().status, 'disconnected')
    assert.equal((await unrelated.get()).data().status, 'connected')
    assert.deepEqual(f.removed, ['synthetic-secret'])
    await assert.rejects(f.handlers.getMailboxMessage(f.request({ connectionId: childRef.id, messageId: 'synthetic-message' })))
  } finally { await f.close() }
})

test('emulator: disconnect during the access probe prevents a late shared connection from becoming usable', { skip: !enabled }, async () => {
  let entered, finish
  const started = new Promise(resolve => { entered = resolve })
  const f = await fixture({ fetch: async () => { entered(); return new Promise(resolve => { finish = () => resolve({ ok: true, status: 200, json: async () => ({ id: 'inbox' }) }) }) } })
  try {
    const pending = f.handlers.addSharedMailbox(f.request({ email }))
    await started
    await f.handlers.disconnectMailbox(f.request({}))
    finish()
    await assert.rejects(pending, { code: 'aborted' })
    const children = await f.db.collection('mailboxConnections').where('parentConnectionId', '==', f.connectionId).get()
    assert.equal(children.empty, true)
  } finally { await f.close() }
})

test('emulator: personal and shared drafts stay isolated and removing a child leaves the credential usable', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const child = (await f.handlers.addSharedMailbox(f.request({ email }))).connectionId
    const draft = { body: 'Personal draft', toRecipients: ['test@brennpunkt-logistik.de'], ccRecipients: [], bccRecipients: [], revision: 0 }
    await f.handlers.saveMailboxDraft(f.request({ messageId: 'same-id', draft }))
    await f.handlers.saveMailboxDraft(f.request({ connectionId: child, messageId: 'same-id', draft: { ...draft, body: 'Shared draft' } }))
    assert.equal((await f.handlers.getMailboxDraft(f.request({ messageId: 'same-id' }))).draft.body, 'Personal draft')
    assert.equal((await f.handlers.getMailboxDraft(f.request({ connectionId: child, messageId: 'same-id' }))).draft.body, 'Shared draft')
    await f.handlers.disconnectMailbox(f.request({ connectionId: child }))
    assert.equal((await f.parent.get()).data().status, 'connected')
    assert.deepEqual(f.removed, [])
  } finally { await f.close() }
})
