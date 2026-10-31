import test from 'node:test'
import assert from 'node:assert/strict'
import { Timestamp } from 'firebase-admin/firestore'
import { transportOrderListProjection } from './transportOrderListProjection.js'
import { applyTransportOrderQueryFilters, transportOrderFieldsMatch, transportOrderLoadingMonths } from './transportOrderList.js'

test('projection preserves trimmed relations, ISO and historical Timestamp calendar dates', () => {
  assert.deepEqual(transportOrderListProjection({ imported: { relation: '  Test  ', loading: { window: { from: '2026-10-31T05:00' } } } }), { version: 2, relation: 'Test', loadingDate: '2026-10-31', loadingMonth: '2026-10' })
  assert.equal(transportOrderListProjection({ imported: { loading: { window: { from: Timestamp.fromDate(new Date('2026-10-31T23:00:00Z')) } } } }).loadingDate, '2026-10-31')
  assert.deepEqual(transportOrderListProjection({}), { version: 2, relation: '', loadingDate: '', loadingMonth: 'legacy' })
})

test('query filters remain disabled until historical projection coverage is complete', () => {
  const calls = []
  const query = { where(...args) { calls.push(args); return this } }
  const filters = { relation: 'Test', loadingFrom: '2026-10-01', loadingUntil: '2026-10-31' }
  assert.equal(applyTransportOrderQueryFilters(query, filters, false), query)
  assert.deepEqual(calls, [])
  applyTransportOrderQueryFilters(query, filters, true)
  assert.deepEqual(calls, [['listQuery.relation', '==', 'Test'], ['listQuery.loadingMonth', 'in', ['2026-10', 'legacy']]])
})

test('month equality buckets preserve global sorting and legacy dates without unsupported range/order combinations', () => {
  assert.deepEqual(transportOrderLoadingMonths('2026-12-15', '2027-01-20'), ['2026-12', '2027-01', 'legacy'])
  assert.equal(transportOrderLoadingMonths('2026-12-15', ''), null)
  assert.equal(transportOrderLoadingMonths('', '2027-01-20'), null)
  assert.equal(transportOrderLoadingMonths('2020-01-01', '2026-12-31'), null)
  assert.equal(transportOrderListProjection({ imported: { loading: { window: { from: '2026-1' } } } }).loadingMonth, 'legacy')
})

test('order-only prefilter retains substring search and rejects unrelated source records before tracking reads', () => {
  const order = { externalNumber: '123456789', imported: { relation: ' Test ', loading: { city: 'Hamburg', window: { from: '2026-10-31T05:00' } } } }
  assert.equal(transportOrderFieldsMatch(order, { search: 'burg', relation: 'Test', loadingFrom: '2026-10-31', loadingUntil: '2026-10-31' }), true)
  assert.equal(transportOrderFieldsMatch(order, { search: 'berlin' }), false)
})
