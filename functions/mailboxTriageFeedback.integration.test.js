import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import process from 'node:process'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createMailboxTriageFeedbackHandlers } from './mailboxTriageFeedback.js'
import { recommendationScope } from './mailboxRecommendations.js'

test('triage feedback atomically persists, reviews and cleans up without reviving dismissed recommendations', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-triage'
  assert.ok(projectId.startsWith('demo-'), 'integration test must never use a real project')
  const app = initializeApp({ projectId }, `triage-feedback-${randomUUID()}`), db = getFirestore(app)
  const hash = value => createHash('sha256').update(value).digest('hex')
  const uid = `triage-${randomUUID()}`, connectionId = hash(uid), messageId = 'synthetic-private-graph-id'
  const connection = { ownerId: uid, status: 'connected', kind: 'personal', tenantId: 'synthetic-tenant', graphUserId: uid, email: 'synthetic@example.invalid' }
  const scopeId = recommendationScope(connection)
  const userRef = db.doc(`users/${uid}`), connectionRef = db.doc(`mailboxConnections/${connectionId}`), scopeRef = db.doc(`mailboxRecommendationScopes/${scopeId}`)
  const messageRef = scopeRef.collection('messages').doc(hash(messageId)), stateRef = db.doc(`mailboxTriageFeedbackStates/${hash(`${uid}|${connectionId}|${messageId}`)}`)
  const refs = [userRef, connectionRef, scopeRef, messageRef, stateRef]
  const profile = { active: true, role: 'user', permissions: { mailboxes: 'edit', todos: 'edit', mailTriageQuality: 'edit', mailTriageCleanup: 'edit' } }
  const request = data => ({ auth: { uid }, data })
  const handlers = createMailboxTriageFeedbackHandlers({ db, project: 'db-bpl-drehpunkt-dev', requireProfile: async () => (await userRef.get()).data(), diagnostic: async () => {} })
  try {
    await Promise.all([userRef.set(profile), connectionRef.set(connection), scopeRef.set({ enabled: true, generation: 'one' }), messageRef.set({ state: 'completed', generation: 'one', kinds: ['todo'], subject: 'Synthetischer Test', decision: { id: hash('decision'), version: 1, status: 'actionable', answers: [], actions: [{ kind: 'todo', confidence: 'high', reason: 'Aufgabe', sourceId: 'body', quote: 'Bitte Unterlagen senden.' }], coverage: { mail: true, forwarded: false, attachments: 'not_present', documentNames: [], unreadable: [] } } })])
    const submission = request({ connectionId, messageId, kind: 'todo', outcome: 'rejected', reason: 'already_done', decisionId: hash('decision') })
    const [first, retry] = await Promise.all([handlers.submit(submission), handlers.submit(submission)])
    assert.deepEqual(first, retry)
    const feedbackRef = db.doc(`mailboxTriageFeedback/${first.feedbackId}`)
    refs.push(feedbackRef)
    assert.equal((await feedbackRef.get()).data().revision, 1)
    assert.deepEqual((await stateRef.get()).data().dismissedKinds, ['todo'])
    const changed = await handlers.update(request({ id: first.feedbackId, revision: 1, status: 'verified', reviewNote: 'Synthetisch geprüft' }))
    assert.equal(changed.item.revision, 2)
    await assert.rejects(handlers.remove(request({ items: [{ id: first.feedbackId, revision: 1 }] })), error => error.code === 'aborted')
    await handlers.remove(request({ items: [{ id: first.feedbackId, revision: 2 }] }))
    assert.equal((await feedbackRef.get()).exists, false)
    await handlers.submit(submission)
    assert.equal((await feedbackRef.get()).exists, false)
    assert.deepEqual((await stateRef.get()).data().dismissedKinds, ['todo'])
  } finally {
    await Promise.all(refs.map(ref => ref.delete()))
    await deleteApp(app)
  }
})
