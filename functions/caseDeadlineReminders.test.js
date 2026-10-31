import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { claimDeadlineReminderDelivery, deadlineReminderDeliveryId, deadlineReminderMetadata, deadlineReminderQuery, isDeadlineReminderDue } from './caseDeadlineReminders.js'

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

test('a retried reminder transaction returns only the claim from its final successful attempt', async () => {
  const ref = deadlineRef('todos', 'T-1', 'D-1')
  const deadline = { date: '2026-09-28', time: '09:00', reminderEnabled: true, reminderRecipientEmail: 'owner@example.test' }
  const metadata = deadlineReminderMetadata(ref, deadline)
  let writes = 0
  const db = { doc: (path) => ({ path }), runTransaction: async (operation) => {
    const attempt = (alreadySent) => operation({
      get: async (reference) => reference === ref
        ? { exists: true, data: () => deadline }
        : reference === metadata.caseRef
          ? { exists: true, data: () => ({ title: 'Test' }) }
          : { exists: alreadySent, data: () => alreadySent ? { status: 'sent' } : undefined },
      set: () => { writes += 1 },
    })
    assert(await attempt(false)) // callback writes are aborted, not committed
    return attempt(true)
  } }
  assert.equal(await claimDeadlineReminderDelivery(db, ref, metadata, new Date('2026-09-28T10:00:00Z')), null)
  assert.equal(writes, 1)
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

test('the reminder query scans only outstanding jobs due at the exact instant', () => {
  const calls = []
  const query = {
    where(...args) { calls.push(['where', ...args]); return this },
    orderBy(...args) { calls.push(['orderBy', ...args]); return this },
  }
  deadlineReminderQuery({ collection: (name) => { calls.push(['collection', name]); return query } }, new Date('2026-09-30T10:00:00.000Z'))
  assert.deepEqual(calls[0], ['collection', 'caseDeadlineReminderWork'])
  assert.equal(calls[1][1], 'dueAt')
  assert.equal(calls[1][3].toDate().toISOString(), '2026-09-30T10:00:00.000Z')
  assert.deepEqual(calls[2], ['orderBy', 'dueAt', 'asc'])
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
