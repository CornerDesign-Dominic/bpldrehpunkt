import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { advanceDeadlineReminderWork, runCaseDeadlineReminderDispatch, scheduledCaseDeadlineReminderDispatch } from './caseDeadlineReminders.js'
import { advanceReminderPreparation, runReminderDispatch } from './reminders.js'

test('published deadline scheduler and preparation exports retain their names while delegating to the central registry', async () => {
  assert.equal(advanceDeadlineReminderWork, advanceReminderPreparation)
  assert.equal(runCaseDeadlineReminderDispatch, runReminderDispatch)
  assert.equal(typeof scheduledCaseDeadlineReminderDispatch, 'function')
  const source = await readFile(new URL('./caseDeadlineReminders.js', import.meta.url), 'utf8')
  assert.match(source, /schedule: '\* \* \* \* \*'/)
  assert.match(source, /timeZone: 'Europe\/Berlin'/)
  assert.doesNotMatch(source, /caseDeadlineReminderWork|collectionGroup\('deadlines'\)/)
})
