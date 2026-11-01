import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc } from 'firebase/firestore'
import { normalizeKnowledgeInput, normalizeKnowledgeGapUpdate, persistKnowledgeRecord, persistKnowledgeGapUpdate } from './knowledge.js'
import { normalizeCaseManagement, persistCaseManagement, normalizeLearningInput, learnSelectedKnowledgeCases, applySelectedKnowledgeLearning } from './knowledgeLearning.js'

test('knowledge rules and transactional publication safeguards', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-knowledge'
  assert.match(projectId, /^demo-/)
  const stamp = Date.now()
  const adminApp = initializeAdminApp({ projectId }, `knowledge-admin-${stamp}`)
  const admin = getAdminFirestore(adminApp)
  const apps = []
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  const profiles = {
    editor: { active: true, role: 'user', permissions: { handbook: 'edit' } },
    viewer: { active: true, role: 'user', permissions: { handbook: 'view' } },
    gapEditor: { active: true, role: 'user', permissions: { knowledgeGaps: 'edit' } },
    gapViewer: { active: true, role: 'user', permissions: { knowledgeGaps: 'view' } },
    learner: { active: true, role: 'user', permissions: { knowledgeGaps: 'edit', handbook: 'edit' } },
    combinedViewer: { active: true, role: 'user', permissions: { knowledgeGaps: 'view', handbook: 'view' } },
    none: { active: true, role: 'user', permissions: { handbook: 'none' } },
    inactive: { active: false, role: 'superadmin' },
    admin: { active: true, role: 'admin', permissions: {} },
    superadmin: { active: true, role: 'superadmin' },
  }
  const clients = Object.fromEntries(Object.keys(profiles).map((name) => {
    const app = initializeApp({ projectId, apiKey: 'test' }, `knowledge-${name}-${stamp}`)
    apps.push(app)
    const db = getFirestore(app)
    connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: `knowledge-${name}` } })
    return [name, db]
  }))
  try {
    await Promise.all([
      ...Object.entries(profiles).map(([name, profile]) => admin.doc(`users/knowledge-${name}`).set(profile)),
      ...['knowledgeArticles', 'knowledgeRules'].flatMap((name) => [admin.doc(`${name}/seeded`).set({ title: 'Current', revision: 1 }), admin.doc(`${name}/seeded/revisions/1`).set({ title: 'Snapshot', revision: 1 })]),
      admin.doc('knowledgeGaps/seeded').set({ title: 'Missing instruction', count: 3, revision: 1, status: 'open' }),
      admin.doc('knowledgeGapEvidence/seeded').set({ gapId: 'seeded', latestSuggestion: 'Private answer draft', sentReply: 'Private final reply', sendStatus: 'accepted' }),
      admin.doc('knowledgeLearningRuns/seeded').set({ proposal: { title: 'Private proposal' }, status: 'ready' }),
      admin.doc('knowledgeGapOccurrences/private').set({ counted: true }),
    ])
    await t.test('handbook and knowledge gap readers have separate collection and evidence access', async () => {
      for (const [name, db] of Object.entries(clients)) {
        for (const collectionName of ['knowledgeArticles', 'knowledgeRules', 'knowledgeGaps', 'knowledgeGapEvidence', 'knowledgeLearningRuns']) {
          const privateGapData = ['knowledgeGaps', 'knowledgeGapEvidence'].includes(collectionName)
          const learningRun = collectionName === 'knowledgeLearningRuns'
          const permitted = learningRun ? ['learner', 'combinedViewer', 'superadmin'].includes(name) : privateGapData ? ['gapEditor', 'gapViewer', 'learner', 'combinedViewer', 'superadmin'].includes(name) : ['editor', 'viewer', 'learner', 'combinedViewer', 'superadmin'].includes(name)
          const operations = [() => getDoc(doc(db, collectionName, 'seeded')), () => getDocs(collection(db, collectionName))]
          if (!privateGapData && !learningRun) operations.push(() => getDoc(doc(db, collectionName, 'seeded', 'revisions', '1')))
          for (const operation of operations) {
            if (permitted) await operation()
            else await assert.rejects(operation(), { code: 'permission-denied' })
          }
        }
      }
    })
    await t.test('direct writes and private gap occurrence reads are denied even for superadmins', async () => {
      for (const db of Object.values(clients)) {
        await assert.rejects(getDoc(doc(db, 'knowledgeGapOccurrences', 'private')), { code: 'permission-denied' })
        await assert.rejects(getDocs(collection(db, 'knowledgeGapOccurrences')), { code: 'permission-denied' })
        for (const path of ['knowledgeArticles/seeded', 'knowledgeRules/seeded', 'knowledgeArticles/seeded/revisions/1', 'knowledgeGaps/seeded', 'knowledgeGapEvidence/seeded', 'knowledgeLearningRuns/seeded', 'knowledgeGapOccurrences/private']) await assert.rejects(updateDoc(doc(db, path), { title: 'forged' }), { code: 'permission-denied' })
        await assert.rejects(setDoc(doc(db, 'knowledgeArticles', 'forged'), { title: 'forged' }), { code: 'permission-denied' })
      }
    })
    await t.test('process articles and rules save with immutable revisions, linked rules and live permissions', async () => {
      const actor = { uid: 'knowledge-editor' }
      const save = (kind, id, values, expectedRevision = 0) => persistKnowledgeRecord(admin, normalizeKnowledgeInput({ kind, id, values, expectedRevision }), actor)
      const rule = { title: 'Außenkommunikation', scope: 'Kunden', provisions: 'Nur belegte Angaben verwenden.', status: 'valid' }
      await save('rule', 'communication', rule)
      const article = { title: 'Statusanfrage', process: 'Transport', situation: 'Kunde fragt nach Status.', action: 'Auftrag zuordnen.', status: 'valid', ruleIds: ['communication'] }
      await save('article', 'delivery', article)
      await save('article', 'delivery', { ...article, action: 'Status prüfen und Entwurf erstellen.' }, 1)
      assert.equal((await admin.doc('knowledgeArticles/delivery/revisions/1').get()).get('action'), article.action)
      await assert.rejects(save('article', 'delivery', article, 1), { code: 'aborted' })
      await admin.doc('users/knowledge-editor').update({ active: false })
      await assert.rejects(save('article', 'delivery', article, 2), { code: 'permission-denied' })
      await admin.doc('users/knowledge-editor').update({ active: true })
    })
    await t.test('independent gap curators complete without article and reopen while preserving demand counts', async () => {
      const actor = { uid: 'knowledge-gapEditor' }
      const input = normalizeKnowledgeGapUpdate({ id: 'seeded', expectedRevision: 1, status: 'resolved' })
      await assert.rejects(persistKnowledgeGapUpdate(admin, input, { uid: 'knowledge-editor' }), { code: 'permission-denied' })
      await assert.rejects(persistKnowledgeGapUpdate(admin, input, { uid: 'knowledge-gapViewer' }), { code: 'permission-denied' })
      await persistKnowledgeGapUpdate(admin, input, actor)
      const saved = await admin.doc('knowledgeGaps/seeded').get()
      assert.equal(saved.get('count'), 3)
      assert.equal(saved.get('status'), 'resolved')
      assert.equal(saved.get('resolvedBy'), actor.uid)
      assert.ok(saved.get('resolvedAt').toDate())
      await assert.rejects(persistKnowledgeGapUpdate(admin, input, actor), { code: 'aborted' })
      await persistKnowledgeGapUpdate(admin, normalizeKnowledgeGapUpdate({ id: 'seeded', expectedRevision: 2, status: 'open' }), actor)
      const reopened = await admin.doc('knowledgeGaps/seeded').get()
      assert.equal(reopened.get('resolvedAt'), null)
      assert.equal(reopened.get('resolvedBy'), '')
      assert.equal(reopened.get('count'), 3)
    })
    await t.test('manual learning leaves valid article unchanged until approval and case removal is local only', async () => {
      const actor = { uid: 'knowledge-learner' }
      await admin.doc('knowledgeGapEvidence/learning-case').set({ gapId: 'seeded', incomingText: 'Wo bleibt die Ware?', latestSuggestion: 'Wir prüfen den Status.', sendStatus: 'draft', caseRevision: 1, learnedRevision: 0, sourceArticleId: 'delivery', sourceRevision: 2 })
      const selection = normalizeLearningInput({ runId: 'learning-run', gapId: 'seeded', caseIds: [{ id: 'learning-case', caseRevision: 1 }], targetArticleId: 'delivery', expectedArticleRevision: 2 })
      const run = await learnSelectedKnowledgeCases(admin, selection, actor, { generate: async () => ({ proposal: { title: 'Statusanfrage', process: 'Transport', situation: 'Kunde fragt nach Status.', action: 'Auftrag zuordnen und Status prüfen.' }, insights: { variants: '', conflicts: '', openQuestions: 'Antwort ist noch nicht bestätigt.' } }) })
      assert.equal(run.status, 'ready')
      assert.equal((await admin.doc('knowledgeArticles/delivery').get()).get('revision'), 2)
      assert.equal((await admin.doc('knowledgeGapEvidence/learning-case').get()).get('learnedRevision'), 1)
      const applied = await applySelectedKnowledgeLearning(admin, { runId: 'learning-run', expectedRevision: 1 }, actor)
      assert.equal(applied.revision, 3)
      assert.equal((await admin.doc('knowledgeArticles/delivery').get()).get('status'), 'valid')
      await persistCaseManagement(admin, normalizeCaseManagement({ id: 'learning-case', expectedRevision: 1, action: 'move', gapId: 'unassigned' }), actor)
      assert.equal((await admin.doc('knowledgeGapEvidence/learning-case').get()).get('sourceArticleId'), 'delivery')
      await persistCaseManagement(admin, normalizeCaseManagement({ id: 'learning-case', expectedRevision: 2, action: 'remove' }), actor)
      const removed = await admin.doc('knowledgeGapEvidence/learning-case').get()
      assert.equal(removed.get('removed'), true)
      assert.equal(removed.get('incomingText'), '')
      assert.equal((await admin.doc('knowledgeArticles/delivery').get()).get('revision'), 3)
    })
  } finally {
    await Promise.all(apps.map((app) => deleteApp(app)))
    await deleteAdminApp(adminApp)
  }
})
