import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpsError } from 'firebase-functions/v2/https'
import { normalizeTransportOrderListPreferences } from './userPreferences.js'

test('personal order-list preferences retain only validated list fields', () => {
  const preferences = normalizeTransportOrderListPreferences({ search: '  261000035 ', trackingFilter: 'completed', attentionFilter: 'action', iconFilters: { licensePlate: true, stopwatch: 'critical' }, relation: '02 Struck Torben', loadingFrom: '2026-10-01', loadingUntil: '2026-10-31', sort: { key: 'externalNumber', direction: 'desc' }, pageSize: 100 })
  assert.deepEqual(preferences, { search: '261000035', trackingFilter: 'completed', attentionFilter: 'action', iconFilters: { automationPaused: false, mailReview: false, licensePlate: true, stopwatch: 'critical', truck: '' }, relation: '02 Struck Torben', loadingFrom: '2026-10-01', loadingUntil: '2026-10-31', sort: { key: 'externalNumber', direction: 'desc' }, pageSize: 100 })
})

test('personal order-list preferences reject invalid fields and invalid date ranges', () => {
  assert.throws(() => normalizeTransportOrderListPreferences({ unexpected: true }), HttpsError)
  assert.throws(() => normalizeTransportOrderListPreferences({ loadingFrom: '2026-11-01', loadingUntil: '2026-10-01' }), HttpsError)
})
