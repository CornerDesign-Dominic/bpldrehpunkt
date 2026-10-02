import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyRecipientChanges, canEditTrackingRecipients, createShipmentTrackingDocument, deriveShipmentTrackingPosition, hasTrackingEditAccess, normalizeRecipientChanges, normalizeTransitCorrections, normalizeTransitEntries, normalizeTransitRemovals } from './shipmentTracking.js'

test('manual transit reports validate position and pause without deriving another tracking stage', () => {
  const entries = normalizeTransitEntries([
    { kind: 'position', at: '2026-10-01T12:00:00Z', kilometersToDestination: 234.5, location: 'A2 bei Hannover' },
    { kind: 'pause', at: '2026-10-01T13:00:00Z', durationMinutes: 45 },
  ])
  assert.equal(entries[0].kilometersToDestination, 234.5)
  assert.equal(entries[0].location, 'A2 bei Hannover')
  assert.equal(entries[1].durationMinutes, 45)
  assert.deepEqual(deriveShipmentTrackingPosition({}), { stageId: 'preparation', progressToNextStage: 0 })
  assert.throws(() => normalizeTransitEntries([{ kind: 'position', at: '2026-10-01T12:00:00Z', kilometersToDestination: -1 }]), /Kilometer/)
  assert.throws(() => normalizeTransitEntries([{ kind: 'pause', at: '2026-10-01T13:00:00Z', durationMinutes: 0 }]), /Pausendauer/)
  assert.throws(() => normalizeTransitEntries([{ kind: 'pause', at: '', durationMinutes: 45 }]), /Zeitpunkt/)
})

test('a manual transit correction must identify one existing report with valid values', () => {
  const correction = normalizeTransitCorrections([{ id: 'ai-position-mail-1', entry: { kind: 'position', at: '2026-10-01T12:00:00Z', kilometersToDestination: 210, location: '' } }])
  assert.equal(correction[0].entry.kilometersToDestination, 210)
  assert.throws(() => normalizeTransitCorrections([{ id: '../other', entry: { kind: 'pause', at: '2026-10-01T12:00:00Z', durationMinutes: 45 } }]), /Ungültige Fahrtmeldung/)
  const duplicate = { id: 'ai-position-mail-1', entry: { kind: 'position', at: '2026-10-01T12:00:00Z', kilometersToDestination: 210 } }
  assert.throws(() => normalizeTransitCorrections([duplicate, duplicate]), /Ungültige Fahrtmeldung/)
})

test('a manual transit removal accepts stable event IDs only once', () => {
  assert.deepEqual(normalizeTransitRemovals(['ai-position-mail-1']), ['ai-position-mail-1'])
  assert.throws(() => normalizeTransitRemovals(['../other']), /Ungültige Fahrtmeldung/)
  assert.throws(() => normalizeTransitRemovals(['position-1', 'position-1']), /Ungültige Fahrtmeldung/)
})

test('manual tracking writes require transportOrders.edit, except for superadmins', () => {
  assert.equal(hasTrackingEditAccess({ role: 'user', permissions: { transportOrders: 'view' } }), false)
  assert.equal(hasTrackingEditAccess({ role: 'user', permissions: { transportOrders: 'edit' } }), true)
  assert.equal(hasTrackingEditAccess({ role: 'superadmin', permissions: { transportOrders: 'none' } }), true)
})

test('an early manual start is explicitly marked and immediately shown as running', () => {
  assert.equal(createShipmentTrackingDocument('order', 'user', 'Name').trackingStartedEarly, false)
  const early = createShipmentTrackingDocument('order', 'user', 'Name', { lifecyclePhase: 'in_progress', trackingStartedEarly: true })
  assert.equal(early.lifecyclePhase, 'in_progress')
  assert.equal(early.trackingStartedEarly, true)
})

test('new shipment tracking documents keep dedicated driver details', () => {
  const tracking = createShipmentTrackingDocument('order', 'user', 'Name')
  assert.equal(tracking.driverName, null)
  assert.equal(tracking.driverPhone, null)
})

test('new shipment tracking documents initialize an imported combined license plate', () => {
  const tracking = createShipmentTrackingDocument('order', 'user', 'Name', { importedLicensePlate: 'AB-CD 123 / EF-GH 456' })
  assert.equal(tracking.licensePlate, 'AB-CD 123 / EF-GH 456')
  assert.equal('tractorLicensePlate' in tracking, false)
  assert.equal('trailerLicensePlate' in tracking, false)
})

test('a valid TA dispatch address prepopulates the carrier recipient', () => {
  assert.deepEqual(
    createShipmentTrackingDocument('order', 'user', 'Name', { carrierRecipientEmail: 'dispo@example.test' }).recipients,
    { carrier: { email: 'dispo@example.test', source: 'transport-order-import' } },
  )
  assert.deepEqual(createShipmentTrackingDocument('order', 'user', 'Name', { carrierRecipientEmail: 'not-an-email' }).recipients, {})
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
  assert.match(source, /getShipmentTrackingActivation\s*=\s*onCall\(\{\s*region:\s*'europe-west3',\s*enforceAppCheck:\s*true,\s*invoker:\s*'public'\s*\}/)
})
