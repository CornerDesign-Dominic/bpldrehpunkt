import test from 'node:test'
import assert from 'node:assert/strict'
import { shipmentTrackingPolicyCardState } from './shipmentTrackingPolicyPresentation.js'
import { fallbackShipmentTrackingRuleCatalog } from '../../shared/shipmentTrackingRuleCatalog.js'

test('the policy card exposes only the partner roles represented by the partner', () => {
  assert.deepEqual(shipmentTrackingPolicyCardState({ debtorNumber: '1001' }, null, true).roles, { customer: true, carrier: false })
  assert.deepEqual(shipmentTrackingPolicyCardState({ creditorNumber: '2001' }, null, true).roles, { customer: false, carrier: true })
  assert.deepEqual(shipmentTrackingPolicyCardState({ debtorNumber: '1001', creditorNumber: '2001' }, null, true).roles, { customer: true, carrier: true })
  assert.deepEqual(shipmentTrackingPolicyCardState({ taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }, null, true).roles, { customer: false, carrier: true })
  assert.deepEqual(shipmentTrackingPolicyCardState({ businessPartnerRoles: ['customer'] }, null, true).roles, { customer: true, carrier: false })
  assert.deepEqual(shipmentTrackingPolicyCardState({}, null, true).roles, { customer: false, carrier: false })
})

test('view access is read-only and master-data edit access enables policy changes', () => {
  const provisionalCarrier = { taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }
  assert.equal(shipmentTrackingPolicyCardState(provisionalCarrier, null, false).editable, false)
  assert.equal(shipmentTrackingPolicyCardState(provisionalCarrier, null, true).editable, true)
})

test('dynamic carrier display follows the global catalog rather than fixed JSX stages', () => {
  const catalog = fallbackShipmentTrackingRuleCatalog()
  catalog.topics.loadingSite.reminders.push({ id: 'loadingSite.external.reminder.new', offsetWorkingHours: 3 })
  const state = shipmentTrackingPolicyCardState({ creditorNumber: '2001' }, null, true, catalog)
  assert.equal(state.carrierRules.some((rule) => rule.id === 'loadingSite.external.reminder.new' && rule.enabled === false), true)
})
