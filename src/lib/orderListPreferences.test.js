import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeOrderListPreferences, orderListStorageKey } from './orderListPreferences.js'

test('order views have an independent user-specific storage key and no tracking filters', () => {
  assert.notEqual(orderListStorageKey('a'), orderListStorageKey('b'))
  assert.equal(Object.hasOwn(normalizeOrderListPreferences({ trackingFilter: 'completed' }), 'trackingFilter'), false)
  assert.deepEqual(normalizeOrderListPreferences({ search: 'TA', pageSize: 50, sort: { key: 'customer', direction: 'asc' } }).sort, { key: 'customer', direction: 'asc' })
})

test('malformed saved views cannot select arbitrary sorts, page sizes or inverted ranges', () => {
  const preferences = normalizeOrderListPreferences({ pageSize: 10000, loadingFrom: '2026-11-02', loadingUntil: '2026-11-01', sort: { key: 'privateData' } })
  assert.equal(preferences.pageSize, 25)
  assert.equal(preferences.loadingUntil, '')
  assert.equal(preferences.sort.key, 'externalNumber')
})
