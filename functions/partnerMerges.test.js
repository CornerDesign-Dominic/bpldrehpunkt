import assert from 'node:assert/strict'
import test from 'node:test'
import { assertManualPartnerState, hasPartnerMergeAccess, manualMergeDirection, mergePartnerRecords, PARTNER_REFERENCE_FIELDS } from './partnerMerges.js'

test('a merge keeps unique debtor and creditor references and safely supplements master data', () => {
  const target = { id: 'target', companyName: 'Ziel GmbH', debtorNumber: '10689', creditorNumber: '', dycosReferences: { debtorNumbers: ['10689'], creditorNumbers: [] }, address: { city: 'Hamburg', street: '' }, contact: { email: '' }, bankData: { iban: '' }, contacts: [{ id: 'one', email: 'same@example.test', name: '' }] }
  const source = { id: 'source', companyName: 'Quelle GmbH', debtorNumber: '', creditorNumber: '75397', dycosReferences: { debtorNumbers: [], creditorNumbers: ['75397', '75398'] }, address: { city: 'Berlin', street: 'Importstraße 1' }, contact: { email: 'info@example.test' }, bankData: { iban: 'DE123' }, contacts: [{ id: 'two', email: 'same@example.test', name: 'Anne' }, { id: 'three', email: 'other@example.test', name: 'Bela' }] }
  const merged = mergePartnerRecords(target, source)
  assert.equal(merged.debtorNumber, '10689')
  assert.equal(merged.creditorNumber, '75397')
  assert.deepEqual(merged.dycosReferences.debtorNumbers, ['10689'])
  assert.deepEqual(merged.dycosReferences.creditorNumbers, ['75397', '75398'])
  assert.equal(merged.address.city, 'Hamburg')
  assert.equal(merged.address.street, 'Importstraße 1')
  assert.equal(merged.bankData.iban, 'DE123')
  assert.equal(merged.contacts.length, 2)
  assert.equal(merged.contacts[0].name, 'Anne')
})

test('reference catalogue covers partner-linked modules without requiring a physical rewrite', () => {
  const modules = new Set(PARTNER_REFERENCE_FIELDS.map(([collection]) => collection))
  for (const module of ['transportOrders', 'todos', 'damageCases', 'palletMovements', 'palletClosings', 'inkassoCases', 'customerImportRows', 'carrierImportRows', 'businessPartners']) assert.equal(modules.has(module), true, module)
  assert.equal(PARTNER_REFERENCE_FIELDS.length, new Set(PARTNER_REFERENCE_FIELDS.map((entry) => entry.join('/'))).size)
})

test('partner merges require their own permission while superadmins remain allowed', () => {
  assert.equal(hasPartnerMergeAccess({ permissions: { partnerMerges: 'edit' } }), true)
  assert.equal(hasPartnerMergeAccess({ permissions: { masterData: 'edit' } }), false)
  assert.equal(hasPartnerMergeAccess({ role: 'superadmin', permissions: {} }), true)
})

test('manual merge direction fixes which partner is archived and rejects self-selection', () => {
  assert.deepEqual(manualMergeDirection('current', 'other', 'current-source'), { sourceId: 'current', targetId: 'other' })
  assert.deepEqual(manualMergeDirection('current', 'other', 'current-target'), { sourceId: 'other', targetId: 'current' })
  assert.throws(() => manualMergeDirection('current', 'current', 'current-target'), /unterschiedliche Partner/)
  assert.throws(() => manualMergeDirection('current', 'other', 'unknown'), /ungültig/)
})

test('manual selection rejects archived or inactive candidate partners', () => {
  const snapshot = (data) => ({ exists: true, data: () => data })
  assert.doesNotThrow(() => assertManualPartnerState(snapshot({ status: 'inactive' }), snapshot({ status: 'active' })))
  assert.throws(() => assertManualPartnerState(snapshot({ status: 'active' }), snapshot({ status: 'inactive' })), /nicht mehr aktiv/)
  assert.throws(() => assertManualPartnerState(snapshot({ status: 'active' }), snapshot({ status: 'active', mergedIntoPartnerId: 'target' })), /archiviert/)
  assert.throws(() => assertManualPartnerState(snapshot({ status: 'active', mergedIntoPartnerId: 'target' }), snapshot({ status: 'active' })), /archiviert/)
})
