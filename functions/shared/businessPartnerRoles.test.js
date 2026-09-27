import test from 'node:test'
import assert from 'node:assert/strict'
import { businessPartnerRoleLabel, businessPartnerRoles } from './businessPartnerRoles.js'

test('provisional transport-import carriers are entrepreneurs without a creditor number', () => {
  const partner = { taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }
  assert.deepEqual(businessPartnerRoles(partner), { customer: false, carrier: true })
  assert.equal(businessPartnerRoleLabel(partner), 'Unternehmer')
})

test('explicitly marked partners, dual roles and partners without role facts remain distinct', () => {
  assert.deepEqual(businessPartnerRoles({ businessPartnerRoles: ['customer'] }), { customer: true, carrier: false })
  assert.equal(businessPartnerRoleLabel({ debtorNumber: 'D-1', creditorNumber: 'C-1' }), 'Kunde & Unternehmer')
  assert.deepEqual(businessPartnerRoles({}), { customer: false, carrier: false })
})
