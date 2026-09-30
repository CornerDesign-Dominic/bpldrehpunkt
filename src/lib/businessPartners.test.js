import test from 'node:test'
import assert from 'node:assert/strict'
import { newBusinessPartnerShipmentTrackingPolicy } from './newBusinessPartnerShipmentTrackingPolicy.js'
import { fallbackShipmentTrackingRuleCatalog } from '../../shared/shipmentTrackingRuleCatalog.js'

test('a manually created customer receives both shipment-tracking importance defaults', () => {
  const partner = { companyName: 'Neuer Kunde', businessPartnerRoles: ['customer'] }
  assert.deepEqual(newBusinessPartnerShipmentTrackingPolicy(partner, fallbackShipmentTrackingRuleCatalog()).customer, {
    licensePlateImportant: true,
    loadingSiteInformationImportant: true,
  })
})

test('an explicit manual policy remains an intentional choice on creation', () => {
  const partner = { businessPartnerRoles: ['customer'], shipmentTrackingPolicy: { customer: { licensePlateImportant: false, loadingSiteInformationImportant: false }, carrier: { enabledRuleIds: {} } } }
  assert.deepEqual(newBusinessPartnerShipmentTrackingPolicy(partner).customer, {
    licensePlateImportant: false,
    loadingSiteInformationImportant: false,
  })
})
