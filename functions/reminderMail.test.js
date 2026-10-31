import assert from 'node:assert/strict'
import test from 'node:test'
import { reminderSenderAddress, sendReminderMail, systemMailTemplateDefinitions } from './systemMails.js'
const deliveryId = 'a'.repeat(64)
const request = { recipient: 'recipient@example.test', deliveryId, dueAt: '2026-10-31T08:00:00.000Z', values: { title: 'Test', dueDateTime: '31.10.2026, 09:00 MEZ', sourceType: 'To-do' }, beforeSend: async () => true }
const dependencies = { environment: 'development', paused: async () => false, notificationUrl: () => 'https://example.test/mail', render: async () => ({ subject: 'Test', message: 'Text', messageHtml: '<p>Text</p>' }), now: () => new Date('2026-10-31T08:00:04Z') }

test('reminders use the fixed sender in both environments and retain delivery identity', async () => {
  for (const environment of ['development', 'production']) {
    let actual
    const result = await sendReminderMail(request, { ...dependencies, environment, fetchImpl: async (url, options) => { actual = { url, options, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ accepted: true, sender: reminderSenderAddress, deliveryId }) } } })
    assert.equal(result.status, 'accepted')
    assert.equal(actual.body.from, 'drehpunkt@brennpunkt-logistik.de')
    assert.equal(actual.body.to, request.recipient)
    assert.equal(actual.body.deliveryId, deliveryId)
    assert.equal(actual.options.headers['Idempotency-Key'], deliveryId)
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
  ]
  for (const [input, overrides, reason] of checks) assert.equal((await sendReminderMail({ ...request, ...input }, { ...dependencies, ...overrides, fetchImpl: neverFetch })).reason, reason)
})
test('a render/check delay past the minute cancels dispatch rather than catching up', async () => {
  let calls = 0
  const result = await sendReminderMail(request, { ...dependencies, now: () => new Date(++calls === 1 ? '2026-10-31T08:00:59Z' : '2026-10-31T08:01:00Z'), fetchImpl: async () => assert.fail('Missed reminder must not send') })
  assert.equal(result.reason, 'outside-delivery-minute')
})
test('HTTP acceptance without matching identity and sender is explicitly uncertain', async () => {
  for (const receipt of [{}, { accepted: true, deliveryId, sender: 'other@example.test' }, { accepted: true, deliveryId: 'different', sender: reminderSenderAddress }]) {
    const result = await sendReminderMail(request, { ...dependencies, fetchImpl: async () => ({ ok: true, json: async () => receipt }) })
    assert.equal(result.status, 'uncertain')
  }
  assert.equal((await sendReminderMail(request, { ...dependencies, fetchImpl: async () => { throw new Error('lost response') } })).status, 'uncertain')
  assert.equal((await sendReminderMail(request, { ...dependencies, fetchImpl: async () => ({ ok: false }) })).status, 'failed')
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
