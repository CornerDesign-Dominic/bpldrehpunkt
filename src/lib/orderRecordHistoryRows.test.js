import assert from 'node:assert/strict'
import test from 'node:test'
import { orderRecordHistoryRows, trackingRecordHistoryRows } from './orderRecordHistoryRows.js'

test('order history interleaves field changes, creation, legacy and every refresh outcome', () => {
  const changes = [
    { id: 'created', eventType: 'transport_order_created', recordedAt: '2026-10-31T08:00:00Z' },
    { id: 'old', summary: 'Legacy entry', recordedAt: '2026-10-31T08:10:00Z' },
    { id: 'fields', recordedAt: '2026-10-31T09:00:00Z', metadata: { changes: [{ path: 'first', label: 'First', oldValue: 0, newValue: 1 }, { path: 'second', label: 'Second', oldValue: 'a', newValue: 'b' }] } },
  ]
  const statuses = ['success', 'partial', 'failed', 'running', 'unconfirmed']
  const refreshes = statuses.map((status, index) => ({ id: status, scope: 'all', status, startedAt: `2026-10-31T10:0${index}:00Z` }))
  const rows = orderRecordHistoryRows({}, changes, refreshes)
  assert.equal(rows.length, 9)
  assert.deepEqual(rows.slice(0, 5).map((row) => row.entry.status), statuses.toReversed())
  assert.equal(rows.filter((row) => row.type === 'change').length, 2)
  assert.equal(rows.filter((row) => row.type === 'creation').length, 1)
  assert.equal(rows.filter((row) => row.type === 'legacy').length, 1)
})

test('refresh receipt duplicates are removed without suppressing repeated real field changes', () => {
  const receipt = { id: 'receipt', status: 'success', completedAt: '2026-10-31T10:00:00Z' }
  assert.equal(orderRecordHistoryRows({}, [], [receipt, receipt]).length, 1)
})

test('tracking history preserves empty-field, duration and unknown events and records both clocks', () => {
  const events = [
    { id: 'duration', eventType: 'loading_duration_reported', eventTime: '2026-10-31T08:00:00Z', recordedAt: '2026-10-31T10:00:00Z', changedFields: [] },
    { id: 'unknown', eventType: 'future_event', recordedAt: '2026-10-31T09:00:00Z' },
    { id: 'no-time', eventType: 'tracking_updated' },
  ]
  const rows = trackingRecordHistoryRows(events)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].entry.id, 'duration')
  assert.equal(rows[0].timestamp, events[0].eventTime)
  assert.equal(rows[0].recordedAt, events[0].recordedAt)
  assert.equal(rows[1].entry.id, 'unknown')
})
