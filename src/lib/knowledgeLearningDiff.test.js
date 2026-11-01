import test from 'node:test'
import assert from 'node:assert/strict'
import { buildKnowledgeLearningDiff, diffKnowledgeText, KNOWLEDGE_LEARNING_TEXT_FIELDS } from './knowledgeLearningDiff.js'

const article = { id: 'article-1', revision: 3, title: 'Verspätung melden', process: 'Transport', topic: '', tags: 'ETA', situation: 'Eine Verspätung wird gemeldet.', checks: 'Status prüfen.', action: 'Kunden informieren.', cautions: '', responseTemplate: '', followUp: '', status: 'valid', owner: 'Team', lastReviewedDate: '2026-11-01', nextReviewDate: '', ruleIds: ['rule-1'] }
const run = (proposal = article, extra = {}) => ({ targetArticleId: article.id, targetArticleRevision: article.revision, baseArticle: article, proposal: { ...proposal, status: 'draft' }, status: 'ready', ...extra })
const reconstruct = (parts, exclude) => parts.filter((part) => part.type !== exclude).map((part) => part.text).join('')
const normalized = (value) => value.replace(/\r\n?/g, '\n').trim()

test('unchanged article and draft proposal status produce no false new insight', () => {
  const result = buildKnowledgeLearningDiff(run())
  assert.equal(result.hasChanges, false)
  assert.equal(result.basis, 'snapshot')
  assert.equal(result.fields.find((field) => field.key === 'status').after, 'valid')
  assert.equal(result.fields.length, 15)
  assert.ok(KNOWLEDGE_LEARNING_TEXT_FIELDS.every((key) => result.fields.some((field) => field.key === key)))
})

test('CRLF and outer whitespace match server comparison while meaningful inner changes remain', () => {
  const result = buildKnowledgeLearningDiff(run({ ...article, checks: '  Status prüfen.\r\n  ' }))
  assert.equal(result.hasChanges, false)
  assert.deepEqual(diffKnowledgeText('a\r\nb', 'a\nb'), [{ type: 'equal', text: 'a\nb' }])
  assert.notDeepEqual(diffKnowledgeText('a b', 'a  b'), [{ type: 'equal', text: 'a b' }])
})

test('additions, replacements and complete deletions remain distinct and reconstruct both versions', () => {
  for (const [before, after] of [['', 'Neu'], ['Alt', ''], ['Heute melden.', 'Morgen melden.'], ['Prüfen.\n\nMelden.', 'Prüfen.\n\nETA ergänzen.\n\nMelden.'], ['Gleich', 'Gleich']]) {
    const parts = diffKnowledgeText(before, after)
    assert.equal(reconstruct(parts, 'added'), normalized(before))
    assert.equal(reconstruct(parts, 'removed'), normalized(after))
  }
  const replacement = diffKnowledgeText('Heute melden.', 'Morgen melden.')
  assert.ok(replacement.some((part) => part.type === 'removed' && part.text.includes('Heute')))
  assert.ok(replacement.some((part) => part.type === 'added' && part.text.includes('Morgen')))
  const result = buildKnowledgeLearningDiff(run({ ...article, checks: '' }))
  const removed = result.fields.find((field) => field.key === 'checks')
  assert.equal(removed.changed, true)
  assert.deepEqual(removed.parts, [{ type: 'removed', text: article.checks }])
})

test('new articles are entirely proposed content and always shown as drafts', () => {
  const result = buildKnowledgeLearningDiff({ proposal: { ...article, status: 'valid' }, targetArticleId: '' })
  assert.equal(result.isNew, true)
  assert.equal(result.hasChanges, true)
  assert.equal(result.basis, 'new')
  assert.equal(result.fields.find((field) => field.key === 'status').after, 'draft')
  assert.ok(result.fields.every((field) => field.parts.every((part) => part.type === 'added')))
})

test('persisted baseline wins over the now updated current article', () => {
  const changed = { ...article, revision: 4, action: 'Eine neue Anweisung.' }
  const result = buildKnowledgeLearningDiff(run({ ...article, action: 'ETA mitteilen.' }, { status: 'applied' }), changed)
  assert.equal(result.basis, 'snapshot')
  assert.equal(result.fields.find((field) => field.key === 'action').before, article.action)
})

test('legacy runs use only a matching current article id and exact revision', () => {
  const legacy = run({ ...article, action: 'ETA mitteilen.' }, { baseArticle: null })
  assert.equal(buildKnowledgeLearningDiff(legacy, article).basis, 'current')
  for (const current of [undefined, { ...article, revision: 4 }, { ...article, id: 'other' }]) {
    const result = buildKnowledgeLearningDiff(legacy, current)
    assert.equal(result.missingBase, true)
    assert.equal(result.hasChanges, false)
    assert.ok(result.fields.every((field) => field.before === null && field.parts.length === 0 && !field.changed))
  }
})

test('no proposal is not confused with an unchanged article', () => {
  const result = buildKnowledgeLearningDiff({ targetArticleId: article.id, targetArticleRevision: 3, baseArticle: article })
  assert.equal(result.proposal, null)
  assert.equal(result.hasChanges, false)
  assert.deepEqual(result.fields, [])
})

test('large unrelated paragraphs use a bounded truthful diff', () => {
  const before = Array.from({ length: 1000 }, (_, index) => `vorher${index}`).join(' ')
  const after = Array.from({ length: 1000 }, (_, index) => `nachher${index}`).join(' ')
  const parts = diffKnowledgeText(before, after)
  assert.equal(reconstruct(parts, 'added'), before)
  assert.equal(reconstruct(parts, 'removed'), after)
  assert.ok(parts.some((part) => part.type === 'removed'))
  assert.ok(parts.some((part) => part.type === 'added'))
})

test('unicode, repeated words, punctuation and arbitrary line boundaries are lossless', () => {
  const words = ['Kunde', 'Kunde', 'prüfen.', '🙂', 'A\n\nB', 'e\u0301', '<b>Text</b>']
  for (let index = 0; index < 40; index += 1) {
    const before = Array.from({ length: 9 }, (_, i) => words[(index + i * 3) % words.length]).join(index % 2 ? ' ' : '\n')
    const after = Array.from({ length: 11 }, (_, i) => words[(index + i * 2) % words.length]).join(index % 3 ? '\n' : ' ')
    const parts = diffKnowledgeText(before, after)
    assert.equal(reconstruct(parts, 'added'), normalized(before))
    assert.equal(reconstruct(parts, 'removed'), normalized(after))
  }
})
