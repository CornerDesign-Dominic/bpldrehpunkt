import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shipmentTrackingOperatingHours.js'
import { shipmentTrackingCompletionAt, shipmentTrackingLifecycle, shipmentTrackingStartAt } from './shipmentTrackingLifecycle.js'

test('tracking starts on the preceding open BPL day at 07:00', () => {
  assert.deepEqual(shipmentTrackingStartAt(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, '2026-10-06 23:00'), { date: '2026-10-05', time: '07:00' })
  assert.deepEqual(shipmentTrackingStartAt(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, '2026-10-05 04:00'), { date: '2026-10-02', time: '07:00' })
})

test('closed BPL days are skipped for both lifecycle boundaries', () => {
  const settings = structuredClone(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS)
  settings.exceptions = { '2026-10-02': { isOpen: false, from: null, to: null, note: 'Brückentag' } }
  assert.deepEqual(shipmentTrackingStartAt(settings, '2026-10-05 07:00'), { date: '2026-10-01', time: '07:00' })
  assert.deepEqual(shipmentTrackingCompletionAt(settings, '2026-10-01 16:00'), { date: '2026-10-05', time: '07:00' })
})

test('lifecycle exposes only upcoming, in-progress and completed phases', () => {
  const input = { earliestLoading: '2026-10-05 07:00', latestUnloading: '2026-10-06 16:00', operatingHours: DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS }
  assert.equal(shipmentTrackingLifecycle({ ...input, now: '2026-10-02T04:00:00.000Z' }).phase, 'upcoming')
  assert.equal(shipmentTrackingLifecycle({ ...input, now: '2026-10-02T05:00:00.000Z' }).phase, 'in_progress')
  assert.equal(shipmentTrackingLifecycle({ ...input, now: '2026-10-07T04:59:00.000Z' }).phase, 'in_progress')
  assert.equal(shipmentTrackingLifecycle({ ...input, now: '2026-10-07T06:00:00.000Z' }).phase, 'completed')
})
