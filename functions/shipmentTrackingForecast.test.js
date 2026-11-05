import test from 'node:test'
import assert from 'node:assert/strict'
import { shipmentTrackingForecastRefreshKind } from './shipmentTrackingForecast.js'

test('precision-only changes refresh the corresponding persisted forecast without needing a changed clock', () => {
  for (const [field, expected] of [['actualArrivalLoadingAt', 'forecast'], ['actualArrivalUnloadingAt', 'arrival']]) {
    const before = { [field]: '2026-11-05T13:10:00Z', fieldSources: { [field]: { derivation: { timingApproximate: true } } } }
    const after = { [field]: before[field], fieldSources: {} }
    assert.equal(shipmentTrackingForecastRefreshKind(before, after), expected)
    assert.equal(shipmentTrackingForecastRefreshKind(after, before), expected)
  }
})

test('forecast-only writes and source timestamps do not create a refresh loop', () => {
  const before = { actualArrivalLoadingAt: '2026-11-05T13:10:00Z', fieldSources: { actualArrivalLoadingAt: { source: 'ai_mail' } } }
  assert.equal(shipmentTrackingForecastRefreshKind(before, { ...before, currentForecast: { state: 'unknown' }, updatedAt: 'later', fieldSources: { actualArrivalLoadingAt: { source: 'manual', receivedAt: 'later' } } }), null)
  assert.equal(shipmentTrackingForecastRefreshKind({}, { actualDepartureLoadingAt: '2026-11-05T13:10:00Z' }), 'forecast')
  assert.equal(shipmentTrackingForecastRefreshKind({}, { unloadingCompletedAt: '2026-11-05T13:10:00Z' }), 'arrival')
})
