import assert from 'node:assert/strict'
import test from 'node:test'
import { projectAcceptedCustomerImportRow, reviewedCustomerImportResult } from './customerImportResults.js'

test('an unknown debtor with the same company name as another partner is recorded as a new partner', () => {
  const csv = { debtorNumber: '10007', companyName: 'Gleicher Name GmbH', data: { linkedCreditorNumber: '' } }
  const result = { partnerId: 'dycos-debtor-10007', assignment: { kind: 'new' }, actions: ['created'] }
  const accepted = { customerId: result.partnerId, companyName: csv.companyName, debtorNumber: csv.debtorNumber, result }
  const unrelated = { id: 'partner-10689', companyName: csv.companyName, debtorNumber: '10689' }
  assert.equal(result.assignment.kind, 'new')
  assert.deepEqual(result.actions, ['created'])
  assert.equal(projectAcceptedCustomerImportRow(accepted, unrelated).affectedPartner, null)
  assert.deepEqual(projectAcceptedCustomerImportRow(accepted, { id: result.partnerId, companyName: 'Tatsächlicher Partner' }).affectedPartner, { id: result.partnerId, companyName: 'Tatsächlicher Partner' })
})

test('review and merge outcomes keep the selected Firestore partner identity', () => {
  const reviewed = reviewedCustomerImportResult({ partnerId: 'partner-a', assignment: { kind: 'debtor', number: '10689' }, actions: ['unchanged'] }, 'partner-a', { companyName: 'Geprüft GmbH' })
  assert.deepEqual(reviewed.actions, ['updated', 'reviewed'])
  assert.equal(projectAcceptedCustomerImportRow({ customerId: 'partner-b', approval: { type: 'reviewed', action: 'merged', targetPartnerId: 'partner-b' }, companyName: 'CSV-Name' }, { id: 'partner-b', companyName: 'Zielpartner' }).affectedPartner.companyName, 'Zielpartner')
  assert.deepEqual(projectAcceptedCustomerImportRow({ customerId: 'partner-b', approval: { type: 'automatic' } }, { id: 'partner-b', companyName: 'Zielpartner' }).result.actions, ['legacyUnknown'])
})
