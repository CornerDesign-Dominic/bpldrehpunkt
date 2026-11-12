import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import * as firestore from 'firebase/firestore'

test('audience pruning rejects a child created after its server query and safely reloads on retry', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  assert.ok(['localhost', '127.0.0.1'].includes(host))
  const projectId = `demo-todo-epoch-${Date.now()}`
  const response = await fetch(`http://${host}:${port}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }] } }),
  })
  assert.equal(response.status, 200, await response.text())
  const adminApp = initializeAdminApp({ projectId }, projectId)
  const admin = getAdminFirestore(adminApp)
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, projectId)
  const db = firestore.getFirestore(app)
  firestore.connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: 'creator' } })
  firestore.setLogLevel('silent')
  let afterQuery = null
  t.mock.module('firebase/firestore', { namedExports: {
    ...firestore,
    getDocsFromServer: async (...args) => {
      const snapshot = await firestore.getDocsFromServer(...args)
      if (afterQuery) await afterQuery(snapshot)
      return snapshot
    },
  } })
  t.mock.module(new URL('../src/lib/firebase.js', import.meta.url).href, { namedExports: {
    db, functions: {}, auth: { currentUser: { uid: 'creator' }, onAuthStateChanged(callback) { callback({ uid: 'creator' }); return () => {} } }, waitForAppCheckToken: async () => { throw new Error('No external calls') },
  } })
  try {
    const service = await import('../src/lib/todos.js')
    const profile = { active: true, role: 'user', firstName: 'Creator', lastName: 'User', permissions: { todos: 'edit' } }
    const member = { ...profile, firstName: 'Member' }
    await admin.doc('users/creator').set(profile)
    await admin.doc('users/member').set(member)
    const actor = { user: { uid: 'creator' }, profile }
    const users = new Map([['creator', { id: 'creator', ...profile }], ['member', { id: 'member', ...member }]])
    const values = { ...service.createEmptyTodo(), title: 'Audience epoch task', audienceType: 'people', audienceIds: ['creator', 'member'] }
    const id = await service.createTodo(values, actor, users)
    const original = await service.getTodoById(id)
    let injected = 0
    // The returned snapshot is genuinely from Firestore and deliberately
    // predates the inserted child. No service or rules operation is stubbed.
    afterQuery = async (snapshot) => {
      afterQuery = null
      assert.equal(snapshot.size, 0)
      injected += 1
      await service.createTodoDeadline(original, {
        ...service.createEmptyTodoDeadline(), date: '2026-12-20', time: '12:00', reminderEnabled: true,
        reminderRecipientMode: 'selected', reminderRecipientUserIds: ['member'], note: 'Concurrent deadline',
      }, actor)
    }
    const changed = { ...values, audienceIds: ['creator'] }
    await assert.rejects(service.updateTodoByCreator(original, changed, users, true, actor), { code: 'todo/stale-edit' })
    assert.equal(injected, 1)
    assert.deepEqual((await service.getTodoById(id)).audienceIds, ['creator', 'member'])
    assert.deepEqual((await service.listTodoDeadlines(id))[0].reminderRecipientUserIds, ['member'])
    assert.equal((await service.listTodoUpdates(id)).length, 2)
    // Retry must fetch a new server collection snapshot, including the child.
    await service.updateTodoByCreator(original, changed, users, true, actor)
    assert.deepEqual((await service.getTodoById(id)).audienceIds, ['creator'])
    let [deadline] = await service.listTodoDeadlines(id)
    assert.equal(deadline.reminderRecipientMode, 'selected')
    assert.deepEqual(deadline.reminderRecipientUserIds, [])
    assert.equal(deadline.time, '12:00')
    assert.equal(deadline.note, 'Concurrent deadline')
    await service.updateTodoByCreator(await service.getTodoById(id), values, users, true, actor)
    ;[deadline] = await service.listTodoDeadlines(id)
    assert.deepEqual(deadline.reminderRecipientUserIds, [], 'rejoining the audience must not resurrect the pruned explicit selection')
  } finally {
    await firestore.terminate(db); await deleteApp(app)
    await admin.terminate(); await deleteAdminApp(adminApp)
  }
})
