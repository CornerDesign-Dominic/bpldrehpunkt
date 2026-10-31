import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { loadReplyKnowledge, recordReplyKnowledgeGap } from './knowledgeReply.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
test('real transactions deduplicate concurrent demand and only retrieve published knowledge', { skip: !enabled }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-knowledge'
  assert.match(projectId, /^demo-/u)
  const app = initializeApp({ projectId }, `knowledge-reply-${Date.now()}`)
  const db = getFirestore(app)
  const uid = `reply-test-${Date.now()}`
  const profile = { active: true, role: 'user', permissions: { handbook: 'view', mailboxes: 'edit' } }
  const refs = []
  try {
    await db.doc(`users/${uid}`).set(profile)
    for (const [suffix, status] of [['valid', 'valid'], ['draft', 'draft'], ['archived', 'archived']]) {
      const ref = db.doc(`knowledgeArticles/${uid}-${suffix}`); refs.push(ref)
      await ref.set({ title: `Status ${status}`, process: 'Transport', revision: 1, status })
    }
    const catalog = await loadReplyKnowledge(db, profile)
    assert.equal(catalog.articles.some(item => item.id === `${uid}-valid`), true)
    assert.equal(catalog.articles.some(item => item.id === `${uid}-draft`), false)
    assert.equal(catalog.articles.some(item => item.id === `${uid}-archived`), false)
    const input = (messageId, suggestion = 'KI Antwortentwurf') => ({ db, profile, suggestion, context: { uid, connectionId: 'private-connection' }, mail: { id: messageId, body: { content: 'Secret body and sender data' } }, catalog, selection: { coverage: 'none', limited: false, gap: { existingGapId: '', intentKey: 'bank_details_change', missingAspect: 'checks' } } })
    // The category may already exist from another suite; compare deltas rather than assume empty global data.
    const first = await recordReplyKnowledgeGap(input(`${uid}-first`))
    const baseline = first.count
    const repeat = await Promise.all(Array.from({ length: 4 }, () => recordReplyKnowledgeGap(input(`${uid}-repeat`))))
    assert.equal(repeat.filter(item => !item.alreadyCounted).length, 1)
    const captured = await recordReplyKnowledgeGap(input(`${uid}-repeat`, 'Neuester KI Antwortentwurf'))
    const evidenceRef = db.doc(`knowledgeGapEvidence/${captured.evidenceId}`)
    const evidence = await evidenceRef.get()
    assert.equal(evidence.get('latestSuggestion'), 'Neuester KI Antwortentwurf')
    assert.equal(evidence.get('sendStatus'), 'draft')
    assert.equal(evidence.get('gapId'), first.id)
    assert.equal(JSON.stringify(evidence.data()).includes('Secret body'), false)
    await evidenceRef.update({ sentReply: 'Exakter menschlicher Antworttext', sentAt: null, sendStatus: 'unknown' })
    await recordReplyKnowledgeGap(input(`${uid}-repeat`, 'Weiterer KI Entwurf'))
    const preserved = await evidenceRef.get()
    assert.equal(preserved.get('latestSuggestion'), 'Weiterer KI Entwurf')
    assert.equal(preserved.get('sentReply'), 'Exakter menschlicher Antworttext')
    assert.equal(preserved.get('sendStatus'), 'unknown')
    const snapshot = await db.doc(`knowledgeGaps/${first.id}`).get()
    assert.equal(snapshot.get('count'), baseline + 1)
    assert.equal(snapshot.get('title'), 'Bankverbindung soll geändert werden')
    assert.equal(JSON.stringify(snapshot.data()).includes('Secret body'), false)
    const revoked = { ...profile, permissions: { handbook: 'none', mailboxes: 'edit' } }
    await db.doc(`users/${uid}`).set(revoked)
    await assert.rejects(recordReplyKnowledgeGap(input(`${uid}-denied`)), { code: 'permission-denied' })
    assert.equal((await db.doc(`knowledgeGaps/${first.id}`).get()).get('count'), baseline + 1)
  } finally {
    await Promise.all([...refs, db.doc(`users/${uid}`)].map(ref => ref.delete()))
    await deleteApp(app)
  }
})
