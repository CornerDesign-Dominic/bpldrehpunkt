import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultTrackingFilter, emptyTrackingFilterMessage, trackingStatusForList, transportOrderListPageSize, visibleTransportOrderPage } from './transportOrderListPresentation.js'

test('tracking list starts without a status restriction and presents every lifecycle label', () => {
  assert.equal(defaultTrackingFilter, 'all')
  assert.equal(trackingStatusForList('upcoming').label, 'Bevorstehend')
  assert.equal(trackingStatusForList('in_progress').label, 'Laufend')
  assert.equal(trackingStatusForList('completed').label, 'Durchgeführt')
  assert.equal(emptyTrackingFilterMessage('in_progress'), 'Keine laufenden Sendungsverfolgungen vorhanden.')
})

test('a list page never exposes more than 100 rows and preserves cursor navigation data', () => {
  const page = visibleTransportOrderPage({ orders: Array.from({ length: 101 }, (_, id) => ({ id })), hasMore: true, nextCursor: 'cursor-100' })
  assert.equal(transportOrderListPageSize, 100)
  assert.equal(page.orders.length, 100)
  assert.equal(page.hasMore, true)
  assert.equal(page.nextCursor, 'cursor-100')
})
