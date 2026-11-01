import assert from 'node:assert/strict'
import test from 'node:test'
import { reminderRecipientPolicy, developmentReminderRecipient } from './reminderRecipientPolicy.js'
import { sendReminderMail } from './systemMails.js'

test('development permits exactly the newly authorized no-reply recipient without redirection', () => {
  assert.equal(reminderRecipientPolicy(developmentReminderRecipient, 'development').allowed, true)
  for (const email of ['df@brennpunkt-logistik.de', 'bb@brennpunkt-logistik.de', 'other@example.test', 'NO-REPLY@brennpunkt-logistik.de', ' no-reply@brennpunkt-logistik.de', '', null]) {
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
  for (const recipient of ['df@brennpunkt-logistik.de', 'bb@brennpunkt-logistik.de', 'other@example.test']) {
    const never = () => assert.fail('Excluded recipients must cause no side effects')
    const result = await sendReminderMail({ recipient }, { environment: 'development', paused: never, notificationUrl: never, authorize: never, render: never, fetchImpl: never })
    assert.deepEqual(result, { status: 'blocked', reason: 'development-recipient-not-authorized' })
  }
})
