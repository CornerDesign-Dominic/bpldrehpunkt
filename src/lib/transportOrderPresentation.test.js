import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTransportOrderWindow, sortTransportOrders, transportOrderDocumentTitle, transportOrderPath } from './transportOrderPresentation.js'

test('transport order opens through its exact route and receives a concise browser-tab title', () => {
  assert.equal(transportOrderPath('dycos-260900123'), '/transportauftraege/dycos-260900123')
  assert.equal(transportOrderDocumentTitle('260900123'), 'Drehpunkt · 260900123')
})

test('transport orders sort every displayed column and keep empty values last', () => {
  const orders = [
    { externalNumber: '10', tracking: { status: '' }, imported: { customer: { name: 'Beta' }, carrier: { originalName: 'Zeta' }, loading: { city: 'Berlin', window: { from: '2026-09-10T14:00' } }, unloading: { city: 'Ulm', window: { until: '2026-09-13T08:00' } }, relation: '02' } },
    { externalNumber: '2', tracking: { status: 'Offen' }, imported: { customer: { name: 'Alpha' }, carrier: { originalName: 'Gamma' }, loading: { city: 'Aachen', window: { from: '2026-09-10T07:00' } }, unloading: { city: 'Bonn', window: { until: '2026-09-11T09:00' } }, relation: '01' } },
    { externalNumber: '3', tracking: { status: 'Erledigt' }, imported: { customer: { name: 'Gamma' }, carrier: { originalName: 'Alpha' }, loading: { city: 'Köln' }, unloading: { city: 'Aachen' }, relation: '03' } },
  ]
  const expected = { externalNumber: ['2', '3', '10'], tracking: ['3', '2', '10'], loading: ['2', '10', '3'], loadingFrom: ['2', '10', '3'], unloading: ['3', '2', '10'], unloadingUntil: ['2', '10', '3'], customer: ['2', '10', '3'], carrier: ['3', '2', '10'], relation: ['2', '10', '3'] }
  Object.entries(expected).forEach(([key, numbers]) => assert.deepEqual(sortTransportOrders(orders, { key, direction: 'asc' }).map((order) => order.externalNumber), numbers))
  assert.deepEqual(sortTransportOrders(orders, { key: 'customer', direction: 'desc' }).map((order) => order.externalNumber), ['3', '10', '2'])
  assert.deepEqual(sortTransportOrders(orders, { key: 'loadingFrom', direction: 'desc' }).map((order) => order.externalNumber), ['10', '2', '3'])
  assert.equal(sortTransportOrders(orders, { key: null }), orders)
})

test('loading and unloading windows display local DyCoS date and time without timezone shifts', () => {
  assert.equal(formatTransportOrderWindow('2026-09-10T07:00'), '10.09.2026, 07:00')
  assert.equal(formatTransportOrderWindow(null), '—')
  assert.equal(formatTransportOrderWindow('ungültig'), '—')
})
