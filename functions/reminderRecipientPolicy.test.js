import assert from 'node:assert/strict'
import test from 'node:test'
import { reminderRecipientPolicy, developmentReminderRecipient, developmentReminderRecipients } from './reminderRecipientPolicy.js'
import { sendReminderMail } from './systemMails.js'

test('development permits exactly no-reply and bb without case folding, trimming or redirection', () => {
  assert.deepEqual(developmentReminderRecipients, ['no-reply@brennpunkt-logistik.de', 'bb@brennpunkt-logistik.de'])
  assert(Object.isFrozen(developmentReminderRecipients))
  for (const email of developmentReminderRecipients) assert.equal(reminderRecipientPolicy(email, 'development').allowed, true)
  for (const email of ['df@brennpunkt-logistik.de', 'other@example.test', 'NO-REPLY@brennpunkt-logistik.de', 'BB@brennpunkt-logistik.de', 'bb@BRENNPUNKT-LOGISTIK.DE', ' no-reply@brennpunkt-logistik.de', 'bb@brennpunkt-logistik.de ', '\tbb@brennpunkt-logistik.de', 'bb@brennpunkt-logistik.de\n', '', null]) {
    const policy = reminderRecipientPolicy(email, 'development')
    assert.equal(policy.allowed, false)
    assert.equal(policy.code, 'development-recipient-not-authorized')
    assert.match(policy.reason, /Dev-Testmodus/)
  }
})

test('production does not change recipient selection and every unknown environment fails closed', () => {
  for (const email of ['df@brennpunkt-logistik.de', 'bb@brennpunkt-logistik.de', 'person@example.test']) assert.equal(reminderRecipientPolicy(email, 'production').allowed, true)
  for (const environment of ['unknown', 'demo', '', null]) assert.equal(reminderRecipientPolicy(developmentReminderRecipient, environment).allowed, false)
})

test('adapter rejects excluded Dev recipients before pause, render, auth and HTTP, with no redirect', async () => {
  for (const recipient of ['df@brennpunkt-logistik.de', 'other@example.test', 'BB@brennpunkt-logistik.de', 'bb@brennpunkt-logistik.de ']) {
    const never = () => assert.fail('Excluded recipients must cause no side effects')
    const result = await sendReminderMail({ recipient }, { environment: 'development', paused: never, notificationUrl: never, authorize: never, render: never, fetchImpl: never })
    assert.deepEqual(result, { status: 'blocked', reason: 'development-recipient-not-authorized' })
  }
})

test('adapter delivers each authorized Dev address unchanged through the mocked provider', async () => {
  for (const recipient of developmentReminderRecipients) {
    let deliveredTo
    const result = await sendReminderMail({ recipient, deliveryId: 'a'.repeat(64), dueAt: '2026-11-02T09:00:00.000Z', beforeSend: async () => true }, {
      environment: 'development', now: () => new Date('2026-11-02T09:00:10.000Z'), paused: async () => false,
      notificationUrl: () => 'https://defaultb829bbdcc0b74128a3416715a67b45.1b.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/synthetic/triggers/manual/paths/invoke?api-version=1',
      authorize: async () => 'Bearer synthetic-token', render: async () => ({ subject: 'Synthetic', message: 'Synthetic', messageHtml: '<p>Synthetic</p>' }),
      fetchImpl: async (_url, options) => {
        const payload = JSON.parse(options.body)
        deliveredTo = payload.to
        return { status: 200, json: async () => ({ contractVersion: payload.contractVersion, projectId: payload.projectId, environment: payload.environment, deliveryId: payload.deliveryId, payloadDigest: payload.payloadDigest, sender: payload.from, accepted: true, outcome: 'accepted' }) }
      },
    })
    assert.equal(result.status, 'accepted')
    assert.equal(deliveredTo, recipient)
  }
})
