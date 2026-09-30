import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeFieldChanges, mergedNumbersForReversal, mergeReversalEligibility, planCopiedMergeRecord, planMergeReference, planMergeReversalFields, restoredMergeSource, summarizeMergeReversal } from './partnerMergeReversal.js'

test('merge and reversal restore separate partner numbers without discarding later target additions', () => {
  const target = { debtorNumber: '10689', creditorNumber: '', dycosReferences: { debtorNumbers: ['10689'], creditorNumbers: [] }, contact: { email: '' } }
  const source = { debtorNumber: '10007', creditorNumber: '75397', dycosReferences: { debtorNumbers: ['10007'], creditorNumbers: ['75397'] }, contact: { email: 'quelle@example.test' } }
  const after = { debtorNumber: '10689', creditorNumber: '75397', dycosReferences: { debtorNumbers: ['10689', '10007'], creditorNumbers: ['75397'] }, contact: { email: 'quelle@example.test' } }
  const changes = mergeFieldChanges(target, after)
  const moved = mergedNumbersForReversal(target, source)
  const current = { ...after, dycosReferences: { debtorNumbers: [...after.dycosReferences.debtorNumbers, '20000'], creditorNumbers: ['75397'] } }
  const plan = planMergeReversalFields(current, changes, moved)
  assert.deepEqual(moved, { debtors: ['10007'], creditors: ['75397'] })
  assert.deepEqual(plan.patch['dycosReferences.debtorNumbers'], ['10689', '20000'])
  assert.deepEqual(plan.patch['dycosReferences.creditorNumbers'], [])
  assert.equal(plan.patch.creditorNumber, '')
  assert.equal(plan.patch['contact.email'], '')
  assert.equal(source.contact.email, 'quelle@example.test')
})

test('only logged references return; a newly created target reference is untouched', () => {
  const before = { customerId: 'source', customerName: 'Quelle', carrierId: 'unrelated' }
  const after = { customerId: 'target', customerName: 'Ziel' }
  const changes = mergeFieldChanges(before, after)
  const plan = planMergeReference({ ...before, ...after }, changes)
  assert.deepEqual(plan.patch, { customerId: 'source', customerName: 'Quelle' })
  assert.equal(Object.hasOwn(plan.patch, 'carrierId'), false)
  const reassigned = planMergeReference({ customerId: 'third-partner', customerName: 'Ziel' }, changes)
  assert.deepEqual(reassigned.patch, {})
  assert.match(reassigned.warnings[0], /manuelle Prüfung erforderlich/)
  const twoRoles = mergeFieldChanges({ customerId: 'source', carrierId: 'source', customerName: 'Quelle', carrierName: 'Quelle' }, { customerId: 'target', carrierId: 'target', customerName: 'Ziel', carrierName: 'Ziel' })
  const partlyReassigned = planMergeReference({ customerId: 'third-partner', carrierId: 'target', customerName: 'Dritter', carrierName: 'Ziel' }, twoRoles)
  assert.deepEqual(partlyReassigned.patch, { carrierId: 'source', carrierName: 'Quelle' })
  const newerTargetReference = { customerId: 'target', customerName: 'Ziel' }
  assert.deepEqual(newerTargetReference, { customerId: 'target', customerName: 'Ziel' })
})

test('later edited target values and copied contact lists are preserved with a warning', () => {
  const target = { address: { city: 'Hamburg' }, contacts: [{ email: 'a@example.test' }] }
  const after = { address: { city: 'Berlin' }, contacts: [{ email: 'a@example.test' }, { email: 'b@example.test' }] }
  const changes = mergeFieldChanges(target, after)
  const current = { address: { city: 'München' }, contacts: after.contacts }
  const plan = planMergeReversalFields(current, changes)
  assert.equal(Object.hasOwn(plan.patch, 'address.city'), false)
  assert.deepEqual(plan.patch.contacts, target.contacts)
  assert.match(plan.warnings[0], /manuelle Prüfung erforderlich/)
  assert.deepEqual(target.contacts, [{ email: 'a@example.test' }])
})

test('missing, completed, nested, and incomplete protocols cannot be separated twice', () => {
  const operation = { schemaVersion: 1, mergeId: 'm1', sourceBefore: { status: 'active' }, targetChanges: [], movedNumbers: { debtors: [], creditors: [] }, status: 'merged', targetPartnerId: 'target', referenceCount: 1, copyCount: 0 }
  const source = { mergedIntoPartnerId: 'target', mergedByMergeId: 'm1' }
  const target = { latestMergeId: 'm1' }
  assert.equal(mergeReversalEligibility(operation, source, target, 1, 0), '')
  assert.match(mergeReversalEligibility(null, source, target, 1, 0), /Protokoll fehlt/)
  assert.match(mergeReversalEligibility({ ...operation, status: 'separated' }, source, target, 1, 0), /bereits getrennt/)
  assert.match(mergeReversalEligibility({ ...operation, nestedSourceMergeId: 'earlier' }, source, target, 1, 0), /verschachtelte/)
  assert.match(mergeReversalEligibility(operation, source, target, 0, 0), /unvollständig/)
  assert.match(mergeReversalEligibility(operation, source, { latestMergeId: 'later' }, 1, 0), /weiter zusammengeführt/)
})

test('archived source is restored as an independent active partner without redirect fields', () => {
  const before = { companyName: 'Quelle', status: 'inactive', debtorNumber: '10007', contacts: [{ email: 'quelle@example.test' }] }
  const archived = { ...before, status: 'merged', mergedIntoPartnerId: 'target', mergedIntoPartnerName: 'Ziel', mergedByMergeId: 'm1' }
  const restored = restoredMergeSource(before, archived, 'm1', 'now')
  assert.equal(restored.status, 'active')
  assert.equal(restored.debtorNumber, '10007')
  assert.deepEqual(restored.contacts, before.contacts)
  assert.equal(restored.mergedIntoPartnerId, undefined)
  assert.equal(restored.mergedIntoPartnerName, undefined)
  assert.equal(restored.mergedByMergeId, undefined)
})

test('copied CRM and insolvency data are archived only if they remained unchanged', () => {
  const copied = { email: 'a@example.test', text: 'Hinweis' }
  assert.deepEqual(planCopiedMergeRecord({ ...copied }, copied), { archiveCopy: true, needsManualReview: false })
  assert.deepEqual(planCopiedMergeRecord({ ...copied, text: 'Später ergänzt' }, copied), { archiveCopy: false, needsManualReview: true })
  assert.deepEqual(planCopiedMergeRecord(null, copied), { archiveCopy: false, needsManualReview: true })
})

test('preview groups logged references and reports only the recorded source values', () => {
  const summary = summarizeMergeReversal({ sourcePartnerId: 'source', targetPartnerId: 'target', movedNumbers: { debtors: ['10007'], creditors: ['75397'] }, targetChanges: [{ path: 'contacts' }, { path: 'dycosReferences.debtorNumbers' }] }, [{ collection: 'transportOrders' }, { collection: 'transportOrders' }, { collection: 'todos' }], [{ collection: 'activities' }], ['Kontakt geändert'])
  assert.deepEqual(summary.referenceCounts, { transportOrders: 2, todos: 1 })
  assert.equal(summary.debtorCount, 1)
  assert.equal(summary.creditorCount, 1)
  assert.equal(summary.dataCount, 2)
  assert.deepEqual(summary.warnings, ['Kontakt geändert'])
})
