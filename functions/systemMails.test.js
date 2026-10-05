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
    'shipment_tracking_loading_eta_request',
    'shipment_tracking_loading_arrival_request',
    'shipment_tracking_loading_departure_request',
    'shipment_tracking_unloading_eta_request',
    'shipment_tracking_unloading_arrival_request',
    'shipment_tracking_loading_update_request',
    'shipment_tracking_unloading_update_request',
    'shipment_tracking_actual_arrival_confirmation',
  ])

  for (const id of Object.keys(definitions).filter((key) => key.startsWith('shipment_tracking_'))) {
    assert.doesNotMatch(definitions[id].displayName, /^Sendungsverfolgung/)
    assert.ok(definitions[id].subject.includes('{{transportOrderNumber}}'))
    assert.match(definitions[id].message, /^Hallo,\n\n/)
    assert.match(definitions[id].message, /\b(?:Could|Has)\b/)
    const unloading = ['shipment_tracking_unloading_eta_request', 'shipment_tracking_unloading_arrival_request', 'shipment_tracking_unloading_update_request'].includes(id)
    const loadingWithoutTime = ['shipment_tracking_loading_update_request', 'shipment_tracking_loading_departure_request'].includes(id)
    assert.ok(definitions[id].message.includes(unloading ? '{{unloadingLocation}}' : '{{loadingLocation}}'))
    if (!unloading && !loadingWithoutTime) assert.ok(definitions[id].message.includes('{{loadingTime}}'))
    assert.deepEqual(definitions[id].allowedPlaceholders, unloading ? ['transportOrderNumber', 'unloadingLocation'] : loadingWithoutTime ? ['transportOrderNumber', 'loadingLocation'] : ['transportOrderNumber', 'loadingLocation', 'loadingTime'])
  }
})

test('existing vacation and test-mail templates remain part of the system mail catalog', () => {
  assert.ok(systemMailTemplateDefinitions.vacation_request_confirmation)
  assert.ok(systemMailTemplateDefinitions.vacation_approved)
  assert.ok(systemMailTemplateDefinitions.system_test)
  assert.ok(systemMailTemplateDefinitions.case_deadline_reminder)
  assert.ok(systemMailTemplateDefinitions.todo_deadline_reminder)
})

test('the short-notice arrival confirmation is editable with the other shipment-tracking templates', () => {
  const definition = systemMailTemplateDefinitions.shipment_tracking_actual_arrival_confirmation
  assert.ok(definition)
  assert.equal(definition.adminVisible, undefined)
  assert.equal(definition.displayName, 'Kurz vor Beladung bestätigen')
})
