import assert from 'node:assert/strict'
import test from 'node:test'
import { deadlineCreatorEmail, reminderDeadlineTime, shortReminderRecipient } from './caseDeadline.js'

test('reminder deadlines require a precise time', () => {
  assert.throws(() => reminderDeadlineTime({ reminderEnabled: true, time: '' }), /Uhrzeit/)
  assert.equal(reminderDeadlineTime({ reminderEnabled: true, time: '09:45' }), '09:45')
  assert.equal(reminderDeadlineTime({ reminderEnabled: false, time: '' }), null)
})

test('creator email stays the reminder recipient and is shortened for tables', () => {
  assert.equal(deadlineCreatorEmail({ user: { email: 'df@brennpunkt-logistik.de' } }), 'df@brennpunkt-logistik.de')
  assert.equal(shortReminderRecipient({ reminderEnabled: true, reminderRecipientEmail: 'df@brennpunkt-logistik.de' }), 'df@...')
  assert.equal(shortReminderRecipient({ reminderEnabled: false, reminderRecipientEmail: 'df@brennpunkt-logistik.de' }), '—')
})
