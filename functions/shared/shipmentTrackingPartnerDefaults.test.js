import test from 'node:test'
import assert from 'node:assert/strict'
import { fallbackShipmentTrackingRuleCatalog } from './shipmentTrackingRuleCatalog.js'
import { newShipmentTrackingPartnerPolicy } from './shipmentTrackingPartnerDefaults.js'

test('a new carrier enables only active internal tracking rules', () => {
  const catalog = fallbackShipmentTrackingRuleCatalog()
  catalog.topics.loadingSite.internalEscalations = [catalog.topics.loadingSite.internalEscalations[1]]
  catalog.retiredRuleIds.push('loadingSite.internal.escalation.1')
  const policy = newShipmentTrackingPartnerPolicy({ creditorNumber: 'K-1' }, catalog)
  assert.deepEqual(policy.customer, { licensePlateImportant: false, loadingSiteInformationImportant: false })
  assert.deepEqual(policy.carrier.enabledRuleIds, {
    'licensePlate.internal.escalation.1': true,
    'loadingSite.internal.escalation.2': true,
  })
  assert.equal(policy.carrier.actualArrivalConfirmationEnabled, false)
})

test('a provisional TA-import carrier without a creditor number receives carrier defaults', () => {
  const policy = newShipmentTrackingPartnerPolicy({ taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }, fallbackShipmentTrackingRuleCatalog())
  assert.deepEqual(Object.keys(policy.carrier.enabledRuleIds).sort(), [
    'licensePlate.internal.escalation.1',
    'loadingSite.internal.escalation.1',
    'loadingSite.internal.escalation.2',
  ])
})

test('a new explicitly marked customer without a debtor number receives both customer defaults', () => {
  const policy = newShipmentTrackingPartnerPolicy({ businessPartnerRoles: ['customer'] }, fallbackShipmentTrackingRuleCatalog())
  assert.deepEqual(policy.customer, { licensePlateImportant: true, loadingSiteInformationImportant: true })
  assert.deepEqual(policy.carrier.enabledRuleIds, {})
})

test('a new partner with both roles receives independent defaults', () => {
  const policy = newShipmentTrackingPartnerPolicy({ businessPartnerRoles: ['customer', 'carrier'] }, fallbackShipmentTrackingRuleCatalog())
  assert.equal(policy.customer.licensePlateImportant, true)
  assert.equal(policy.customer.loadingSiteInformationImportant, true)
  assert.equal(Object.values(policy.carrier.enabledRuleIds).every(Boolean), true)
  assert.equal(policy.carrier.actualArrivalConfirmationEnabled, false)
})
