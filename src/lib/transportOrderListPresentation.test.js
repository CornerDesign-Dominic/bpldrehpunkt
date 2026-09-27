import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultTrackingFilter, emptyTrackingFilterMessage, trackingStatusForList, transportOrderListPageSize, visibleTransportOrderPage } from './transportOrderListPresentation.js'

test('tracking list starts with the active filter and presents every lifecycle label', () => {
  assert.equal(defaultTrackingFilter, 'active')
  assert.equal(trackingStatusForList('upcoming').label, 'Bevorstehend')
  assert.equal(trackingStatusForList('active').label, 'Laufend')
  assert.equal(trackingStatusForList('completed').label, 'Abgeschlossen')
  assert.equal(emptyTrackingFilterMessage('active'), 'Keine laufenden Sendungsverfolgungen vorhanden.')
})

test('a list page never exposes more than 100 rows and preserves cursor navigation data', () => {
  const page = visibleTransportOrderPage({ orders: Array.from({ length: 101 }, (_, id) => ({ id })), hasMore: true, nextCursor: 'cursor-100' })
  assert.equal(transportOrderListPageSize, 100)
  assert.equal(page.orders.length, 100)
  assert.equal(page.hasMore, true)
  assert.equal(page.nextCursor, 'cursor-100')
})
