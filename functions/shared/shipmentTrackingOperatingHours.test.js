import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, effectiveOperatingHours, isOpenAt, lastAllowedOperatingTime, previewShipmentTrackingOperatingHours, subtractWorkingMinutes, validateShipmentTrackingOperatingHours } from './shipmentTrackingOperatingHours.js'

function settingsWith(exceptions = {}) { return { ...DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, weekly: structuredClone(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS.weekly), exceptions } }

test('standard Monday to Friday hours and closed Sunday are applied in Europe/Berlin wall time', () => {
  assert.equal(isOpenAt(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, { date: '2026-12-08', time: '10:00' }), true)
  assert.equal(isOpenAt(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, { date: '2026-12-06', time: '10:00' }), false)
  assert.equal(effectiveOperatingHours(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, '2026-12-06').isOpen, false)
})

test('working hours subtract over a weekend', () => {
  const result = subtractWorkingMinutes(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, { date: '2026-12-07', time: '10:00' }, 4 * 60)
  assert.deepEqual(result.local, { date: '2026-12-04', time: '16:00' })
})

test('a shortened Friday exception fully replaces the weekly rule', () => {
  const settings = settingsWith({ '2026-12-11': { isOpen: true, from: '07:00', to: '16:00', note: 'Kürzerer Freitag' } })
  const result = subtractWorkingMinutes(settings, { date: '2026-12-14', time: '10:00' }, 4 * 60)
  assert.deepEqual(result.local, { date: '2026-12-11', time: '15:00' })
  assert.equal(effectiveOperatingHours(settings, '2026-12-11').source, 'exception')
})

test('an individually opened Saturday is used for backwards calculation', () => {
  const settings = settingsWith({ '2026-12-12': { isOpen: true, from: '08:00', to: '12:00', note: '' } })
  const result = subtractWorkingMinutes(settings, { date: '2026-12-14', time: '09:00' }, 3 * 60)
  assert.deepEqual(result.local, { date: '2026-12-12', time: '11:00' })
})

test('an action after closing is moved to the last permitted operating time', () => {
  const result = lastAllowedOperatingTime(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, { date: '2026-12-08', time: '21:00' })
  assert.deepEqual(result.local, { date: '2026-12-08', time: '17:00' })
  assert.equal(result.moved, true)
})

test('Tuesday 22:00 minus six working hours stays on Tuesday at 11:00', () => {
  const preview = previewShipmentTrackingOperatingHours(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, { referenceDate: '2026-12-08', referenceTime: '22:00', workingHours: 6, mode: 'subtract' })
  assert.deepEqual(preview.result, { date: '2026-12-08', time: '11:00' })
})

test('a fully closed configuration reports that no operating time exists', () => {
  const closed = settingsWith()
  for (const key of Object.keys(closed.weekly)) closed.weekly[key] = { isOpen: false, from: null, to: null }
  assert.throws(() => lastAllowedOperatingTime(closed, { date: '2026-12-08', time: '10:00' }), /keine Betriebszeit/)
})

test('invalid open windows are rejected before they can be saved', () => {
  const invalid = settingsWith()
  invalid.weekly.monday = { isOpen: true, from: '17:00', to: '07:00' }
  assert.throws(() => validateShipmentTrackingOperatingHours(invalid), /Ende der Betriebszeit/)
})

test('calendar arithmetic stays on Berlin dates across the daylight-saving boundary', () => {
  const result = subtractWorkingMinutes(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, { date: '2026-03-30', time: '08:00' }, 2 * 60)
  assert.deepEqual(result.local, { date: '2026-03-27', time: '16:00' })
})
