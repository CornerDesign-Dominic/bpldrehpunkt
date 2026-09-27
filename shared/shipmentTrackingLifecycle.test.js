import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shipmentTrackingOperatingHours.js'
import { aftercareCompletionAt, preparationStart, shipmentTrackingLifecycle } from './shipmentTrackingLifecycle.js'

test('preparation starts on the second preceding open BPL day', () => {
  assert.deepEqual(preparationStart(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, '2026-10-05 07:00'), { date: '2026-10-01', time: '07:00' })
  assert.equal(shipmentTrackingLifecycle({ earliestLoading: '2026-10-05 07:00', latestUnloading: '2026-10-06 16:00', operatingHours: DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, now: '2026-10-01T08:00:00.000Z' }).phase, 'preparation')
})

test('closed BPL days are skipped for preparation and the aftercare end', () => {
  const settings = structuredClone(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS)
  settings.exceptions = { '2026-10-02': { isOpen: false, from: null, to: null, note: 'Brückentag' } }
  assert.deepEqual(preparationStart(settings, '2026-10-05 07:00'), { date: '2026-09-30', time: '07:00' })
  assert.deepEqual(aftercareCompletionAt(settings, '2026-09-30 16:00'), { date: '2026-10-05', time: '17:00' })
})

test('lifecycle moves from preparation to in progress, aftercare and completed', () => {
  const input = { earliestLoading: '2026-10-05 07:00', latestUnloading: '2026-10-06 16:00', operatingHours: DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS }
  assert.equal(shipmentTrackingLifecycle({ ...input, now: '2026-09-30T06:00:00.000Z' }).phase, 'upcoming')
  assert.equal(shipmentTrackingLifecycle({ ...input, now: '2026-10-02T06:00:00.000Z' }).phase, 'preparation')
  assert.equal(shipmentTrackingLifecycle({ ...input, now: '2026-10-05T06:00:00.000Z' }).phase, 'in_progress')
  assert.equal(shipmentTrackingLifecycle({ ...input, now: '2026-10-06T15:30:00.000Z' }).phase, 'aftercare')
  assert.equal(shipmentTrackingLifecycle({ ...input, now: '2026-10-08T16:01:00.000Z' }).phase, 'completed')
})
