import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import test from 'node:test'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { loadReminderSource, loadReminderRecipients, loadReminderRecipient } from './reminderSources.js'
import { refreshReminderSource, runReminderDispatch } from './reminders.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const profile = (department = 'Buchhaltung') => ({ active: true, role: 'user', department, permissions: { todos: 'edit' } })
async function scenario(run) {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/)
  const projectId = `demo-todo-recipients-${randomUUID().slice(0, 12)}`
  const app = initializeApp({ projectId }, projectId), db = getFirestore(app)
  try {
    for (const id of ['owner', 'a', 'b', 'c']) await db.doc(`users/${id}`).set({ ...profile(id === 'c' ? 'Disposition' : 'Buchhaltung'), firstName: id, email: `${id}@example.invalid` })
    await db.doc('reminderState/preparation').set({ complete: true })
    await run(db)
  } finally { await db.terminate(); await deleteApp(app) }
}
const task = { creatorUserId: 'owner', status: 'open', title: 'Synthetic task', audienceType: 'department', audienceId: 'Buchhaltung' }
const deadline = { date: '2026-11-12', time: '12:00', reminderEnabled: true, reminderRecipientMode: 'all', reminderRecipientUserIds: [] }

test('all/selected recipients immediately follow group changes and current department membership', { skip: !enabled }, async () => scenario(async (db) => {
  const path = 'todos/task/deadlines/date'
  await db.doc('todos/task').set(task)
  await db.doc(path).set(deadline)
  let context = await loadReminderSource(db, path)
  assert.deepEqual((await loadReminderRecipients(db, context)).map((row) => row.userId).sort(), ['a', 'b', 'owner'])
  await db.doc('users/a').update({ department: 'Disposition' })
  assert.equal((await loadReminderRecipient(db, context, 'a')).eligible, false)
  await db.doc(path).update({ reminderRecipientMode: 'selected', reminderRecipientUserIds: ['a', 'b', 'c'] })
  await db.doc('todos/task').update({ audienceType: 'people', audienceId: null, audienceIds: ['b', 'c'] })
  context = await loadReminderSource(db, path)
  assert.deepEqual((await loadReminderRecipients(db, context)).map((row) => row.userId).sort(), ['b', 'c'])
  assert.equal((await loadReminderRecipient(db, context, 'owner')).eligible, false)
  await db.doc('todos/task').update({ audienceType: 'department', audienceId: 'Buchhaltung', audienceIds: null })
  context = await loadReminderSource(db, path)
  assert.deepEqual((await loadReminderRecipients(db, context)).map((row) => row.userId), ['b'])
  await db.doc('users/b').update({ active: false })
  assert.equal((await loadReminderRecipient(db, context, 'b')).eligible, false)
  assert.deepEqual(await loadReminderRecipients(db, context), [])
  await db.doc(path).update({ reminderRecipientUserIds: [] })
  assert.match((await loadReminderSource(db, path)).configuration, /Keine Erinnerungsempfänger/)
}))

test('a person removed after delivery reservation is stopped at the final HTTP guard; no duplicate sends', { skip: !enabled }, async () => scenario(async (db) => {
  const path = 'todos/task/deadlines/date'
  await db.doc('todos/task').set({ ...task, audienceType: 'people', audienceId: null, audienceIds: ['a', 'b'] })
  await db.doc(path).set(deadline)
  const now = new Date('2026-11-12T11:00:10Z')
  await refreshReminderSource(db, path, { now: new Date('2026-11-12T10:59:00Z') })
  const sent = []
  const send = async (message) => {
    if (message.recipient === 'b@example.invalid') {
      await db.doc('todos/task').update({ audienceIds: ['a'] })
      assert.equal(await message.beforeSend(), false)
      return { status: 'cancelled' }
    }
    if (!await message.beforeSend()) return { status: 'cancelled' }
    sent.push(message.recipient)
    return { status: 'accepted' }
  }
  await runReminderDispatch(now, { db, clock: () => now, environment: 'production', send })
  await runReminderDispatch(now, { db, clock: () => now, environment: 'production', send })
  assert.deepEqual(sent, ['a@example.invalid'])
  assert.equal((await db.collection('reminderDeliveries').where('status', '==', 'accepted').get()).size, 1)
}))

test('department joins/leaves, account activation and view/edit/none changes use current profiles for every recipient load', { skip: !enabled }, async () => scenario(async (db) => {
  const path = 'todos/task/deadlines/date'
  await db.doc('todos/task').set(task)
  await db.doc(path).set(deadline)
  const ids = async () => (await loadReminderRecipients(db, await loadReminderSource(db, path))).map((row) => row.userId).sort()
  await db.doc('users/c').update({ department: 'Buchhaltung', 'permissions.todos': 'view' })
  assert.deepEqual(await ids(), ['a', 'b', 'c', 'owner'])
  for (const permission of ['edit', 'view', 'none', 'view']) {
    await db.doc('users/c').update({ 'permissions.todos': permission })
    assert.equal((await ids()).includes('c'), permission !== 'none')
  }
  await db.doc('users/c').update({ active: false })
  assert(!(await ids()).includes('c'))
  await db.doc('users/c').update({ active: true })
  assert((await ids()).includes('c'))
  await db.doc('users/c').update({ department: 'Disposition' })
  assert(!(await ids()).includes('c'))
  await db.doc('todos/task').update({ audienceType: 'people', audienceIds: ['a', 'c'], audienceId: null })
  await db.doc(path).update({ reminderRecipientMode: 'selected', reminderRecipientUserIds: ['a', 'b', 'c'] })
  assert.deepEqual(await ids(), ['a', 'c'])
  await db.doc(path).update({ reminderRecipientUserIds: ['a'] })
  assert.deepEqual(await ids(), ['a'])
  await db.doc(path).update({ reminderRecipientMode: 'all' })
  assert.deepEqual(await ids(), ['a', 'c'])
}))

for (const mutation of ['deactivate', 'remove-permission', 'leave-department', 'deselect', 'reschedule', 'complete', 'disable-date', 'delete-date']) {
  test(`final delivery guard rejects ${mutation} after reservation`, { skip: !enabled }, async () => scenario(async (db) => {
    const path = 'todos/task/deadlines/date'
    await db.doc('todos/task').set(task)
    await db.doc(path).set({ ...deadline, reminderRecipientMode: 'selected', reminderRecipientUserIds: ['a'] })
    const now = new Date('2026-11-12T11:00:10Z')
    await refreshReminderSource(db, path, { now: new Date('2026-11-12T10:59:00Z') })
    let accepted = 0
    let guarded = 0
    await runReminderDispatch(now, { db, clock: () => now, environment: 'production', send: async (message) => {
      if (mutation === 'deactivate') await db.doc('users/a').update({ active: false })
      if (mutation === 'remove-permission') await db.doc('users/a').update({ 'permissions.todos': 'none' })
      if (mutation === 'leave-department') await db.doc('users/a').update({ department: 'Disposition' })
      if (mutation === 'deselect') await db.doc(path).update({ reminderRecipientUserIds: [] })
      if (mutation === 'reschedule') await db.doc(path).update({ time: '12:01' })
      if (mutation === 'complete') await db.doc('todos/task').update({ status: 'completed' })
      if (mutation === 'disable-date') await db.doc(path).update({ reminderEnabled: false })
      if (mutation === 'delete-date') await db.doc(path).delete()
      guarded += 1
      if (await message.beforeSend()) { accepted += 1; return { status: 'accepted' } }
      return { status: 'cancelled' }
    } })
    assert.equal(guarded, 1)
    assert.equal(accepted, 0)
    assert.equal((await db.collection('reminderDeliveries').where('status', '==', 'accepted').get()).size, 0)
  }))
}

test('completed/reopened task and rescheduled date deliver only the current occurrence once', { skip: !enabled }, async () => scenario(async (db) => {
  const path = 'todos/task/deadlines/date'
  await db.doc('todos/task').set({ ...task, status: 'completed', audienceType: 'people', audienceId: null, audienceIds: ['a'] })
  await db.doc(path).set(deadline)
  let now = new Date('2026-11-12T11:00:10Z')
  const messages = []
  const dependencies = { db, clock: () => now, environment: 'production', send: async (message) => {
    if (!await message.beforeSend()) return { status: 'cancelled' }
    messages.push({ recipient: message.recipient, dueAt: message.dueAt })
    return { status: 'accepted' }
  } }
  await refreshReminderSource(db, path, { now })
  await runReminderDispatch(now, dependencies)
  assert.equal(messages.length, 0)
  await db.doc('todos/task').update({ status: 'open' })
  await refreshReminderSource(db, path, { now })
  await runReminderDispatch(now, dependencies)
  await runReminderDispatch(now, dependencies)
  assert.equal(messages.length, 1)
  await db.doc('todos/task').update({ status: 'completed' })
  await refreshReminderSource(db, path, { now })
  await db.doc('todos/task').update({ status: 'open' })
  await refreshReminderSource(db, path, { now })
  await runReminderDispatch(now, dependencies)
  assert.equal(messages.length, 1, 'Reopening never duplicates an already accepted occurrence')
  await db.doc(path).update({ time: '12:01' })
  await refreshReminderSource(db, path, { now })
  await runReminderDispatch(now, dependencies)
  assert.equal(messages.length, 1)
  now = new Date('2026-11-12T11:01:10Z')
  await runReminderDispatch(now, dependencies)
  await runReminderDispatch(now, dependencies)
  assert.equal(messages.length, 2)
  assert.notEqual(messages[0].dueAt, messages[1].dueAt)
}))
