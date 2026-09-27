import test from 'node:test'
import assert from 'node:assert/strict'
import { trackingStatusMatches, transportOrderListPageSize, transportOrderTrackingStatus } from './transportOrderList.js'

test('list tracking status is derived only from the separate tracking lifecycle', () => {
  assert.equal(transportOrderTrackingStatus(null), 'upcoming')
  assert.equal(transportOrderTrackingStatus({ lifecycleStatus: 'active' }), 'active')
  assert.equal(transportOrderTrackingStatus({ lifecycleStatus: 'completed' }), 'completed')
})

test('tracking filter matches only its selected status and the server page is capped at 100 orders', () => {
  assert.equal(transportOrderListPageSize, 100)
  assert.equal(trackingStatusMatches('active', 'active'), true)
  assert.equal(trackingStatusMatches('completed', 'active'), false)
  assert.equal(trackingStatusMatches('upcoming', 'all'), true)
})
