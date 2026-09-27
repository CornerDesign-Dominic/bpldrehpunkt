import assert from 'node:assert/strict'
import test from 'node:test'
import { transportRatingSummary } from './transportOrderRatingPresentation.js'

test('CRM aggregates transport ratings by role and skips unscored criteria', () => {
  const ratings = [
    { partnerRole: 'carrier', averageScore: 4.5, scores: { punctuality: 5, communication: 4 } },
    { partnerRole: 'carrier', averageScore: 4.25, scores: { punctuality: 4, communication: 4, execution: 5, price: 4 } },
    { partnerRole: 'customer', averageScore: 3, scores: { compensation: 3 } },
  ]
  const carrier = transportRatingSummary(ratings, 'carrier')
  assert.equal(carrier.count, 2)
  assert.equal(carrier.averageScore, 4.375)
  assert.deepEqual(carrier.criteria.map(({ key, count, averageScore }) => [key, count, averageScore]), [
    ['punctuality', 2, 4.5], ['communication', 2, 4], ['execution', 1, 5], ['price', 1, 4],
  ])
  const customer = transportRatingSummary(ratings, 'customer')
  assert.equal(customer.count, 1)
  assert.equal(customer.averageScore, 3)
  assert.deepEqual(customer.criteria.map(({ count }) => count), [1, 0, 0])
})

test('empty role remains unrated', () => {
  const summary = transportRatingSummary([], 'customer')
  assert.equal(summary.count, 0)
  assert.equal(summary.averageScore, null)
  assert.ok(summary.criteria.every(({ averageScore }) => averageScore === null))
})
