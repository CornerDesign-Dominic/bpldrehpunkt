import test from 'node:test'
import assert from 'node:assert/strict'
import { loadingStartMatches, relationMatches, trackingStatusMatches, transportOrderListPageSize, transportOrderRelationOptions, transportOrderTrackingStatus } from './transportOrderList.js'

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

test('tracking filter matches only its selected status and the server page is capped at 100 orders', () => {
  assert.equal(transportOrderListPageSize, 100)
  assert.equal(trackingStatusMatches('in_progress', 'in_progress'), true)
  assert.equal(trackingStatusMatches('in_progress', 'upcoming'), false)
  assert.equal(trackingStatusMatches('upcoming', 'all'), true)
})
