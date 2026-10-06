import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultTrackingFilter, emptyTrackingFilterMessage, normalizeTransportOrderListPreferences, trackingStatusForList, transportOrderListPageSize, transportOrderListPageSizeOptions, validTransportOrderListPageSize, visibleTransportOrderPage } from './transportOrderListPresentation.js'

test('tracking list starts without a status restriction and presents every lifecycle label', () => {
  assert.equal(defaultTrackingFilter, 'all')
  assert.equal(trackingStatusForList('upcoming').label, 'Startet')
  assert.equal(trackingStatusForList('in_progress').label, 'Laufend')
  assert.equal(trackingStatusForList('completed').label, 'Ende')
  assert.equal(emptyTrackingFilterMessage('in_progress'), 'Keine laufenden Sendungsverfolgungen vorhanden.')
})

test('a list page defaults to 25 rows and honors the available page sizes', () => {
  const page = visibleTransportOrderPage({ orders: Array.from({ length: 101 }, (_, id) => ({ id })), hasMore: true, nextCursor: 'cursor-100' })
  assert.equal(transportOrderListPageSize, 25)
  assert.deepEqual(transportOrderListPageSizeOptions, [25, 50, 100])
  assert.equal(page.orders.length, 25)
  assert.equal(page.hasMore, true)
  assert.equal(page.nextCursor, 'cursor-100')
  assert.equal(visibleTransportOrderPage({ orders: Array.from({ length: 101 }, (_, id) => ({ id })) }, 50).orders.length, 50)
  assert.equal(validTransportOrderListPageSize(75), 25)
})

test('saved order-list preferences keep valid personal filters and discard malformed values', () => {
  const preferences = normalizeTransportOrderListPreferences({ search: '  EDEKA  ', trackingFilter: 'in_progress', attentionFilter: 'critical', iconFilters: { mailReview: true, truck: 'warning' }, relation: '02 Struck Torben', loadingFrom: '2026-10-01', loadingUntil: '2026-10-31', sort: { key: 'relation', direction: 'desc' }, pageSize: 50 })
  assert.deepEqual(preferences, { search: 'EDEKA', trackingFilter: 'in_progress', attentionFilter: 'critical', iconFilters: { automationPaused: false, mailReview: true, licensePlate: false, stopwatch: '', truck: 'warning' }, relation: '02 Struck Torben', loadingFrom: '2026-10-01', loadingUntil: '2026-10-31', sort: { key: 'relation', direction: 'desc' }, pageSize: 50 })
  assert.equal(normalizeTransportOrderListPreferences({ loadingFrom: 'not-a-date', pageSize: 75 }).pageSize, 25)
})
