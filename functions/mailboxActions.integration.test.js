import assert from 'node:assert/strict'
import process from 'node:process'
import { randomUUID, createHash } from 'node:crypto'
import test from 'node:test'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createMailboxActionHandlers } from './mailboxActions.js'
import { previewPersonalMailTracking, applyPersonalMailTracking } from './personalMailTracking.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const profile = { active: true, firstName: 'Emulator', role: 'user', permissions: { mailboxes: 'edit', transportOrders: 'edit', masterData: 'view', agbChecker: 'view' } }
async function fixture() {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-mail-actions-worker'
  assert.ok(projectId.startsWith('demo-'), 'Never run mailbox job integration against real Firebase')
  const suffix = randomUUID(), uid = `owner-${suffix}`, connectionId = createHash('sha256').update(suffix).digest('hex')
  const app = initializeApp({ projectId }, `job-${suffix}`), db = getFirestore(app)
  await db.doc(`mailboxConnections/${connectionId}`).set({ ownerId: uid, status: 'connected', graphUserId: 'graph', tenantId: 'tenant' })
  const request = data => ({ auth: { uid }, data: { connectionId, messageId: `message-${suffix}`, kind: 'order', ...data } })
  const handlers = createMailboxActionHandlers({ db, project: 'db-bpl-drehpunkt-dev', requireProfile: async () => profile, handlers: { previewMailboxOrder: async () => ({ customer: 'Synthetic' }), analyzeMailboxAgb: async () => ({ historyId: 'synthetic-history' }) } })
  return { app, db, uid, suffix, connectionId, request, handlers, async close() { await db.terminate(); await deleteApp(app) } }
}

test('emulator: concurrent starts and duplicate Firestore deliveries produce one persistent result', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const responses = await Promise.all(Array.from({ length: 4 }, () => f.handlers.startMailboxAction(f.request())))
    assert.equal(new Set(responses.map(result => result.action.jobId)).size, 1)
    const jobId = responses[0].action.jobId
    await Promise.all(Array.from({ length: 3 }, () => f.handlers.processMailboxActionRun(jobId)))
    const finished = (await f.handlers.getMailboxAction(f.request())).action
    assert.equal(finished.state, 'review'); assert.equal(finished.result.customer, 'Synthetic')
    const list = await f.handlers.listMailboxActions(f.request({ messageIds: [f.request().data.messageId] }))
    assert.equal(list.actions.length, 1); assert.equal('result' in list.actions[0], false)
    await f.handlers.updateMailboxAction(f.request({ action: 'discard', jobId }))
    const cleared = await f.handlers.getMailboxAction(f.request())
    assert.equal(cleared.action.state, 'discarded'); assert.equal(cleared.action.result, null)
    const second = await f.handlers.startMailboxAction(f.request()); assert.notEqual(second.action.jobId, jobId)
  } finally { await f.close() }
})

test('emulator: a queued tracking result survives reload and apply versus discard is serializable', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const orderNumber = `8${String(Date.now()).slice(-8)}`, orderId = `order-${f.suffix}`
    await f.db.doc(`transportOrders/${orderId}`).set({ externalNumber: orderNumber, imported: { loading: { city: 'Hamburg' }, unloading: { city: 'Berlin' } } })
    const context = { uid: f.uid, profile, connectionId: f.connectionId, connection: { graphUserId: 'graph', tenantId: 'tenant' }, ref: f.db.doc(`mailboxConnections/${f.connectionId}`) }
    const mail = { id: f.request().data.messageId, subject: `TA ${orderNumber}`, receivedDateTime: '2026-10-30T10:00:00Z', body: { contentType: 'text', content: 'Kennzeichen W-AB 123.' } }
    const handlers = createMailboxActionHandlers({ db: f.db, project: 'db-bpl-drehpunkt-dev', requireProfile: async () => profile, handlers: { previewMailboxTracking: async () => previewPersonalMailTracking({ db: f.db, context, mail, orderNumber, inferOrder: async () => ({ candidates: [] }), infer: async () => ({ isStatusUpdate: true, reviewRequired: false, reviewReason: '', updates: [{ field: 'licensePlate', value: 'W-AB 123', evidence: 'Kennzeichen W-AB 123', confidence: 'high' }], transitUpdates: [], pauseUpdates: [] }) }) } })
    const { action } = await handlers.startMailboxAction(f.request({ kind: 'tracking' }))
    await handlers.processMailboxActionRun(action.jobId)
    const restored = (await handlers.getMailboxAction(f.request({ kind: 'tracking' }))).action
    assert.equal(restored.state, 'review'); assert.equal(restored.result.proposals.licensePlate, 'W-AB 123'); assert.equal(restored.result.expiresAt, Number.MAX_SAFE_INTEGER)
    const [applied, discarded] = await Promise.allSettled([
      applyPersonalMailTracking({ db: f.db, context, previewId: restored.result.previewId, changes: restored.result.proposals }),
      handlers.updateMailboxAction(f.request({ kind: 'tracking', action: 'discard', jobId: action.jobId })),
    ])
    assert.notEqual(applied.status, discarded.status, 'Exactly one of confirmation and discard can succeed')
    const final = (await handlers.getMailboxAction(f.request({ kind: 'tracking' }))).action
    if (applied.status === 'fulfilled') {
      assert.equal(final.state, 'completed'); assert.equal(final.result.appliedChanges.licensePlate, 'W-AB 123')
    } else {
      assert.equal(final.state, 'discarded'); assert.equal((await f.db.doc(`transportOrderTrackings/${orderId}`).get()).exists, false)
    }
  } finally { await f.close() }
})


test('emulator: shared invoice results await manual completion and peers can complete and reopen the same result', { skip: !enabled }, async () => {
  const f = await fixture()
  const second = createHash('sha256').update(`peer-${f.suffix}`).digest('hex'), scopeId = createHash('sha256').update(`scope-${f.suffix}`).digest('hex')
  try {
    const canonicalMailboxId = `canonical-${f.suffix}`
    for (const [id, ownerId] of [[f.connectionId, f.uid], [second, `peer-${f.uid}`]]) await f.db.doc(`mailboxConnections/${id}`).set({ ownerId, kind: 'personal', email: 'rechnung@brennpunkt-logistik.de', status: 'connected', graphUserId: canonicalMailboxId, tenantId: 'tenant', canonicalMailboxId })
    await f.db.doc(`mailboxRecommendationScopes/${scopeId}`).set({ enabled: true, mode: 'automatic', generation: f.suffix, kind: 'shared', tenantId: 'tenant', canonicalMailboxId })
    let calls = 0
    const handlers = createMailboxActionHandlers({ db: f.db, project: 'db-bpl-drehpunkt-dev', requireProfile: async () => profile, handlers: { reviewMailboxInvoices: async () => { calls++; return { reportId: 'synthetic-shared-report' } } } })
    const automatic = { scopeId, generation: f.suffix, connections: [{ id: f.connectionId, ownerId: f.uid }], messageId: f.request().data.messageId, kinds: ['invoice', 'order'] }
    const peerRequest = f.request({ connectionId: second, kind: 'invoice' }); peerRequest.auth.uid = `peer-${f.uid}`
    const [auto, manual] = await Promise.all([handlers.startAutomaticMailboxActions(automatic), handlers.startMailboxAction(peerRequest)])
    assert.equal(auto.actions.length, 1)
    assert.equal(auto.actions[0].jobId, manual.action.jobId)
    await Promise.all([handlers.processMailboxActionRun(manual.action.jobId), handlers.processMailboxActionRun(manual.action.jobId)])
    assert.equal(calls, 1)
    const peer = (await handlers.getMailboxAction(peerRequest)).action
    assert.equal(peer.state, 'review'); assert.equal(peer.result.reportId, 'synthetic-shared-report'); assert.equal(peer.connectionId, second)
    const original = (await handlers.getMailboxAction(f.request({ kind: 'invoice' }))).action
    assert.equal(original.jobId, peer.jobId)
    assert.equal(original.state, 'review')
    const completeRequest = { ...peerRequest, data: { ...peerRequest.data, action: 'complete', jobId: peer.jobId } }
    const confirmations = await Promise.all([handlers.updateMailboxAction(completeRequest), handlers.updateMailboxAction(completeRequest)])
    assert.ok(confirmations.every(result => result.action.state === 'completed'))
    assert.deepEqual(confirmations[0].action.completion, confirmations[1].action.completion, 'Repeated confirmation must keep the first server receipt')
    const completed = (await handlers.getMailboxAction(f.request({ kind: 'invoice' }))).action
    assert.equal(completed.state, 'completed')
    assert.equal(completed.completion.invoiceReviewed, true)
    assert.equal(completed.completion.actorId, peerRequest.auth.uid)
    assert.deepEqual(completed.result, peer.result)
    const reopened = (await handlers.updateMailboxAction(f.request({ kind: 'invoice', action: 'reopen', jobId: completed.jobId }))).action
    assert.equal(reopened.state, 'review')
    assert.equal(reopened.completion, null)
    const peerReloaded = (await handlers.getMailboxAction(peerRequest)).action
    assert.equal(peerReloaded.state, 'review')
    assert.equal(peerReloaded.jobId, peer.jobId)
    assert.deepEqual(peerReloaded.result, peer.result)
    assert.equal(calls, 1, 'Status changes do not rerun invoice analysis')
  } finally {
    await Promise.all([f.db.doc(`mailboxConnections/${f.connectionId}`).delete(), f.db.doc(`mailboxConnections/${second}`).delete(), f.db.doc(`mailboxRecommendationScopes/${scopeId}`).delete()])
    await f.close()
  }
})
