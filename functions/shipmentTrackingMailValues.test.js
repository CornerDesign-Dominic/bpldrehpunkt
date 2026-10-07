import assert from 'node:assert/strict'
import test from 'node:test'
import { shipmentTrackingMailTemplateValues, shipmentTrackingTimeWindow } from './shipmentTrackingMailValues.js'

test('shipment-tracking mail values expose separate and combined loading and unloading windows', () => {
  const imported = {
    orderNumber: '260900123',
    loading: { city: 'Duisburg', window: { from: '2026-09-28T07:00', until: '2026-09-28T09:00' } },
    unloading: { city: 'Berlin', window: { from: '2026-09-29T11:30', until: '2026-09-29T14:00' } },
  }
  assert.deepEqual(shipmentTrackingMailTemplateValues(imported), {
    transportOrderNumber: '260900123',
    loadingLocation: 'Duisburg',
    unloadingLocation: 'Berlin',
    loadingTimeFrom: 'Mo, 28.09.2026, 07:00 Uhr',
    loadingTimeUntil: 'Mo, 28.09.2026, 09:00 Uhr',
    loadingTime: 'Mo, 28.09.2026, 07:00–09:00 Uhr',
    unloadingTimeFrom: 'Di, 29.09.2026, 11:30 Uhr',
    unloadingTimeUntil: 'Di, 29.09.2026, 14:00 Uhr',
    unloadingTime: 'Di, 29.09.2026, 11:30–14:00 Uhr',
  })
})

test('shipment-tracking time windows remain clear across days and when one edge is missing', () => {
  assert.equal(shipmentTrackingTimeWindow({ from: '2026-09-28T07:00', until: '2026-09-29T07:00' }), 'Mo, 28.09.2026, 07:00 Uhr bis Di, 29.09.2026, 07:00 Uhr')
  assert.equal(shipmentTrackingTimeWindow({ until: '2026-09-29T07:00' }), 'bis Di, 29.09.2026, 07:00 Uhr')
})
