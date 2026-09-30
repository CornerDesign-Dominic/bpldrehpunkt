import assert from 'node:assert/strict'
import test from 'node:test'
import { mergedPartnerHistoryEntry, partnerMergeReversalAction, partnerReferenceNumbers } from './partnerReferencePresentation.js'

test('additional debtor and creditor references are counted separately without repeating the primary', () => {
  const partner = { debtorNumber: '10689', creditorNumber: '75397', dycosReferences: { debtorNumbers: ['10689', '10008', '10007', '10008'], creditorNumbers: ['75397', '75398'] } }
  assert.deepEqual(partnerReferenceNumbers(partner, 'debtor'), { primary: '10689', numbers: ['10689', '10008', '10007'], additional: ['10008', '10007'] })
  assert.deepEqual(partnerReferenceNumbers(partner, 'creditor'), { primary: '75397', numbers: ['75397', '75398'], additional: ['75398'] })
  assert.equal(partnerReferenceNumbers({ debtorNumber: '10689' }, 'debtor').additional.length, 0)
})

test('merge history uses the archived source record for its prior main numbers', () => {
  const history = { sourcePartnerId: 'source-id', category: 'merge', action: 'merged', actor: { name: 'Alex Beispiel' }, createdAt: '2026-09-23' }
  const source = { id: 'source-id', companyName: 'Quell GmbH', debtorNumber: '10008', creditorNumber: '75398' }
  assert.deepEqual(mergedPartnerHistoryEntry(history, source), { mergeId: '', id: 'source-id', companyName: 'Quell GmbH', debtorNumber: '10008', creditorNumber: '75398', mergedAt: '2026-09-23', actorName: 'Alex Beispiel', canOpen: true })
  assert.equal(mergedPartnerHistoryEntry(history, null).canOpen, false)
  assert.equal(mergedPartnerHistoryEntry({ ...history, mergeId: 'merge-1' }, source).mergeId, 'merge-1')
})

test('old or blocked merges show no enabled separation action while a safe preview enables it', () => {
  assert.equal(partnerMergeReversalAction({ mergeId: '' }).enabled, false)
  assert.match(partnerMergeReversalAction({ mergeId: '' }).reason, /nicht automatisch sicher/)
  assert.deepEqual(partnerMergeReversalAction({ mergeId: 'm1', reversal: { canSeparate: false, reason: 'Verschachtelt' } }), { enabled: false, reason: 'Verschachtelt' })
  assert.equal(partnerMergeReversalAction({ mergeId: 'm1', reversal: { canSeparate: true } }).enabled, true)
})
