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

test('document history matches persistent source identity and displays individual business changes', () => {
  const before = [{ sourceId: '501', internalNumber: '115726', externalNumber: null, businessType: 'carrier_invoice', internalType: 'proforma_credit_note', date: '2026-06-23' }, { sourceId: '502', internalNumber: '63369', externalNumber: null }]
  const after = [{ ...before[1] }, { ...before[0], externalNumber: '1099/06/2026' }]
  const [row] = transportOrderHistoryRows({}, [{ id: 'document', field: 'financial.documents', oldValue: before, newValue: after }])
  assert.equal(row.changes.length, 1)
  assert.equal(row.changes[0].label, 'Beleg · 115726 · Externe Belegnummer')
  assert.deepEqual([row.changes[0].oldValue, row.changes[0].newValue], [null, '1099/06/2026'])
  assert.equal(transportOrderHistoryValue('carrier_invoice', 'de', { path: 'financial.documents.501-1.businessType' }), 'Unternehmerrechnung erhalten')
  assert.equal(transportOrderHistoryValue('proforma_credit_note', 'en', { path: 'financial.documents.501-1.internalType' }), 'Pro forma credit note')
  assert.equal(transportOrderHistoryValue('2026-06-23', 'de', { path: 'financial.documents.501-1.date' }), '23.06.2026')
  assert.deepEqual(transportOrderHistoryRows({}, [{ id: 'technical', field: 'financial.documents', oldValue: before, newValue: before.map(item => ({ ...item, warningCodes: ['DOCUMENT_TYPE_UNCONFIRMED'] })) }]), [])
})

test('invoice cancellation status, original number and date remain separate auditable document fields', () => {
  const original = { sourceId: '501', internalNumber: '66966', businessType: 'customer_invoice', cancelled: false }
  const cancellation = { sourceId: '502', internalNumber: '66966', businessType: 'customer_invoice_cancellation', internalType: 'invoice_cancellation', cancelled: false, originalDocumentSourceId: '501', originalDocumentNumber: '66966' }
  const [row] = transportOrderHistoryRows({}, [{ id: 'cancel', field: 'financial.documents', oldValue: [original], newValue: [{ ...original, cancelled: true, cancellationDate: '2026-10-27' }, cancellation] }])
  assert.ok(row.changes.some(change => change.path === 'financial.documents.501-1.cancelled' && change.oldValue === false && change.newValue === true))
  assert.ok(row.changes.some(change => change.path === 'financial.documents.502-1.originalDocumentNumber' && change.newValue === '66966'))
  assert.equal(transportOrderHistoryValue('2026-10-27', 'de', { path: 'financial.documents.501-1.cancellationDate' }), '27.10.2026')
  assert.equal(transportOrderHistoryValue('customer_invoice_cancellation', 'en', { path: 'financial.documents.502-1.businessType' }), 'Customer invoice cancellation')
})
