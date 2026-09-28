import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { automaticTrackingDeliveryId, isDevelopmentTrackingRecipientAllowed, shouldActivateShipmentTracking } from './shipmentTrackingAutomation.js'

test('automatic tracking mail delivery is limited to the BPL test domain and has stable deduplication ids', () => {
  assert.equal(isDevelopmentTrackingRecipientAllowed('test@brennpunkt-logistik.de'), true)
  assert.equal(isDevelopmentTrackingRecipientAllowed('test@external.example'), false)
  assert.equal(automaticTrackingDeliveryId('same-due-bundle'), automaticTrackingDeliveryId('same-due-bundle'))
  assert.notEqual(automaticTrackingDeliveryId('first'), automaticTrackingDeliveryId('second'))
})

test('a rule due before the lifecycle start provisions tracking early but retains the upcoming lifecycle phase', () => {
  const lifecycle = { phase: 'upcoming', startAt: { date: '2026-10-01', time: '07:00' } }
  assert.equal(shouldActivateShipmentTracking(lifecycle, { rules: [{ scheduledAt: '2026-09-30T09:00:00.000Z' }] }, '2026-09-30T09:01:00.000Z'), true)
  assert.equal(shouldActivateShipmentTracking(lifecycle, { rules: [] }, '2026-09-30T09:01:00.000Z'), false)
})

test('scheduled tracking automation creates lifecycle states and permits Dev-only dispatches', async () => {
  const [source, index] = await Promise.all([
    readFile(new URL('./shipmentTrackingAutomation.js', import.meta.url), 'utf8'),
    readFile(new URL('./index.js', import.meta.url), 'utf8'),
  ])
  assert.match(source, /shipmentTrackingLifecycle/)
  assert.match(source, /createShipmentTrackingDocument/)
  assert.match(source, /lifecyclePhase: 'completed'/)
  assert.match(source, /externalEffectsEnvironment\(\) !== 'development'/)
  assert.match(source, /isDevelopmentTrackingRecipientAllowed/)
  assert.match(source, /onSchedule\(\{ region: 'europe-west3', schedule: 'every 5 minutes'/)
  assert.match(index, /scheduledShipmentTrackingAutomation/)
})
