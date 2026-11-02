import assert from 'node:assert/strict'
import test from 'node:test'
import { shipmentTrackingAttention } from './shipmentTrackingAttention.js'
import { buildShipmentTrackingForecast, vehicleForecastProfile } from './shipmentTrackingForecast.js'
import { shipmentTrackingDate } from './shipmentTrackingTime.js'

const imported = {
  shipment: { vehicleType: 'Tautliner mit Plane' },
  loading: { window: { from: '2026-10-06T12:00:00Z', until: '2026-10-06T14:00:00Z' } },
  unloading: { window: { from: '2026-10-07T12:00:00Z', until: '2026-10-07T18:00:00Z' } },
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
  assert.equal(result.slotStartAt, '2026-10-07T12:00:00.000Z')
})

test('forecast exposes both bounds of the unloading time slot', () => {
  const result = buildShipmentTrackingForecast({ tracking: { actualDepartureLoadingAt: '2026-10-06T10:00:00Z' }, imported, route: { roundedDistanceKm: 650 } })
  assert.equal(result.loadingSlotStartAt, '2026-10-06T12:00:00.000Z')
  assert.equal(result.loadingSlotEndAt, '2026-10-06T14:00:00.000Z')
  assert.equal(result.loadingFacts.actualDepartureAt, '2026-10-06T10:00:00.000Z')
  assert.equal(result.slotStartAt, '2026-10-07T12:00:00.000Z')
  assert.equal(result.deadlineAt, '2026-10-07T18:00:00.000Z')
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

test('departure preserves current unloading warning and separates historical loading gaps', () => {
  const result = shipmentTrackingAttention({ tracking: { actualDepartureLoadingAt: '2026-10-06T12:00:00Z' }, imported, now: new Date('2026-10-08T18:00:00Z') })
  assert.equal(result.items.find((item) => item.id === 'unloading-arrival').severity, 'critical')
  assert.equal(result.items.some((item) => item.icon === 'stopwatch'), false)
  assert.deepEqual(result.history.missingFields, ['actualArrivalLoadingAt', 'loadingStartedAt', 'loadingCompletedAt'])
})

test('closed transports hide mail review and pause but retain neutral history', () => {
  const result = shipmentTrackingAttention({ tracking: { lifecycleStatus: 'completed', automationPaused: true, actualArrivalUnloadingAt: '2026-10-07T18:00:00Z' }, imported, receivedMails: [{ ai: { reviewRequired: true } }] })
  assert.deepEqual(result.items, [])
  assert.equal(result.history.severity, 'neutral')
})

test('a completed unloading or manually completed tracking suppresses every operational truck prompt', () => {
  for (const tracking of [
    { unloadingCompletedAt: '2026-10-07T18:00:00Z' },
    { lifecycleStatus: 'completed' },
  ]) {
    const result = shipmentTrackingAttention({ tracking, imported, now: new Date('2026-10-08T10:00:00Z') })
    assert.equal(result.items.some((item) => item.id === 'loading-arrival' || item.id === 'departure-missing' || item.id === 'departure-confirmation' || item.id === 'unloading-arrival' || item.id === 'in-transit'), false)
  }
})

test('forecast color uses the active admin thresholds while preserving the calculated span', () => {
  const base = { tracking: { actualDepartureLoadingAt: '2026-10-06T10:00:00Z' }, imported: { ...imported, unloading: { window: { until: '2026-10-07T07:30:00Z' } } }, route: { roundedDistanceKm: 650 } }
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

test('forecast plans mandatory driving breaks and daily rest for a long single-driver journey', () => {
  const result = buildShipmentTrackingForecast({
    tracking: { actualDepartureLoadingAt: '2026-10-05T08:00:00Z' },
    imported: { ...imported, unloading: { window: { until: '2026-10-07T18:00:00Z' } } },
    route: { roundedDistanceKm: 617.5 },
  })
  assert.equal(result.inputs.regulatedRestPlanning.realistic.breakCount, 1)
  assert.equal(result.inputs.regulatedRestPlanning.realistic.dailyRestCount, 1)
  assert.equal(result.arrivals.realistic, '2026-10-06T05:15:00.000Z')
})

test('forecast plans a reduced Sunday rest in optimistic and realistic scenarios and a regular one pessimistically', () => {
  const result = buildShipmentTrackingForecast({
    tracking: { actualDepartureLoadingAt: '2026-10-03T08:00:00Z' },
    imported: { ...imported, unloading: { window: { until: '2026-10-08T18:00:00Z' } } },
    route: { roundedDistanceKm: 1450 },
  })
  assert.equal(result.inputs.regulatedRestPlanning.optimistic.weeklyRestHours, 24)
  assert.equal(result.inputs.regulatedRestPlanning.realistic.weeklyRestHours, 24)
  assert.equal(result.inputs.regulatedRestPlanning.pessimistic.weeklyRestHours, 45)
  assert.equal(result.assumptions.some((item) => item.startsWith('Wochenendplanung: Bei einer Fahrt bis Sonntag')), true)
})

test('later loading facts suppress obsolete arrival prompts without inventing times', () => {
  for (const tracking of [{ loadingStartedAt: '2026-10-06T08:00:00Z' }, { loadingCompletedAt: '2026-10-06T09:00:00Z' }]) {
    const result = shipmentTrackingAttention({ tracking, imported, now: new Date('2026-10-06T09:15:00Z') })
    assert.equal(result.items.some((item) => item.id === 'loading-arrival'), false)
    assert.ok(result.history.missingFields.includes('actualArrivalLoadingAt'))
    assert.equal(tracking.actualArrivalLoadingAt, undefined)
  }
})

test('unloading progress and final closure suppress obsolete warnings and forecasts', () => {
  for (const tracking of [{ unloadingStartedAt: '2026-10-07T18:00:00Z' }, { unloadingCompletedAt: '2026-10-07T18:00:00Z' }, { lifecycleStatus: 'completed' }]) {
    const attention = shipmentTrackingAttention({ tracking, imported })
    assert.deepEqual(attention.items, [])
    assert.ok(attention.history.missingFields.includes('actualDepartureLoadingAt'))
    const forecast = buildShipmentTrackingForecast({ tracking, imported })
    assert.equal(forecast.kind, 'completed')
    assert.equal(forecast.state, tracking.lifecycleStatus === 'completed' ? 'neutral' : 'unknown')
  }
})

test('complete historical facts remove the history icon', () => {
  const tracking = { licensePlate: 'B AB 123', actualArrivalLoadingAt: '2026-10-06T08:00:00Z', loadingStartedAt: '2026-10-06T08:10:00Z', loadingCompletedAt: '2026-10-06T09:00:00Z', actualDepartureLoadingAt: '2026-10-06T09:10:00Z', actualArrivalUnloadingAt: '2026-10-07T12:00:00Z', unloadingStartedAt: '2026-10-07T12:10:00Z', unloadingCompletedAt: '2026-10-07T13:00:00Z' }
  assert.equal(shipmentTrackingAttention({ tracking, imported }).history, null)
})

test('mail pause preserves all live warning colors and only adds a neutral pause notice', () => {
  const scenarios = [
    [{}, '2026-10-01T01:00:00Z'],
    [{ estimatedArrivalLoadingAt: '2026-10-06T08:00:00Z' }, '2026-10-01T01:00:00Z'],
    [{ actualDepartureLoadingAt: '2026-10-06T10:00:00Z' }, '2026-10-07T15:30:00Z'],
    [{ actualDepartureLoadingAt: '2026-10-06T10:00:00Z' }, '2026-10-09T18:00:00Z'],
    [{ actualArrivalLoadingAt: '2026-10-06T08:00:00Z' }, '2026-10-06T08:05:00Z'],
    [{ actualArrivalLoadingAt: '2026-10-06T08:00:00Z' }, '2026-10-09T18:00:00Z'],
    [{ unloadingStartedAt: '2026-10-07T12:00:00Z' }, '2026-10-07T13:00:00Z'],
  ]
  for (const [facts, at] of scenarios) {
    const tracking = { lifecycleStatus: 'active', lifecyclePhase: 'in_progress', ...facts }
    const args = { tracking, imported, now: new Date(at), receivedMails: [{ ai: { reviewRequired: true } }] }
    const active = shipmentTrackingAttention(args)
    const paused = shipmentTrackingAttention({ ...args, tracking: { ...tracking, automationPaused: true } })
    assert.deepEqual(paused.items.filter((item) => item.id !== 'automation-paused'), active.items)
    assert.equal(paused.items.find((item) => item.id === 'automation-paused').severity, 'neutral')
    assert.deepEqual(paused.history, active.history)
  }
})

test('final closure neutralizes even a late arrival without losing its historical result', () => {
  const tracking = { lifecycleStatus: 'completed', actualArrivalUnloadingAt: '2026-10-09T18:00:00Z', automationPaused: true }
  const result = buildShipmentTrackingForecast({ tracking, imported })
  assert.equal(result.kind, 'completed')
  assert.equal(result.state, 'neutral')
  assert.equal(result.arrivalState, 'yellow')
  assert.equal(result.actualArrivalUnloadingAt, tracking.actualArrivalUnloadingAt.replace('Z', '.000Z'))
  const attention = shipmentTrackingAttention({ tracking, imported, receivedMails: [{ ai: { status: 'error' } }] })
  assert.deepEqual(attention.visible, [])
  assert.ok(attention.history)
})

test('aftercare and past dates alone never count as final closure', () => {
  const result = shipmentTrackingAttention({ tracking: { lifecycleStatus: 'active', lifecyclePhase: 'aftercare', automationPaused: true }, imported, now: new Date('2026-10-20T18:00:00Z') })
  assert.ok(result.items.some((item) => item.severity === 'critical'))
  assert.ok(result.items.some((item) => item.id === 'automation-paused'))
})
