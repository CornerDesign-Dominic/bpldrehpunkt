import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { listTodoCalendarProjectionHandler } from './todoCalendarProjection.js'

test('authenticated projection follows source audience, selections and current department without legacy mirrors', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/)
  const app = initializeApp({ projectId: `demo-todo-calendar-${process.pid}` })
  const db = getFirestore(app)
  const range = { from: '2026-11-01', until: '2026-11-30', upcomingFrom: '2026-11-12' }
  const profile = { active: true, role: 'user', department: 'Buchhaltung', permissions: { todos: 'view' } }
  const source = { status: 'open', title: 'Synthetic task', audienceType: 'people', audienceIds: ['alice', 'bob'], creatorUserId: 'creator', dueDate: '2026-11-20', reminderDate: '2026-11-20', reminderTime: '10:00', reminderRecipientMode: 'all' }
  const task = db.doc('todos/task')
  const call = (uid = 'alice', data = range) => listTodoCalendarProjectionHandler({ auth: { uid }, data })
  try {
    await db.doc('users/alice').set(profile)
    await db.doc('users/bob').set(profile)
    await db.doc('users/creator').set(profile)
    await task.set(source)
    await db.doc('todos/task/deadlines/first').set({ type: 'appointment', date: '2026-11-21', time: '09:00', reminderEnabled: false, reminderRecipientMode: 'selected', reminderRecipientUserIds: ['alice'] })
    await db.doc('todos/task/deadlines/second').set({ date: '2026-11-22', reminderEnabled: true, reminderRecipientMode: 'all' })
    await db.doc('todoCalendarEntries/stale').set({ ownerUserId: 'alice', todoId: 'task', title: 'Stale mirror must not return', startDate: '2026-11-23' })
    for (let round = 0; round < 3; round += 1) {
      await task.update({ audienceType: 'department', audienceId: 'Buchhaltung' })
      const department = await call()
      assert.equal(department.entries.length, 3)
      assert(department.entries.every((entry) => entry.calendarId === 'todo-department:Buchhaltung'))
      assert.equal(new Set(department.entries.map((entry) => entry.id)).size, 3)
      await task.update({ audienceType: 'people', audienceId: null })
      const personal = await call()
      assert.equal(personal.entries.length, 3)
      assert(personal.entries.every((entry) => entry.calendarId === 'personal-alice'))
      assert.equal((await call('bob')).entries.length, 2)
    }
    assert.equal((await call('creator')).entries.length, 0)
    await task.update({ audienceIds: ['bob'] })
    assert.equal((await call()).entries.length, 0)
    await task.update({ audienceType: 'department', audienceId: 'Buchhaltung' })
    await db.doc('users/alice').update({ department: 'Vertrieb' })
    const transferred = await call()
    assert.equal(transferred.entries.length, 0)
    assert(!transferred.calendars.some((calendar) => calendar.id === 'todo-department:Buchhaltung'))
    await db.doc('users/alice').set(profile)
    await task.update({ status: 'completed' })
    const completed = await call()
    assert.equal(completed.entries.length, 3)
    assert(completed.entries.every((entry) => entry.completed && !entry.reminderEnabled))
    await task.update({ status: 'in_progress' })
    assert((await call()).entries.some((entry) => entry.reminderEnabled))
    await db.doc('todos/task/deadlines/first').delete()
    assert.equal((await call()).entries.length, 2)
    await task.update({ status: 'withdrawn' })
    assert.equal((await call()).entries.length, 0)
    await db.doc('users/alice').update({ active: false })
    await assert.rejects(call(), { code: 'permission-denied' })
    await db.doc('users/alice').set({ ...profile, permissions: { calendar: 'edit' } })
    await assert.rejects(call(), { code: 'permission-denied' })
    await db.doc('users/alice').set(profile)
    await assert.rejects(call('alice', { ...range, userId: 'bob' }), { code: 'invalid-argument' })
    await assert.rejects(listTodoCalendarProjectionHandler({ data: range }), { code: 'unauthenticated' })
    assert.equal((await db.doc('todoCalendarEntries/stale').get()).exists, true)

    // Current account state, rather than old calendar copies or the token's
    // historical permissions, controls every subsequent load.
    await task.set({ ...source, audienceType: 'department', audienceId: 'Buchhaltung' })
    for (const level of ['edit', 'view', 'none', 'view', 'edit']) {
      await db.doc('users/alice').update({ 'permissions.todos': level })
      if (level === 'none') await assert.rejects(call(), { code: 'permission-denied' })
      else assert.equal((await call()).entries.length, 2)
    }
    for (const department of ['Vertrieb', 'Buchhaltung', 'Disposition', 'Buchhaltung']) {
      await db.doc('users/alice').update({ department })
      const result = await call()
      assert.equal(result.entries.length, department === 'Buchhaltung' ? 2 : 0)
      assert(!result.entries.some((entry) => entry.calendarId === 'personal-alice'))
    }
    await task.set({ ...source, reminderRecipientMode: 'selected', reminderRecipientUserIds: ['bob'] })
    assert.equal((await call()).entries.length, 1, 'Only the independent all-recipient deadline remains')
    await task.update({ reminderRecipientUserIds: ['alice'] })
    assert.equal((await call()).entries.length, 2)
    await db.doc('todos/task/deadlines/second').update({ reminderEnabled: false, reminderRecipientMode: 'selected', reminderRecipientUserIds: ['bob'] })
    let result = await call()
    assert.equal(result.entries.length, 1)
    const stableId = result.entries[0].id
    await task.update({ reminderTime: '15:45' })
    result = await call()
    assert.equal(result.entries[0].id, stableId)
    assert.equal(result.entries[0].startTime, '15:45')
    await db.doc('todos/task/deadlines/second').update({ reminderRecipientMode: 'all', time: '16:30' })
    result = await call()
    assert.equal(result.entries.length, 2)
    assert.equal(result.entries.find((entry) => entry.id.endsWith('deadline:second')).startTime, '16:30')
    assert.equal(result.entries.find((entry) => entry.id.endsWith('deadline:second')).reminderEnabled, false)
    await task.update({ audienceType: 'all', audienceIds: null })
    assert.equal((await call('creator')).entries.length, 1, 'All-recipient date follows everyone, selected main date does not')
  } finally {
    await db.terminate()
    await deleteApp(app)
  }
})
