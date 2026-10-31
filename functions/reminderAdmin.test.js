import assert from 'node:assert/strict'
import test from 'node:test'
import { reminderCasePath, listCaseReminderUsersHandler, setReminderResponsibilityHandler } from './reminderAdmin.js'

test('responsibility API only accepts the four supported case roots', () => {
  assert.deepEqual(reminderCasePath('damageCases/a'), { path: 'damageCases/a', module: 'damages' })
  for (const path of ['users/a', 'todos/a', 'damageCases/a/deadlines/b', 'constructor/a', 'damageCases/', '/damageCases/a', 'damageCases/a\nb']) assert.throws(() => reminderCasePath(path), { code: 'invalid-argument' })
})
test('viewer and admin without module edit cannot discover or change responsible users', async () => {
  for (const profile of [{ active: true, role: 'user', permissions: { damages: 'view' } }, { active: true, role: 'admin', permissions: {} }, { active: false, role: 'superadmin' }]) {
    const options = { db: {}, authorize: async () => profile }
    await assert.rejects(listCaseReminderUsersHandler({ data: { parentPath: 'damageCases/a' } }, options), { code: 'permission-denied' })
    await assert.rejects(setReminderResponsibilityHandler({ data: { parentPath: 'damageCases/a', userId: 'user', expectedUserId: null } }, options), { code: 'permission-denied' })
  }
})
test('responsibility requires an explicit concurrency expectation and a valid user ID', async () => {
  for (const data of [{ userId: 'u' }, { userId: 'u/x', expectedUserId: null }, { userId: ['u'], expectedUserId: null }, { userId: null, expectedUserId: 'a/b' }]) await assert.rejects(setReminderResponsibilityHandler({ data: { parentPath: 'damageCases/a', ...data } }, { db: {} }), { code: 'invalid-argument' })
})
