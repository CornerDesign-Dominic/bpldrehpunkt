import test from 'node:test'
import assert from 'node:assert/strict'
import { assertReminderStatuses, assertReminderUsers, assertReminderResponsibility } from './reminderResponses.js'
test('status response validates complete requested sources and recipient data', () => {
 const value = { statuses: [{ sourcePath: 'todos/a', status: 'scheduled', dueAt: null, recipients: [{ userId: 'u', name: 'Person', status: 'pending' }] }] }
 assert.equal(assertReminderStatuses(value, ['todos/a']), value)
 for (const malformed of [{ statuses: [] }, { statuses: [{ ...value.statuses[0], sourcePath: 'todos/b' }] }, { statuses: [{ ...value.statuses[0], recipients: [{}] }] }]) assert.throws(() => assertReminderStatuses(malformed, ['todos/a']), { code: 'diagnostic/invalid-response' })
})
test('responsibility responses cannot silently accept malformed results', () => {
 assert.deepEqual(assertReminderUsers({ users: [] }), { users: [] })
 assert.throws(() => assertReminderUsers({ users: [{ id: 'u' }] }), { code: 'diagnostic/invalid-response' })
 assert.throws(() => assertReminderResponsibility({ changed: true }), { code: 'diagnostic/invalid-response' })
 assert.equal(assertReminderResponsibility({ responsibleUserId: null, responsibleUserName: null, changed: true }).changed, true)
})
