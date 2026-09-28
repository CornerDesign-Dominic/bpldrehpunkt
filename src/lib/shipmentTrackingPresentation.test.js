import test from 'node:test'
import assert from 'node:assert/strict'
import { formatShipmentTrackingDelay, formatShipmentTrackingRoutePlan, formatShipmentTrackingSlot, shipmentTrackingEventDescription, shipmentTrackingScheduleStatus, shipmentTrackingStageConfigurations, shipmentTrackingStageEventDetails, shipmentTrackingStageEvents, shipmentTrackingStationAssessments, shipmentTrackingStationStateDefinitions, shipmentTrackingStationSummary, shipmentTrackingStations, shipmentTrackingTimelineModel } from './shipmentTrackingPresentation.js'

const imported = {
  loading: { window: { from: '2026-09-25T08:00', until: '2026-09-25T10:00' } },
  unloading: { window: { from: '2026-09-25T14:30', until: '2026-09-25T16:30' } },
}

test('timeline model uses the neutral upcoming state until manual tracking exists', () => {
  const model = shipmentTrackingTimelineModel(null, imported)
  assert.equal(model.lifecycleLabel, 'Bevorstehend')
  assert.equal(model.statusLabel, 'Sendungsverfolgung noch nicht gestartet')
  assert.equal(model.vehiclePosition.stageId, 'preparation')
  assert.equal(model.stations.find((station) => station.id === 'loading').plan, 'Fr., 08:00–10:00')
})

test('history description remains understandable for tracked field corrections', () => {
  assert.match(shipmentTrackingEventDescription({ eventType: 'tracking_updated', changedFields: ['actualArrivalLoadingAt'], newValue: { actualArrivalLoadingAt: new Date('2026-09-25T08:07:00') } }), /Tatsächliche Ankunft Ladestelle erfasst: 08:07/)
})

test('recipient history makes old and new manual addresses understandable', () => {
  assert.equal(shipmentTrackingEventDescription({ eventType: 'tracking_recipients_updated', changedFields: ['recipients.customer'], oldValue: { recipients: { customer: { email: 'old@example.test' } } }, newValue: { recipients: { customer: { email: 'new@example.test' } } } }), 'Empfänger Kunde: old@example.test → new@example.test')
  assert.equal(shipmentTrackingEventDescription({ eventType: 'tracking_recipients_updated', changedFields: ['recipients.carrier'], oldValue: { recipients: { carrier: { email: 'carrier@example.test' } } }, newValue: { recipients: { carrier: null } } }), 'Empfänger Unternehmer: carrier@example.test → Nicht hinterlegt')
})

test('an active manual tracking state is labelled as running', () => {
  const model = shipmentTrackingTimelineModel({ lifecycleStatus: 'active' }, imported)
  assert.equal(model.lifecycleLabel, 'Laufend')
  assert.equal(model.statusLabel, 'Manuelles Tracking aktiv')
  assert.equal(model.trackingTypeLabel, 'Manuell')
})

test('timeline presentation exposes automatic tracking as a type label only', () => {
  const model = shipmentTrackingTimelineModel({ lifecycleStatus: 'active', trackingMode: 'automatic' }, imported)
  assert.equal(model.lifecycleLabel, 'Laufend')
  assert.equal(model.trackingTypeLabel, 'Automatisch')
})

test('an actual time within a planned window is shown as on plan', () => {
  assert.deepEqual(shipmentTrackingScheduleStatus({ plannedFrom: '2026-09-25T08:00', plannedUntil: '2026-09-25T10:00', actualAt: new Date('2026-09-25T08:07:00') }), { key: 'on-plan', label: 'Im Plan' })
})

test('a later actual time creates a positive, readable deviation', () => {
  assert.deepEqual(shipmentTrackingScheduleStatus({ plannedUntil: '2026-09-25T10:00', actualAt: new Date('2026-09-25T10:22:00') }), { key: 'deviation', label: 'Abweichung', detail: '+22 Min. verspätet', differenceMinutes: 22 })
})

test('a planned time without an actual remains open', () => {
  assert.deepEqual(shipmentTrackingScheduleStatus({ plannedUntil: '2026-09-25T10:00' }), { key: 'open', label: 'Noch offen' })
})

test('an actual time without a planned comparison remains not assessable', () => {
  assert.deepEqual(shipmentTrackingScheduleStatus({ actualAt: new Date('2026-09-25T10:00:00') }), { key: 'not-assessable', label: 'Noch nicht beurteilbar' })
})

test('forecasts are never used as actuals or planned times', () => {
  const stations = shipmentTrackingStations({ tracking: { estimatedArrivalLoadingAt: new Date('2026-09-25T07:50:00') }, imported: { loading: {} } })
  const loading = stations.find((station) => station.id === 'loading')
  assert.deepEqual(loading.actualRows, [])
  assert.deepEqual(loading.forecastRows, [{ label: 'Voraussichtliche Ankunft', value: '07:50' }])
  assert.equal(loading.plan, 'Sollzeit fehlt')
  assert.equal(loading.status.label, 'Noch nicht beurteilbar')
})

test('missing data never invents a time or a positive status', () => {
  const stations = shipmentTrackingStations({ imported: {} })
  const loading = stations.find((station) => station.id === 'loading')
  assert.equal(loading.plan, 'Sollzeit fehlt')
  assert.deepEqual(loading.actualRows, [])
  assert.equal(loading.status.label, 'Noch nicht beurteilbar')
  assert.notEqual(loading.status.label, 'Im Plan')
})

test('stations only expose their professionally relevant tracking information', () => {
  const stations = shipmentTrackingStations({ tracking: {
    licensePlate: 'AB-CD 123',
    actualArrivalLoadingAt: new Date('2026-09-25T08:07:00'),
    actualDepartureLoadingAt: new Date('2026-09-25T09:55:00'),
    estimatedArrivalUnloadingAt: new Date('2026-09-25T14:20:00'),
    proofStatus: 'received',
  }, imported, route: { roundedDistanceKm: 290 } })
  const preparation = stations.find((station) => station.id === 'preparation')
  const loading = stations.find((station) => station.id === 'loading')
  const transit = stations.find((station) => station.id === 'in_transit')
  const afterTransport = stations.find((station) => station.id === 'afterTransport')
  assert.deepEqual(preparation.actualRows, [{ kind: 'license-plate', label: 'Kennzeichen', value: 'AB-CD 123' }])
  assert.deepEqual(loading.forecastRows, [])
  assert.deepEqual(transit.forecastRows, [{ label: 'Prognose Ankunft', value: '14:20' }])
  assert.equal(transit.plan, '290 km\n4 Std. 9 Min.')
  assert.equal(afterTransport.emptyMessage, 'Nachweise vorhanden')
})

test('manual tracking keeps its existing vehicle position in the extended timeline model', () => {
  const model = shipmentTrackingTimelineModel({ lifecycleStatus: 'active', stageId: 'in_transit', progressToNextStage: 0.4 }, imported)
  assert.deepEqual(model.vehiclePosition, { stageId: 'in_transit', progressToNextStage: 0.4 })
  assert.equal(model.trackingExists, true)
})

const stationStates = (tracking) => shipmentTrackingStations({ tracking, imported }).map((station) => station.workflowState)

test('tracking not started keeps every station pending', () => {
  assert.deepEqual(stationStates(null), ['pending', 'pending', 'pending', 'pending', 'pending'])
})

test('started tracking without a license plate keeps preparation active', () => {
  assert.deepEqual(stationStates({ lifecycleStatus: 'active' }), ['active', 'pending', 'pending', 'pending', 'pending'])
})

test('a license plate completes preparation and activates loading', () => {
  assert.deepEqual(stationStates({ lifecycleStatus: 'active', licensePlate: 'AB-CD 123' }), ['completed', 'active', 'pending', 'pending', 'pending'])
})

test('an actual loading departure completes loading and activates transit', () => {
  assert.deepEqual(stationStates({ lifecycleStatus: 'active', licensePlate: 'AB-CD 123', actualDepartureLoadingAt: new Date('2026-09-25T09:55:00') }), ['completed', 'completed', 'active', 'pending', 'pending'])
})

test('an actual unloading arrival completes transit and activates unloading', () => {
  assert.deepEqual(stationStates({ lifecycleStatus: 'active', licensePlate: 'AB-CD 123', actualDepartureLoadingAt: new Date('2026-09-25T09:55:00'), actualArrivalUnloadingAt: new Date('2026-09-25T14:28:00') }), ['completed', 'completed', 'completed', 'active', 'pending'])
})

test('tracking completion completes the after-transport station', () => {
  const states = stationStates({ lifecycleStatus: 'completed', licensePlate: 'AB-CD 123', actualDepartureLoadingAt: new Date('2026-09-25T09:55:00'), actualArrivalUnloadingAt: new Date('2026-09-25T14:28:00'), unloadingStartedAt: new Date('2026-09-25T14:35:00'), unloadingCompletedAt: new Date('2026-09-25T15:10:00') })
  assert.deepEqual(states, ['completed', 'completed', 'completed', 'completed', 'completed'])
})

test('automation and manual escalation remain supported visual states without automatic derivation', () => {
  assert.equal(shipmentTrackingStationStateDefinitions.automationActive.label, 'Automatik läuft')
  assert.equal(shipmentTrackingStationStateDefinitions.manualEscalation.label, 'Manuelle Klärung erforderlich')
  assert.equal(stationStates({ lifecycleStatus: 'active', licensePlate: 'AB-CD 123' }).includes('automationActive'), false)
  assert.equal(stationStates({ lifecycleStatus: 'active', licensePlate: 'AB-CD 123' }).includes('manualEscalation'), false)
})

test('delay formatting remains readable for minutes, hours and days', () => {
  assert.equal(formatShipmentTrackingDelay(22), '+22 Min. verspätet')
  assert.equal(formatShipmentTrackingDelay(90), '+1 Std. 30 Min. verspätet')
  assert.equal(formatShipmentTrackingDelay(1550), '1 Tag 1 Std. 50 Min. verspätet')
})

test('slot formatting keeps a same-day window compact', () => {
  assert.equal(formatShipmentTrackingSlot('2026-09-28T07:00', '2026-09-28T14:00'), 'Mo., 07:00–14:00')
})

test('slot formatting uses a two-line fixed date for identical complete timestamps', () => {
  assert.equal(formatShipmentTrackingSlot('2026-10-01T12:00', '2026-10-01T12:00'), 'FIX\nDo., 12:00')
})

test('slot formatting identifies raw and normalized time-only end values as fixed dates', () => {
  assert.equal(formatShipmentTrackingSlot('01.10.2026 12:00', '12:00'), 'FIX\nDo., 12:00')
  assert.equal(formatShipmentTrackingSlot('2026-10-01T12:00', '2026-10-01T12:00'), 'FIX\nDo., 12:00')
})

test('slot formatting identifies a complete start without an end as a fixed date', () => {
  assert.equal(formatShipmentTrackingSlot('2026-10-01T12:00', null), 'FIX\nDo., 12:00')
})

test('slot formatting keeps explicit different dates and times as time windows', () => {
  assert.equal(formatShipmentTrackingSlot('2026-10-01T12:00', '2026-10-02T12:00'), 'Do., 12:00 – Fr., 12:00')
  assert.equal(formatShipmentTrackingSlot('2026-10-01T12:00', '13:00'), 'Do., 12:00–13:00')
  assert.equal(formatShipmentTrackingSlot(null, '12:00'), 'Sollzeit fehlt')
})

test('slot formatting shows both weekdays across different days within a week', () => {
  assert.equal(formatShipmentTrackingSlot('2026-09-28T07:00', '2026-09-30T14:00'), 'Mo., 07:00 – Mi., 14:00')
})

test('slot formatting keeps exactly seven calendar days in weekday notation', () => {
  assert.equal(formatShipmentTrackingSlot('2026-09-28T07:00', '2026-10-05T14:00'), 'Mo., 07:00 – Mo., 14:00')
})

test('slot formatting adds day and month after more than seven calendar days', () => {
  assert.equal(formatShipmentTrackingSlot('2026-09-28T07:00', '2026-10-06T14:00'), 'Mo., 28.09. · 07:00 – Di., 06.10. · 14:00')
})

test('slot formatting remains compact across a month change within a week', () => {
  assert.equal(formatShipmentTrackingSlot('2026-09-30T07:00', '2026-10-02T14:00'), 'Mi., 07:00 – Fr., 14:00')
})

test('slot formatting shows both years over a year transition', () => {
  assert.equal(formatShipmentTrackingSlot('2026-12-29T07:00', '2027-01-05T14:00'), 'Di., 29.12.2026 · 07:00 – Di., 05.01.2027 · 14:00')
})

test('slot formatting handles individual start, end and missing values', () => {
  assert.equal(formatShipmentTrackingSlot('2026-09-28T07:00', null), 'FIX\nMo., 07:00')
  assert.equal(formatShipmentTrackingSlot(null, '2026-09-30T14:00'), 'bis Mi., 14:00')
  assert.equal(formatShipmentTrackingSlot(null, null), 'Sollzeit fehlt')
})

test('slot formatting uses Europe Berlin across the daylight-saving boundary', () => {
  assert.equal(formatShipmentTrackingSlot(new Date('2026-03-29T00:30:00Z'), new Date('2026-03-29T01:30:00Z')), 'So., 01:30–03:30')
})

test('transit presents only the stored manual route as a plan value', () => {
  assert.equal(formatShipmentTrackingRoutePlan(290), '290 km\n4 Std. 9 Min.')
  assert.equal(formatShipmentTrackingRoutePlan(null), 'Planstrecke noch nicht berechnet')
})

test('every station editor is restricted to its own tracking fields', () => {
  assert.deepEqual(shipmentTrackingStageConfigurations.preparation.fields, ['licensePlate'])
  assert.deepEqual(shipmentTrackingStageConfigurations.loading.fields, ['estimatedArrivalLoadingAt', 'actualArrivalLoadingAt', 'loadingStartedAt', 'loadingCompletedAt', 'estimatedDepartureLoadingAt', 'actualDepartureLoadingAt'])
  assert.deepEqual(shipmentTrackingStageConfigurations.in_transit.fields, ['estimatedArrivalUnloadingAt'])
  assert.deepEqual(shipmentTrackingStageConfigurations.unloading.fields, ['actualArrivalUnloadingAt', 'unloadingStartedAt', 'unloadingCompletedAt'])
  assert.deepEqual(shipmentTrackingStageConfigurations.afterTransport.fields, ['proofStatus'])
})

test('station summaries keep the direct view compact and stage-specific', () => {
  const stations = shipmentTrackingStations({ tracking: { licensePlate: 'AB-CD 123', actualArrivalLoadingAt: new Date('2026-09-25T08:07:00'), loadingStartedAt: new Date('2026-09-25T08:15:00'), loadingCompletedAt: new Date('2026-09-25T09:00:00'), actualDepartureLoadingAt: new Date('2026-09-25T09:10:00') }, imported })
  const preparation = shipmentTrackingStationSummary(stations.find((station) => station.id === 'preparation'), { licensePlate: 'AB-CD 123' })
  const loading = shipmentTrackingStationSummary(stations.find((station) => station.id === 'loading'), {})
  assert.deepEqual(preparation.rows, [{ label: 'KZ', value: 'AB-CD 123', kind: 'actual' }])
  assert.equal(preparation.actionLabel, 'Kennzeichen aktualisieren')
  assert.equal(loading.rows.length, 3)
  assert.equal(loading.actionLabel, 'Ladestelle erfassen')
})

test('stage information filters events, fields and ordering without leaking other stages', () => {
  const events = [
    { id: 'unloading', recordedAt: new Date('2026-09-25T12:00:00'), changedFields: ['actualArrivalUnloadingAt'], newValue: { actualArrivalUnloadingAt: new Date('2026-09-25T11:50:00') } },
    { id: 'loading-later', recordedAt: new Date('2026-09-25T10:00:00'), changedFields: ['actualDepartureLoadingAt'], newValue: { actualDepartureLoadingAt: new Date('2026-09-25T09:55:00') } },
    { id: 'loading-earlier', recordedAt: new Date('2026-09-25T09:00:00'), changedFields: ['actualArrivalLoadingAt', 'licensePlate'], newValue: { actualArrivalLoadingAt: new Date('2026-09-25T08:07:00'), licensePlate: 'AB-CD 123' } },
  ]
  const loadingEvents = shipmentTrackingStageEvents(events, 'loading')
  assert.deepEqual(loadingEvents.map((event) => event.id), ['loading-earlier', 'loading-later'])
  assert.deepEqual(shipmentTrackingStageEventDetails(loadingEvents[0], 'loading'), [{ label: 'Tatsächliche Ankunft Ladestelle', value: '08:07' }])
})

test('a missing license plate is only highlighted when the customer requires it', () => {
  assert.deepEqual(shipmentTrackingStationAssessments({ tracking: {}, customerPolicy: { customer: { licensePlateImportant: true } } }).preparation.licensePlate, { severity: 'notice', text: 'Kennzeichen wichtig für Kunde' })
  assert.equal(shipmentTrackingStationAssessments({ tracking: {}, customerPolicy: { customer: { licensePlateImportant: false } } }).preparation.licensePlate, undefined)
})

test('an open loading arrival is only highlighted when the customer requires loading-site information', () => {
  const important = { customer: { loadingSiteInformationImportant: true } }
  assert.deepEqual(shipmentTrackingStationAssessments({ tracking: {}, customerPolicy: important }).loading.arrival, { severity: 'notice', text: 'Ankunft wichtig für Kunde' })
  assert.equal(shipmentTrackingStationAssessments({ tracking: {}, customerPolicy: { customer: { loadingSiteInformationImportant: false } } }).loading.arrival, undefined)

  const loading = shipmentTrackingStations({ tracking: {}, customerPolicy: important }).find((station) => station.id === 'loading')
  assert.deepEqual(shipmentTrackingStationSummary(loading, {}).rows, [{ label: '', value: 'Ankunft offen', kind: 'missing', key: 'arrival', hint: { severity: 'notice', text: 'Ankunft wichtig für Kunde' } }])
})

test('loading arrival is assessed only with a complete slot and only after its start', () => {
  const base = { imported }
  assert.equal(shipmentTrackingStationAssessments({ ...base, tracking: { actualArrivalLoadingAt: new Date('2026-09-25T08:00:00+02:00') } }).loading.arrival, undefined)
  assert.deepEqual(shipmentTrackingStationAssessments({ ...base, tracking: { actualArrivalLoadingAt: new Date('2026-09-25T08:15:00+02:00') } }).loading.arrival, { severity: 'notice', text: 'Spät im Slot' })
  assert.deepEqual(shipmentTrackingStationAssessments({ ...base, tracking: { actualArrivalLoadingAt: new Date('2026-09-25T10:35:00+02:00') } }).loading.arrival, { severity: 'alert', text: '35 Min. nach Slotende' })
  assert.equal(shipmentTrackingStationAssessments({ tracking: { actualArrivalLoadingAt: new Date('2026-09-25T10:35:00+02:00') }, imported: { loading: { window: { from: '2026-09-25T08:00' } } } }).loading.arrival, undefined)
})

test('loading duration uses the requested warning and alert thresholds', () => {
  const started = new Date('2026-09-25T08:00:00+02:00')
  assert.equal(shipmentTrackingStationAssessments({ tracking: { loadingStartedAt: started }, now: new Date('2026-09-25T09:30:00+02:00') }).loading.process, undefined)
  assert.deepEqual(shipmentTrackingStationAssessments({ tracking: { loadingStartedAt: started }, now: new Date('2026-09-25T09:45:00+02:00') }).loading.process, { severity: 'notice', text: 'Beladung seit 1 Std. 45 Min.' })
  assert.deepEqual(shipmentTrackingStationAssessments({ tracking: { loadingStartedAt: started }, now: new Date('2026-09-25T11:00:00+02:00') }).loading.process, { severity: 'notice', text: 'Beladung seit 3 Std.' })
  assert.deepEqual(shipmentTrackingStationAssessments({ tracking: { loadingStartedAt: started, loadingCompletedAt: new Date('2026-09-25T11:10:00+02:00') } }).loading.process, { severity: 'alert', text: 'Beladung dauerte 3 Std. 10 Min.' })
})

test('loading departure uses one hour as the warning-to-alert boundary', () => {
  const base = { imported }
  assert.equal(shipmentTrackingStationAssessments({ ...base, tracking: { actualDepartureLoadingAt: new Date('2026-09-25T10:00:00+02:00') } }).loading.departure, undefined)
  assert.deepEqual(shipmentTrackingStationAssessments({ ...base, tracking: { actualDepartureLoadingAt: new Date('2026-09-25T11:00:00+02:00') } }).loading.departure, { severity: 'notice', text: '1 Std. nach Slotende' })
  assert.deepEqual(shipmentTrackingStationAssessments({ ...base, tracking: { actualDepartureLoadingAt: new Date('2026-09-25T11:20:00+02:00') } }).loading.departure, { severity: 'alert', text: '1 Std. 20 Min. nach Slotende' })
  assert.equal(shipmentTrackingStationAssessments({ tracking: { actualDepartureLoadingAt: new Date('2026-09-25T11:20:00+02:00') }, imported: { loading: { window: {} } } }).loading.departure, undefined)
})
