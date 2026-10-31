import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeKnowledgeInput, normalizeKnowledgeGapUpdate, persistKnowledgeRecord, persistKnowledgeGapUpdate, requireKnowledgeAccess } from './knowledge.js'

const editor = { active: true, role: 'user', firstName: 'Anna', lastName: 'Beispiel', permissions: { handbook: 'edit' } }
const article = { title: 'Lieferstatus fehlt', process: 'Transportdurchführung', situation: 'Kunde fragt nach der Lieferung.', action: 'Auftrag zuordnen und Status prüfen.' }
const input = (values = article, expectedRevision = 0, kind = 'article') => normalizeKnowledgeInput({ kind, id: 'entry', expectedRevision, values })
function fakeDb(initial = {}) {
  const records = new Map(Object.entries({ 'users/editor': editor, ...initial }))
  const ref = (path) => ({ path, collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }) })
  return {
    records, doc: ref,
    runTransaction: async (callback) => {
      const writes = []
      const result = await callback({
        get: async ({ path }) => ({ exists: records.has(path), data: () => records.get(path) }),
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
  assert.equal(normalizeKnowledgeGapUpdate(update).articleId, '')
  for (const patch of [{ count: 100 }, { title: 'forged' }, { status: 'done' }, { status: 'resolved' }, { articleId: 'bad/id' }, { expectedRevision: 0 }]) assert.throws(() => normalizeKnowledgeGapUpdate({ ...update, ...patch }), { code: 'invalid-argument' })
})

test('gap resolutions require a valid article, preserve demand counts and reject races', async () => {
  const initial = { title: 'Fehlendes Wissen', missing: 'Welche Rückfrage?', process: 'Kommunikation', count: 12, revision: 4, status: 'open', firstSeenAt: 'original' }
  const db = fakeDb({ 'knowledgeGaps/gap': initial })
  const update = normalizeKnowledgeGapUpdate({ id: 'gap', expectedRevision: 4, status: 'resolved', articleId: 'entry' })
  await assert.rejects(persistKnowledgeGapUpdate(db, update, { uid: 'editor' }), { code: 'failed-precondition' })
  db.records.set('knowledgeArticles/entry', { status: 'draft' })
  await assert.rejects(persistKnowledgeGapUpdate(db, update, { uid: 'editor' }), { code: 'failed-precondition' })
  db.records.set('knowledgeArticles/entry', { status: 'valid' })
  await persistKnowledgeGapUpdate(db, update, { uid: 'editor' })
  const saved = db.records.get('knowledgeGaps/gap')
  assert.equal(saved.count, 12)
  assert.equal(saved.firstSeenAt, 'original')
  assert.equal(saved.status, 'resolved')
  assert.equal(saved.revision, 5)
  await assert.rejects(persistKnowledgeGapUpdate(db, update, { uid: 'editor' }), { code: 'aborted' })
  db.records.set('users/editor', { ...editor, permissions: { handbook: 'view' } })
  await assert.rejects(persistKnowledgeGapUpdate(db, { ...update, expectedRevision: 5 }, { uid: 'editor' }), { code: 'permission-denied' })
})
