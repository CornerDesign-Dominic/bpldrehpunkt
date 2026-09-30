import assert from 'node:assert/strict'
import test from 'node:test'
import { loginErrorMessage } from './loginFeedback.js'

test('login feedback keeps credential failures generic', () => {
  assert.equal(loginErrorMessage({ code: 'auth/invalid-credential' }), 'E-Mail oder Passwort sind nicht korrekt.')
  assert.equal(loginErrorMessage({ code: 'auth/user-disabled' }), 'E-Mail oder Passwort sind nicht korrekt.')
})

test('login feedback exposes actionable configuration and App Check failures', () => {
  assert.match(loginErrorMessage({ code: 'auth/invalid-app-credential' }), /Sicherheitsprüfung/)
  assert.match(loginErrorMessage({ code: 'auth/captcha-check-failed' }), /Sicherheitsprüfung/)
  assert.match(loginErrorMessage({ code: 'auth/operation-not-allowed' }), /E-Mail\/Passwort-Anmeldung/)
  assert.match(loginErrorMessage({ code: 'auth/app-not-authorized' }), /Domain/)
  assert.match(loginErrorMessage({ code: 'auth/invalid-api-key' }), /Anmeldekonfiguration/)
})
