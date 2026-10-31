import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarReminderFields, reminderDueAtLabel, reminderValidationMessage, todoReminderFields, validateReminderForm } from './reminderForm.js'

test('new reminders require explicit time and date; disabling clears the schedule without inventing defaults', () => {
  assert.throws(() => todoReminderFields({ reminderDate: '2026-11-05' }), (error) => error.reminderCode === 'invalid-time')
  assert.deepEqual(todoReminderFields({ reminderDate: '', reminderTime: '10:00', reminderOccurrence: 'earlier' }), { reminderDate: null, reminderTime: null, reminderOccurrence: null })
  assert.deepEqual(todoReminderFields({ reminderDate: '2026-11-05', reminderTime: '10:00' }), { reminderDate: '2026-11-05', reminderTime: '10:00', reminderOccurrence: null })
})

test('unrelated edits preserve incomplete legacy reminders, but rescheduling them requires completion', () => {
  const previous = { reminderDate: '2026-10-30' }
  assert.deepEqual(todoReminderFields({ ...previous, title: 'Changed' }, previous), { reminderDate: previous.reminderDate, reminderTime: null, reminderOccurrence: null })
  assert.throws(() => todoReminderFields({ reminderDate: '2026-11-01' }, previous), /Uhrzeit/)
})

test('DST gaps are rejected and repeated times need an explicit occurrence in German and English', () => {
  assert.throws(() => validateReminderForm({ date: '2026-03-29', time: '02:30' }), (error) => error.reminderCode === 'nonexistent-time' && reminderValidationMessage(error, 'en').includes('does not exist'))
  assert.throws(() => validateReminderForm({ date: '2026-10-25', time: '02:30' }), (error) => error.reminderCode === 'ambiguous-time')
  const earlier = todoReminderFields({ reminderDate: '2026-10-25', reminderTime: '02:30', reminderOccurrence: 'earlier' })
  const later = todoReminderFields({ reminderDate: '2026-10-25', reminderTime: '02:30', reminderOccurrence: 'later' })
  assert.equal(earlier.reminderOccurrence, 'earlier')
  assert.equal(later.reminderOccurrence, 'later')
  assert.notEqual(validateReminderForm({ date: earlier.reminderDate, time: earlier.reminderTime, occurrence: earlier.reminderOccurrence }).dueAt, validateReminderForm({ date: later.reminderDate, time: later.reminderTime, occurrence: later.reminderOccurrence }).dueAt)
})

test('all-day calendar events remain valid without reminders, while an enabled reminder needs its own explicit schedule', () => {
  assert.deepEqual(calendarReminderFields({ allDay: true, startDate: '2027-05-10' }), { reminderEnabled: false, reminderDate: null, reminderTime: null, reminderOccurrence: null })
  assert.throws(() => calendarReminderFields({ allDay: true, startDate: '2027-05-10', startTime: '09:00', reminderEnabled: true }), (error) => error.reminderCode === 'invalid-date')
  assert.deepEqual(calendarReminderFields({ allDay: true, reminderEnabled: true, reminderDate: '2027-10-31', reminderTime: '02:30', reminderOccurrence: 'later' }), { reminderEnabled: true, reminderDate: '2027-10-31', reminderTime: '02:30', reminderOccurrence: 'later' })
})

test('saved repeated-hour statuses display the different UTC offsets instead of two identical wall times', () => {
  for (const language of ['de', 'en']) {
    const earlier = reminderDueAtLabel('2026-10-25T00:30:00.000Z', language)
    const later = reminderDueAtLabel('2026-10-25T01:30:00.000Z', language)
    assert.match(earlier, /02:30/)
    assert.match(later, /02:30/)
    assert.notEqual(earlier, later)
  }
  assert.equal(reminderDueAtLabel('invalid'), '')
})
