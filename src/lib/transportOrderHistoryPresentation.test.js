import assert from 'node:assert/strict'
import test from 'node:test'
import { transportOrderHistoryRows, transportOrderHistoryValue } from './transportOrderHistoryPresentation.js'

test('a refresh groups its changed fields and leaves creation compact', () => {
  const rows = transportOrderHistoryRows({}, [
    { id: 'created', eventType: 'transport_order_created', recordedAt: '2026-10-29T08:00:00Z', recordedByName: 'Anna' },
    { id: 'a', importRunId: 'refresh-1', recordedAt: '2026-10-29T09:00:00Z', recordedByName: 'Ben', field: 'shipment.weightKg', fieldLabel: 'Gewicht', oldValue: null, newValue: 0 },
    { id: 'b', importRunId: 'refresh-1', recordedAt: '2026-10-29T09:00:00Z', recordedByName: 'Ben', field: 'financial.costNet', fieldLabel: 'Kosten netto', oldValue: 100, newValue: 120 },
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].changes.length, 2)
  assert.equal(rows[0].changes[0].oldValue, null)
  assert.equal(rows[0].changes[0].newValue, 0)
  assert.equal(rows[1].creation, true)
  assert.deepEqual(rows[1].changes, [])
})

test('station cargo and pallet changes show business fields without serializing SQL identifiers', () => {
  const before = [{ sourceId: '901', sequence: 1, cargo: { weightKg: null, packages: 0 }, palletExchange: false }]
  const after = [{ sourceId: '901', sequence: 1, cargo: { weightKg: 500, packages: 0 }, palletExchange: true }]
  const [row] = transportOrderHistoryRows({}, [{ id: 's', field: 'stops', oldValue: before, newValue: after }])
  assert.equal(row.changes.length, 2)
  assert.match(row.changes[0].label, /Station · 1 · Gewicht/)
  assert.equal(row.changes[1].newValue, true)
  assert.doesNotMatch(row.changes.map((change) => change.label).join(), /sourceId|901|cargo/)
})

test('price positions use source identity, preserve duplicate sequence numbers and hide technical document references', () => {
  const before = [{ sourceCounter: '21', sequence: 1, description: 'Fracht', amountNet: 100, documentSourceId: 'SECRET-ID' }, { sourceCounter: '22', sequence: 1, amountNet: 20 }]
  const after = [{ ...before[1], amountNet: 25 }, { ...before[0], amountNet: 120 }]
  const [row] = transportOrderHistoryRows({}, [{ id: 'p', field: 'financial.revenuePositions', oldValue: before, newValue: after }])
  assert.equal(row.changes.length, 2)
  assert.deepEqual(row.changes.map((change) => [change.oldValue, change.newValue]), [[100, 120], [20, 25]])
  assert.doesNotMatch(JSON.stringify(row.changes), /SECRET-ID/)
  const duplicates = transportOrderHistoryRows({}, [{ id: 'dups', field: 'financial.costPositions', oldValue: [], newValue: [{ sequence: 1, amountNet: 10 }, { sequence: 1, amountNet: 10 }] }])
  assert.equal(duplicates[0].changes.filter((change) => change.path.endsWith('.amountNet')).length, 2)
})

test('source-only technical changes do not produce user changes; legacy creation and unknown values remain honest', () => {
  const rows = transportOrderHistoryRows({ createdAt: '2026-10-29T08:00:00Z', createdByName: 'Clara' }, [
    { id: 'technical', field: 'source', oldValue: { schemaVersion: 1 }, newValue: { schemaVersion: 2 } },
    { id: 'legacy', summary: 'Alter Eintrag', recordedAt: '2026-10-29T09:00:00Z' },
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].legacy, true)
  assert.equal(rows[1].createdByName, 'Clara')
  assert.equal(transportOrderHistoryValue(null), '—')
  assert.equal(transportOrderHistoryValue(0, 'de', { path: 'financial.costNet' }), '0,00 €')
  assert.equal(transportOrderHistoryValue(500, 'de', { path: 'stops.1.cargo.weightKg' }), '500 kg')
  assert.equal(transportOrderHistoryValue('2026-11-02T08:00', 'de'), '02.11.2026, 08:00')
})
