import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { deadlineReminderDeliveryId, deadlineReminderMetadata, deadlineReminderQuery, isDeadlineReminderDue } from './caseDeadlineReminders.js'

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

test('the reminder query filters up to the Berlin-local date and has deterministic paging order', () => {
  const calls = []
  const query = {
    where(...args) { calls.push(['where', ...args]); return this },
    orderBy(...args) { calls.push(['orderBy', ...args]); return this },
  }
  deadlineReminderQuery({ collectionGroup: (name) => { calls.push(['collectionGroup', name]); return query } }, new Date('2026-09-30T10:00:00.000Z'))
  assert.deepEqual(calls, [
    ['collectionGroup', 'deadlines'],
    ['where', 'reminderEnabled', '==', true],
    ['where', 'date', '<=', '2026-09-30'],
    ['orderBy', 'date', 'asc'],
    ['orderBy', 'time', 'asc'],
  ])
})

test('the required collection-group index stays versioned with the scheduler query', async () => {
  const indexes = JSON.parse(await readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'))
  assert(indexes.indexes.some((index) => index.collectionGroup === 'deadlines'
    && index.queryScope === 'COLLECTION_GROUP'
    && JSON.stringify(index.fields) === JSON.stringify([
      { fieldPath: 'reminderEnabled', order: 'ASCENDING' },
      { fieldPath: 'date', order: 'ASCENDING' },
      { fieldPath: 'time', order: 'ASCENDING' },
    ])))
})
