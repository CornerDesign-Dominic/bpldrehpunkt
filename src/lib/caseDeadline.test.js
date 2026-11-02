import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { berlinToday, calendarDaysUntil, caseDeadlineReminder, optionalDeadlineTime, reminderDeadlineTime } from './caseDeadline.js'

test('reminder deadlines require a precise time', () => {
  assert.throws(() => reminderDeadlineTime({ reminderEnabled: true, time: '' }), /Uhrzeit/)
  assert.equal(reminderDeadlineTime({ reminderEnabled: true, time: '09:45' }), '09:45')
  assert.equal(reminderDeadlineTime({ reminderEnabled: false, time: '' }), null)
})

test('case reminders store schedule and occurrence, never derive an address from creator metadata', () => {
  assert.deepEqual(caseDeadlineReminder({ date: '2026-10-31', time: '09:45', reminderEnabled: true, reminderRecipientEmail: 'legacy@example.test' }), { date: '2026-10-31', time: '09:45', reminderEnabled: true, reminderOccurrence: null })
  assert.deepEqual(caseDeadlineReminder({ date: '2026-10-31', time: '', reminderEnabled: false }), { date: '2026-10-31', time: null, reminderEnabled: false, reminderOccurrence: null })
})

test('case schedules validate real dates and require explicit DST occurrence without shifting a deadline', () => {
  assert.throws(() => caseDeadlineReminder({ date: '2026-02-30', time: '', reminderEnabled: false }), { code: 'invalid-date' })
  assert.throws(() => caseDeadlineReminder({ date: '2026-03-29', time: '02:30', reminderEnabled: true }), { code: 'nonexistent-time' })
  assert.throws(() => caseDeadlineReminder({ date: '2026-10-25', time: '02:30', reminderEnabled: true }), { code: 'ambiguous-time' })
  assert.equal(caseDeadlineReminder({ date: '2026-10-25', time: '02:30', reminderEnabled: true, occurrence: 'later' }).reminderOccurrence, 'later')
  assert.equal(caseDeadlineReminder({ date: '2026-10-25', time: '02:30', reminderEnabled: true, reminderOccurrence: 'earlier' }).reminderOccurrence, 'earlier')
  assert.throws(() => caseDeadlineReminder({ date: '2026-10-25', time: '02:30', reminderEnabled: true, reminderOccurrence: 'earlier', occurrence: null }), { code: 'ambiguous-time' })
})

test('case day counts and today are Berlin calendar dates rather than UTC defaults', () => {
  const now = new Date('2026-07-15T22:30:00Z')
  assert.equal(berlinToday(now), '2026-07-16')
  assert.equal(calendarDaysUntil('2026-07-16', now), 0)
  assert.equal(calendarDaysUntil('2026-07-15', now), -1)
  assert.ok(Number.isNaN(calendarDaysUntil('2026-02-30', now)))
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
