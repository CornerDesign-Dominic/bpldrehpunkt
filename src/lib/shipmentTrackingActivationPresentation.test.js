import test from 'node:test'
import assert from 'node:assert/strict'
import { shipmentTrackingActivationAt, shipmentTrackingActivationPresentation } from './shipmentTrackingActivationPresentation.js'

test('the automatic start countdown uses the persisted Europe/Berlin wall-clock time', () => {
  const model = shipmentTrackingActivationPresentation({ startAt: { date: '2026-10-01', time: '07:00' } }, { now: new Date('2026-10-01T04:30:00.000Z') })
  assert.equal(model.countdown, 'Automatischer Start in 0 Std. 30 Min.')
  assert.match(model.startAt, /^Startzeitpunkt: Do\., 01\.10\.2026, 07:00 Uhr$/)
})

test('the automatic start conversion respects the Berlin summer-time offset', () => {
  assert.equal(shipmentTrackingActivationAt({ date: '2026-07-01', time: '07:00' }).toISOString(), '2026-07-01T05:00:00.000Z')
})

test('missing activation data never invents a countdown', () => {
  assert.deepEqual(shipmentTrackingActivationPresentation({ startAt: null }), { available: false, countdown: 'Automatischer Startzeitpunkt nicht berechenbar.', startAt: null })
})
