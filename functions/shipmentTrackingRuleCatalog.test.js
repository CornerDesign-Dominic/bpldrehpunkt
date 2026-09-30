import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { hasShipmentTrackingRuleCatalogAdminAccess, shipmentTrackingRuleCatalogPath } from './shipmentTrackingRuleCatalog.js'

test('only active admins and superadmins can update the global tracking rule catalog', () => {
  assert.equal(shipmentTrackingRuleCatalogPath, 'systemSettings/shipmentTrackingRuleCatalog')
  assert.equal(hasShipmentTrackingRuleCatalogAdminAccess({ active: true, role: 'admin' }), true)
  assert.equal(hasShipmentTrackingRuleCatalogAdminAccess({ active: true, role: 'superadmin' }), true)
  assert.equal(hasShipmentTrackingRuleCatalogAdminAccess({ active: true, role: 'user' }), false)
  assert.equal(hasShipmentTrackingRuleCatalogAdminAccess({ active: false, role: 'admin' }), false)
})

test('Firestore rules permit master-data readers but no direct catalog writes', async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
  assert.match(rules, /match \/systemSettings\/shipmentTrackingRuleCatalog \{\s*allow read: if admin\(\) \|\| view\('masterData'\);\s*allow write: if false;/s)
})
