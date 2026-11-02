import assert from 'node:assert/strict'
import test from 'node:test'
import { canRetryStatusMailAi, statusMailAiLeaseExpiresAt } from './statusMailAiRetry.js'

test('only a proven expired pending lease unlocks manual retry, with Timestamp and normalized ISO instants', () => {
  const now = Date.parse('2026-10-31T12:00:00Z')
  const pending = { ai: { status: 'pending' }, aiProcessing: { token: 'worker', expiresAt: { toMillis: () => now + 1 } } }
  assert.equal(canRetryStatusMailAi(pending, now), false)
  assert.equal(canRetryStatusMailAi(pending, now + 1), true)
  assert.equal(canRetryStatusMailAi({ ...pending, aiProcessing: { token: 'worker', expiresAt: '2026-10-31T13:00:00+01:00' } }, now), true)
  assert.equal(statusMailAiLeaseExpiresAt({ aiProcessing: { expiresAt: '2026-10-31T12:00:00Z' } }), now)
  for (const lease of [undefined, {}, { token: 'worker' }, { token: 'worker', expiresAt: 'invalid' }, { token: 'worker', expiresAt: '2026-10-31T12:00:00' }, { expiresAt: { toMillis: () => now - 1 } }]) {
    assert.equal(canRetryStatusMailAi({ ai: { status: 'pending', queuedAt: '2000-01-01T00:00:00Z' }, aiProcessing: lease }, now), false)
  }
})

test('existing retry statuses remain available while running leases and completed states stay protected', () => {
  const now = Date.now()
  for (const status of ['no_change', 'needs_review', 'error']) {
    assert.equal(canRetryStatusMailAi({ ai: { status } }, now), true)
    assert.equal(canRetryStatusMailAi({ ai: { status }, aiProcessing: { token: 'worker', expiresAt: { toMillis: () => now + 60_000 } } }, now), false)
  }
  for (const status of ['applied', 'reviewed', 'skipped', undefined]) assert.equal(canRetryStatusMailAi({ ai: { status }, aiProcessing: { token: 'worker', expiresAt: { toMillis: () => now - 1 } } }, now), false)
})
