import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { automaticTrackingDeliveryId, isDevelopmentTrackingRecipientAllowed, shipmentTrackingArrivalConfirmationPlan, shouldActivateShipmentTracking } from './shipmentTrackingAutomation.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS } from './shared/shipmentTrackingOperatingHours.js'

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

test('the short-notice arrival confirmation is due two working hours before loading and never after an actual arrival', () => {
  const input = {
    imported: { loading: { window: { from: '2026-12-08T10:00' } } },
    tracking: {},
    carrier: { shipmentTrackingPolicy: { carrier: { actualArrivalConfirmationEnabled: true } } },
    settings: { enabled: true, offsetWorkingHours: 2 },
    operatingHours: DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS,
    now: '2026-12-08T07:05:00.000Z',
  }
  const plan = shipmentTrackingArrivalConfirmationPlan(input)
  assert.deepEqual(plan?.scheduled, { date: '2026-12-08', time: '08:00' })
  assert.equal(plan?.offsetWorkingHours, 2)
  assert.equal(shipmentTrackingArrivalConfirmationPlan({ ...input, tracking: { actualArrivalLoadingAt: '2026-12-08T08:01:00.000Z' } }), null)
  assert.equal(shipmentTrackingArrivalConfirmationPlan({ ...input, carrier: { shipmentTrackingPolicy: { carrier: { actualArrivalConfirmationEnabled: false } } } }), null)
  assert.equal(shipmentTrackingArrivalConfirmationPlan({ ...input, now: '2026-12-08T08:20:00.000Z' }), null)
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
  assert.match(source, /dispatchArrivalConfirmation/)
  assert.match(source, /onSchedule\(\{ region: 'europe-west3', schedule: 'every 5 minutes'/)
  assert.match(index, /scheduledShipmentTrackingAutomation/)
})
