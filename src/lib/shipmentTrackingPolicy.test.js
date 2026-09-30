import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SHIPMENT_TRACKING_POLICY, normalizeShipmentTrackingPolicy, shipmentTrackingCarrierRules, shipmentTrackingPartnerRoles } from './shipmentTrackingPolicy.js'
import { fallbackShipmentTrackingRuleCatalog } from '../../shared/shipmentTrackingRuleCatalog.js'

test('a partner without a tracking policy receives only unchecked defaults', () => {
  assert.deepEqual(normalizeShipmentTrackingPolicy(), DEFAULT_SHIPMENT_TRACKING_POLICY)
})

test('customer and carrier roles are derived independently from partner references', () => {
  assert.deepEqual(shipmentTrackingPartnerRoles({ debtorNumber: '1001' }), { customer: true, carrier: false })
  assert.deepEqual(shipmentTrackingPartnerRoles({ creditorNumber: '2001' }), { customer: false, carrier: true })
  assert.deepEqual(shipmentTrackingPartnerRoles({ dycosReferences: { debtorNumbers: ['1001'], creditorNumbers: ['2001'] } }), { customer: true, carrier: true })
})

test('the shared business role facts include provisional TA-import carriers and explicitly marked customers without accounting numbers', () => {
  assert.deepEqual(shipmentTrackingPartnerRoles({ taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }), { customer: false, carrier: true })
  assert.deepEqual(shipmentTrackingPartnerRoles({ businessPartnerRoles: ['customer'] }), { customer: true, carrier: false })
  assert.deepEqual(shipmentTrackingPartnerRoles({}), { customer: false, carrier: false })
})

test('legacy static carrier values migrate to stable catalog IDs without affecting customer values', () => {
  const policy = normalizeShipmentTrackingPolicy({ customer: { licensePlateImportant: true }, carrier: { loadingSite: { request12WorkingHours: true } } })
  assert.equal(policy.customer.licensePlateImportant, true)
  assert.equal(policy.customer.loadingSiteInformationImportant, false)
  assert.equal(policy.carrier.enabledRuleIds['loadingSite.external.initial'], true)
  assert.equal(policy.carrier.enabledRuleIds['licensePlate.external.initial'], undefined)
})

test('new catalog rules are disabled for every partner until explicitly enabled', () => {
  const catalog = fallbackShipmentTrackingRuleCatalog()
  catalog.topics.licensePlate.reminders.push({ id: 'licensePlate.external.reminder.new', offsetWorkingHours: 3 })
  const rules = shipmentTrackingCarrierRules(null, catalog)
  assert.equal(rules.find((rule) => rule.id === 'licensePlate.external.reminder.new').enabled, false)
})
