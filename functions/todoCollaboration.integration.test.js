import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import * as firestore from 'firebase/firestore'

test('todo service and rules allow immediate group collaboration and revoke removed members', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  assert.ok(['localhost', '127.0.0.1'].includes(host))
  const projectId = `demo-todo-collaboration-${Date.now()}`
  const response = await fetch(`http://${host}:${port}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }] } }),
  })
  assert.equal(response.status, 200, await response.text())
  const adminApp = initializeAdminApp({ projectId }, projectId)
  const admin = getAdminFirestore(adminApp)
  const clients = []
  const profiles = new Map([
    ['creator', { active: true, role: 'user', firstName: 'Creator', lastName: 'User', department: 'A', permissions: { todos: 'edit' } }],
    ['member', { active: true, role: 'user', firstName: 'Member', lastName: 'User', department: 'A', permissions: { todos: 'edit' } }],
    ['viewer', { active: true, role: 'user', firstName: 'Viewer', lastName: 'User', department: 'A', permissions: { todos: 'view' } }],
    ['outsider', { active: true, role: 'user', firstName: 'Outside', lastName: 'User', department: 'B', permissions: { todos: 'edit' } }],
  ])
  try {
    for (const [uid, profile] of profiles) {
      await admin.doc(`users/${uid}`).set(profile)
      const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `${projectId}-${uid}`)
      const db = firestore.getFirestore(app)
      firestore.connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid } })
      clients.push({ uid, app, db })
    }
    const db = clients[0].db
    const member = clients[1].db, viewer = clients[2].db, outsider = clients[3].db
    firestore.setLogLevel('silent')
    t.mock.module(new URL('../src/lib/firebase.js', import.meta.url).href, { namedExports: { db, functions: {}, auth: { currentUser: { uid: 'creator' }, onAuthStateChanged(callback) { callback({ uid: 'creator' }); return () => {} } }, waitForAppCheckToken: async () => { throw new Error('No live calls') } } })
    const service = await import('../src/lib/todos.js')
    const actor = { user: { uid: 'creator' }, profile: profiles.get('creator') }
    const users = new Map([...profiles].map(([id, profile]) => [id, { id, ...profile }]))
    const values = { ...service.createEmptyTodo(), title: 'Shared task', audienceType: 'people', audienceIds: ['member', 'viewer'], reminderRecipientMode: 'selected', reminderRecipientUserIds: ['member', 'viewer'] }
    const id = await service.createTodo(values, actor, users)
    const ref = (client) => firestore.doc(client, 'todos', id)
    const saved = await service.getTodoById(id)
    assert.equal(saved.status, 'open')
    assert.equal(saved.assignedUserId, null)
    assert.equal(service.todoStatus({ status: 'completed', assignedUserId: null }), 'completed')
    await t.test('department authorization uses the same trimmed legacy profile value as calendars and reminders', async () => {
      const departmentId = await service.createTodo({ ...service.createEmptyTodo(), title: 'Department task', audienceType: 'department', audienceId: 'A' }, actor, users)
      const memberRef = firestore.doc(member, 'todos', departmentId)
      await admin.doc('users/member').update({ department: ' A ' })
      try {
        assert.equal((await firestore.getDocFromServer(memberRef)).exists(), true)
        await firestore.updateDoc(memberRef, { title: 'Department collaboration', updatedAt: firestore.serverTimestamp() })
        await assert.rejects(firestore.getDocFromServer(firestore.doc(outsider, 'todos', departmentId)), { code: 'permission-denied' })
      } finally { await admin.doc('users/member').update({ department: 'A' }) }
    })
    await t.test('creation fails closed without authentication and bounds recipient fields', async () => {
      const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `${projectId}-anonymous`)
      const anonymous = firestore.getFirestore(app)
      firestore.connectFirestoreEmulator(anonymous, host, Number(port))
      try {
        const payload = { ...saved, createdAt: firestore.serverTimestamp(), updatedAt: firestore.serverTimestamp() }
        delete payload.id
        await assert.rejects(firestore.setDoc(firestore.doc(firestore.collection(anonymous, 'todos')), payload), { code: 'permission-denied' })
        for (const patch of [{ reminderRecipientMode: 'arbitrary' }, { reminderRecipientMode: 'selected', reminderRecipientUserIds: Array.from({ length: 51 }, (_, index) => `user-${index}`) }, { reminderRecipientMode: 'all', reminderRecipientUserIds: ['member'] }]) {
          await assert.rejects(firestore.setDoc(firestore.doc(firestore.collection(db, 'todos')), { ...payload, ...patch }), { code: 'permission-denied' })
        }
      } finally { await firestore.terminate(anonymous); await deleteApp(app) }
    })
    await t.test('members edit, complete and reopen immediately; viewers only add notes', async () => {
      await firestore.updateDoc(ref(member), { title: 'Edited by group', updatedAt: firestore.serverTimestamp() })
      await firestore.updateDoc(ref(member), { status: 'completed', completedAt: firestore.serverTimestamp(), completedByUserId: 'member', completedByName: 'Member User', updatedAt: firestore.serverTimestamp() })
      await assert.rejects(firestore.updateDoc(ref(viewer), { status: 'open', completedAt: null, completedByUserId: null, completedByName: null, updatedAt: firestore.serverTimestamp() }), { code: 'permission-denied' })
      await firestore.updateDoc(ref(member), { status: 'open', completedAt: null, completedByUserId: null, completedByName: null, updatedAt: firestore.serverTimestamp() })
      await assert.rejects(firestore.updateDoc(ref(viewer), { title: 'Forbidden', updatedAt: firestore.serverTimestamp() }), { code: 'permission-denied' })
      const batch = firestore.writeBatch(viewer)
      batch.update(ref(viewer), { updatedAt: firestore.serverTimestamp() })
      batch.set(firestore.doc(viewer, `todos/${id}/updates/viewer-note`), { type: 'note', text: 'Synthetic note', createdByUserId: 'viewer', createdByName: 'Viewer User', createdAt: firestore.serverTimestamp() })
      await batch.commit()
    })
    await t.test('legacy assignments do not block group completion or creator reopening', async () => {
      await admin.doc(`todos/${id}`).update({ status: 'in_progress', assignedUserId: 'outsider', assignedUserName: 'Outside User', assignedAt: new Date() })
      await firestore.updateDoc(ref(member), { status: 'completed', completedAt: firestore.serverTimestamp(), completedByUserId: 'member', completedByName: 'Member User', updatedAt: firestore.serverTimestamp() })
      await service.reactivateTodoForCurrentUser(id, actor)
      const todo = await service.getTodoById(id)
      assert.equal(todo.status, 'open')
      assert.equal(todo.assignedUserId, 'outsider')
      await assert.rejects(firestore.getDocFromServer(ref(outsider)), { code: 'permission-denied' })
    })
    await t.test('audience members cannot change audience, withdraw, claim assignment, or read mirrors', async () => {
      await assert.rejects(firestore.updateDoc(ref(member), { audienceType: 'all', audienceId: null, audienceIds: null, audienceLabel: 'Alle', updatedAt: firestore.serverTimestamp() }), { code: 'permission-denied' })
      await assert.rejects(firestore.updateDoc(ref(member), { status: 'withdrawn', withdrawnAt: firestore.serverTimestamp(), withdrawnByUserId: 'member', updatedAt: firestore.serverTimestamp() }), { code: 'permission-denied' })
      await assert.rejects(firestore.updateDoc(ref(member), { assignedUserId: 'member', assignedUserName: 'Member User', assignedAt: firestore.serverTimestamp(), status: 'in_progress', updatedAt: firestore.serverTimestamp() }), { code: 'permission-denied' })
      await admin.doc('todoCalendarEntries/obsolete').set({ ownerUserId: 'member', todoId: id, description: 'Private legacy mirror' })
      await assert.rejects(firestore.getDoc(firestore.doc(member, 'todoCalendarEntries', 'obsolete')), { code: 'permission-denied' })
      await admin.doc('todoCalendarEntries/obsolete').delete()
    })
    let deadline
    await t.test('deadline service writes source only and group members edit dates', async () => {
      const todo = await service.getTodoById(id)
      await service.createTodoDeadline(todo, { ...service.createEmptyTodoDeadline(), date: '2026-11-20', time: '12:00', reminderEnabled: true, reminderRecipientMode: 'selected', reminderRecipientUserIds: ['member', 'viewer'] }, actor)
      ;[deadline] = await service.listTodoDeadlines(id)
      assert.equal(deadline.calendarEntryId, undefined)
      assert.equal(await service.updateTodoDeadline(todo, deadline, { type: deadline.type, date: deadline.date, time: deadline.time, reminderEnabled: true, note: '' }, actor), false)
      assert.equal((await admin.collection('todoCalendarEntries').get()).size, 0)
      const batch = firestore.writeBatch(member)
      batch.update(ref(member), { updatedAt: firestore.serverTimestamp() })
      batch.update(firestore.doc(member, `todos/${id}/deadlines/${deadline.id}`), { note: 'Group edit', updatedAt: firestore.serverTimestamp(), updatedBy: 'member', updatedByName: 'Member User' })
      await batch.commit()
    })
    await t.test('audience changes prune selected recipients and revoke stale assignees', async () => {
      await admin.doc(`todos/${id}`).update({ assignedUserId: 'member', assignedUserName: 'Member User', assignedAt: new Date(), status: 'in_progress' })
      const todo = await service.getTodoById(id)
      await service.updateTodoByCreator(todo, { ...values, audienceIds: ['viewer'] }, users, true, actor)
      assert.deepEqual((await service.getTodoById(id)).reminderRecipientUserIds, ['viewer'])
      assert.deepEqual((await service.listTodoDeadlines(id))[0].reminderRecipientUserIds, ['viewer'])
      for (const client of [member, outsider]) {
        await assert.rejects(firestore.getDocFromServer(ref(client)), { code: 'permission-denied' })
        await assert.rejects(firestore.updateDoc(ref(client), { title: 'Forbidden', updatedAt: firestore.serverTimestamp() }), { code: 'permission-denied' })
      }
    })
    await t.test('service audience batches preserve selected recipients and deadline details through repeated department and people changes', async () => {
      const before = await service.getTodoById(id)
      const [beforeDeadline] = await service.listTodoDeadlines(id)
      assert.deepEqual(before.reminderRecipientUserIds, ['viewer'])
      assert.deepEqual(beforeDeadline.reminderRecipientUserIds, ['viewer'])
      for (const audienceType of ['department', 'people', 'department', 'people']) {
        const current = await service.getTodoById(id)
        await service.updateTodoByCreator(current, {
          ...current, audienceType, audienceId: audienceType === 'department' ? 'A' : '',
          audienceIds: audienceType === 'people' ? ['viewer'] : [],
        }, users, true, actor)
        const updated = await service.getTodoById(id)
        const [updatedDeadline] = await service.listTodoDeadlines(id)
        assert.equal(updated.audienceType, audienceType)
        assert.deepEqual(updated.reminderRecipientUserIds, ['viewer'])
        assert.deepEqual(updatedDeadline.reminderRecipientUserIds, ['viewer'])
        for (const field of ['type', 'date', 'time', 'note']) assert.deepEqual(updatedDeadline[field], beforeDeadline[field], `${audienceType}: preserved deadline ${field}`)
        for (const field of ['dueDate', 'reminderDate', 'reminderTime', 'reminderOccurrence']) assert.deepEqual(updated[field], before[field], `${audienceType}: preserved root ${field}`)
        assert.equal((await firestore.getDocFromServer(ref(viewer))).exists(), true)
        if (audienceType === 'department') assert.equal((await firestore.getDocFromServer(ref(member))).exists(), true)
        else await assert.rejects(firestore.getDocFromServer(ref(member)), { code: 'permission-denied' })
        await assert.rejects(firestore.getDocFromServer(ref(outsider)), { code: 'permission-denied' })
      }
      assert.deepEqual((await service.getTodoById(id)).audienceIds, ['viewer'])
    })
    await t.test('unreadable stale assigned user cannot list or edit old tasks', async () => {
      await admin.doc(`todos/${id}`).update({ assignedUserId: 'member', assignedUserName: 'Member User', assignedAt: new Date() })
      await assert.rejects(firestore.getDocFromServer(ref(member)), { code: 'permission-denied' })
      await assert.rejects(firestore.updateDoc(ref(member), { status: 'completed', completedAt: firestore.serverTimestamp(), completedByUserId: 'member', completedByName: 'Member User', updatedAt: firestore.serverTimestamp() }), { code: 'permission-denied' })
      await assert.rejects(firestore.getDocs(firestore.query(firestore.collection(member, 'todos'), firestore.where('assignedUserId', '==', 'member'))), { code: 'permission-denied' })
    })
  } finally {
    for (const { app, db } of clients) { await firestore.terminate(db); await deleteApp(app) }
    await admin.terminate(); await deleteAdminApp(adminApp)
  }
})
