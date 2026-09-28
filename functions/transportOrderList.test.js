import test from 'node:test'
import assert from 'node:assert/strict'
import { trackingStatusMatches, transportOrderListPageSize, transportOrderTrackingStatus } from './transportOrderList.js'

test('list tracking status is derived only from the separate tracking lifecycle', () => {
  assert.equal(transportOrderTrackingStatus(null), 'upcoming')
  assert.equal(transportOrderTrackingStatus({ lifecycleStatus: 'active' }), 'in_progress')
  assert.equal(transportOrderTrackingStatus({ lifecycleStatus: 'active', lifecyclePhase: 'preparation' }), 'preparation')
  assert.equal(transportOrderTrackingStatus({ lifecycleStatus: 'active', lifecyclePhase: 'aftercare' }), 'aftercare')
  assert.equal(transportOrderTrackingStatus({ lifecycleStatus: 'completed' }), 'completed')
})

test('tracking filter matches only its selected status and the server page is capped at 100 orders', () => {
  assert.equal(transportOrderListPageSize, 100)
  assert.equal(trackingStatusMatches('in_progress', 'in_progress'), true)
  assert.equal(trackingStatusMatches('aftercare', 'in_progress'), false)
  assert.equal(trackingStatusMatches('upcoming', 'all'), true)
})
