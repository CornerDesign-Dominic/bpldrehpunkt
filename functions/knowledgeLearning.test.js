import test from 'node:test'
import assert from 'node:assert/strict'
import { HttpsError } from 'firebase-functions/v2/https'
import { normalizeCaseManagement, persistCaseManagement, normalizeLearningInput, learnSelectedKnowledgeCases, applySelectedKnowledgeLearning, validateLearningProposal, generateLearningProposal } from './knowledgeLearning.js'

const actor = { uid: 'editor' }
const profile = { active: true, role: 'user', firstName: 'Anna', permissions: { handbook: 'edit', knowledgeGaps: 'edit' } }
const sourceCase = { gapId: 'group', incomingText: 'Kunde fragt nach dem Lieferstatus.', latestSuggestion: 'Wir prüfen den Lieferstatus.', sendStatus: 'draft', caseRevision: 1, learnedRevision: 0, sourceArticleId: 'original', sourceRevision: 2 }
const article = { title: 'Lieferstatus', process: 'Transport', topic: '', tags: '', situation: 'Statusanfrage', checks: '', action: 'Status prüfen.', cautions: '', responseTemplate: '', followUp: '', owner: 'Team', status: 'valid', lastReviewedDate: '2026-10-01', nextReviewDate: '2026-12-01', ruleIds: [], revision: 3 }
const proposed = { proposal: Object.fromEntries(['title', 'process', 'topic', 'tags', 'situation', 'checks', 'action', 'cautions', 'responseTemplate', 'followUp'].map(key => [key, article[key] || ''])), insights: { variants: 'Kunde oder Unternehmer prüfen.', conflicts: '', openQuestions: 'Ist die Antwort tatsächlich erfolgreich?' } }
const input = (patch = {}) => normalizeLearningInput({ runId: 'run', gapId: 'group', caseIds: [{ id: 'case', caseRevision: 1 }], ...patch })
function fakeDb(initial = {}) {
  const records = new Map(Object.entries({ 'users/editor': profile, 'knowledgeGapEvidence/case': sourceCase, 'knowledgeArticles/article': article, ...initial }))
  const ref = path => ({ path, collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) })
  const collection = name => { const query = { collectionName: name, filters: [], where: (key, operator, value) => { query.filters.push([key, value]); return query }, limit: count => { query.limitCount = count; return query } }; return query }
  return { records, doc: ref, collection, runTransaction: async callback => {
    const writes = []
    const result = await callback({ get: async reference => reference.collectionName ? { docs: [...records].filter(([path, value]) => path.split('/').length === 2 && path.startsWith(`${reference.collectionName}/`) && reference.filters.every(([key, expected]) => value[key] === expected)).slice(0, reference.limitCount).map(([path, value]) => ({ id: path.split('/')[1], exists: true, data: () => value })) } : { exists: records.has(reference.path), data: () => records.get(reference.path) }, set: (reference, value) => writes.push([reference.path, value]), create: (reference, value) => { assert.equal(records.has(reference.path), false); writes.push([reference.path, value]) } })
    for (const [path, value] of writes) records.set(path, value)
    return result
  } }
}

test('case edits require expected revision, preserve source provenance and locally tombstone only', async () => {
  const db = fakeDb()
  const result = await persistCaseManagement(db, normalizeCaseManagement({ id: 'case', expectedRevision: 1, action: 'move', articleId: 'article' }), actor)
  assert.equal(result.gapId, 'article-article')
  assert.equal(db.records.get('knowledgeGaps/article-article').category, 'article')
  assert.equal(db.records.get('knowledgeGapEvidence/case').sourceArticleId, 'original')
  assert.equal(db.records.get('knowledgeGapEvidence/case').sourceRevision, 2)
  await assert.rejects(persistCaseManagement(db, normalizeCaseManagement({ id: 'case', expectedRevision: 1, action: 'remove' }), actor), { code: 'aborted' })
  await persistCaseManagement(db, normalizeCaseManagement({ id: 'case', expectedRevision: 2, action: 'remove' }), actor)
  const removed = db.records.get('knowledgeGapEvidence/case')
  assert.equal(removed.removed, true)
  assert.equal(removed.incomingText, '')
  assert.equal(removed.latestSuggestion, '')
  assert.equal(removed.sentReply, '')
  assert.equal(db.records.has('knowledgeArticles/article'), true)
  await assert.rejects(persistCaseManagement(db, normalizeCaseManagement({ id: 'case', expectedRevision: 3, action: 'move', gapId: 'unassigned' }), actor), { code: 'failed-precondition' })
})

test('curators without handbook may move to unassigned but cannot assign article groups', async () => {
  const db = fakeDb({ 'users/editor': { ...profile, permissions: { knowledgeGaps: 'edit' } } })
  await assert.rejects(persistCaseManagement(db, normalizeCaseManagement({ id: 'case', expectedRevision: 1, action: 'move', articleId: 'article' }), actor), { code: 'permission-denied' })
  await persistCaseManagement(db, normalizeCaseManagement({ id: 'case', expectedRevision: 1, action: 'move', gapId: 'unassigned' }), actor)
  assert.equal(db.records.get('knowledgeGaps/unassigned').category, 'unassigned')
  assert.equal(db.records.get('knowledgeGapEvidence/case').caseRevision, 2)
})

test('selection validation rejects duplicate, missing and oversized lists and permits long article-group IDs', () => {
  for (const patch of [{ caseIds: [] }, { caseIds: Array.from({ length: 21 }, (_, index) => ({ id: `case-${index}`, caseRevision: 1 })) }, { caseIds: [{ id: 'case', caseRevision: 1 }, { id: 'case', caseRevision: 1 }] }, { caseIds: [{ id: 'case', caseRevision: 0 }] }, { targetArticleId: 'article' }, { extra: true }]) assert.throws(() => input(patch), { code: 'invalid-argument' })
  assert.equal(input({ gapId: `article-${'a'.repeat(128)}` }).gapId.length, 136)
  assert.throws(() => normalizeCaseManagement({ id: 'case', expectedRevision: 1, action: 'move', articleId: 'article', gapId: 'group' }), { code: 'invalid-argument' })
})

test('manual analysis marks only exact selected revision and leaves current valid article unchanged', async () => {
  const db = fakeDb()
  const result = await learnSelectedKnowledgeCases(db, input({ targetArticleId: 'article', expectedArticleRevision: 3 }), actor, { generate: async () => proposed })
  assert.equal(result.status, 'ready')
  assert.equal(result.proposal.status, 'draft')
  assert.equal(result.proposal.owner, 'Team')
  assert.equal(result.proposal.lastReviewedDate, article.lastReviewedDate)
  assert.equal(db.records.get('knowledgeArticles/article'), article)
  assert.equal(db.records.get('knowledgeGapEvidence/case').learnedRevision, 1)
  assert.equal(db.records.get('knowledgeLearningRuns/run').targetArticleRevision, 3)
  const applied = await applySelectedKnowledgeLearning(db, { runId: 'run', expectedRevision: 1 }, actor)
  assert.equal(applied.id, 'article')
  assert.equal(applied.revision, 4)
  assert.equal(db.records.get('knowledgeArticles/article').status, 'valid')
  assert.equal(db.records.get('knowledgeArticles/article/revisions/4').owner, 'Team')
  assert.deepEqual(await applySelectedKnowledgeLearning(db, { runId: 'run', expectedRevision: 1 }, actor), applied)
})

test('analysis retries share the saved result and never bill or generate twice', async () => {
  const db = fakeDb()
  let calls = 0
  const generate = async () => { calls++; return proposed }
  await learnSelectedKnowledgeCases(db, input(), actor, { generate })
  await learnSelectedKnowledgeCases(db, input(), actor, { generate })
  assert.equal(calls, 1)
  const applied = await applySelectedKnowledgeLearning(db, { runId: 'run', expectedRevision: 1, values: { ...db.records.get('knowledgeLearningRuns/run').proposal, status: 'valid' } }, actor)
  assert.equal(db.records.get(`knowledgeArticles/${applied.id}`).status, 'draft')
})

test('case, target and rights changes during model generation prevent ready proposals and green markers', async () => {
  for (const change of ['case', 'article', 'rights', 'removed']) {
    const db = fakeDb()
    await assert.rejects(learnSelectedKnowledgeCases(db, input({ targetArticleId: 'article', expectedArticleRevision: 3 }), actor, { generate: async () => {
      if (change === 'case') db.records.set('knowledgeGapEvidence/case', { ...sourceCase, caseRevision: 2 })
      if (change === 'removed') db.records.set('knowledgeGapEvidence/case', { ...sourceCase, removed: true })
      if (change === 'article') db.records.set('knowledgeArticles/article', { ...article, revision: 4 })
      if (change === 'rights') db.records.set('users/editor', { ...profile, permissions: { knowledgeGaps: 'edit' } })
      return proposed
    } }), { code: change === 'rights' ? 'permission-denied' : 'aborted' })
    assert.equal(db.records.get('knowledgeGapEvidence/case').learnedRevision || 0, 0)
    assert.equal(db.records.get('knowledgeLearningRuns/run').status, 'failed')
  }
})

test('learning and apply reject stale cases, incomplete legacy text and oversized payloads', async () => {
  for (const patch of [{ removed: true }, { gapId: 'other' }, { incomingText: '' }, { incomingText: 'x'.repeat(120001) }]) {
    const db = fakeDb({ 'knowledgeGapEvidence/case': { ...sourceCase, ...patch } })
    await assert.rejects(learnSelectedKnowledgeCases(db, input(), actor, { generate: async () => { throw new Error('must not generate') } }))
    assert.equal(db.records.has('knowledgeLearningRuns/run'), false)
  }
  const db = fakeDb()
  await learnSelectedKnowledgeCases(db, input(), actor, { generate: async () => proposed })
  db.records.set('knowledgeGapEvidence/case', { ...sourceCase, caseRevision: 2 })
  await assert.rejects(applySelectedKnowledgeLearning(db, { runId: 'run', expectedRevision: 1 }, actor), { code: 'aborted' })
})

test('failed provider runs signal explicit new-run retry and running runs cannot be duplicated', async () => {
  const db = fakeDb()
  const failure = new HttpsError('unavailable', 'Provider failed')
  await assert.rejects(learnSelectedKnowledgeCases(db, input(), actor, { generate: async () => { throw failure } }), error => error.details?.retryWithNewRunId === true)
  await assert.rejects(learnSelectedKnowledgeCases(db, input(), actor, { generate: async () => proposed }), error => error.details?.runStatus === 'failed')
  const pending = fakeDb()
  let release
  const gate = new Promise(resolve => { release = resolve })
  const operation = learnSelectedKnowledgeCases(pending, input(), actor, { generate: async () => { await gate; return proposed } })
  await new Promise(resolve => setTimeout(resolve, 0))
  await assert.rejects(learnSelectedKnowledgeCases(pending, input(), actor, { generate: async () => proposed }), { code: 'already-exists' })
  release()
  await operation
})

test('linked rules are supplied to the model and a later rule change blocks applying the proposal', async () => {
  const db = fakeDb({ 'knowledgeArticles/article': { ...article, ruleIds: ['rule'] }, 'knowledgeRules/rule': { title: 'Keine Zusagen', provisions: 'Nur bestätigte Angaben.', status: 'valid', revision: 1 } })
  let rules
  await learnSelectedKnowledgeCases(db, input({ targetArticleId: 'article', expectedArticleRevision: 3 }), actor, { generate: async values => { rules = values.rules; return proposed } })
  assert.equal(rules[0].title, 'Keine Zusagen')
  db.records.set('knowledgeRules/rule', { status: 'valid', revision: 2 })
  await assert.rejects(applySelectedKnowledgeLearning(db, { runId: 'run', expectedRevision: 1 }, actor), { code: 'aborted' })
})

test('general valid rules are supplied without linking them and excessive rule context is rejected', async () => {
  const db = fakeDb({ 'knowledgeRules/general': { title: 'Außenkommunikation', audience: 'general', status: 'valid', revision: 2, provisions: 'Nur bestätigte Angaben.' }, 'knowledgeRules/draft': { title: 'Not authoritative', audience: 'general', status: 'draft', revision: 1 } })
  let supplied
  await learnSelectedKnowledgeCases(db, input(), actor, { generate: async values => { supplied = values.rules; return proposed } })
  assert.deepEqual(supplied.map(rule => rule.title), ['Außenkommunikation'])
  assert.deepEqual(db.records.get('knowledgeLearningRuns/run').proposal.ruleIds, [])
  const huge = fakeDb({ 'knowledgeRules/general': { audience: 'general', status: 'valid', revision: 1, provisions: 'x'.repeat(120001) } })
  await assert.rejects(learnSelectedKnowledgeCases(huge, input(), actor, { generate: async () => proposed }), { code: 'resource-exhausted' })
})

test('learning requires edit on both modules and applying partial human text edits preserves metadata', async () => {
  for (const permissions of [{ handbook: 'edit' }, { knowledgeGaps: 'edit' }, { handbook: 'view', knowledgeGaps: 'edit' }]) {
    await assert.rejects(learnSelectedKnowledgeCases(fakeDb({ 'users/editor': { ...profile, permissions } }), input(), actor, { generate: async () => proposed }), { code: 'permission-denied' })
  }
  const db = fakeDb()
  await learnSelectedKnowledgeCases(db, input({ targetArticleId: 'article', expectedArticleRevision: 3 }), actor, { generate: async () => proposed })
  await applySelectedKnowledgeLearning(db, { runId: 'run', expectedRevision: 1, values: { title: 'Geprüfte Überschrift' } }, actor)
  assert.equal(db.records.get('knowledgeArticles/article').owner, 'Team')
  assert.equal(db.records.get('knowledgeArticles/article').lastReviewedDate, article.lastReviewedDate)
  assert.equal(db.records.get('knowledgeArticles/article').title, 'Geprüfte Überschrift')
})

test('proposal validation and the AI request protect boundaries and use content-free usage logging', async () => {
  assert.throws(() => validateLearningProposal({ proposal: { ...proposed.proposal, ruleIds: ['forged'] }, insights: proposed.insights }), { code: 'invalid-argument' })
  let requestBody
  const generated = await generateLearningProposal({ cases: [sourceCase], article, userId: 'editor', apiKey: 'test', execute: async ({ feature, operation }) => { assert.equal(feature, 'knowledge_case_learning'); return operation() }, http: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    requestBody = JSON.parse(options.body)
    return { ok: true, headers: { get: () => '' }, json: async () => ({ status: 'completed', output_text: JSON.stringify(proposed), usage: {} }) }
  } })
  assert.deepEqual(generated, proposed)
  assert.equal(requestBody.store, false)
  assert.match(requestBody.instructions, /Versand.*beweist weder Richtigkeit/)
  assert.match(requestBody.instructions, /Widersprüche/)
  assert.match(requestBody.instructions, /Nichts senden/)
})
