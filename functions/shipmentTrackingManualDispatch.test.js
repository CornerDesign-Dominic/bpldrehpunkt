import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { canManuallyDispatchShipmentTracking, hasShipmentTrackingManualDispatchAccess } from './shipmentTrackingManualDispatch.js'

test('manual shipment-tracking mail requires the existing transport-order edit access', () => {
  assert.equal(hasShipmentTrackingManualDispatchAccess({ role: 'user', permissions: { transportOrders: 'view' } }), false)
  assert.equal(hasShipmentTrackingManualDispatchAccess({ role: 'user', permissions: { transportOrders: 'edit' } }), true)
  assert.equal(hasShipmentTrackingManualDispatchAccess({ role: 'superadmin', permissions: { transportOrders: 'none' } }), true)
})

test('manual test requests are permitted after completion without reopening the tracking', () => {
  assert.equal(canManuallyDispatchShipmentTracking({ lifecycleStatus: 'active' }), true)
  assert.equal(canManuallyDispatchShipmentTracking({ lifecycleStatus: 'completed' }), true)
  assert.equal(canManuallyDispatchShipmentTracking({ lifecycleStatus: 'preparation' }), false)
  assert.equal(canManuallyDispatchShipmentTracking(null), false)
})

test('manual shipment-tracking mail is App-Check protected and only matching due bundles mark rules as sent', async () => {
  const [index, handler] = await Promise.all([
    readFile(new URL('./index.js', import.meta.url), 'utf8'),
    readFile(new URL('./shipmentTrackingManualDispatch.js', import.meta.url), 'utf8'),
  ])
  assert.match(index, /sendManualShipmentTrackingMail = onCall\(\{ region: 'europe-west3', enforceAppCheck: true, invoker: 'public', secrets: \[systemMailNotificationUrl\] \}, sendManualShipmentTrackingMailHandler\)/)
  assert.match(index, /previewManualShipmentTrackingMail = onCall\(\{ region: 'europe-west3', enforceAppCheck: true, invoker: 'public' \}, previewManualShipmentTrackingMailHandler\)/)
  assert.match(handler, /matchingDueBundle\(preview, requestedBundleId, templateId, recipient\)/)
  assert.match(handler, /dispatchContext\(db, orderId, \{ allowCompleted: true \}\)/)
  assert.match(handler, /tracking\.lifecycleStatus === 'active' \? matchingDueBundle/)
  assert.match(handler, /afterCompletion: true/)
  assert.match(handler, /ruleIds: dueBundle\?\.ruleIds \|\| \[\]/)
  assert.match(handler, /allowDevelopment: true/)
  assert.match(handler, /status: 'sent'/)
  assert.match(handler, /Der Versand ist in dieser Umgebung deaktiviert/)
})
