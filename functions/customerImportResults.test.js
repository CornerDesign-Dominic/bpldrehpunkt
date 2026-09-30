import assert from 'node:assert/strict'
import test from 'node:test'
import { customerImportActions, customerImportAssignment, projectAcceptedCustomerImportRow, reviewedCustomerImportResult } from './customerImportResults.js'

test('an unknown debtor with the same company name as another partner is recorded as a new partner', () => {
  const csv = { debtorNumber: '10007', companyName: 'Gleicher Name GmbH', data: { linkedCreditorNumber: '' } }
  const result = { partnerId: 'dycos-debtor-10007', assignment: customerImportAssignment(null, null, csv.debtorNumber, ''), actions: customerImportActions(null, csv, { created: true }) }
  const accepted = { customerId: result.partnerId, companyName: csv.companyName, debtorNumber: csv.debtorNumber, result }
  const unrelated = { id: 'partner-10689', companyName: csv.companyName, debtorNumber: '10689' }
  assert.equal(result.assignment.kind, 'new')
  assert.deepEqual(result.actions, ['created'])
  assert.equal(projectAcceptedCustomerImportRow(accepted, unrelated).affectedPartner, null)
  assert.deepEqual(projectAcceptedCustomerImportRow(accepted, { id: result.partnerId, companyName: 'Tatsächlicher Partner' }).affectedPartner, { id: result.partnerId, companyName: 'Tatsächlicher Partner' })
})

test('the result records the exact identity used and the numbers actually added', () => {
  const partner = { id: 'partner-10689', companyName: 'Bestehend', debtorNumber: '10689', creditorNumber: '', dycosReferences: { debtorNumbers: ['10689'], creditorNumbers: [] } }
  const row = { debtorNumber: '10689', data: { linkedCreditorNumber: '75397' } }
  assert.deepEqual(customerImportAssignment(partner, null, '10689', '75397'), { kind: 'debtor', number: '10689' })
  assert.deepEqual(customerImportActions(partner, row, { creditorNumber: '75397' }), ['creditorAdded'])
  assert.deepEqual(customerImportActions(partner, row, { creditorNumber: '75397', address: { city: 'Hamburg' } }), ['creditorAdded', 'updated'])
  assert.deepEqual(customerImportAssignment(null, { id: 'partner-75397' }, '10007', '75397'), { kind: 'creditor', number: '75397' })
  assert.deepEqual(customerImportActions({ creditorNumber: '75397', dycosReferences: {} }, { debtorNumber: '10007', data: { linkedCreditorNumber: '75397' } }, { debtorNumber: '10007' }), ['debtorAdded'])
})

test('review and merge outcomes keep the selected Firestore partner identity', () => {
  const reviewed = reviewedCustomerImportResult({ partnerId: 'partner-a', assignment: { kind: 'debtor', number: '10689' }, actions: ['unchanged'] }, 'partner-a', { companyName: 'Geprüft GmbH' })
  assert.deepEqual(reviewed.actions, ['updated', 'reviewed'])
  assert.equal(projectAcceptedCustomerImportRow({ customerId: 'partner-b', approval: { type: 'reviewed', action: 'merged', targetPartnerId: 'partner-b' }, companyName: 'CSV-Name' }, { id: 'partner-b', companyName: 'Zielpartner' }).affectedPartner.companyName, 'Zielpartner')
  assert.deepEqual(projectAcceptedCustomerImportRow({ customerId: 'partner-b', approval: { type: 'automatic' } }, { id: 'partner-b', companyName: 'Zielpartner' }).result.actions, ['legacyUnknown'])
})
