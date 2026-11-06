import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { createHash, randomUUID } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { captureSentMailboxLearning } from './mailboxSentLearning.js'
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const hash = value => createHash('sha256').update(value).digest('hex')
const at = Date.parse('2026-11-06T12:00:00Z')
async function fixture(shared = false) {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-mail-learning'
  assert.ok(projectId.startsWith('demo-'))
  const suffix = randomUUID(), scopeId = hash(suffix), id = hash('connection' + suffix), ownerId = 'owner-' + suffix, articleId = 'article-' + suffix
  const app = initializeApp({ projectId }, suffix), db = getFirestore(app)
  const connection = { id, ownerId, kind: 'personal', status: 'connected', tenantId: 'tenant', email: shared ? 'rechnung@brennpunkt-logistik.de' : 'personal@example.invalid', graphUserId: 'graph', ...(shared ? { canonicalMailboxId: suffix } : {}) }
  const scope = { enabled: true, generation: suffix, since: at - 1000, kind: shared ? 'shared' : 'personal', connectionId: id, ownerId: shared ? null : ownerId, tenantId: 'tenant', canonicalMailboxId: shared ? suffix : null }
  await db.doc(`users/${ownerId}`).set({ active: true, role: 'user', permissions: { mailboxes: 'edit' } })
  await db.doc(`mailboxConnections/${id}`).set(connection)
  await db.doc(`mailboxLearningScopes/${scopeId}`).set(scope)
  await db.doc(`knowledgeArticles/${articleId}`).set({ title: 'Status mitteilen', process: 'Transport', status: 'valid', revision: 1 })
  const selection = { sources: [{ id: articleId, kind: 'article', revision: 1, title: 'Status mitteilen' }], coverage: 'full', gap: null, senderRole: 'carrier', recipientRole: 'internal' }
  let calls = 0
  const input = { db, scopeId, generation: suffix, connection, incoming: { id: 'in-' + suffix, body: { content: 'Hallo Frau Müller, der LKW ist angekommen.\n\nMit freundlichen Grüßen\nFahrer' } }, reply: { id: 'sent-' + suffix, internetMessageId: `<${suffix}@example.invalid>`, isDraft: false, sentDateTime: new Date(at).toISOString(), body: { content: 'Vielen Dank, wir haben die Ankunft eingetragen.\n\nMit freundlichen Grüßen\nDispo' } }, now: at, select: async () => { calls++; return selection } }
  return { db, input, connection, scopeId, articleId, selection, calls: () => calls, async close() {
    const cases = await db.collection('knowledgeGapEvidence').where('learningScopeId', '==', scopeId).get()
    for (const item of cases.docs) { await item.ref.delete(); await db.doc(`knowledgeGapOccurrences/${item.id}`).delete() }
    await Promise.all([db.doc(`knowledgeGaps/article-${articleId}`).delete(), db.doc(`knowledgeArticles/${articleId}`).delete(), db.doc(`mailboxLearningScopes/${scopeId}`).delete(), db.doc(`mailboxConnections/${id}`).delete(), db.doc(`users/${ownerId}`).delete()])
    await db.terminate(); await deleteApp(app)
  } }
}

test('emulator: sent cases use existing cleaning, real answer only, and one case per sent reply', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    const [a, b] = await Promise.all([captureSentMailboxLearning(f.input), captureSentMailboxLearning(f.input)])
    assert.equal([a,b].filter(value => value.captured).length, 1)
    const record = (await f.db.doc(`knowledgeGapEvidence/${a.evidenceId}`).get()).data()
    assert.equal(record.sendStatus, 'accepted'); assert.equal(record.latestSuggestion, '')
    assert.equal(record.sentReply, 'Vielen Dank, wir haben die Ankunft eingetragen.')
    assert.match(record.incomingText, /Frau Müller/)
    assert.ok(!record.incomingText.includes('Fahrer'))
    assert.equal(record.sourceArticleId, f.articleId)
    await captureSentMailboxLearning({ ...f.input, reply: { ...f.input.reply, id: 'second', internetMessageId: '<second-' + f.scopeId + '@example.invalid>' } })
    assert.equal((await f.db.doc(`knowledgeGaps/article-${f.articleId}`).get()).data().count, 2)
    await f.db.doc(`knowledgeGapEvidence/${a.evidenceId}`).update({ removed: true, sentReply: '' })
    assert.equal((await captureSentMailboxLearning(f.input)).captured, false)
    assert.equal((await f.db.doc(`knowledgeGapEvidence/${a.evidenceId}`).get()).data().sentReply, '')
  } finally { await f.close() }
})

test('emulator: disabled scopes and drafts cannot create cases and late disable blocks capture', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await assert.rejects(captureSentMailboxLearning({ ...f.input, reply: { ...f.input.reply, isDraft: true } }), { code: 'invalid-argument' })
    await f.db.doc(`mailboxLearningScopes/${f.scopeId}`).update({ enabled: false })
    assert.equal((await captureSentMailboxLearning(f.input)).skipped, true); assert.equal(f.calls(), 0)
    await f.db.doc(`mailboxLearningScopes/${f.scopeId}`).update({ enabled: true })
    assert.equal((await captureSentMailboxLearning({ ...f.input, select: async () => { await f.db.doc(`mailboxLearningScopes/${f.scopeId}`).update({ enabled: false }); return f.selection } })).skipped, true)
    assert.equal((await f.db.collection('knowledgeGapEvidence').where('learningScopeId', '==', f.scopeId).get()).size, 0)
  } finally { await f.close() }
})

test('emulator: shared mailbox copies deduplicate across users and reject foreign mailbox bindings', { skip: !enabled }, async () => {
  const f = await fixture(true), peerId = hash('peer-' + f.scopeId), peerOwner = 'peer-' + f.scopeId
  try {
    await f.db.doc(`users/${peerOwner}`).set({ active: true, role: 'user', permissions: { mailboxes: 'edit' } })
    const peer = { ...f.connection, id: peerId, ownerId: peerOwner }
    await f.db.doc(`mailboxConnections/${peerId}`).set(peer)
    const results = await Promise.all([captureSentMailboxLearning(f.input), captureSentMailboxLearning({ ...f.input, connection: peer })])
    assert.equal(results.filter(value => value.captured).length, 1)
    await f.db.doc(`mailboxConnections/${peerId}`).update({ tenantId: 'foreign' })
    await assert.rejects(captureSentMailboxLearning({ ...f.input, connection: peer, reply: { ...f.input.reply, id: 'other', internetMessageId: '<other@example.invalid>' } }), { code: 'permission-denied' })
  } finally {
    await Promise.all([f.db.doc(`mailboxConnections/${peerId}`).delete(), f.db.doc(`users/${peerOwner}`).delete()]); await f.close()
  }
})

test('emulator: revoked users and changed article revisions prevent a stale learning assignment', { skip: !enabled }, async () => {
  const f = await fixture()
  try {
    await f.db.doc(`users/${f.connection.ownerId}`).update({ active: false })
    await assert.rejects(captureSentMailboxLearning(f.input), { code: 'permission-denied' }); assert.equal(f.calls(), 0)
    await f.db.doc(`users/${f.connection.ownerId}`).update({ active: true })
    await assert.rejects(captureSentMailboxLearning({ ...f.input, select: async () => { await f.db.doc(`knowledgeArticles/${f.articleId}`).update({ revision: 2 }); return f.selection } }), { code: 'aborted' })
    assert.equal((await f.db.collection('knowledgeGapEvidence').where('learningScopeId', '==', f.scopeId).get()).size, 0)
  } finally { await f.close() }
})
