import test from 'node:test'
import assert from 'node:assert/strict'
import { collectRelatedRecordResults, filterPartnerTodos, partnerRelatedRecordPlan } from './partnerRelatedRecordPlan.js'

test('only permitted modules produce collection queries; names and external numbers never become keys', () => {
  const plans = partnerRelatedRecordPlan(['root', 'archive'], ['inkasso', 'legalDisputes'])
  assert.deepEqual(plans.map((plan) => plan.collection), ['inkassoCases', 'legalDisputes'])
  assert.deepEqual(plans.flatMap((plan) => plan.queries), [
    { field: 'debtorPartnerId', ids: ['root', 'archive'] },
    { field: 'counterpartyPartnerId', ids: ['root', 'archive'] },
  ])
  assert.deepEqual(partnerRelatedRecordPlan(['root'], []), [])
})

test('a large merged partner cluster yields bounded queries for every original reference field', () => {
  const ids = Array.from({ length: 23 }, (_, index) => `partner-${index}`)
  const [plan] = partnerRelatedRecordPlan([...ids, ids[0], '', null], ['damages'])
  assert.equal(plan.queries.length, 6)
  for (const field of plan.fields) {
    const queries = plan.queries.filter((entry) => entry.field === field)
    assert.deepEqual(queries.flatMap((entry) => entry.ids), ids)
    assert.ok(queries.every((entry) => entry.ids.length <= 10))
  }
})

test('insolvencies include canonical document IDs as well as explicit partner references', () => {
  const [plan] = partnerRelatedRecordPlan(['root', 'old'], ['insolvencies'])
  assert.deepEqual(plan.queries.map((entry) => entry.field), ['partnerId', '__name__'])
})

test('to-dos require actor-scoped loading and retain only exact cluster references', () => {
  const [plan] = partnerRelatedRecordPlan(['root', 'old'], ['todos'])
  assert.deepEqual(plan.queries, [])
  const todos = [{ id: 'a', customerId: 'old' }, { id: 'b', carrierId: 'root' }, { id: 'c', customerName: 'root' }, { id: 'd', customerId: 'unrelated' }]
  assert.deepEqual(filterPartnerTodos(todos, ['root', 'old']).map((todo) => todo.id), ['a', 'b'])
})

test('multiple partner roles and archived references do not duplicate records; partial failure remains visible', () => {
  const result = collectRelatedRecordResults([
    { status: 'fulfilled', value: [{ id: 'case-1', claimantPartnerId: 'old' }, { id: 'case-2' }] },
    { status: 'rejected', reason: new Error('offline') },
    { status: 'fulfilled', value: [{ id: 'case-1', claimantPartnerId: 'old' }] },
  ])
  assert.deepEqual(result.records.map((record) => record.id), ['case-1', 'case-2'])
  assert.equal(result.records[0].claimantPartnerId, 'old')
  assert.equal(result.failedQueries, 1)
  assert.deepEqual(collectRelatedRecordResults([{ status: 'rejected' }]), { records: [], failedQueries: 1 })
})

test('insolvency archive shells are omitted while live cases retain original archived-partner references', () => {
  const queries = [{ status: 'fulfilled', value: [
    { id: 'root', partnerId: 'root' },
    { id: 'old-merged', partnerId: 'old-merged', mergedIntoPartnerId: 'root' },
    { id: 'old-split', partnerId: 'old-split', splitArchivedAt: { seconds: 1 } },
    { id: 'still-live', partnerId: 'archived-partner' },
  ] }]
  assert.deepEqual(collectRelatedRecordResults(queries, 'insolvency').records.map((record) => record.id), ['root', 'still-live'])
  const originalCase = { id: 'damage-1', claimantPartnerId: 'old-merged', contractorPartnerId: 'old-split' }
  const result = collectRelatedRecordResults([{ status: 'fulfilled', value: [originalCase] }], 'damage')
  assert.deepEqual(result.records, [originalCase])
  assert.equal(result.records[0].claimantPartnerId, 'old-merged')
  assert.equal(result.records[0].contractorPartnerId, 'old-split')
})
