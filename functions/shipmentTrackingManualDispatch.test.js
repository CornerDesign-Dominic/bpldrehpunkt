import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { canManuallyDispatchShipmentTracking, hasShipmentTrackingManualDispatchAccess, isManualTrackingRecipientAllowed, manualMailTechnicalDiagnostic, shipmentTrackingLoadingWindow } from './shipmentTrackingManualDispatch.js'

test('manual shipment-tracking mail requires the existing transport-order edit access', () => {
  assert.equal(hasShipmentTrackingManualDispatchAccess({ role: 'user', permissions: { transportOrders: 'view' } }), false)
  assert.equal(hasShipmentTrackingManualDispatchAccess({ role: 'user', permissions: { transportOrders: 'edit' } }), true)
  assert.equal(hasShipmentTrackingManualDispatchAccess({ role: 'superadmin', permissions: { transportOrders: 'none' } }), true)
})

test('manual test requests are permitted after completion without reopening the tracking', () => {
  assert.equal(canManuallyDispatchShipmentTracking({ lifecycleStatus: 'active' }), true)
  assert.equal(canManuallyDispatchShipmentTracking({ lifecycleStatus: 'completed' }), true)
  assert.equal(canManuallyDispatchShipmentTracking({ lifecycleStatus: 'upcoming' }), false)
  assert.equal(canManuallyDispatchShipmentTracking(null), false)
})

test('manual tracking mail permits arbitrary stored recipients only in production', () => {
  assert.equal(isManualTrackingRecipientAllowed('carrier@example.test', { GCLOUD_PROJECT: 'db-bpl-drehpunkt' }), true)
  assert.equal(isManualTrackingRecipientAllowed('carrier@example.test', { GCLOUD_PROJECT: 'db-bpl-drehpunkt-dev' }), false)
  assert.equal(isManualTrackingRecipientAllowed('status@brennpunkt-logistik.de', { GCLOUD_PROJECT: 'db-bpl-drehpunkt-dev' }), true)
  assert.equal(isManualTrackingRecipientAllowed('status@brennpunkt-logistik.de', { GCLOUD_PROJECT: 'unknown-project' }), false)
  assert.equal(isManualTrackingRecipientAllowed('not-an-email', { GCLOUD_PROJECT: 'db-bpl-drehpunkt' }), false)
})

test('loading windows omit redundant dates and repeated times in system mails', () => {
  assert.equal(shipmentTrackingLoadingWindow({ loading: { window: { from: '2026-09-28T07:00', until: '2026-09-28T09:00' } } }), 'Mo, 28.09.2026, 07:00–09:00 Uhr')
  assert.equal(shipmentTrackingLoadingWindow({ loading: { window: { from: '2026-09-28T07:00', until: '2026-09-28T07:00' } } }), 'Mo, 28.09.2026, 07:00 Uhr')
  assert.equal(shipmentTrackingLoadingWindow({ loading: { window: { from: '2026-09-28T07:00', until: '2026-09-29T07:00' } } }), 'Mo, 28.09.2026, 07:00 Uhr bis Di, 29.09.2026, 07:00 Uhr')
})

test('manual mail diagnostics classify unreachable webhook endpoints without persisting their URL', () => {
  assert.deepEqual(manualMailTechnicalDiagnostic({ cause: { code: 'ENOTFOUND' } }), {
    code: 'notification_endpoint_unreachable', message: 'Der Versanddienst ist nicht erreichbar.',
  })
  assert.deepEqual(manualMailTechnicalDiagnostic(new Error('notification-service-not-configured')), {
    code: 'notification_service_missing', message: 'Der Versanddienst ist nicht konfiguriert.',
  })
  assert.deepEqual(manualMailTechnicalDiagnostic(new Error('notification-service-401')), {
    code: 'notification_service_rejected', message: 'Der Versanddienst hat die Anfrage abgelehnt.',
  })
})

test('manual shipment-tracking mail is App-Check protected and only matching due bundles mark rules as sent', async () => {
  const [index, handler] = await Promise.all([
    readFile(new URL('./index.js', import.meta.url), 'utf8'),
    readFile(new URL('./shipmentTrackingManualDispatch.js', import.meta.url), 'utf8'),
  ])
  assert.match(index, /sendManualShipmentTrackingMail = onCall\(\{ region: 'europe-west3', enforceAppCheck: true, invoker: 'public', secrets: \[shipmentTrackingMailNotificationUrl, systemMailNotificationUrl\] \}, sendManualShipmentTrackingMailHandler\)/)
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
