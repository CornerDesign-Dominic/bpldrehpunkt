import test from 'node:test'
import assert from 'node:assert/strict'
import { orderReviewCounts, orderReviewEntries } from './orderReviewPresentation.js'

test('form counts distinguish missing, invalid, proposed and manually edited values', () => {
  const entries = [
    { path: 'missing', value: '' }, { path: 'invalid', value: 'bad' },
    { path: 'proposal', value: 'Berlin' }, { path: 'manual', value: 'Bonn', manual: true },
    { path: 'optional', value: null }, { path: 'warning', value: 10 },
  ]
  assert.deepEqual(orderReviewCounts(entries, [
    { path: 'missing', severity: 'error' }, { path: 'invalid', severity: 'error' }, { path: 'warning', severity: 'warning' },
  ]), { green: 1, yellow: 2, red: 1, blue: 1, gray: 1 })
})
test('nested stops retain field paths and exclude structural metadata', () => {
  assert.deepEqual(orderReviewEntries({ stops: [{ id: 'a', type: 'loading', company: 'A', goods: [{ id: 'b', quantity: 2 }] }] }), [
    { path: 'stops.0.company', value: 'A' }, { path: 'stops.0.goods.0.quantity', value: 2 },
  ])
})
test('explicit verification colors win, numeric zero remains a value', () => {
  assert.deepEqual(orderReviewCounts([{ color: 'yellow' }, { color: 'green' }, { path: 'quantity', value: 0 }]), { green: 1, yellow: 1, red: 0, blue: 1, gray: 0 })
})
