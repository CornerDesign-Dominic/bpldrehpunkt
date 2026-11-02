import test from 'node:test'
import assert from 'node:assert/strict'
import { activeKnowledgeCases, knowledgeCaseAnswer, knowledgeCaseGroups, knowledgeCasePending, knowledgeCaseSelection, knowledgeGroupRun } from './knowledgeCases.js'

test('overview counts only current group copies, excludes removed copies and retains unassigned', () => {
  const cases = [{ id: 'a', gapId: 'g1', caseRevision: 2, learnedRevision: 1 }, { id: 'b', gapId: 'g2', caseRevision: 1, learnedRevision: 1 }, { id: 'c', gapId: 'g1', removed: true }, { id: 'd' }]
  const groups = knowledgeCaseGroups([{ id: 'g1', title: 'One' }, { id: 'g2', title: 'Two' }], cases)
  assert.equal(groups.find((group) => group.id === 'g1').caseCount, 1)
  assert.equal(groups.find((group) => group.id === 'g2').pendingCount, 0)
  assert.equal(groups.find((group) => group.id === 'unassigned').caseCount, 1)
  assert.equal(activeKnowledgeCases(cases).length, 3)
  assert.equal(knowledgeCasePending(cases[0]), true)
  assert.equal(knowledgeCasePending({ caseRevision: 3, learnedRevision: 3 }), false)
  assert.equal(knowledgeCaseGroups([], [])[0].id, 'unassigned')
})
test('sent and uncertain answers take precedence, drafts remain explicitly drafts', () => {
  assert.deepEqual(knowledgeCaseAnswer({ sendStatus: 'accepted', sentReply: 'Human', latestSuggestion: 'AI' }), { text: 'Human', kind: 'accepted' })
  assert.deepEqual(knowledgeCaseAnswer({ sendStatus: 'unknown', sentReply: 'Attempt' }), { text: 'Attempt', kind: 'unknown' })
  assert.deepEqual(knowledgeCaseAnswer({ sendStatus: 'draft', latestSuggestion: 'AI' }), { text: 'AI', kind: 'draft' })
})
test('article collections mirror current handbook metadata, including empty and hidden collections', () => {
  const articles = [{ id: 'a', title: 'Current title', process: 'Transport', topic: 'Delivery' }, { id: 'b', title: 'Empty article', process: 'Email' }]
  const groups = knowledgeCaseGroups([{ id: 'article-a', title: 'Old title', hidden: true, revision: 4 }], [{ id: 'copy', gapId: 'article-a', caseRevision: 1, learnedRevision: 1 }], articles)
  assert.equal(groups.find((item) => item.id === 'article-a').title, 'Current title')
  assert.equal(groups.find((item) => item.id === 'article-a').hidden, true)
  assert.equal(groups.find((item) => item.id === 'article-a').caseCount, 1)
  assert.equal(groups.find((item) => item.id === 'article-b').virtual, true)
  assert.equal(groups.find((item) => item.id === 'article-b').caseCount, 0)
  assert.equal(groups.filter((item) => item.id === 'article-a').length, 1)
  assert.equal(groups.find((item) => item.id === 'unassigned').revision, 0)
})
test('no cases are implicitly selected and removed or stale absent selections are excluded', () => {
  const cases = [{ id: 'a', caseRevision: 4 }, { id: 'b', removed: true, caseRevision: 2 }]
  assert.deepEqual(knowledgeCaseSelection(cases, []), [])
  assert.deepEqual(knowledgeCaseSelection(cases, ['a', 'b', 'unknown']), [{ id: 'a', caseRevision: 4 }])
  assert.deepEqual(knowledgeCaseSelection([{ id: 'legacy' }], ['legacy']), [{ id: 'legacy', caseRevision: 1 }])
})
test('background result survives reopening and follows applied article without stale local work hiding server status', () => {
  const first = { id: 'first', gapId: 'group', status: 'ready', createdAt: { toMillis: () => 5 } }
  const next = { id: 'next', gapId: 'group', status: 'applied', appliedResult: { targetGapId: 'article-new' }, createdAt: { toMillis: () => 10 } }
  assert.equal(knowledgeGroupRun([first, next], 'group', { id: 'next', status: 'running' }), next)
  assert.equal(knowledgeGroupRun([first, next], 'article-new'), next)
  assert.equal(knowledgeGroupRun([first], 'group', { id: 'local', status: 'running', startedAt: 12 }).id, 'local')
  assert.equal(knowledgeGroupRun([first], 'other'), null)
})
