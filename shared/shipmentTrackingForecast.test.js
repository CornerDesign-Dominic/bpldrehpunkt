import assert from 'node:assert/strict'
import test from 'node:test'
import { shipmentTrackingAttention } from './shipmentTrackingAttention.js'
import { buildShipmentTrackingForecast, vehicleForecastProfile } from './shipmentTrackingForecast.js'
import { shipmentTrackingDate } from './shipmentTrackingTime.js'

const imported = {
  shipment: { vehicleType: 'Tautliner mit Plane' },
  loading: { window: { from: '2026-10-06T12:00:00Z' } },
  unloading: { window: { until: '2026-10-07T18:00:00Z' } },
}

test('forecast matches imported vehicle aliases and discloses standard fallback', () => {
  assert.equal(vehicleForecastProfile('Tautliner mit Plane').loadingDurationHours, 2)
  assert.equal(vehicleForecastProfile('Unbekanntes Sonderfahrzeug').assumed, true)
})

test('forecast is grey after an ETA-based loading assumption expires', () => {
  const result = buildShipmentTrackingForecast({ tracking: { estimatedArrivalLoadingAt: '2026-10-06T08:00:00Z' }, imported, route: { roundedDistanceKm: 650 }, now: new Date('2026-10-06T10:01:00Z') })
  assert.equal(result.kind, 'forecast')
  assert.equal(result.state, 'grey')
  assert.equal(result.source, 'estimated_arrival_loading')
})

test('actual unloading ends forecast calculation with a separate house result', () => {
  const result = buildShipmentTrackingForecast({ tracking: { actualArrivalUnloadingAt: '2026-10-07T17:45:00Z' }, imported, route: { roundedDistanceKm: 650 } })
  assert.deepEqual(result.kind, 'arrival')
  assert.equal(result.state, 'green')
})

test('attention uses a stopwatch instead of a duplicate truck during loading', () => {
  const result = shipmentTrackingAttention({ tracking: { lifecycleStatus: 'active', lifecyclePhase: 'in_progress', actualArrivalLoadingAt: '2026-10-06T08:00:00Z' }, imported, now: new Date('2026-10-06T09:15:00Z') })
  assert.equal(result.items.some((item) => item.icon === 'stopwatch'), true)
  assert.equal(result.items.some((item) => item.id === 'loading-arrival'), false)
})

test('bare local date-times are parsed in Berlin time across DST and reject a missing clock time', () => {
  assert.equal(shipmentTrackingDate('2026-03-29T01:30').toISOString(), '2026-03-29T00:30:00.000Z')
  assert.equal(shipmentTrackingDate('2026-03-29T02:30'), null)
  assert.equal(shipmentTrackingDate('2026-10-25T02:30').toISOString(), '2026-10-25T00:30:00.000Z')
})

test('attention applies exact working-hour thresholds to retroactive missing loading arrivals', () => {
  const yellow = shipmentTrackingAttention({ tracking: { lifecycleStatus: 'active', lifecyclePhase: 'in_progress' }, imported, now: new Date('2026-10-06T06:00:00Z') })
  const red = shipmentTrackingAttention({ tracking: { lifecycleStatus: 'active', lifecyclePhase: 'in_progress' }, imported, now: new Date('2026-10-06T10:00:00Z') })
  assert.equal(yellow.items.find((item) => item.id === 'loading-arrival').severity, 'warning')
  assert.equal(red.items.find((item) => item.id === 'loading-arrival').severity, 'critical')
})

test('loading-start and loading-end stopwatch limits remain independent', () => {
  const settings = { timing: { loadingStartYellowElapsedHours: 1, loadingStartRedElapsedHours: 2, loadingEndYellowElapsedHours: 3, loadingEndRedElapsedHours: 4 } }
  const beforeStart = shipmentTrackingAttention({ tracking: { actualArrivalLoadingAt: '2026-10-06T08:00:00Z' }, imported, settings, now: new Date('2026-10-06T10:30:00Z') })
  const afterStart = shipmentTrackingAttention({ tracking: { actualArrivalLoadingAt: '2026-10-06T08:00:00Z', loadingStartedAt: '2026-10-06T08:00:00Z' }, imported, settings, now: new Date('2026-10-06T10:30:00Z') })
  assert.equal(beforeStart.items.find((item) => item.id === 'loading-wait').severity, 'critical')
  assert.equal(afterStart.items.find((item) => item.id === 'loading-wait').severity, 'success')
})

test('forecast color uses the active admin thresholds while preserving the calculated span', () => {
  const base = { tracking: { actualDepartureLoadingAt: '2026-10-06T10:00:00Z' }, imported: { ...imported, unloading: { window: { until: '2026-10-06T20:00:00Z' } } }, route: { roundedDistanceKm: 650 } }
  const yellow = buildShipmentTrackingForecast({ ...base, settings: { redThresholdPercent: 15, greenThresholdPercent: 50 } })
  const red = buildShipmentTrackingForecast({ ...base, settings: { redThresholdPercent: 60, greenThresholdPercent: 70 } })
  assert.equal(yellow.onTimeSharePercent, red.onTimeSharePercent)
  assert.equal(yellow.state, 'yellow')
  assert.equal(red.state, 'red')
})

test('a fresh location report and an active reported pause affect a refresh without becoming an automatic trigger', () => {
  const result = buildShipmentTrackingForecast({
    tracking: { actualDepartureLoadingAt: '2026-10-06T10:00:00Z' }, imported, route: { roundedDistanceKm: 650 }, now: new Date('2026-10-06T11:00:00Z'),
    events: [
      { eventType: 'transit_position_reported', eventTime: '2026-10-06T10:45:00Z', newValue: { transitEntry: { at: '2026-10-06T10:45:00Z', kilometersToDestination: 100 } } },
      { eventType: 'transit_pause_reported', eventTime: '2026-10-06T10:50:00Z', newValue: { transitEntry: { at: '2026-10-06T10:50:00Z', durationMinutes: 30 } } },
    ],
  })
  assert.equal(result.inputs.usedDistanceKm, 100)
  assert.equal(result.inputs.activePauseMinutes, 20)
  assert.equal(result.assumptions.some((item) => item.includes('Standortmeldung')), true)
})
