import test from 'node:test'
import assert from 'node:assert/strict'
import { filterKnowledge, knowledgeOverdue, knowledgeUrl, knowledgeValues } from './knowledgePresentation.js'

test('new articles are drafts without a department and independent rule selections', () => {
  const rules = ['rule-1']
  const article = knowledgeValues('article', { title: 'Delay', process: 'Transport', ruleIds: rules })
  assert.equal(article.status, 'draft')
  assert.equal(Object.hasOwn(article, 'departmentId'), false)
  article.ruleIds.push('rule-2')
  assert.deepEqual(rules, ['rule-1'])
  assert.equal(knowledgeValues('rule').audience, 'general')
  assert.equal(Object.hasOwn(knowledgeValues('rule'), 'ruleIds'), false)
})

test('catalog search includes recognition, checks and tags and respects process and validity filters', () => {
  const records = [
    { id: 'b', title: 'Verspätung', process: 'Transport', status: 'valid', checks: 'Status prüfen', tags: 'ETA' },
    { id: 'a', title: 'Anfrage', process: 'Kommunikation', status: 'draft', situation: 'Mail unklar' },
  ]
  assert.deepEqual(filterKnowledge(records, { search: 'eta', status: 'valid', process: 'Transport' }), [records[0]])
  assert.deepEqual(filterKnowledge(records, { search: 'prüfen', process: 'Kommunikation' }), [])
  assert.deepEqual(filterKnowledge(records, { search: 'mail' }), [records[1]])
  assert.deepEqual(filterKnowledge(records).map((item) => item.id), ['a', 'b'])
  assert.equal(records[0].id, 'b')
})

test('ground rule audience filters and overdue checks remain explicit', () => {
  const record = { title: 'Customer communication', audience: 'customer', nextReviewDate: '2026-10-31' }
  assert.deepEqual(filterKnowledge([record], { audience: 'carrier' }), [])
  assert.equal(knowledgeOverdue(record, '2026-10-31'), false)
  assert.equal(knowledgeOverdue(record, '2026-11-01'), true)
  assert.equal(knowledgeOverdue({}, '2026-11-01'), false)
  assert.equal(knowledgeUrl('rule', 'abc'), '/qualitaet/grundregeln/abc')
  assert.equal(knowledgeUrl('article', 'abc'), '/qualitaet/handbuch/abc')
})
