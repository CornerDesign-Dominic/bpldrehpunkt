import test from 'node:test'
import assert from 'node:assert/strict'
import { mailboxOrderCustomerCandidates as candidates } from './mailboxOrderCustomerCandidates.js'
const partner = (id, extra = {}) => ({ id, companyName: 'Muster GmbH', debtorNumber: '12345', address: { postalCode: '42103', city: 'Wuppertal' }, companyData: { vatId: 'DE123456789' }, ...extra })
test('VAT matching ignores formatting and postcode/town ranks duplicate VAT matches', () => {
  const matches = candidates([partner('other', { address: { postalCode: '10000', city: 'Berlin' } }), partner('right')], { customerVatId: ' DE 123 456 789 ', customerPostalCode: '42103', customerCity: 'WUPPERTAL' })
  assert.deepEqual(matches.map(item => item.partner.id), ['right', 'other'])
})
test('postcode and city suggest candidates when VAT is unavailable; postcode alone does not', () => {
  assert.equal(candidates([partner('a')], { customerPostalCode: '42103', customerCity: 'Wuppertal' }).length, 1)
  assert.equal(candidates([partner('a')], { customerPostalCode: '42103' }).length, 0)
})
test('VAT conflict and merged partners cannot become suggestions through name or address', () => {
  assert.equal(candidates([partner('a')], { customerVatId: 'DE999999999', customerName: 'Muster GmbH', customerPostalCode: '42103', customerCity: 'Wuppertal' }).length, 0)
  assert.equal(candidates([partner('a', { status: 'merged' })], { customerNumber: '12345' }).length, 0)
})
