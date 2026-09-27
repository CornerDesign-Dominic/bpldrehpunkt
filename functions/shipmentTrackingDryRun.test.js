import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { hasShipmentTrackingDryRunAccess } from './shipmentTrackingDryRun.js'

test('the dry-run callable accepts active transport-order viewers but not users without view access', () => {
  assert.equal(hasShipmentTrackingDryRunAccess({ active: true, permissions: { transportOrders: 'view' } }), true)
  assert.equal(hasShipmentTrackingDryRunAccess({ active: true, permissions: { transportOrders: 'edit' } }), true)
  assert.equal(hasShipmentTrackingDryRunAccess({ active: true, permissions: { transportOrders: 'none' } }), false)
  assert.equal(hasShipmentTrackingDryRunAccess({ active: true, role: 'superadmin', permissions: {} }), true)
})

test('the dry-run callable is App-Check protected, read-only and exported from the functions entry point', async () => {
  const [index, callable, firebaseClient, trackingClient] = await Promise.all([
    readFile(new URL('./index.js', import.meta.url), 'utf8'),
    readFile(new URL('./shipmentTrackingDryRun.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/firebase.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/shipmentTracking.js', import.meta.url), 'utf8'),
  ])
  assert.match(index, /getShipmentTrackingDryRun = onCall\(\{ region: 'europe-west3', enforceAppCheck: true, invoker: 'public' \}, getShipmentTrackingDryRunHandler\)/)
  assert.match(firebaseClient, /getFunctions\(firebaseApp, 'europe-west3'\)/)
  assert.match(trackingClient, /httpsCallable\(functions, 'getShipmentTrackingDryRun'\)\(\{ orderId \}\)/)
  assert.doesNotMatch(callable, /FieldValue|\.set\(|\.update\(|\.create\(|runTransaction/)
  assert.match(callable, /tracking\.lifecycleStatus !== 'active'/)
  assert.match(callable, /effectivePartner\(db, imported\?\.carrier\?\.partnerId\)/)
  assert.match(callable, /catalog: catalogSnapshot\.exists \? catalogSnapshot\.data\(\) : null/)
})
