import assert from 'node:assert/strict'
import test from 'node:test'
import { carrierAdditions, carrierDecisionDetails, carrierPayload, carrierReadPath, hasCarrierImportAccess, sameCarrierValue } from './carrierImportModel.js'

const row = { creditorNumber: '75397', companyName: 'Spedition GmbH', data: { linkedDebtorNumber: '', street: 'Musterstraße 1', city: 'Berlin', country: 'DE', postalCode: '10115', vatId: 'DE123', taxNumber: '12', website: 'www.example.test', contacts: [{ id: '1', name: 'Anna', email: 'anna@example.test' }], paymentTermsOriginal: '45 Tage Netto', paymentTermDays: 45, iban: 'DE123', bic: 'TESTDEFF', ibanVerifiedAt: '21.09.2026', dycosCreatedAt: '01.01.2020', timocomNumber: '42' } }

test('safe additions do not duplicate normalized emails or overwrite filled values', () => {
  const partner = { creditorNumber: '75397', dycosReferences: { creditorNumbers: ['75397'] }, companyName: 'Manuell GmbH', address: { street: '' }, contact: {}, companyData: { vatId: 'DE123' }, bankData: {}, contacts: [{ id: 'existing', name: '', email: 'ANNA@example.test' }] }
  const additions = carrierAdditions(partner, row)
  assert.equal(additions.patch.address.street, 'Musterstraße 1')
  assert.equal(additions.patch.bankData.iban, 'DE123')
  assert.equal(additions.patch.contacts.length, 1)
  assert.equal(additions.patch.contacts[0].name, 'Anna')
  assert.ok(additions.conflicts.some((item) => item.path === 'companyName'))
  assert.equal(carrierDecisionDetails(row, additions).comparisons[0].label, 'Unternehmer')
})

test('payment wording without a day count is stored as text without an extra review', () => {
  const ambiguous = { ...row, data: { ...row.data, paymentTermsOriginal: 'nach Vereinbarung', paymentTermDays: null } }
  const details = carrierDecisionDetails(ambiguous, { conflicts: [] })
  assert.deepEqual(details, { reasons: [], comparisons: [] })
  assert.equal(carrierPayload(ambiguous, 'run', 'now').paymentTermDays, 'nach Vereinbarung')
  assert.equal(carrierPayload(ambiguous, 'run', 'now').paymentTermsOriginal, 'nach Vereinbarung')
})

test('the same DyCoS wording converts a legacy numeric creditor target without conflict', () => {
  const existing = { creditorNumber: row.creditorNumber, paymentTermDays: 45, paymentTermsOriginal: '45 Tage Netto', dycosReferences: {}, address: {}, contact: {}, companyData: {}, bankData: {}, contacts: [] }
  const additions = carrierAdditions(existing, row)
  assert.equal(additions.patch.paymentTermDays, '45 Tage Netto')
  assert.ok(!additions.conflicts.some((item) => item.path === 'paymentTermDays'))
  const changed = carrierAdditions({ ...existing, paymentTermsOriginal: '14 Tage Netto' }, row)
  assert.ok(changed.conflicts.some((item) => item.path === 'paymentTermDays' && item.label === 'Zahlungsziel'))
  assert.equal(carrierReadPath(existing, 'paymentTermDays'), '45 Tage Netto')
})

test('creditor number types compare semantically and permissions require both rights', () => {
  assert.equal(sameCarrierValue('creditorNumber', 75397, '75397'), true)
  assert.equal(sameCarrierValue('creditorNumber', 75397, '75398'), false)
  assert.equal(hasCarrierImportAccess({ permissions: { dataImports: 'edit', masterData: 'edit' } }), true)
  assert.equal(hasCarrierImportAccess({ permissions: { dataImports: 'edit', masterData: 'view' } }), false)
  assert.equal(hasCarrierImportAccess({ role: 'superadmin' }), true)
})
