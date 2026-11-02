import test from 'node:test'
import assert from 'node:assert/strict'
import { carrierAdditions, carrierPayload } from './carrierImportModel.js'

const policy = { customer: { licensePlateImportant: true }, carrier: { licensePlate: { remind8WorkingHours: true } } }

test('a new carrier import receives internal defaults while an existing policy is never overwritten', () => {
  const row = { creditorNumber: '2001', companyName: 'Unternehmer', data: { street: 'Musterstraße 1', contacts: [] } }
  const created = carrierPayload(row, 'run', null).shipmentTrackingPolicy
  assert.equal(Object.keys(created.carrier.enabledRuleIds).every((id) => id.includes('.internal.')), true)
  const additions = carrierAdditions({ creditorNumber: '2001', shipmentTrackingPolicy: policy, address: {}, contact: {}, companyData: {}, bankData: {}, dycosReferences: {}, contacts: [] }, row)
  assert.equal(Object.hasOwn(additions.patch, 'shipmentTrackingPolicy'), false)
})
