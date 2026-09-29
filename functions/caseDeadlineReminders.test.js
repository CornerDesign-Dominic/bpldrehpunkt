import assert from 'node:assert/strict'
import test from 'node:test'
import { deadlineReminderDeliveryId, deadlineReminderMetadata, isDeadlineReminderDue } from './caseDeadlineReminders.js'

function deadlineRef(root, caseId, deadlineId) {
  return {
    path: `${root}/${caseId}/deadlines/${deadlineId}`,
    parent: { parent: { id: caseId, parent: { id: root } } },
  }
}

test('case deadline reminder uses the stored creator address and Berlin deadline time', () => {
  const ref = deadlineRef('damageCases', 'S-1', 'D-1')
  const metadata = deadlineReminderMetadata(ref, {
    date: '2026-09-28', time: '14:30', reminderEnabled: true, reminderRecipientEmail: 'df@brennpunkt-logistik.de',
  })
  assert.equal(metadata.type, 'Schadenfall')
  assert.equal(metadata.recipient, 'df@brennpunkt-logistik.de')
  assert.equal(metadata.dueAt, '2026-09-28T12:30:00.000Z')
  assert.equal(isDeadlineReminderDue(metadata, new Date('2026-09-28T12:29:59.999Z')), false)
  assert.equal(isDeadlineReminderDue(metadata, new Date('2026-09-28T12:30:00.000Z')), true)
})

test('case deadline reminder rejects all-day, disabled and malformed deadlines', () => {
  const ref = deadlineRef('inkassoCases', 'I-1', 'D-1')
  assert.equal(deadlineReminderMetadata(ref, { date: '2026-09-28', time: '', reminderEnabled: true, reminderRecipientEmail: 'df@example.test' }), null)
  assert.equal(deadlineReminderMetadata(ref, { date: '2026-09-28', time: '14:30', reminderEnabled: false, reminderRecipientEmail: 'df@example.test' }), null)
  assert.equal(deadlineReminderMetadata(ref, { date: '2026-09-28', time: '14:30', reminderEnabled: true, reminderRecipientEmail: 'not-an-email' }), null)
})

test('to-do deadline reminder uses its own template and the creator address', () => {
  const ref = deadlineRef('todos', 'T-1', 'D-1')
  const metadata = deadlineReminderMetadata(ref, {
    date: '2026-09-28', time: '09:15', reminderEnabled: true, reminderRecipientEmail: 'df@brennpunkt-logistik.de',
  })
  assert.equal(metadata.type, 'To-do')
  assert.equal(metadata.templateId, 'todo_deadline_reminder')
  assert.equal(metadata.recipient, 'df@brennpunkt-logistik.de')
})

test('case deadline reminder delivery identity is stable but changes for a rescheduled deadline', () => {
  const ref = deadlineRef('legalDisputes', 'G-1', 'D-1')
  const original = deadlineReminderMetadata(ref, { date: '2026-09-28', time: '14:30', reminderEnabled: true, reminderRecipientEmail: 'df@example.test' })
  const rescheduled = deadlineReminderMetadata(ref, { date: '2026-09-28', time: '15:30', reminderEnabled: true, reminderRecipientEmail: 'df@example.test' })
  assert.equal(deadlineReminderDeliveryId(ref, original), deadlineReminderDeliveryId(ref, original))
  assert.notEqual(deadlineReminderDeliveryId(ref, original), deadlineReminderDeliveryId(ref, rescheduled))
})
