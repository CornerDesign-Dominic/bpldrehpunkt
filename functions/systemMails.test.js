import assert from 'node:assert/strict'
import test from 'node:test'
import { systemMailTemplateDefinitions } from './systemMails.js'

test('shipment-tracking templates cover the individual and bundled carrier requests', () => {
  const definitions = systemMailTemplateDefinitions

  assert.deepEqual(Object.keys(definitions).filter((id) => id.startsWith('shipment_tracking_')), [
    'shipment_tracking_license_plate_request',
    'shipment_tracking_arrival_request',
    'shipment_tracking_license_plate_and_arrival_request',
    'shipment_tracking_general_status_update',
  ])

  for (const id of Object.keys(definitions).filter((key) => key.startsWith('shipment_tracking_'))) {
    assert.match(definitions[id].displayName, /^Sendungsverfolgung – /)
    assert.ok(definitions[id].subject.includes('{{transportOrderNumber}}'))
    assert.ok(definitions[id].message.includes('{{loadingLocation}}'))
    assert.ok(definitions[id].message.includes('{{loadingTime}}'))
    assert.deepEqual(definitions[id].allowedPlaceholders, ['transportOrderNumber', 'loadingLocation', 'loadingTime'])
  }
})

test('existing vacation and test-mail templates remain part of the system mail catalog', () => {
  assert.ok(systemMailTemplateDefinitions.vacation_request_confirmation)
  assert.ok(systemMailTemplateDefinitions.vacation_approved)
  assert.ok(systemMailTemplateDefinitions.system_test)
})
