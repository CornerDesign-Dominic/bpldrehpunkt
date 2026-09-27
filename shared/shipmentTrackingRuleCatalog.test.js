import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SHIPMENT_TRACKING_RULE_CATALOG, fallbackShipmentTrackingRuleCatalog, materializeShipmentTrackingRuleCatalog, validateShipmentTrackingRuleCatalog } from './shipmentTrackingRuleCatalog.js'

const ids = ['one', 'two', 'three', 'four', 'five']
const idFactory = () => ids.shift()

test('the fallback catalog provides the agreed initial rule stages', () => {
  const catalog = fallbackShipmentTrackingRuleCatalog()
  assert.deepEqual(catalog, DEFAULT_SHIPMENT_TRACKING_RULE_CATALOG)
  assert.deepEqual(catalog.topics.licensePlate.reminders.map((rule) => rule.offsetWorkingHours), [8, 4])
  assert.deepEqual(catalog.topics.loadingSite.internalEscalations.map((rule) => rule.offsetWorkingHours), [2, 0])
  assert.deepEqual(catalog.topics.licensePlate.customerRequirement, { id: 'licensePlate.customer.required.internal', offsetWorkingHours: 2 })
  assert.deepEqual(catalog.topics.loadingSite.customerRequirement, { id: 'loadingSite.customer.required.internal', offsetWorkingHours: 2 })
})

test('the initial request cannot be removed and catalog lists respect their bounds', () => {
  const missingInitial = fallbackShipmentTrackingRuleCatalog(); missingInitial.topics.licensePlate.initialRequest = null
  assert.throws(() => validateShipmentTrackingRuleCatalog(missingInitial), /erste Anfrage/)
  const tooManyReminders = fallbackShipmentTrackingRuleCatalog(); tooManyReminders.topics.licensePlate.reminders = Array.from({ length: 6 }, (_, index) => ({ id: `licensePlate.external.reminder.extra${index}`, offsetWorkingHours: 10 - index }))
  assert.throws(() => validateShipmentTrackingRuleCatalog(tooManyReminders), /höchstens fünf Erinnerungen/)
  const noEscalation = fallbackShipmentTrackingRuleCatalog(); noEscalation.topics.loadingSite.internalEscalations = []
  assert.throws(() => validateShipmentTrackingRuleCatalog(noEscalation), /mindestens eine/)
})

test('catalog validation rejects non-descending, duplicate and invalid offsets', () => {
  const nonDescending = fallbackShipmentTrackingRuleCatalog(); nonDescending.topics.licensePlate.reminders[0].offsetWorkingHours = 4
  assert.throws(() => validateShipmentTrackingRuleCatalog(nonDescending), /streng absteigender/)
  const duplicate = fallbackShipmentTrackingRuleCatalog(); duplicate.topics.loadingSite.internalEscalations[1].offsetWorkingHours = 2
  assert.throws(() => validateShipmentTrackingRuleCatalog(duplicate), /streng absteigender/)
  const zeroExternal = fallbackShipmentTrackingRuleCatalog(); zeroExternal.topics.loadingSite.reminders[0].offsetWorkingHours = 0
  assert.throws(() => validateShipmentTrackingRuleCatalog(zeroExternal), /positive ganze Zahl/)
  const zeroInternal = fallbackShipmentTrackingRuleCatalog(); zeroInternal.topics.licensePlate.internalEscalations[0].offsetWorkingHours = 0
  assert.doesNotThrow(() => validateShipmentTrackingRuleCatalog(zeroInternal))
  const zeroCustomerRequirement = fallbackShipmentTrackingRuleCatalog(); zeroCustomerRequirement.topics.licensePlate.customerRequirement.offsetWorkingHours = 0
  assert.doesNotThrow(() => validateShipmentTrackingRuleCatalog(zeroCustomerRequirement))
})

test('saving an existing catalog adds the dedicated customer requirement with the safe two-hour starting value', () => {
  const legacy = fallbackShipmentTrackingRuleCatalog()
  delete legacy.topics.licensePlate.customerRequirement
  delete legacy.topics.loadingSite.customerRequirement
  const saved = materializeShipmentTrackingRuleCatalog(legacy, legacy, idFactory)
  assert.deepEqual(saved.topics.licensePlate.customerRequirement, { id: 'licensePlate.customer.required.internal', offsetWorkingHours: 2 })
  assert.deepEqual(saved.topics.loadingSite.customerRequirement, { id: 'loadingSite.customer.required.internal', offsetWorkingHours: 2 })
})

test('new stages receive unique server IDs and deleted IDs are retired permanently', () => {
  const firstInput = fallbackShipmentTrackingRuleCatalog(); firstInput.topics.licensePlate.reminders.push({ offsetWorkingHours: 3 })
  const first = materializeShipmentTrackingRuleCatalog(firstInput, null, idFactory)
  const generated = first.topics.licensePlate.reminders.at(-1).id
  assert.equal(generated, 'licensePlate.external.reminder.one')
  const removal = structuredClone(first); removal.topics.licensePlate.reminders.pop()
  const retired = materializeShipmentTrackingRuleCatalog(removal, first, idFactory)
  assert.ok(retired.retiredRuleIds.includes(generated))
  const reuse = structuredClone(retired); reuse.topics.licensePlate.reminders.push({ id: generated, offsetWorkingHours: 3 })
  assert.throws(() => materializeShipmentTrackingRuleCatalog(reuse, retired, idFactory), /serverseitig vergeben|nicht wiederverwendet/)
})
