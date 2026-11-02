import assert from 'node:assert/strict'
import test from 'node:test'
import { loadingScheduleMovedEarlier, transportOrderImportChanges, transportOrderImportFingerprint } from './transportOrderImportChanges.js'

const imported = (overrides = {}) => ({
  relation: '01 Team Nord', customerReference: 'Ref-1',
  customer: { debtorNumber: '1001', name: 'Kunde' }, carrier: { originalName: 'Unternehmer' },
  loading: { originalText: 'Hafenstraße 1', city: 'Hamburg', window: { from: '2026-10-01 08:00', until: '2026-10-01 10:00' }, note: '', reference: '' },
  unloading: { originalText: 'Ring 2', city: 'Berlin', window: { from: '2026-10-02 08:00', until: '2026-10-02 10:00' }, note: '', reference: '' },
  financial: { revenueNet: 100, costNet: 50 }, shipment: { weightKg: 24000 }, contacts: { carrierStandardEmail: 'Dispo@Example.test' }, dispatch: { sentTo: 'Status@Example.test' },
  ...overrides,
})

test('import fingerprints ignore whitespace, Unicode composition, equivalent date and number formats, and email case', () => {
  const first = imported({ loading: { ...imported().loading, originalText: 'Hafenstraße 1' } })
  const second = imported({ loading: { ...imported().loading, originalText: '  Hafenstra\u00dfe   1  ', window: { from: '2026-10-01 8:00:00', until: '2026-10-01 10:00' } }, financial: { revenueNet: '100,00', costNet: '50,00' }, shipment: { weightKg: '24.000' }, contacts: { carrierStandardEmail: 'dispo@example.test' }, dispatch: { sentTo: 'status@example.test' } })
  assert.equal(transportOrderImportFingerprint(first), transportOrderImportFingerprint(second))
  assert.deepEqual(transportOrderImportChanges(first, second), [])
})

test('each relevant imported order field produces its own labeled change', () => {
  const before = imported()
  const after = imported({ financial: { revenueNet: 125, costNet: 50 }, shipment: { weightKg: 26000 }, loading: { ...before.loading, city: 'Bremen' } })
  assert.deepEqual(transportOrderImportChanges(before, after).map(({ path, label, routeRelevant }) => [path, label, Boolean(routeRelevant)]), [
    ['loading.city', 'Ort Ladestelle', true],
    ['financial.revenueNet', 'Ertrag netto', false],
    ['shipment.weightKg', 'Gewicht', false],
  ])
})

test('only a moved-forward loading start sets the no-retroactive-send cutoff', () => {
  const before = imported()
  assert.equal(loadingScheduleMovedEarlier(before, imported({ loading: { ...before.loading, window: { ...before.loading.window, from: '2026-09-30 08:00' } } })), true)
  assert.equal(loadingScheduleMovedEarlier(before, imported({ loading: { ...before.loading, window: { ...before.loading.window, from: '2026-10-02 08:00' } } })), false)
})

test('carrier address-only source changes affect status fingerprint and each history field', () => {
  const before = imported({ carrier: { originalName: 'Unternehmer', snapshot: { street: 'Alt', postalCode: '10000', city: 'Altstadt', country: 'DE' } } })
  const after = imported({ carrier: { originalName: 'Unternehmer', snapshot: { street: 'Neu', postalCode: '20000', city: 'Neustadt', country: 'AT' } } })
  assert.notEqual(transportOrderImportFingerprint(before), transportOrderImportFingerprint(after))
  assert.deepEqual(transportOrderImportChanges(before, after).map((change) => change.path), ['carrier.snapshot.street', 'carrier.snapshot.postalCode', 'carrier.snapshot.city', 'carrier.snapshot.country'])
})

test('cargo, pallets and line items change the import history without invalidating routes or schedules', () => {
  const before = imported({ stops: [{ sourceId: '1', cargo: { weightKg: 100 }, palletExchange: false }] })
  const after = structuredClone(before)
  after.stops[0].cargo.weightKg = 200
  after.stops[0].palletExchange = true
  after.financial.costPositions = [{ id: 'cost-1', amountNet: 50 }]
  assert.notEqual(transportOrderImportFingerprint(before), transportOrderImportFingerprint(after))
  const changes = transportOrderImportChanges(before, after)
  assert.deepEqual(changes.map((change) => change.path), ['financial.costPositions', 'stops'])
  assert.equal(changes.some((change) => change.routeRelevant || change.scheduleRelevant), false)
})

test('disposition and document changes are auditable without changing routes or schedules', () => {
  const before = imported()
  const after = structuredClone(before)
  after.dispositionNote = 'Bei Ankunft Disposition anrufen'
  after.financial.documents = [{ sourceId: '50', internalNumber: '115726', externalNumber: '1099/06/2026' }]
  const changes = transportOrderImportChanges(before, after)
  assert.deepEqual(changes.map(change => change.path), ['dispositionNote', 'financial.documents'])
  assert.equal(changes.some(change => change.routeRelevant || change.scheduleRelevant), false)
  assert.notEqual(transportOrderImportFingerprint(before), transportOrderImportFingerprint(after))
  assert.deepEqual(transportOrderImportChanges(after, structuredClone(after)), [])
})

test('missing versus empty document list does not create an artificial import change', () => {
  const before = imported()
  const after = structuredClone(before)
  after.financial.documents = []
  assert.deepEqual(transportOrderImportChanges(before, after), [])
  assert.equal(transportOrderImportFingerprint(before), transportOrderImportFingerprint(after))
})

test('fixed flags audit false separately from unknown without altering route or time cutoffs', () => {
  const before = imported({ stops: [{ sourceId: '31' }] })
  const unknown = structuredClone(before)
  unknown.stops[0].fixedAppointment = null
  unknown.loading.fixedAppointment = null
  assert.equal(transportOrderImportFingerprint(before), transportOrderImportFingerprint(unknown))
  assert.deepEqual(transportOrderImportChanges(before, unknown), [])
  const noFixed = structuredClone(unknown)
  noFixed.stops[0].fixedAppointment = false
  noFixed.loading.fixedAppointment = false
  const changes = transportOrderImportChanges(unknown, noFixed)
  assert.deepEqual(changes.map(change => change.path), ['loading.fixedAppointment', 'stops'])
  assert.equal(changes[0].oldValue, null)
  assert.equal(changes[0].newValue, false)
  assert.equal(changes.some(change => change.routeRelevant || change.scheduleRelevant), false)
  assert.equal(loadingScheduleMovedEarlier(before, noFixed), false)
  const fixed = structuredClone(noFixed)
  fixed.loading.fixedAppointment = true
  fixed.stops[0].fixedAppointment = true
  assert.notEqual(transportOrderImportFingerprint(noFixed), transportOrderImportFingerprint(fixed))
})

test('unknown optional transport fields and station descriptions create no legacy-only history', () => {
  const before = imported({ stops: [{ sourceId: '31', cargo: { weightKg: null, packages: null, loadingMeters: null } }] })
  const after = structuredClone(before)
  Object.assign(after.shipment, { goodsDescription: null, vehicleInformation: null, hazardousGoods: null })
  after.distances = { order: { totalKm: null, motorwayKm: null, emptyKm: null, routed: null }, tour: null }
  after.stops[0].cargo.description = null
  after.stops[0].cargo.volumetricWeightKg = null
  assert.equal(transportOrderImportFingerprint(before), transportOrderImportFingerprint(after))
  assert.deepEqual(transportOrderImportChanges(before, after), [])
  const explicitZero = structuredClone(after)
  explicitZero.stops[0].cargo.volumetricWeightKg = 0
  assert.deepEqual(transportOrderImportChanges(after, explicitZero).map(change => change.path), ['stops'])
})

test('transport source values are audited including explicit false and zero without route or tracking changes', () => {
  const before = imported({ stops: [{ sourceId: '31', cargo: { weightKg: 10 } }] })
  const after = structuredClone(before)
  Object.assign(after.shipment, { goodsDescription: 'Handelsware', vehicleInformation: 'Seitlich beladbar', hazardousGoods: false })
  after.distances = { order: { totalKm: 0, motorwayKm: 0, emptyKm: 0, routed: false }, tour: { totalKm: 500, motorwayKm: 300, emptyKm: 0, routed: true } }
  after.stops[0].cargo.description = 'Stationseigene Ware'
  after.stops[0].cargo.volumetricWeightKg = 0
  const changes = transportOrderImportChanges(before, after)
  assert.deepEqual(changes.map(change => change.path), [
    'shipment.vehicleInformation', 'shipment.goodsDescription', 'shipment.hazardousGoods',
    'stops',
  ])
  assert.ok(changes.some(change => change.path === 'shipment.hazardousGoods' && change.oldValue === null && change.newValue === false))
  assert.equal(changes.some(change => change.path.startsWith('distances.')), false)
  assert.equal(changes.some(change => change.routeRelevant || change.scheduleRelevant), false)
  assert.equal(loadingScheduleMovedEarlier(before, after), false)
  assert.deepEqual(transportOrderImportChanges(after, structuredClone(after)), [])
  const volumetricChange = structuredClone(after)
  volumetricChange.stops[0].cargo.volumetricWeightKg = 2000
  assert.deepEqual(transportOrderImportChanges(after, volumetricChange).map(change => change.path), ['stops'])
  assert.equal(volumetricChange.shipment.weightKg, before.shipment.weightKg)
})

test('retired DyCoS distances cannot trigger business updates, false deletion history or route recalculation', () => {
  const before = imported({ distances: { order: { totalKm: 100.5, routed: true }, tour: { totalKm: 500 } } })
  const changed = structuredClone(before)
  changed.distances.tour.totalKm = 550
  const withoutDistances = structuredClone(before)
  delete withoutDistances.distances
  for (const next of [changed, withoutDistances]) {
    assert.deepEqual(transportOrderImportChanges(before, next), [])
    assert.equal(transportOrderImportFingerprint(before), transportOrderImportFingerprint(next))
    assert.equal(loadingScheduleMovedEarlier(before, next), false)
  }
})
