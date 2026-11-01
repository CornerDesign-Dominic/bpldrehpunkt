import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReminderProviderRequest, parseReminderProviderResponse, reminderSenderAddress } from './reminderProviderContract.js'

const input = { environment: 'development', recipient: 'person@example.test', deliveryId: 'b'.repeat(64), dueAt: '2026-10-31T08:00:00.000Z', subject: 'Reminder', message: 'Note <not HTML>', messageHtml: '<p>Note &lt;not HTML&gt;</p>' }
const receipt = (payload, extra = {}) => ({ contractVersion: 1, projectId: payload.projectId, environment: payload.environment, deliveryId: payload.deliveryId, payloadDigest: payload.payloadDigest, sender: reminderSenderAddress, accepted: true, outcome: 'accepted', ...extra })

test('copied Dev/Production data use different provider namespaces and content identities', () => {
  const dev = buildReminderProviderRequest(input)
  const prod = buildReminderProviderRequest({ ...input, environment: 'production' })
  assert.notEqual(dev.deliveryKey, prod.deliveryKey)
  assert.notEqual(dev.payloadDigest, prod.payloadDigest)
  assert.equal(dev.deliveryKey, `db-bpl-drehpunkt-dev:${input.deliveryId}`)
  assert.deepEqual(buildReminderProviderRequest(input), dev)
  assert.equal(dev.expiresAt, '2026-10-31T08:01:00.000Z')
  assert.equal(dev.messageHtml, input.messageHtml)
  for (const field of ['recipient', 'subject', 'message', 'messageHtml', 'dueAt']) {
    const changed = { ...input, [field]: field === 'dueAt' ? '2026-10-31T08:01:00Z' : field === 'recipient' ? 'other@example.test' : `${input[field]} changed` }
    assert.notEqual(buildReminderProviderRequest(changed).payloadDigest, dev.payloadDigest, field)
  }
})

test('malformed schedules, headers, recipient lists or unknown targets cannot create provider requests', () => {
  for (const patch of [{ environment: 'unknown' }, { environment: 'constructor' }, { dueAt: '2026-10-31' }, { dueAt: '2026-10-31T08:00:01Z' }, { dueAt: '2026-10-31T08:00:00' }, { recipient: 'a@example.test;b@example.test' }, { recipient: 'a,b@example.test' }, { deliveryId: 'not-an-id' }, { subject: 'A\r\nB' }, { messageHtml: '' }]) assert.throws(() => buildReminderProviderRequest({ ...input, ...patch }), /invalid-reminder-provider-contract/)
})

test('only a synchronous matching provider acceptance confirms a send, never an HTTP queue response', () => {
  const payload = buildReminderProviderRequest(input)
  assert.deepEqual(parseReminderProviderResponse(receipt(payload), payload, 200), { status: 'accepted' })
  for (const httpStatus of [202, 204, 400, 500]) assert.equal(parseReminderProviderResponse(receipt(payload), payload, httpStatus).status, 'uncertain')
  for (const patch of [{ contractVersion: 2 }, { projectId: 'db-bpl-drehpunkt' }, { environment: 'production' }, { deliveryId: 'c'.repeat(64) }, { payloadDigest: 'd'.repeat(64) }, { sender: 'other@example.test' }, { accepted: false }, { outcome: 'queued' }]) assert.equal(parseReminderProviderResponse(receipt(payload, patch), payload, 200).status, 'uncertain')
})

test('explicit same-identity missed, rejected and uncertain outcomes preserve their true meaning', () => {
  const payload = buildReminderProviderRequest(input)
  assert.equal(parseReminderProviderResponse(receipt(payload, { accepted: false, outcome: 'missed' }), payload, 200).status, 'missed')
  assert.equal(parseReminderProviderResponse(receipt(payload, { accepted: false, outcome: 'uncertain' }), payload, 200).status, 'uncertain')
  assert.equal(parseReminderProviderResponse(receipt(payload, { accepted: false, outcome: 'rejected' }), payload, 422).status, 'failed')
  assert.equal(parseReminderProviderResponse({ accepted: false, outcome: 'rejected' }, payload, 422).status, 'uncertain')
})
