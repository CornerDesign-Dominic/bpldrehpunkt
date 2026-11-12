import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import * as firestore from 'firebase/firestore'
import { todoReminderRecipientIds } from '../shared/todoCollaboration.js'

async function within(promise) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Subscription did not settle')), 8000) })]) }
  finally { clearTimeout(timer) }
}

test('open todo forms use fresh access and reject concurrent source changes without data loss', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  assert.ok(['127.0.0.1', 'localhost'].includes(host))
  const projectId = `demo-todo-fresh-${Date.now()}`
  const response = await fetch(`http://${host}:${port}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }] } }),
  })
  assert.equal(response.status, 200, await response.text())
  const adminApp = initializeAdminApp({ projectId }, projectId)
  const admin = getAdminFirestore(adminApp)
  const clients = []
  const profile = { active: true, role: 'user', firstName: 'Creator', lastName: 'User', department: 'A', permissions: { todos: 'edit' } }
  const memberProfile = { ...profile, firstName: 'Member' }
  try {
    for (const [uid, data] of [['creator', profile], ['member', memberProfile]]) {
      await admin.doc(`users/${uid}`).set(data)
      const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `${projectId}-${uid}`)
      const db = firestore.getFirestore(app)
      firestore.connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid } })
      clients.push({ app, db })
    }
    const [{ db }, { db: member }] = clients
    firestore.setLogLevel('silent')
    t.mock.module(new URL('../src/lib/firebase.js', import.meta.url).href, { namedExports: {
      db, functions: {}, auth: { currentUser: { uid: 'creator' }, onAuthStateChanged(callback) { callback({ uid: 'creator' }); return () => {} } }, waitForAppCheckToken: async () => { throw new Error('No external calls') },
    } })
    const service = await import('../src/lib/todos.js')
    const actor = { user: { uid: 'creator' }, profile }
    const users = new Map([['creator', { id: 'creator', ...profile }], ['member', { id: 'member', ...memberProfile }]])
    const base = () => ({ ...service.createEmptyTodo(), title: 'Original task', audienceType: 'all' })
    async function fixture(values = {}) {
      const id = await service.createTodo({ ...base(), ...values }, actor, users)
      const todo = await service.getTodoById(id)
      await service.createTodoDeadline(todo, { ...service.createEmptyTodoDeadline(), date: '2026-12-20', time: '12:00', reminderEnabled: true, reminderRecipientMode: 'selected', reminderRecipientUserIds: ['creator', 'member'], note: 'Original deadline note' }, actor)
      const [deadline] = await service.listTodoDeadlines(id)
      return { id, todo: await service.getTodoById(id), deadline }
    }
    const root = (id, client = db) => firestore.doc(client, 'todos', id)
    const deadlineRef = (todo, deadline, client = db) => firestore.doc(client, `todos/${todo.id}/deadlines/${deadline.id}`)
    const stale = { code: 'todo/stale-edit' }

    await t.test('stale content and audience forms cannot overwrite another participant; notes alone do not conflict', async () => {
      const { id, todo } = await fixture()
      await firestore.updateDoc(root(id, member), { description: 'New description from another participant', updatedAt: firestore.serverTimestamp() })
      const historyCount = (await service.listTodoUpdates(id)).length
      await assert.rejects(service.updateTodoByCreator(todo, { ...todo, title: 'Stale form title' }, users, false, actor), stale)
      assert.equal((await service.getTodoById(id)).description, 'New description from another participant')
      assert.equal((await service.getTodoById(id)).title, 'Original task')
      assert.equal((await service.listTodoUpdates(id)).length, historyCount)
      const current = await service.getTodoById(id)
      await service.addTodoNote(id, 'A note while the edit form is open', actor)
      await service.updateTodoByCreator(current, { ...current, title: 'Valid edit after note' }, users, false, actor)
      const beforeAudienceChange = await service.getTodoById(id)
      await service.updateTodoByCreator(beforeAudienceChange, { ...beforeAudienceChange, audienceType: 'people', audienceId: '', audienceIds: ['member'] }, users, true, actor)
      await assert.rejects(service.updateTodoByCreator(beforeAudienceChange, { ...beforeAudienceChange, title: 'Stale audience restored' }, users, false, actor), stale)
      assert.deepEqual((await service.getTodoById(id)).audienceIds, ['member'])
    })

    await t.test('stale deadline edit/delete cannot erase a newer time, note or selected recipients', async () => {
      const { id, todo, deadline } = await fixture()
      const batch = firestore.writeBatch(member)
      batch.update(root(id, member), { updatedAt: firestore.serverTimestamp() })
      batch.update(deadlineRef(todo, deadline, member), { time: '14:00', note: 'Concurrent note', reminderRecipientUserIds: ['member'], updatedAt: firestore.serverTimestamp(), updatedBy: 'member', updatedByName: 'Member User' })
      await batch.commit()
      await assert.rejects(service.updateTodoDeadline(todo, deadline, { ...deadline, date: '2026-12-21' }, actor), stale)
      await assert.rejects(service.deleteTodoDeadline(todo, deadline, actor), stale)
      const [saved] = await service.listTodoDeadlines(id)
      assert.equal(saved.date, '2026-12-20')
      assert.equal(saved.time, '14:00')
      assert.equal(saved.note, 'Concurrent note')
      assert.deepEqual(saved.reminderRecipientUserIds, ['member'])
      await service.deleteTodoDeadline(todo, saved, actor)
      await assert.rejects(service.updateTodoDeadline(todo, saved, { ...saved, note: 'Resurrect deleted deadline' }, actor), stale)
      assert.equal((await service.listTodoDeadlines(id)).length, 0)
    })

    await t.test('a completed or withdrawn task rejects pending content and deadline operations until explicit reopening', async () => {
      const { id, todo, deadline } = await fixture()
      await firestore.updateDoc(root(id, member), { status: 'completed', completedAt: firestore.serverTimestamp(), completedByUserId: 'member', completedByName: 'Member User', updatedAt: firestore.serverTimestamp() })
      for (const operation of [
        () => service.updateTodoByCreator(todo, { ...todo, title: 'Stale title' }, users, false, actor),
        () => service.createTodoDeadline(todo, { ...deadline, note: 'Stale new deadline' }, actor),
        () => service.updateTodoDeadline(todo, deadline, { ...deadline, note: 'Stale deadline edit' }, actor),
        () => service.deleteTodoDeadline(todo, deadline, actor),
        () => service.completeTodoForCurrentUser(id, actor),
      ]) await assert.rejects(operation(), stale)
      assert.equal((await service.getTodoById(id)).status, 'completed')
      assert.equal((await service.listTodoDeadlines(id)).length, 1)
      await service.reactivateTodoForCurrentUser(id, actor)
      assert.equal((await service.getTodoById(id)).status, 'open')
      await service.withdrawTodo(id, actor)
      await assert.rejects(service.reactivateTodoForCurrentUser(id, actor), stale)
      await assert.rejects(service.createTodoDeadline(todo, deadline, actor), stale)
      await assert.rejects(firestore.getDocFromServer(root(id, member)), { code: 'permission-denied' })
    })

    await t.test('simultaneous complete and reopen attempts produce one state transition and one history entry', async () => {
      const { id } = await fixture()
      for (const operation of [service.completeTodoForCurrentUser, service.reactivateTodoForCurrentUser]) {
        const count = (await service.listTodoUpdates(id)).length
        const attempts = await Promise.allSettled([operation(id, actor), operation(id, actor)])
        assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1)
        const [rejected] = attempts.filter((result) => result.status === 'rejected')
        assert.equal(rejected.reason.code, 'todo/stale-edit')
        assert.equal((await service.listTodoUpdates(id)).length, count + 1)
      }
      assert.equal((await service.getTodoById(id)).status, 'open')
    })

    await t.test('cached edit rights cannot survive downgrade or deactivation; current view rights still allow notes', async () => {
      const { id, todo, deadline } = await fixture()
      await admin.doc('users/creator').update({ permissions: { todos: 'view' } })
      try {
        for (const operation of [
          () => service.updateTodoByCreator(todo, { ...todo, title: 'No longer allowed' }, users, false, actor),
          () => service.createTodoDeadline(todo, deadline, actor),
          () => service.updateTodoDeadline(todo, deadline, { ...deadline, note: 'No longer allowed' }, actor),
          () => service.deleteTodoDeadline(todo, deadline, actor),
          () => service.completeTodoForCurrentUser(id, actor),
          () => service.withdrawTodo(id, actor),
        ]) await assert.rejects(operation(), { code: 'permission-denied' })
        await service.addTodoNote(id, 'Still a readable task', actor)
        await admin.doc('users/creator').update({ active: false })
        await assert.rejects(service.addTodoNote(id, 'Disabled account note', actor), { code: 'permission-denied' })
      } finally { await admin.doc('users/creator').set(profile) }
      assert.equal((await service.getTodoById(id)).title, 'Original task')
    })

    await t.test('renamed employees keep person-task edit access and history uses the fresh authoritative name', async () => {
      const { id, todo, deadline } = await fixture({ audienceType: 'self' })
      await admin.doc('users/creator').update({ firstName: 'Renamed', lastName: 'Person' })
      try {
        await service.updateTodoByCreator(todo, { ...todo, audienceType: 'self', title: 'After rename' }, users, false, actor)
        await service.updateTodoDeadline(todo, deadline, { ...deadline, note: 'After rename' }, actor)
        await assert.rejects(firestore.updateDoc(root(id), { audienceLabel: 'Forged current audience label', updatedAt: firestore.serverTimestamp() }), { code: 'permission-denied' })
        await service.completeTodoForCurrentUser(id, actor)
        assert.equal((await service.getTodoById(id)).completedByName, 'Renamed Person')
        assert.equal((await service.listTodoUpdates(id))[0].createdByName, 'Renamed Person')
      } finally { await admin.doc('users/creator').set(profile) }
    })

    await t.test('department leave and rejoin use current profile, even with an old in-memory actor profile', async () => {
      const { id, todo, deadline } = await fixture({ audienceType: 'department', audienceId: 'A' })
      await admin.doc(`todos/${id}`).update({ creatorUserId: 'other-owner', creatorName: 'Other Owner' })
      const original = { ...todo, creatorUserId: 'other-owner', creatorName: 'Other Owner' }
      await admin.doc('users/creator').update({ department: 'B' })
      try {
        await assert.rejects(service.updateTodoDeadline(original, deadline, { ...deadline, note: 'After leaving' }, actor), { code: 'permission-denied' })
        await assert.rejects(service.completeTodoForCurrentUser(id, actor), { code: 'permission-denied' })
        assert.deepEqual(todoReminderRecipientIds(original, deadline, [{ id: 'creator', ...profile, department: 'B' }, { id: 'member', ...memberProfile }]), ['member'])
        await admin.doc('users/creator').update({ department: 'A' })
        const staleDepartedActor = { ...actor, profile: { ...profile, department: 'B' } }
        await service.updateTodoDeadline(original, deadline, { ...deadline, note: 'After rejoining' }, staleDepartedActor)
        assert.equal((await service.listTodoDeadlines(id))[0].note, 'After rejoining')
      } finally { await admin.doc('users/creator').set(profile) }
    })

    await t.test('stale deadline modals cannot use the previous audience after an owner changes its members', async () => {
      const { id, todo, deadline } = await fixture()
      await service.updateTodoByCreator(todo, { ...todo, audienceType: 'people', audienceId: '', audienceIds: ['member'] }, users, true, actor)
      for (const operation of [
        () => service.createTodoDeadline(todo, deadline, actor),
        () => service.updateTodoDeadline(todo, deadline, { ...deadline, note: 'Old audience' }, actor),
        () => service.deleteTodoDeadline(todo, deadline, actor),
      ]) await assert.rejects(operation(), stale)
      assert.deepEqual((await service.listTodoDeadlines(id))[0].reminderRecipientUserIds, ['member'])
    })

    await t.test('task and child subscriptions stop exposing values when audience access is revoked', async () => {
      const { id, deadline } = await fixture({ audienceType: 'department', audienceId: 'A' })
      await admin.doc(`todos/${id}`).update({ creatorUserId: 'other-owner', creatorName: 'Other Owner' })
      const subscriptions = [service.subscribeTodo, service.subscribeTodoUpdates, service.subscribeTodoDeadlines]
      const initial = [], denied = [], unsubscribers = [], received = []
      for (const subscribe of subscriptions) {
        let ready, removed
        const values = []
        received.push(values)
        initial.push(new Promise((resolve) => { ready = resolve }))
        denied.push(new Promise((resolve) => { removed = resolve }))
        unsubscribers.push(subscribe(id, (value) => { values.push(value); ready() }, (error) => { assert.equal(error.code, 'permission-denied'); removed() }))
      }
      try {
        await within(Promise.all(initial))
        await admin.doc(`todos/${id}`).update({ audienceType: 'people', audienceId: null, audienceIds: ['member'], audienceLabel: 'Personen: Member User' })
        await admin.doc(`todos/${id}/deadlines/${deadline.id}`).update({ note: 'Private after removal' })
        await admin.doc(`todos/${id}/updates/after-removal`).set({ type: 'note', text: 'Private after removal', createdByUserId: 'member', createdByName: 'Member User', createdAt: new Date() })
        await within(Promise.all(denied))
        await assert.rejects(firestore.getDocFromServer(root(id)), { code: 'permission-denied' })
        assert(received[0].every((value) => value?.audienceType === 'department'))
        assert(!received.slice(1).flat(2).some((value) => value.note === 'Private after removal' || value.text === 'Private after removal'))
      } finally { unsubscribers.forEach((unsubscribe) => unsubscribe()) }
    })
  } finally {
    for (const { app, db } of clients) { await firestore.terminate(db); await deleteApp(app) }
    await admin.terminate(); await deleteAdminApp(adminApp)
  }
})
