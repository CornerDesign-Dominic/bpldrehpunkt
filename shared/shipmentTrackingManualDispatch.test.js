import assert from 'node:assert/strict'
import test from 'node:test'
import { shipmentTrackingManualDispatchBundles } from './shipmentTrackingManualDispatch.js'

const recipient = { role: 'carrier', state: 'configured', email: 'carrier@example.test' }
const dueAt = '2026-09-25T13:00:00.000Z'

function rule({ ruleId, topic, scheduledAt = dueAt, state = recipient, status = 'due', kind = 'external' }) {
  return { ruleId, topic, scheduledAt, recipient: state, status, kind }
}

test('manual dispatch combines due license-plate and arrival requests with the same carrier and exact due time', () => {
  const bundles = shipmentTrackingManualDispatchBundles({ rules: [
    rule({ ruleId: 'license.external.reminder', topic: 'licensePlate' }),
    rule({ ruleId: 'loading.external.reminder', topic: 'loadingSite' }),
  ] })

  assert.equal(bundles.length, 1)
  assert.equal(bundles[0].templateId, 'shipment_tracking_license_plate_and_arrival_request')
  assert.deepEqual(bundles[0].ruleIds, ['license.external.reminder', 'loading.external.reminder'])
  assert.deepEqual(bundles[0].topicLabels, ['Kennzeichen', 'LKW-Ankunft'])
})

test('manual dispatch keeps different due times or recipients in separate bundles', () => {
  const bundles = shipmentTrackingManualDispatchBundles({ rules: [
    rule({ ruleId: 'license.external.reminder', topic: 'licensePlate' }),
    rule({ ruleId: 'loading.external.reminder', topic: 'loadingSite', scheduledAt: '2026-09-25T15:00:00.000Z' }),
    rule({ ruleId: 'loading.external.next', topic: 'loadingSite', state: { ...recipient, email: 'other@example.test' } }),
  ] })

  assert.equal(bundles.length, 3)
  assert.deepEqual(bundles.map((bundle) => bundle.templateId), [
    'shipment_tracking_license_plate_request',
    'shipment_tracking_arrival_request',
    'shipment_tracking_arrival_request',
  ])
})

test('manual dispatch ignores upcoming, internal, already sent and recipient-less rules', () => {
  const bundles = shipmentTrackingManualDispatchBundles({ rules: [
    rule({ ruleId: 'upcoming', topic: 'licensePlate', status: 'upcoming' }),
    rule({ ruleId: 'internal', topic: 'licensePlate', kind: 'internal' }),
    rule({ ruleId: 'sent', topic: 'licensePlate', status: 'sent' }),
    rule({ ruleId: 'missing-recipient', topic: 'licensePlate', state: { role: 'carrier', state: 'missing', email: null } }),
  ] })

  assert.deepEqual(bundles, [])
})
