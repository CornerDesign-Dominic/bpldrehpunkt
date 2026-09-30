import assert from 'node:assert/strict'
import test from 'node:test'
import { passwordResetErrorMessage } from './passwordResetFeedback.js'

test('reset feedback keeps account state private and does not hide delivery failures', () => {
  assert.equal(passwordResetErrorMessage({ code: 'auth/user-not-found' }), '')
  assert.equal(passwordResetErrorMessage({ code: 'auth/email-not-found' }), '')
  assert.equal(passwordResetErrorMessage({ code: 'auth/user-disabled' }), '')
  assert.match(passwordResetErrorMessage({ code: 'auth/invalid-email' }), /gültige E-Mail-Adresse/)
  assert.match(passwordResetErrorMessage({ code: 'auth/network-request-failed' }), /Netzwerkfehler/)
  assert.match(passwordResetErrorMessage({ code: 'auth/too-many-requests' }), /später/)
  assert.match(passwordResetErrorMessage({ code: 'auth/operation-not-allowed' }), /nicht gesendet/)
})
