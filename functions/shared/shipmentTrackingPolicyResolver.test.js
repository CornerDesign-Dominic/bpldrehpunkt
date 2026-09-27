import test from 'node:test'
import assert from 'node:assert/strict'
import { fallbackShipmentTrackingRuleCatalog } from './shipmentTrackingRuleCatalog.js'
import { resolveShipmentTrackingPolicy } from './shipmentTrackingPolicyResolver.js'

const partner = (shipmentTrackingPolicy) => ({ shipmentTrackingPolicy })
const resolve = ({ customerPolicy, carrierPolicy, catalog } = {}) => resolveShipmentTrackingPolicy({ customer: customerPolicy === undefined ? null : partner(customerPolicy), carrier: carrierPolicy === undefined ? null : partner(carrierPolicy), catalog: catalog || fallbackShipmentTrackingRuleCatalog() })
const carrierRules = (ids) => ({ carrier: { enabledRuleIds: Object.fromEntries(ids.map((id) => [id, true])) } })
const importantCustomer = (topic) => ({ customer: topic === 'licensePlate' ? { licensePlateImportant: true } : { loadingSiteInformationImportant: true } })

test('customer not important leaves carrier rules unchanged', () => {
  const result = resolve({ carrierPolicy: carrierRules(['licensePlate.external.reminder.1']) }).topics.licensePlate
  assert.deepEqual(result, { enabledRuleIds: ['licensePlate.external.reminder.1'], rules: [{ id: 'licensePlate.external.reminder.1', source: 'carrier' }], customerImportant: false, forcedRuleIds: [], diagnostics: [] })
})

test('an important customer forces its dedicated license-plate requirement when carrier rules are off', () => {
  const result = resolve({ customerPolicy: importantCustomer('licensePlate') }).topics.licensePlate
  assert.deepEqual(result.enabledRuleIds, ['licensePlate.customer.required.internal'])
  assert.deepEqual(result.rules, [{ id: 'licensePlate.customer.required.internal', source: 'customer-required' }])
  assert.deepEqual(result.forcedRuleIds, ['licensePlate.customer.required.internal'])
})

test('an important customer keeps carrier reminders and adds its separate requirement', () => {
  const result = resolve({ customerPolicy: importantCustomer('licensePlate'), carrierPolicy: carrierRules(['licensePlate.external.reminder.1', 'licensePlate.external.reminder.2']) }).topics.licensePlate
  assert.deepEqual(result.rules, [
    { id: 'licensePlate.external.reminder.1', source: 'carrier' },
    { id: 'licensePlate.external.reminder.2', source: 'carrier' },
    { id: 'licensePlate.customer.required.internal', source: 'customer-required' },
  ])
})

test('carrier policies cannot enable or suppress the dedicated customer requirement', () => {
  const result = resolve({ customerPolicy: importantCustomer('licensePlate'), carrierPolicy: carrierRules(['licensePlate.customer.required.internal']) }).topics.licensePlate
  assert.deepEqual(result.rules, [{ id: 'licensePlate.customer.required.internal', source: 'customer-required' }])
  assert.deepEqual(result.forcedRuleIds, ['licensePlate.customer.required.internal'])
  assert.deepEqual(result.diagnostics.map((entry) => entry.code), ['inactive-carrier-rule'])
})

test('a customer that does not require a topic and a carrier with all rules off resolves to no rules', () => {
  const result = resolve().topics.licensePlate
  assert.deepEqual(result.enabledRuleIds, [])
  assert.deepEqual(result.rules, [])
  assert.deepEqual(result.diagnostics, [])
})

test('the same dedicated customer requirement policy applies to the loading site', () => {
  const result = resolve({ customerPolicy: importantCustomer('loadingSite'), carrierPolicy: carrierRules(['loadingSite.external.reminder.1']) }).topics.loadingSite
  assert.deepEqual(result.rules, [
    { id: 'loadingSite.external.reminder.1', source: 'carrier' },
    { id: 'loadingSite.customer.required.internal', source: 'customer-required' },
  ])
  assert.deepEqual(result.forcedRuleIds, ['loadingSite.customer.required.internal'])
})

test('missing partners produce a safe, disabled result', () => {
  const result = resolveShipmentTrackingPolicy({ catalog: fallbackShipmentTrackingRuleCatalog() })
  assert.deepEqual(result.topics.licensePlate.enabledRuleIds, [])
  assert.deepEqual(result.topics.loadingSite.enabledRuleIds, [])
  assert.deepEqual(result.diagnostics, [])
})

test('one partner serving both roles still contributes only the matching policy area per assignment', () => {
  const samePartner = partner({ customer: { licensePlateImportant: true }, carrier: { enabledRuleIds: { 'licensePlate.external.initial': true } } })
  const fromBothRoles = resolveShipmentTrackingPolicy({ customer: samePartner, carrier: samePartner, catalog: fallbackShipmentTrackingRuleCatalog() }).topics.licensePlate
  const onlyAsCarrier = resolveShipmentTrackingPolicy({ carrier: samePartner, catalog: fallbackShipmentTrackingRuleCatalog() }).topics.licensePlate
  assert.deepEqual(fromBothRoles.enabledRuleIds, ['licensePlate.external.initial', 'licensePlate.customer.required.internal'])
  assert.equal(onlyAsCarrier.customerImportant, false)
  assert.deepEqual(onlyAsCarrier.enabledRuleIds, ['licensePlate.external.initial'])
})

test('the resolver exposes the same role facts for a provisional TA-import carrier without a creditor number', () => {
  const carrier = { taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] }, shipmentTrackingPolicy: carrierRules(['licensePlate.external.initial']) }
  const result = resolveShipmentTrackingPolicy({ carrier, catalog: fallbackShipmentTrackingRuleCatalog() })
  assert.deepEqual(result.partnerRoles.carrier, { customer: false, carrier: true })
  assert.deepEqual(result.topics.licensePlate.enabledRuleIds, ['licensePlate.external.initial'])
})

test('retired or otherwise inactive carrier rule IDs never become effective', () => {
  const catalog = fallbackShipmentTrackingRuleCatalog()
  catalog.retiredRuleIds.push('licensePlate.external.reminder.1')
  const result = resolve({ carrierPolicy: carrierRules(['licensePlate.external.reminder.1', 'retired.unknown.rule']), catalog }).topics.licensePlate
  assert.deepEqual(result.enabledRuleIds, [])
  assert.deepEqual(result.diagnostics.map((entry) => entry.code), ['inactive-carrier-rule', 'inactive-carrier-rule'])
})

test('an active rule for one topic is not falsely reported as inactive for the other topic', () => {
  const result = resolve({ carrierPolicy: carrierRules(['licensePlate.external.reminder.2']) })
  assert.deepEqual(result.topics.licensePlate.enabledRuleIds, ['licensePlate.external.reminder.2'])
  assert.deepEqual(result.diagnostics, [])
})

test('a required topic without its customer requirement reports a diagnostic instead of inventing a rule', () => {
  const catalog = fallbackShipmentTrackingRuleCatalog()
  delete catalog.topics.loadingSite.customerRequirement
  const result = resolve({ customerPolicy: importantCustomer('loadingSite'), catalog }).topics.loadingSite
  assert.deepEqual(result.enabledRuleIds, [])
  assert.deepEqual(result.forcedRuleIds, [])
  assert.deepEqual(result.diagnostics, [{ code: 'missing-customer-requirement', topic: 'loadingSite', message: 'Für loadingSite ist keine Kundenanforderungs-Stufe im Regelkatalog vorhanden.' }])
})
