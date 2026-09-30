import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { hasShipmentTrackingOperatingHoursAdminAccess, shipmentTrackingOperatingHoursPath } from './shipmentTrackingOperatingHours.js'

test('shipment tracking operating-hours writes are restricted to active admins and superadmins', () => {
  assert.equal(shipmentTrackingOperatingHoursPath, 'systemSettings/shipmentTrackingOperatingHours')
  assert.equal(hasShipmentTrackingOperatingHoursAdminAccess({ active: true, role: 'admin' }), true)
  assert.equal(hasShipmentTrackingOperatingHoursAdminAccess({ active: true, role: 'superadmin' }), true)
  assert.equal(hasShipmentTrackingOperatingHoursAdminAccess({ active: true, role: 'user' }), false)
  assert.equal(hasShipmentTrackingOperatingHoursAdminAccess({ active: false, role: 'admin' }), false)
})

test('Firestore rules allow only admin reads and no direct writes to the operating-hours document', async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
  assert.match(rules, /match \/systemSettings\/shipmentTrackingOperatingHours \{\s*allow read: if admin\(\);\s*allow write: if false;/s)
})
