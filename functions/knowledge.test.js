import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeKnowledgeInput, normalizeKnowledgeGapUpdate, persistKnowledgeRecord, persistKnowledgeGapUpdate, requireKnowledgeAccess } from './knowledge.js'

const editor = { active: true, role: 'user', firstName: 'Anna', lastName: 'Beispiel', permissions: { handbook: 'edit' } }
const gapEditor = { ...editor, permissions: { knowledgeGaps: 'edit' } }
const article = { title: 'Lieferstatus fehlt', process: 'Transportdurchführung', situation: 'Kunde fragt nach der Lieferung.', action: 'Auftrag zuordnen und Status prüfen.' }
const input = (values = article, expectedRevision = 0, kind = 'article') => normalizeKnowledgeInput({ kind, id: 'entry', expectedRevision, values })
function fakeDb(initial = {}) {
  const records = new Map(Object.entries({ 'users/editor': editor, ...initial }))
  const ref = (path) => ({ path, collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }) })
  return {
    records, doc: ref, collection: collectionName => ({ collectionName, where: (key, op, value) => ({ collectionName, key, value }) }),
    runTransaction: async (callback) => {
      const writes = []
      const result = await callback({
        get: async item => item.collectionName ? { docs: [...records].filter(([path, value]) => path.split('/').length === 2 && path.startsWith(`${item.collectionName}/`) && value[item.key] === item.value).map(([path, value]) => ({ id: path.split('/')[1], data: () => value })) } : { exists: records.has(item.path), data: () => records.get(item.path) },
        update: (reference, value) => writes.push([reference.path, { ...records.get(reference.path), ...value }]),
        set: (reference, value) => writes.push([reference.path, value]),
        create: (reference, value) => { assert.equal(records.has(reference.path), false); writes.push([reference.path, value]) },
      })
      for (const [path, value] of writes) records.set(path, value)
      return result
    },
  }
}

test('knowledge is process-based, defaults to draft and rejects department and metadata injection', () => {
  const normalized = input()
  assert.equal(normalized.values.status, 'draft')
  assert.equal(normalized.values.owner, '')
  assert.deepEqual(normalized.values.ruleIds, [])
  assert.equal(Object.hasOwn(normalized.values, 'departmentId'), false)
  for (const patch of [{ departmentId: 'accounting' }, { updatedBy: 'forged' }, { revision: 7 }, { title: '' }, { process: '' }, { status: null }, { situation: 123 }, { ruleIds: null }, { title: 'x'.repeat(201) }, { tags: 'x'.repeat(2001) }, { action: 'x'.repeat(20001) }, { ruleIds: ['a', 'a'] }, { ruleIds: ['bad/id'] }]) assert.throws(() => input({ ...article, ...patch }), { code: 'invalid-argument' })
})

test('valid knowledge requires actionable content and real ordered review dates', () => {
  assert.equal(input({ ...article, status: 'valid' }).values.status, 'valid')
  for (const patch of [{ status: 'valid', situation: '' }, { status: 'valid', action: '' }, { status: 'published' }, { lastReviewedDate: '2026-02-30' }, { lastReviewedDate: '2026-11-01', nextReviewDate: '2026-10-31' }]) assert.throws(() => input({ ...article, ...patch }), { code: 'invalid-argument' })
  assert.equal(input({ title: 'Kommunikation', audience: 'customer' }, 0, 'rule').values.status, 'draft')
  assert.equal(input({ title: 'Kommunikation', audience: 'customer', scope: 'Kundenanfragen', provisions: 'Nur bestätigte Angaben verwenden.', status: 'valid' }, 0, 'rule').values.audience, 'customer')
  for (const patch of [{ audience: 'finance' }, { status: 'valid' }, { status: 'valid', scope: 'Kunden' }]) assert.throws(() => input({ title: 'Regel', ...patch }, 0, 'rule'), { code: 'invalid-argument' })
})

test('permission checks preserve view/edit split and no admin or inactive override', () => {
  requireKnowledgeAccess(editor, true)
  requireKnowledgeAccess({ ...editor, permissions: { handbook: 'view' } })
  requireKnowledgeAccess({ active: true, role: 'superadmin' }, true)
  for (const profile of [{ ...editor, permissions: { handbook: 'view' } }, { ...editor, role: 'admin', permissions: {} }, { active: false, role: 'superadmin' }, { role: 'superadmin' }]) assert.throws(() => requireKnowledgeAccess(profile, true), { code: 'permission-denied' })
})

test('saves create immutable full revisions, server actor and reject stale overwrite', async () => {
  const db = fakeDb()
  assert.deepEqual(await persistKnowledgeRecord(db, input(), { uid: 'editor' }), { id: 'entry', revision: 1 })
  assert.equal(db.records.get('knowledgeArticles/entry').updatedByName, 'Anna Beispiel')
  await assert.rejects(persistKnowledgeRecord(db, input(), { uid: 'editor' }), { code: 'aborted' })
  await persistKnowledgeRecord(db, input({ ...article, action: 'Neue Anweisung', status: 'valid' }, 1), { uid: 'editor' })
  assert.equal(db.records.get('knowledgeArticles/entry').revision, 2)
  assert.equal(db.records.get('knowledgeArticles/entry/revisions/1').action, article.action)
  assert.equal(db.records.get('knowledgeArticles/entry/revisions/2').action, 'Neue Anweisung')
})

test('linked rules must exist and current edit rights are checked inside the transaction', async () => {
  const db = fakeDb()
  await assert.rejects(persistKnowledgeRecord(db, input({ ...article, ruleIds: ['rule'] }), { uid: 'editor' }), { code: 'failed-precondition' })
  assert.equal(db.records.has('knowledgeArticles/entry'), false)
  db.records.set('knowledgeRules/rule', { status: 'draft' })
  await assert.rejects(persistKnowledgeRecord(db, input({ ...article, status: 'valid', ruleIds: ['rule'] }), { uid: 'editor' }), { code: 'failed-precondition' })
  db.records.set('knowledgeRules/rule', { status: 'archived' })
  await assert.rejects(persistKnowledgeRecord(db, input({ ...article, status: 'valid', ruleIds: ['rule'] }), { uid: 'editor' }), { code: 'failed-precondition' })
  await persistKnowledgeRecord(db, input({ ...article, ruleIds: ['rule'] }), { uid: 'editor' })
  db.records.set('users/editor', { ...editor, active: false })
  await assert.rejects(persistKnowledgeRecord(db, input(article, 1), { uid: 'editor' }), { code: 'permission-denied' })
  assert.equal(db.records.get('knowledgeArticles/entry').revision, 1)
})

test('gap mutations allow only status and article link with expected revision', () => {
  const update = { id: 'gap', expectedRevision: 1, status: 'open' }
  assert.equal(Object.hasOwn(normalizeKnowledgeGapUpdate(update), 'articleId'), false)
  assert.equal(Object.hasOwn(normalizeKnowledgeGapUpdate({ ...update, status: 'resolved' }), 'articleId'), false)
  for (const patch of [{ count: 100 }, { title: 'forged' }, { status: 'done' }, { articleId: 'bad/id' }]) assert.throws(() => normalizeKnowledgeGapUpdate({ ...update, ...patch }), { code: 'invalid-argument' })
})

test('gap completion permits optional draft context links, preserves demand counts and rejects races', async () => {
  const initial = { title: 'Fehlendes Wissen', missing: 'Welche Rückfrage?', process: 'Kommunikation', count: 12, revision: 4, status: 'open', firstSeenAt: 'original' }
  const db = fakeDb({ 'knowledgeGaps/gap': initial, 'users/editor': { ...editor, permissions: { handbook: 'view', knowledgeGaps: 'edit' } } })
  const update = normalizeKnowledgeGapUpdate({ id: 'gap', expectedRevision: 4, status: 'resolved', articleId: 'entry' })
  await assert.rejects(persistKnowledgeGapUpdate(db, update, { uid: 'editor' }), { code: 'failed-precondition' })
  db.records.set('knowledgeArticles/entry', { status: 'draft' })
  await persistKnowledgeGapUpdate(db, update, { uid: 'editor' })
  const saved = db.records.get('knowledgeGaps/gap')
  assert.equal(saved.count, 12)
  assert.equal(saved.firstSeenAt, 'original')
  assert.equal(saved.status, 'resolved')
  assert.equal(saved.revision, 5)
  assert.equal(saved.resolvedBy, 'editor')
  assert.equal(saved.resolvedByName, 'Anna Beispiel')
  await assert.rejects(persistKnowledgeGapUpdate(db, update, { uid: 'editor' }), { code: 'aborted' })
  db.records.set('users/editor', { ...editor, permissions: { handbook: 'view' } })
  await assert.rejects(persistKnowledgeGapUpdate(db, { ...update, expectedRevision: 5 }, { uid: 'editor' }), { code: 'permission-denied' })
})

test('gap curators can complete without article or handbook rights and reopen with cleared completion metadata', async () => {
  const db = fakeDb({ 'users/editor': gapEditor, 'knowledgeGaps/gap': { status: 'open', count: 8, revision: 1 } })
  const update = (status, expectedRevision, articleId = '') => normalizeKnowledgeGapUpdate({ id: 'gap', status, expectedRevision, articleId })
  await persistKnowledgeGapUpdate(db, update('resolved', 1), { uid: 'editor' })
  const resolved = db.records.get('knowledgeGaps/gap')
  assert.equal(resolved.resolvedBy, 'editor')
  assert.equal(resolved.resolvedByName, 'Anna Beispiel')
  assert.ok(resolved.resolvedAt)
  assert.equal(resolved.count, 8)
  await persistKnowledgeGapUpdate(db, update('resolved', 2), { uid: 'editor' })
  assert.equal(db.records.get('knowledgeGaps/gap').resolvedAt, resolved.resolvedAt)
  await persistKnowledgeGapUpdate(db, update('open', 3), { uid: 'editor' })
  const reopened = db.records.get('knowledgeGaps/gap')
  assert.equal(reopened.resolvedAt, null)
  assert.equal(reopened.resolvedBy, '')
  assert.equal(reopened.resolvedByName, '')
  db.records.set('users/editor', editor)
  await assert.rejects(persistKnowledgeGapUpdate(db, update('resolved', 4), { uid: 'editor' }), { code: 'permission-denied' })
})

test('gap curators can retain an existing article link but may not infer or add inaccessible knowledge', async () => {
  const db = fakeDb({ 'users/editor': gapEditor, 'knowledgeGaps/gap': { status: 'open', count: 1, revision: 1, articleId: 'existing' }, 'knowledgeArticles/other': { status: 'valid' } })
  await persistKnowledgeGapUpdate(db, normalizeKnowledgeGapUpdate({ id: 'gap', status: 'resolved', expectedRevision: 1, articleId: 'existing' }), { uid: 'editor' })
  await assert.rejects(persistKnowledgeGapUpdate(db, normalizeKnowledgeGapUpdate({ id: 'gap', status: 'resolved', expectedRevision: 2, articleId: 'other' }), { uid: 'editor' }), { code: 'permission-denied' })
  await persistKnowledgeGapUpdate(db, normalizeKnowledgeGapUpdate({ id: 'gap', status: 'resolved', expectedRevision: 2, articleId: '' }), { uid: 'editor' })
  assert.equal(db.records.get('knowledgeGaps/gap').articleId, '')
})

test('visibility can create virtual unassigned and readable article groups without a status transition', async () => {
  const db = fakeDb({ 'users/editor': gapEditor })
  await persistKnowledgeGapUpdate(db, normalizeKnowledgeGapUpdate({ id: 'unassigned', expectedRevision: 0, hidden: true }), { uid: 'editor' })
  assert.equal(db.records.get('knowledgeGaps/unassigned').hidden, true)
  assert.equal(db.records.get('knowledgeGaps/unassigned').status, 'open')
  await persistKnowledgeGapUpdate(db, normalizeKnowledgeGapUpdate({ id: 'unassigned', expectedRevision: 1, hidden: false }), { uid: 'editor' })
  assert.equal(db.records.get('knowledgeGaps/unassigned').hidden, false)
  await assert.rejects(persistKnowledgeGapUpdate(db, normalizeKnowledgeGapUpdate({ id: 'unknown', expectedRevision: 0, hidden: true }), { uid: 'editor' }), { code: 'not-found' })
  db.records.set('knowledgeArticles/article', { title: 'Artikel', process: 'Transport' })
  const virtualArticle = normalizeKnowledgeGapUpdate({ id: 'article-article', expectedRevision: 0, hidden: true })
  await assert.rejects(persistKnowledgeGapUpdate(db, virtualArticle, { uid: 'editor' }), { code: 'permission-denied' })
  db.records.set('users/editor', { ...gapEditor, permissions: { knowledgeGaps: 'edit', handbook: 'view' } })
  await persistKnowledgeGapUpdate(db, virtualArticle, { uid: 'editor' })
  assert.equal(db.records.get('knowledgeGaps/article-article').articleId, 'article')
  assert.equal(db.records.get('knowledgeGaps/article-article').title, 'Artikel')
  await assert.rejects(persistKnowledgeGapUpdate(db, virtualArticle, { uid: 'editor' }), { code: 'aborted' })
  for (const hidden of ['true', null, 1]) assert.throws(() => normalizeKnowledgeGapUpdate({ id: 'unassigned', expectedRevision: 0, hidden }), { code: 'invalid-argument' })
})

test('article assignment moves every active group case atomically, preserves provenance and hides only the source', async () => {
  const initialCase = { gapId: 'gap', caseRevision: 2, learnedRevision: 2, sourceArticleId: 'original', sourceRevision: 7, incomingText: 'Private case' }
  const db = fakeDb({ 'users/editor': { ...gapEditor, permissions: { knowledgeGaps: 'edit', handbook: 'view' } }, 'knowledgeGaps/gap': { revision: 1, status: 'resolved', count: 5 }, 'knowledgeGaps/article-article': { title: 'Old title', hidden: false, revision: 3 }, 'knowledgeArticles/article': { title: 'New title', process: 'Transport' }, 'knowledgeGapEvidence/one': initialCase, 'knowledgeGapEvidence/two': { ...initialCase, caseRevision: 1 }, 'knowledgeGapEvidence/removed': { ...initialCase, removed: true } })
  const result = await persistKnowledgeGapUpdate(db, normalizeKnowledgeGapUpdate({ id: 'gap', expectedRevision: 1, articleId: 'article', hidden: true }), { uid: 'editor' })
  assert.equal(result.targetGapId, 'article-article')
  assert.equal(result.movedCount, 2)
  assert.equal(db.records.get('knowledgeGapEvidence/one').gapId, 'article-article')
  assert.equal(db.records.get('knowledgeGapEvidence/one').caseRevision, 3)
  assert.equal(db.records.get('knowledgeGapEvidence/one').learnedRevision, 2)
  assert.equal(db.records.get('knowledgeGapEvidence/one').sourceArticleId, 'original')
  assert.equal(db.records.get('knowledgeGapEvidence/removed').gapId, 'gap')
  assert.equal(db.records.get('knowledgeGaps/gap').hidden, true)
  assert.equal(db.records.get('knowledgeGaps/gap').status, 'resolved')
  assert.equal(db.records.get('knowledgeGaps/article-article').hidden, false)
  assert.equal(db.records.get('knowledgeGaps/article-article').revision, 4)
  const unassigned = await persistKnowledgeGapUpdate(db, normalizeKnowledgeGapUpdate({ id: 'article-article', expectedRevision: 4, articleId: '' }), { uid: 'editor' })
  assert.equal(unassigned.movedCount, 2)
  assert.equal(db.records.get('knowledgeGapEvidence/one').gapId, 'unassigned')
  assert.equal(db.records.get('knowledgeGaps/unassigned').category, 'unassigned')
})

test('large group assignments fail without moving a partial subset', async () => {
  const cases = Object.fromEntries(Array.from({ length: 401 }, (_, index) => [`knowledgeGapEvidence/case-${index}`, { gapId: 'gap', caseRevision: 1 }]))
  const db = fakeDb({ 'users/editor': gapEditor, 'knowledgeGaps/gap': { revision: 1 }, ...cases })
  await assert.rejects(persistKnowledgeGapUpdate(db, normalizeKnowledgeGapUpdate({ id: 'gap', expectedRevision: 1, articleId: '' }), { uid: 'editor' }), { code: 'resource-exhausted' })
  assert.equal(db.records.get('knowledgeGapEvidence/case-0').gapId, 'gap')
  assert.equal(db.records.get('knowledgeGaps/gap').revision, 1)
})
