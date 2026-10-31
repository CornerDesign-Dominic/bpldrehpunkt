import assert from 'node:assert/strict'
import test from 'node:test'
import { notifyVacationRequestCreated, reminderSenderAddress, sendReminderMail, systemMailTemplateDefinitions } from './systemMails.js'
import { buildReminderProviderRequest } from './reminderProviderContract.js'
import { scheduledCaseDeadlineReminderDispatch } from './caseDeadlineReminders.js'
const deliveryId = 'a'.repeat(64)
const request = { recipient: 'recipient@example.test', deliveryId, dueAt: '2026-10-31T08:00:00.000Z', values: { title: 'Test', dueDateTime: '31.10.2026, 09:00 MEZ', sourceType: 'To-do' }, beforeSend: async () => true }
const providerUrl = 'https://defaultb829bbdcc0b74128a3416715a67b45.1b.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/synthetic/triggers/manual/paths/invoke?api-version=1'
const dependencies = { environment: 'development', paused: async () => false, notificationUrl: () => providerUrl, authorize: async () => 'Bearer synthetic-token', render: async () => ({ subject: 'Test', message: 'Text', messageHtml: '<p>Text</p>' }), now: () => new Date('2026-10-31T08:00:04Z') }
const acceptedReceipt = (payload) => ({ contractVersion: payload.contractVersion, projectId: payload.projectId, environment: payload.environment, deliveryId: payload.deliveryId, payloadDigest: payload.payloadDigest, sender: reminderSenderAddress, accepted: true, outcome: 'accepted' })
const expectedPayload = (environment = 'development') => buildReminderProviderRequest({ ...request, environment, subject: 'Test', message: 'Text', messageHtml: '<p>Text</p>' })

test('the existing scheduler export binds its isolated reminder secret while other system mail keeps its secret', () => {
  const secrets = (entry) => entry.__endpoint.secretEnvironmentVariables.map((value) => value.key)
  assert.deepEqual(secrets(scheduledCaseDeadlineReminderDispatch), ['POWER_AUTOMATE_REMINDER_URL', 'REMINDER_TENANT_ID', 'REMINDER_CLIENT_ID', 'REMINDER_SERVICE_PRINCIPAL_ID', 'REMINDER_CERTIFICATE_PEM', 'REMINDER_PRIVATE_KEY_PEM'])
  assert.deepEqual(secrets(notifyVacationRequestCreated), ['POWER_AUTOMATE_NOTIFICATION_URL'])
})

test('reminders use the fixed sender in both environments and retain delivery identity', async () => {
  for (const environment of ['development', 'production']) {
    let actual
    const result = await sendReminderMail(request, { ...dependencies, environment, fetchImpl: async (url, options) => { actual = { url, options, body: JSON.parse(options.body) }; return { status: 200, json: async () => acceptedReceipt(actual.body) } } })
    assert.equal(result.status, 'accepted')
    assert.equal(actual.body.from, 'drehpunkt@brennpunkt-logistik.de')
    assert.equal(actual.body.to, request.recipient)
    assert.equal(actual.body.deliveryId, deliveryId)
    assert.equal(actual.options.headers['Idempotency-Key'], actual.body.deliveryKey)
    assert.equal(actual.options.headers.Authorization, 'Bearer synthetic-token')
    assert.equal(actual.body.environment, environment)
    assert.equal(actual.body.expiresAt, '2026-10-31T08:01:00.000Z')
    assert.equal(actual.options.redirect, 'error')
    assert.ok(actual.options.signal)
  }
  assert.ok(systemMailTemplateDefinitions.central_reminder.allowedPlaceholders.includes('note'))
})
test('a blocked, stale or invalid dispatch never reaches the mail provider', async () => {
  const neverFetch = async () => assert.fail('Must not contact provider')
  const checks = [
    [{}, { environment: 'unknown' }, 'unsupported-environment'],
    [{}, { paused: async () => true }, 'global-paused'],
    [{ dueAt: '2026-10-31T07:59:00Z' }, {}, 'outside-delivery-minute'],
    [{ beforeSend: async () => false }, {}, 'no-longer-eligible'],
    [{ templateId: 'shipment_tracking_general_status_update' }, {}, 'invalid-dispatch-contract'],
    [{}, { notificationUrl: () => '' }, 'provider-not-configured'],
    [{}, { notificationUrl: () => 'http://example.test/mail' }, 'provider-url-invalid'],
    [{}, { notificationUrl: () => 'invalid' }, 'provider-url-invalid'],
    [{}, { notificationUrl: () => 'https://untrusted.example/invoke' }, 'provider-url-invalid'],
    [{}, { notificationUrl: () => `${providerUrl}&sig=legacy-secret` }, 'provider-url-invalid'],
    [{}, { notificationUrl: () => providerUrl.replace('/invoke?', '/other?') }, 'provider-url-invalid'],
  ]
  for (const [input, overrides, reason] of checks) assert.equal((await sendReminderMail({ ...request, ...input }, { ...dependencies, ...overrides, fetchImpl: neverFetch })).reason, reason)
})

test('authentication failure, malformed authorization and a slow authentication never send anonymously or retry', async () => {
  for (const authorize of [async () => { throw new Error('sensitive upstream content') }, async () => '', async () => 'Bearer token\r\nInjected: value']) {
    let attempts = 0
    const result = await sendReminderMail(request, { ...dependencies, authorize, fetchImpl: async () => { attempts++; assert.fail('Authentication failed') } })
    assert.deepEqual(result, { status: 'failed', reason: 'provider-authentication-failed' })
    assert.equal(attempts, 0)
  }
  const result = await sendReminderMail(request, { ...dependencies, timeoutMs: 5, authorize: async () => {
    await new Promise(resolve => setTimeout(resolve, 10))
    return 'Bearer synthetic-token'
  }, fetchImpl: async () => assert.fail('Expired authentication must not send') })
  assert.deepEqual(result, { status: 'failed', reason: 'provider-time-budget-expired' })
})

test('responsibility, pause and due minute are checked after authentication', async () => {
  for (const state of ['responsibility', 'pause', 'minute']) {
    let authenticated = false
    const result = await sendReminderMail({ ...request, beforeSend: async () => state !== 'responsibility' || !authenticated }, {
      ...dependencies,
      authorize: async () => { authenticated = true; return 'Bearer synthetic-token' },
      paused: async () => state === 'pause' && authenticated,
      now: () => new Date(state === 'minute' && authenticated ? '2026-10-31T08:01:00Z' : '2026-10-31T08:00:04Z'),
      fetchImpl: async () => assert.fail('Changed eligibility must prevent dispatch'),
    })
    assert.equal(result.status, 'blocked')
    assert.equal(result.reason, { responsibility: 'no-longer-eligible', pause: 'global-paused', minute: 'outside-delivery-minute' }[state])
  }
})
test('a render/check delay past the minute cancels dispatch rather than catching up', async () => {
  let calls = 0
  const result = await sendReminderMail(request, { ...dependencies, now: () => new Date(++calls === 1 ? '2026-10-31T08:00:59Z' : '2026-10-31T08:01:00Z'), fetchImpl: async () => assert.fail('Missed reminder must not send') })
  assert.equal(result.reason, 'outside-delivery-minute')
})
test('HTTP acceptance without matching identity and sender is explicitly uncertain', async () => {
  for (const receipt of [{}, { ...acceptedReceipt(expectedPayload()), sender: 'other@example.test' }, { ...acceptedReceipt(expectedPayload()), deliveryId: 'different' }, { ...acceptedReceipt(expectedPayload()), environment: 'production' }]) {
    const result = await sendReminderMail(request, { ...dependencies, fetchImpl: async () => ({ status: 200, json: async () => receipt }) })
    assert.equal(result.status, 'uncertain')
  }
  assert.equal((await sendReminderMail(request, { ...dependencies, fetchImpl: async () => { throw new Error('lost response') } })).status, 'uncertain')
  assert.equal((await sendReminderMail(request, { ...dependencies, fetchImpl: async () => ({ status: 500, json: async () => acceptedReceipt(expectedPayload()) }) })).status, 'uncertain')
  assert.equal((await sendReminderMail(request, { ...dependencies, fetchImpl: async () => ({ status: 202, json: async () => acceptedReceipt(expectedPayload()) }) })).status, 'uncertain')
})

test('an explicit expiry or uncertain duplicate is never reported as accepted', async () => {
  for (const [outcome, expected] of [['missed', 'missed'], ['uncertain', 'uncertain']]) {
    const result = await sendReminderMail(request, { ...dependencies, fetchImpl: async () => ({ status: 200, json: async () => ({ ...acceptedReceipt(expectedPayload()), accepted: false, outcome }) }) })
    assert.equal(result.status, expected)
  }
})

test('a stalled provider request is aborted and never retried', async () => {
  let attempts = 0
  const result = await sendReminderMail(request, { ...dependencies, timeoutMs: 5, fetchImpl: async (_url, options) => {
    attempts++
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
  } })
  assert.deepEqual(result, { status: 'uncertain', reason: 'provider-outcome-unknown' })
  assert.equal(attempts, 1)
})
