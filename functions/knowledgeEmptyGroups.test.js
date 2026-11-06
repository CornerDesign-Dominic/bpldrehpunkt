import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeEmptyKnowledgeGroup, persistEmptyKnowledgeGroup } from './knowledgeEmptyGroups.js'

const profile = { active: true, firstName: 'Test', permissions: { knowledgeGaps: 'edit', handbook: 'edit' } }
function fixture(extra = {}) {
  const records = new Map(Object.entries({ 'users/curator': profile, 'knowledgeGaps/proposal': { title: 'Situation fehlt', process: 'Transport', revision: 3, category: 'gap', articleId: '' }, ...extra }))
  const doc = path => ({ path, collection: name => ({ doc: id => doc(`${path}/${name}/${id}`) }) })
  const db = { records, doc, collection: name => ({ where: (field, operator, value) => ({ name, field, value }) }), runTransaction: async fn => {
    const writes = []
    const result = await fn({
      get: async ref => ref.name ? { docs: [...records].filter(([path, value]) => path.startsWith(`${ref.name}/`) && value[ref.field] === ref.value).map(([, value]) => ({ data: () => value })) } : { exists: records.has(ref.path), data: () => records.get(ref.path) },
      create: (ref, value) => { assert.equal(records.has(ref.path), false); writes.push(() => records.set(ref.path, value)) },
      delete: ref => writes.push(() => records.delete(ref.path)),
    })
    writes.forEach(write => write())
    return result
  } }
  return db
}
const input = (action = 'remove', patch = {}) => normalizeEmptyKnowledgeGroup({ id: 'proposal', expectedRevision: 3, action, ...(action === 'createArticle' ? { values: { title: 'Neue Situation', process: 'Transport' } } : {}), ...patch })

test('empty-group requests reject articles, unassigned, invalid revisions and field injection', () => {
  for (const patch of [{ id: 'unassigned' }, { id: 'article-a' }, { id: '../invalid' }, { expectedRevision: 0 }, { action: 'publish' }, { ownerId: 'forged' }]) assert.throws(() => input('remove', patch), { code: 'invalid-argument' })
  assert.throws(() => input('createArticle', { values: { title: 'New', process: 'Transport', status: 'valid' } }), { code: 'invalid-argument' })
  assert.throws(() => input('createArticle', { values: { title: '', process: 'Transport' } }), { code: 'invalid-argument' })
})

test('remove deletes only an empty proposal, keeping removed evidence and original content untouched', async () => {
  const db = fixture({ 'knowledgeGapEvidence/old': { gapId: 'proposal', removed: true, incomingText: 'Existing retained case' } })
  await persistEmptyKnowledgeGroup(db, input(), { uid: 'curator' })
  assert.equal(db.records.has('knowledgeGaps/proposal'), false)
  assert.equal(db.records.get('knowledgeGapEvidence/old').incomingText, 'Existing retained case')
})

test('draft conversion creates immutable first revision and a standard article case group atomically', async () => {
  const db = fixture()
  const result = await persistEmptyKnowledgeGroup(db, input('createArticle'), { uid: 'curator' })
  const record = db.records.get(`knowledgeArticles/${result.articleId}`)
  assert.equal(record.status, 'draft'); assert.equal(record.revision, 1)
  assert.equal(record.createdBy, 'curator'); assert.equal(record.situation, '')
  assert.deepEqual(db.records.get(`knowledgeArticles/${result.articleId}/revisions/1`), record)
  assert.equal(db.records.get(`knowledgeGaps/article-${result.articleId}`).articleId, result.articleId)
  assert.equal(db.records.has('knowledgeGaps/proposal'), false)
})

test('current cases and stale revision block removal and conversion without partial writes', async () => {
  for (const action of ['remove', 'createArticle']) {
    const active = fixture({ 'knowledgeGapEvidence/one': { gapId: 'proposal', removed: false } })
    await assert.rejects(persistEmptyKnowledgeGroup(active, input(action), { uid: 'curator' }), { code: 'failed-precondition' })
    assert.equal(active.records.has('knowledgeGaps/proposal'), true)
    assert.equal([...active.records.keys()].some(path => path.startsWith('knowledgeArticles/')), false)
    await assert.rejects(persistEmptyKnowledgeGroup(fixture(), input(action, { expectedRevision: 2 }), { uid: 'curator' }), { code: 'aborted' })
  }
})

test('permissions preserve knowledge-gap edit and handbook edit for conversion, and deny inactive accounts', async () => {
  const gapOnly = fixture({ 'users/curator': { ...profile, permissions: { knowledgeGaps: 'edit' } } })
  await assert.rejects(persistEmptyKnowledgeGroup(gapOnly, input('createArticle'), { uid: 'curator' }), { code: 'permission-denied' })
  await persistEmptyKnowledgeGroup(gapOnly, input(), { uid: 'curator' })
  for (const user of [{ ...profile, active: false }, { ...profile, permissions: { knowledgeGaps: 'view', handbook: 'edit' } }]) await assert.rejects(persistEmptyKnowledgeGroup(fixture({ 'users/curator': user }), input(), { uid: 'curator' }), { code: 'permission-denied' })
  for (const group of [{ category: 'article', articleId: 'article' }, { category: 'unassigned' }, { category: 'gap', articleId: 'article' }]) await assert.rejects(persistEmptyKnowledgeGroup(fixture({ 'knowledgeGaps/proposal': { revision: 3, ...group } }), input(), { uid: 'curator' }), { code: 'failed-precondition' })
})
