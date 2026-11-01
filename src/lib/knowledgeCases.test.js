import test from 'node:test'
import assert from 'node:assert/strict'
import { activeKnowledgeCases, knowledgeCaseAnswer, knowledgeCaseGroups, knowledgeCasePending, knowledgeCaseSelection } from './knowledgeCases.js'

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
test('no cases are implicitly selected and removed or stale absent selections are excluded', () => {
  const cases = [{ id: 'a', caseRevision: 4 }, { id: 'b', removed: true, caseRevision: 2 }]
  assert.deepEqual(knowledgeCaseSelection(cases, []), [])
  assert.deepEqual(knowledgeCaseSelection(cases, ['a', 'b', 'unknown']), [{ id: 'a', caseRevision: 4 }])
})
