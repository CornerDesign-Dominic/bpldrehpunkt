import assert from 'node:assert/strict'
import test from 'node:test'
import { hasActiveProfile } from './access.js'

test('accepts an active profile', () => {
  assert.equal(hasActiveProfile({ active: true }), true)
})

test('rejects a disabled profile', () => {
  assert.equal(hasActiveProfile({ active: false }), false)
})

test('rejects a missing profile', () => {
  assert.equal(hasActiveProfile(null), false)
})

test('rejects a legacy profile without an explicit active field', () => {
  assert.equal(hasActiveProfile({ role: 'user' }), false)
})
