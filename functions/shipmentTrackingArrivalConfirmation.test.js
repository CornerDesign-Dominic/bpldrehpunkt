import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION, hasShipmentTrackingArrivalConfirmationAdminAccess, normalizeShipmentTrackingArrivalConfirmation, shipmentTrackingArrivalConfirmationPath, validateShipmentTrackingArrivalConfirmation } from './shipmentTrackingArrivalConfirmation.js'

test('arrival confirmation defaults to two working hours and has the dedicated settings path', () => {
  assert.equal(shipmentTrackingArrivalConfirmationPath, 'systemSettings/shipmentTrackingArrivalConfirmation')
  assert.equal(DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION.offsetWorkingHours, 2)
  assert.equal(normalizeShipmentTrackingArrivalConfirmation({}).enabled, true)
  assert.equal(normalizeShipmentTrackingArrivalConfirmation({ offsetWorkingHours: 3 }).offsetWorkingHours, 3)
})

test('arrival confirmation settings allow only an active admin and a valid schedule', () => {
  assert.equal(hasShipmentTrackingArrivalConfirmationAdminAccess({ active: true, role: 'admin' }), true)
  assert.equal(hasShipmentTrackingArrivalConfirmationAdminAccess({ active: true, role: 'user' }), false)
  assert.deepEqual(validateShipmentTrackingArrivalConfirmation(DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION), DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION)
  assert.throws(() => validateShipmentTrackingArrivalConfirmation({ ...DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION, offsetWorkingHours: 49 }), /zwischen 1 und 48 Arbeitsstunden/)
})
