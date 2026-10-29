import assert from 'node:assert/strict'
import test from 'node:test'
import { businessPartnerHistoryActor, businessPartnerHistoryRows, businessPartnerHistoryValue } from './businessPartnerHistoryPresentation.js'

test('creation produces one compact entry and excludes initial import enrichment and CRM activities', () => {
  const history = [
    { id: 'creation', category: 'import', action: 'created', createdAt: '2026-10-29T10:00:00Z', createdByName: 'Anna' },
    { id: 'initial-enrichment', category: 'masterData', action: 'updated', createdAt: '2026-10-29T10:00:00Z', metadata: { addedFields: ['phone'] } },
    { id: 'call', category: 'contact', action: 'created', createdAt: '2026-10-29T12:00:00Z' },
    { id: 'changed', category: 'masterData', action: 'updated', createdAt: '2026-10-29T11:00:00Z', metadata: { changes: [{ path: 'companyName', label: 'Firmenname', oldValue: 'A', newValue: 'B' }] } },
  ]
  const rows = businessPartnerHistoryRows({}, history)
  assert.deepEqual(rows.map((entry) => entry.id), ['changed', 'creation'])
  assert.deepEqual(rows[1].changes, [])
  assert.equal(rows[1].creation, true)
  assert.equal(businessPartnerHistoryActor(rows[1]), 'Anna')
})

test('legacy before/after reviews are rendered but unrecorded historical values are never invented', () => {
  const rows = businessPartnerHistoryRows({}, [
    { id: 'review', category: 'import', action: 'reviewed', actor: { name: 'Ben' }, previousValues: { 'address.city': 'Alt' }, appliedValues: { address: { city: 'Neu' } } },
    { id: 'old', category: 'masterData', action: 'updated', summary: 'Adresse geändert', metadata: { field: 'address' } },
    { id: 'comparison', category: 'masterData', action: 'updated', metadata: { changes: [], conflictFields: ['companyName'] } },
  ])
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0].changes.map((change) => [change.path, change.oldValue, change.newValue]), [['address.city', 'Alt', 'Neu']])
  assert.equal(businessPartnerHistoryActor(rows[0]), 'Ben')
  assert.equal(rows[1].legacy, true)
  assert.equal(rows[1].changes, null)
})

test('legacy creation fallback uses the actual Drehpunkt timestamp and actor, not the DyCoS date', () => {
  const [row] = businessPartnerHistoryRows({ createdAt: '2026-10-29T10:00:00Z', createdByName: 'Clara', dycosCreatedAt: '2020-01-01' }, [])
  assert.equal(row.createdAt, '2026-10-29T10:00:00Z')
  assert.equal(businessPartnerHistoryActor(row), 'Clara')
  assert.equal(businessPartnerHistoryValue(null), '—')
  assert.equal(businessPartnerHistoryValue(0), '0')
  assert.equal(businessPartnerHistoryValue(false), 'Nein')
})

test('one save groups its category entries, while merge decisions retain actual target changes', () => {
  const rows = businessPartnerHistoryRows({}, [
    { id: 'a', category: 'masterData', metadata: { operationId: 'save-1', changes: [{ path: 'companyName', oldValue: 'A', newValue: 'B' }] } },
    { id: 'b', category: 'creditLimit', metadata: { operationId: 'save-1', changes: [{ path: 'creditLimit', oldValue: null, newValue: 100 }] } },
    { id: 'merge', category: 'merge', action: 'merged', decisions: [{ key: 'companyName', targetValue: 'B', resultValue: 'C' }] },
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].changes.length, 2)
  assert.equal(rows[1].changes[0].oldValue, 'B')
  assert.equal(rows[1].changes[0].newValue, 'C')
})

test('legacy flat paths cannot modify JavaScript prototypes', () => {
  businessPartnerHistoryRows({}, [{ id: 'x', category: 'import', previousValues: { '__proto__.historyPolluted': true }, appliedValues: { companyName: 'A' } }])
  assert.equal({}.historyPolluted, undefined)
})
