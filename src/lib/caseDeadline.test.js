import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { calendarDaysUntil, deadlineCreatorEmail, optionalDeadlineTime, reminderDeadlineTime, shortReminderRecipient } from './caseDeadline.js'

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


test('deadline day counts agree at midnight, midday and night across local calendar boundaries', () => {
  const previous = process.env.TZ
  process.env.TZ = 'Europe/Berlin'
  try {
    for (const hour of [0, 12, 23]) {
      const now = new Date(2026, 9, 31, hour)
      assert.equal(calendarDaysUntil('2026-10-31', now), 0)
      assert.equal(calendarDaysUntil('2026-10-30', now), -1)
      assert.equal(calendarDaysUntil('2026-11-01', now), 1)
    }
    assert.equal(calendarDaysUntil('2026-03-30', new Date(2026, 2, 28, 23)), 2)
    assert.equal(calendarDaysUntil('2026-10-26', new Date(2026, 9, 24, 23)), 2)
    assert.equal(calendarDaysUntil('2024-03-01', new Date(2024, 1, 28)), 2)
    assert.equal(calendarDaysUntil('2027-01-01', new Date(2026, 11, 31)), 1)
    assert.ok(Number.isNaN(calendarDaysUntil('invalid', new Date())))
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})

test('reminder time validation rejects impossible clock times instead of saving unschedulable reminders', () => {
  for (const value of ['24:00', '23:60', '99:99', '-1:30']) assert.throws(() => optionalDeadlineTime(value), /Uhrzeit/)
  for (const value of ['00:00', '12:30', '23:59']) assert.equal(optionalDeadlineTime(value), value)
})
