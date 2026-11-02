import test from 'node:test'
import assert from 'node:assert/strict'
import { knowledgeDevExamples, seedKnowledgeDevExamples } from '../scripts/knowledge-dev-examples.mjs'

test('Dev examples are validated published scenarios with distinct applicability and a shared rule', () => {
  assert.equal(knowledgeDevExamples.filter((item) => item.kind === 'article').length, 3)
  assert.equal(knowledgeDevExamples.filter((item) => item.kind === 'rule').length, 1)
  const rule = knowledgeDevExamples.find((item) => item.kind === 'rule')
  for (const item of knowledgeDevExamples) {
    assert.equal(item.values.status, 'valid')
    assert.match(item.values.title, /^Dev-Beispiel:/)
    if (item.kind === 'article') { assert.deepEqual(item.values.ruleIds, [rule.id]); assert.ok(item.values.situation); assert.ok(item.values.action) }
  }
})

test('seeding rejects production before touching data', async () => {
  await assert.rejects(seedKnowledgeDevExamples({ projectId: 'db-bpl-drehpunkt', runTransaction: () => { throw new Error('Must not run') } }), /ausschließlich/)
})
