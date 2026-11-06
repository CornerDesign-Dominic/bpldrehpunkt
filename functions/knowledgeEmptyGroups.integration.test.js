import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { normalizeEmptyKnowledgeGroup, persistEmptyKnowledgeGroup } from './knowledgeEmptyGroups.js'

test('emulator: empty proposal conversion and concurrently arriving cases cannot lose case membership', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-mail-recommendations'
  assert.ok(projectId.startsWith('demo-'))
  const suffix = randomUUID(), uid = `empty-curator-${suffix}`, groupId = `empty-proposal-${suffix}`, caseId = `empty-case-${suffix}`
  const app = initializeApp({ projectId }, suffix), db = getFirestore(app)
  const groupRef = db.doc(`knowledgeGaps/${groupId}`), caseRef = db.doc(`knowledgeGapEvidence/${caseId}`)
  let createdArticle = null
  try {
    await db.doc(`users/${uid}`).set({ active: true, permissions: { knowledgeGaps: 'edit', handbook: 'edit' } })
    await groupRef.set({ title: 'Synthetic proposal', process: 'Synthetic process', category: 'gap', revision: 3 })
    const input = normalizeEmptyKnowledgeGroup({ id: groupId, expectedRevision: 3, action: 'createArticle', values: { title: 'Synthetic draft', process: 'Synthetic process' } })
    createdArticle = input.articleId
    const capture = () => db.runTransaction(async tx => {
      const current = (await tx.get(groupRef)).data()
      tx.create(caseRef, { gapId: groupId, removed: false, incomingText: 'Synthetic incoming', sentReply: 'Synthetic reply' })
      tx.set(groupRef, { title: 'Synthetic proposal', process: 'Synthetic process', category: 'gap', revision: (current?.revision || 0) + 1 })
    })
    const [converted, captured] = await Promise.allSettled([persistEmptyKnowledgeGroup(db, input, { uid }), capture()])
    assert.equal(captured.status, 'fulfilled')
    const [group, evidence, article] = await Promise.all([groupRef.get(), caseRef.get(), db.doc(`knowledgeArticles/${input.articleId}`).get()])
    assert.equal(group.exists, true); assert.equal(evidence.data().gapId, groupId)
    if (converted.status === 'fulfilled') {
      assert.equal(article.data().status, 'draft')
      assert.equal((await db.doc(`knowledgeGaps/article-${input.articleId}`).get()).exists, true)
    } else {
      assert.ok(['aborted', 'failed-precondition'].includes(converted.reason.code))
      assert.equal(article.exists, false)
    }
    await assert.rejects(persistEmptyKnowledgeGroup(db, normalizeEmptyKnowledgeGroup({ id: groupId, expectedRevision: group.data().revision, action: 'remove' }), { uid }), { code: 'failed-precondition' })
  } finally {
    await Promise.all([groupRef.delete(), caseRef.delete(), db.doc(`users/${uid}`).delete(), ...(createdArticle ? [db.recursiveDelete(db.doc(`knowledgeArticles/${createdArticle}`)), db.doc(`knowledgeGaps/article-${createdArticle}`).delete()] : [])])
    await db.terminate(); await deleteApp(app)
  }
})
