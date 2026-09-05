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

test('keeps legacy profiles without an active field usable during migration', () => {
  assert.equal(hasActiveProfile({ role: 'user' }), true)
})
