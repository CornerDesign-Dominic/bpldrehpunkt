import assert from 'node:assert/strict'
import test from 'node:test'
import { latestTransportOrderRefresh, mergeTransportOrderRefreshes, transportOrderResult, transportOrderWorkspaceScope, transportOrderWorkspaceStops } from './transportOrderWorkspacePresentation.js'

test('unknown source amounts never become zero profit; real zero values remain valid', () => {
  assert.equal(transportOrderResult({ revenueNet: 0, costNet: 20 }), -20)
  assert.equal(transportOrderResult({ revenueNet: 980, costNet: 790 }), 190)
  assert.equal(transportOrderResult({ revenueNet: 980, costNet: null }), null)
  assert.equal(transportOrderResult({ revenueNet: 0.3, costNet: 0.1 }), 0.2)
})

test('confirmed refresh receipts survive a failed history reload and merge once the server returns', () => {
  const receipt = { id: 'receipt', scope: 'all', status: 'success', completedAt: '2026-10-31T12:00:00Z' }
  const previous = { id: 'old', scope: 'all', status: 'success', completedAt: '2026-10-31T10:00:00Z' }
  const interim = mergeTransportOrderRefreshes([previous], [receipt])
  assert.equal(latestTransportOrderRefresh(interim, 'all'), receipt)
  const serverReceipt = { ...receipt, actorName: 'Server actor' }
  const confirmed = mergeTransportOrderRefreshes([serverReceipt, previous], [receipt])
  assert.equal(confirmed.length, 2)
  assert.equal(confirmed[0], serverReceipt)
})

test('all source stops and explicitly empty new source data take precedence over legacy endpoints', () => {
  const stops = [{ sourceId: 'one' }, { sourceId: 'two' }, { sourceId: 'three' }]
  assert.equal(transportOrderWorkspaceStops({ stops }), stops)
  assert.deepEqual(transportOrderWorkspaceStops({ stops: [], loading: { city: 'old' } }), [])
  assert.equal(transportOrderWorkspaceStops({ loading: { city: 'Hamburg' }, unloading: { originalText: 'Dortmund' } }).length, 2)
})

test('tab actions share the agreed order scope and timestamps are scoped to their data', () => {
  assert.equal(transportOrderWorkspaceScope('finance'), 'order')
  assert.equal(transportOrderWorkspaceScope('transport'), 'order')
  assert.equal(transportOrderWorkspaceScope('partners'), 'partners')
  assert.equal(transportOrderWorkspaceScope('overview'), 'all')
  assert.equal(transportOrderWorkspaceScope('history'), null)
  const entries = [{ id: 'all', scope: 'all', completedAt: '2026-10-31T10:00:00Z' }, { id: 'order', scope: 'order', completedAt: '2026-10-31T11:00:00Z' }]
  assert.equal(latestTransportOrderRefresh(entries, 'partners').id, 'all')
  assert.equal(latestTransportOrderRefresh(entries, 'order').id, 'order')
  assert.equal(latestTransportOrderRefresh(entries, 'all').id, 'all')
  assert.equal(latestTransportOrderRefresh(entries.filter((entry) => entry.scope !== 'all'), 'all'), null)
})
