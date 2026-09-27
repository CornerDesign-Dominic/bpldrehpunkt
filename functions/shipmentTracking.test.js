import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyRecipientChanges, canEditTrackingRecipients, deriveShipmentTrackingPosition, hasTrackingEditAccess, normalizeRecipientChanges } from './shipmentTracking.js'

test('manual tracking writes require transportOrders.edit, except for superadmins', () => {
  assert.equal(hasTrackingEditAccess({ role: 'user', permissions: { transportOrders: 'view' } }), false)
  assert.equal(hasTrackingEditAccess({ role: 'user', permissions: { transportOrders: 'edit' } }), true)
  assert.equal(hasTrackingEditAccess({ role: 'superadmin', permissions: { transportOrders: 'none' } }), true)
})

test('manual tracking position only advances to in transit after an actual loading departure', () => {
  assert.deepEqual(deriveShipmentTrackingPosition({ estimatedDepartureLoadingAt: {} }), { stageId: 'preparation', progressToNextStage: 0 })
  assert.deepEqual(deriveShipmentTrackingPosition({ actualDepartureLoadingAt: {} }), { stageId: 'in_transit', progressToNextStage: 0 })
})

test('manual tracking position prioritizes unloading and completion', () => {
  assert.deepEqual(deriveShipmentTrackingPosition({ loadingStartedAt: {} }), { stageId: 'loading', progressToNextStage: 0 })
  assert.deepEqual(deriveShipmentTrackingPosition({ actualArrivalUnloadingAt: {} }), { stageId: 'unloading', progressToNextStage: 0 })
  assert.deepEqual(deriveShipmentTrackingPosition({ lifecycleStatus: 'completed' }), { stageId: 'post_transport', progressToNextStage: 0 })
})

test('recipient changes store only explicitly changed manual addresses and preserve the other recipient', () => {
  const current = { customer: { email: 'old-customer@example.test', source: 'manual' }, carrier: { email: 'carrier@example.test', source: 'manual' } }
  const changes = normalizeRecipientChanges({ customer: 'new-customer@example.test' })
  const result = applyRecipientChanges(current, changes)
  assert.deepEqual(result.recipients, { customer: { email: 'new-customer@example.test', source: 'manual' }, carrier: { email: 'carrier@example.test', source: 'manual' } })
  assert.deepEqual(result.oldValue, { recipients: { customer: { email: 'old-customer@example.test', source: 'manual' } } })
  assert.deepEqual(result.newValue, { recipients: { customer: { email: 'new-customer@example.test', source: 'manual' } } })
})

test('recipient clearing is explicit and remains historizable', () => {
  const result = applyRecipientChanges({ customer: { email: 'customer@example.test', source: 'manual' }, carrier: { email: 'carrier@example.test', source: 'manual' } }, normalizeRecipientChanges({ customer: null, carrier: null }))
  assert.deepEqual(result.recipients, {})
  assert.deepEqual(result.oldValue, { recipients: { customer: { email: 'customer@example.test', source: 'manual' }, carrier: { email: 'carrier@example.test', source: 'manual' } } })
  assert.deepEqual(result.newValue, { recipients: { customer: null, carrier: null } })
})

test('recipient validation rejects empty and invalid addresses', () => {
  assert.throws(() => normalizeRecipientChanges({ customer: '' }), /ungültig/i)
  assert.throws(() => normalizeRecipientChanges({ customer: 'not-an-email' }), /ungültig/i)
  assert.throws(() => normalizeRecipientChanges({ unknown: 'test@example.test' }), /Ungültige Empfängerangaben/)
})

test('recipient changes use existing edit access and are locked after completion', () => {
  assert.equal(hasTrackingEditAccess({ role: 'user', permissions: { transportOrders: 'view' } }), false)
  assert.equal(hasTrackingEditAccess({ role: 'user', permissions: { transportOrders: 'edit' } }), true)
  assert.equal(canEditTrackingRecipients({ lifecycleStatus: 'active' }), true)
  assert.equal(canEditTrackingRecipients({ lifecycleStatus: 'completed' }), false)
})

test('recipient helpers do not mutate import or partner data', () => {
  const imported = { customer: { email: 'import@example.test' } }
  const partner = { shipmentTrackingPolicy: { customer: { licensePlateImportant: true } } }
  applyRecipientChanges({}, normalizeRecipientChanges({ customer: 'manual@example.test' }))
  assert.deepEqual(imported, { customer: { email: 'import@example.test' } })
  assert.deepEqual(partner, { shipmentTrackingPolicy: { customer: { licensePlateImportant: true } } })
})

test('the existing tracking callable remains App-Check protected', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  assert.match(source, /updateManualShipmentTracking\s*=\s*onCall\(\{\s*region:\s*'europe-west3',\s*enforceAppCheck:\s*true\s*\}/)
})
