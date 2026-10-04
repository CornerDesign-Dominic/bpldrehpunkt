import test from 'node:test'
import assert from 'node:assert/strict'
import { listIconFiltersMatch, loadingStartMatches, normalizeListIconFilters, normalizeTransportOrderListPageSize, relationMatches, trackingStatusMatches, transportOrderListPageSize, transportOrderRelationOptions, transportOrderTrackingStatus } from './transportOrderList.js'

test('list tracking status is derived only from the separate tracking lifecycle', () => {
  assert.equal(transportOrderTrackingStatus(null), 'upcoming')
  assert.equal(transportOrderTrackingStatus({ lifecycleStatus: 'active' }), 'in_progress')
  assert.equal(transportOrderTrackingStatus({ lifecycleStatus: 'active', lifecyclePhase: 'upcoming' }), 'upcoming')
  assert.equal(transportOrderTrackingStatus({ lifecycleStatus: 'active', lifecyclePhase: 'preparation' }), 'in_progress')
  assert.equal(transportOrderTrackingStatus({ lifecycleStatus: 'active', lifecyclePhase: 'aftercare' }), 'in_progress')
  assert.equal(transportOrderTrackingStatus({ lifecycleStatus: 'completed' }), 'completed')
})

test('relation and loading-start filters use the selected relation and inclusive calendar range', () => {
  const first = { imported: { relation: '00 Standard', loading: { window: { from: '2026-09-29T06:00' } } } }
  const second = { imported: { relation: '02 Struck Torben', loading: { window: { from: '2026-10-01T07:00' } } } }
  assert.deepEqual(transportOrderRelationOptions([second, first, first]), ['00 Standard', '02 Struck Torben'])
  assert.equal(relationMatches(first, '00 Standard'), true)
  assert.equal(relationMatches(first, '02 Struck Torben'), false)
  assert.equal(loadingStartMatches(first, '2026-09-29', '2026-09-29'), true)
  assert.equal(loadingStartMatches(first, '2026-09-30', ''), false)
  assert.equal(loadingStartMatches({ imported: { loading: { window: {} } } }, '', ''), false)
})

test('tracking filter matches only its selected status and the server page defaults to 25 orders', () => {
  assert.equal(transportOrderListPageSize, 25)
  assert.equal(normalizeTransportOrderListPageSize(50), 50)
  assert.equal(normalizeTransportOrderListPageSize(75), 25)
  assert.equal(trackingStatusMatches('in_progress', 'in_progress'), true)
  assert.equal(trackingStatusMatches('in_progress', 'upcoming'), false)
  assert.equal(trackingStatusMatches('upcoming', 'all'), true)
})

test('icon filters combine groups but keep each color selection mutually exclusive', () => {
  const items = [
    { id: 'mail-review', severity: 'warning' },
    { id: 'loading-wait', icon: 'stopwatch', severity: 'warning' },
    { id: 'license-plate', severity: 'warning' },
  ]
  const filters = normalizeListIconFilters({ mailReview: true, licensePlate: true, stopwatch: 'warning' })
  assert.equal(listIconFiltersMatch(items, filters), true)
  assert.equal(listIconFiltersMatch(items, { ...filters, stopwatch: 'critical' }), false)
  assert.equal(listIconFiltersMatch(items, { ...filters, automationPaused: true }), false)
  assert.deepEqual(normalizeListIconFilters({ stopwatch: 'warning', truck: 'red', mailReview: 'true' }), { automationPaused: false, mailReview: false, licensePlate: false, stopwatch: 'warning', truck: '' })
})
