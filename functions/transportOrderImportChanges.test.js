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
