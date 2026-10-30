import assert from 'node:assert/strict'
import test from 'node:test'
import { mailboxOrderCustomerIdentity } from './mailboxOrderCustomerIdentity.js'

const partner = () => ({ debtorNumber: '10042', status: 'active', dycosReferences: { debtorNumbers: ['10042', '10043'], accounts: [{ entity: 'customer', number: '10042', sourceId: '33' }, { entity: 'customer', number: '10043', sourceId: '44' }] }, dycosImport: { sourceReferences: [{ entity: 'customer', id: '33' }, { entity: 'customer', id: '44' }, { entity: 'carrier', id: '55' }] } })

test('export selects exact account mapping from the new importer and keeps SQL IDs distinct from account numbers', () => {
  assert.deepEqual(mailboxOrderCustomerIdentity(partner(), '10043'), { kind: 'debtor', number: '10043', sourceId: '44' })
  assert.equal(mailboxOrderCustomerIdentity(partner(), '33'), null)
  assert.equal(mailboxOrderCustomerIdentity({ ...partner(), debtorNumber: '10000', dycosReferences: { accounts: partner().dycosReferences.accounts } }, '10042'), null)
})

test('incomplete, archived and contradictory identities block XML rather than guessing a source ID', () => {
  assert.equal(mailboxOrderCustomerIdentity({ ...partner(), mergedIntoPartnerId: 'other' }, '10042'), null)
  assert.equal(mailboxOrderCustomerIdentity({ ...partner(), dycosImport: {} }, '10042'), null)
  assert.equal(mailboxOrderCustomerIdentity({ ...partner(), dycosReferences: { debtorNumbers: ['10042'] } }, '10042'), null)
  const conflicted = partner()
  conflicted.dycosReferences.accounts.push({ entity: 'customer', number: '10042', sourceId: '44' })
  assert.equal(mailboxOrderCustomerIdentity(conflicted, '10042'), null)
  assert.equal(mailboxOrderCustomerIdentity({ ...partner(), dycosIdentities: { 'debtor-10042': { kind: 'debtor', number: '10042', sourceId: '999' } } }, '10042'), null)
})

test('previous verified reference-specific identities remain usable without a flow call', () => {
  assert.deepEqual(mailboxOrderCustomerIdentity({ debtorNumber: '10042', dycosIdentities: { 'debtor-10042': { kind: 'debtor', number: '10042', sourceId: '33' } } }, '10042'), { kind: 'debtor', number: '10042', sourceId: '33' })
})
