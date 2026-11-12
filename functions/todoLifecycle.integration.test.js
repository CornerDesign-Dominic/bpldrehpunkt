import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import * as firestore from 'firebase/firestore'

test('actual todo creation and handoff respect rules for normal and boundary profiles', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  assert.equal(typeof t.mock.module, 'function')
  const projectId = 'demo-todo-permissions-lifecycle'
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  assert.ok(['127.0.0.1', 'localhost'].includes(host))
  const rulesResponse = await fetch(`http://${host}:${port}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }] } }),
  })
  assert.equal(rulesResponse.status, 200, await rulesResponse.text())
  const adminApp = initializeAdminApp({ projectId }, `todo-admin-${Date.now()}`)
  const admin = getAdminFirestore(adminApp)
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `todo-client-${Date.now()}`)
  const db = firestore.getFirestore(app)
  firestore.connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: 'todo-editor' } })
  firestore.setLogLevel('silent')
  t.mock.module(new URL('../src/lib/firebase.js', import.meta.url).href, { namedExports: { db, functions: {}, auth: { currentUser: { uid: 'todo-editor' }, onAuthStateChanged(callback) { callback({ uid: 'todo-editor' }); return () => {} } }, waitForAppCheckToken: async () => { throw new Error('No external callable allowed') } } })
  try {
    const service = await import('../src/lib/todos.js')
    const profile = { active: true, role: 'user', firstName: 'Todo', lastName: 'Editor', department: 'Disposition', permissions: { todos: 'edit' } }
    const actor = { user: { uid: 'todo-editor', email: 'editor@example.invalid' }, profile }
    const users = new Map(Array.from({ length: 35 }, (_, index) => [`target-${index}`, { id: `target-${index}`, firstName: 'EmployeeLongFirstname', lastName: `EmployeeLongLastname${index}` }]))
    await admin.doc('users/todo-editor').set(profile)
    for (const user of users.values()) await admin.doc(`users/${user.id}`).set({ ...user, active: true, role: 'user', permissions: { todos: 'edit' } })
    const values = { ...service.createEmptyTodo(), title: 'Synthetic task' }
    await t.test('people audience including self creates a linked task with a complete reminder', async () => {
      users.set(actor.user.uid, { id: actor.user.uid, ...profile })
      await admin.doc('businessPartners/reminder-customer').set({ companyName: 'Reminder customer', businessPartnerRoles: ['customer'] })
      await admin.doc('businessPartners/reminder-carrier').set({ companyName: 'Reminder carrier', businessPartnerRoles: ['carrier'] })
      await admin.doc('transportOrders/261000309').set({ externalNumber: '261000309', imported: { customer: { partnerId: 'reminder-customer', name: 'Reminder customer' }, carrier: { partnerId: 'reminder-carrier', originalName: 'Reminder carrier' } } })
      const next = { ...values, audienceType: 'people', audienceIds: [actor.user.uid], reminderRecipientMode: 'selected', reminderRecipientUserIds: [actor.user.uid], dueDate: '2026-11-12', reminderDate: '2026-11-12', reminderTime: '12:00', reminderOccurrence: 'earlier', customerId: 'reminder-customer', customerName: 'Reminder customer', carrierId: 'reminder-carrier', carrierName: 'Reminder carrier', transportOrderLinks: [{ id: '261000309', number: '261000309' }] }
      const id = await service.createTodo(next, actor, users)
      const saved = await service.getTodoById(id)
      assert.equal(saved.status, 'open')
      assert.equal(saved.reminderTime, '12:00')
      assert.deepEqual(saved.audienceIds, [actor.user.uid])
      await admin.doc('businessPartners/reminder-customer').set({ companyName: 'Reminder customer', debtorNumber: '100', creditorNumber: '', dycosReferences: { debtorNumbers: ['100'], creditorNumbers: [], accounts: [{ entity: 'customer', number: '100', sourceId: 'customer-source' }] } })
      await admin.doc('businessPartners/reminder-carrier').set({ companyName: 'Reminder carrier', creditorNumber: '200', debtorNumber: '', dycosReferences: { creditorNumbers: ['200'], debtorNumbers: [], accounts: [{ entity: 'carrier', number: '200', sourceId: 'carrier-source' }] } })
      const legacy = await service.createTodo(next, actor, users).catch((error) => { error.message = `Current legacy numeric partners: ${error.message}`; throw error })
      assert.equal((await service.getTodoById(legacy)).reminderTime, '12:00')
      profile.permissions.transportOrders = 'view'
      await admin.doc('users/todo-editor').set(profile)
      for (const [index, roles] of [
        [{ businessPartnerRoles: ['customer'] }, { businessPartnerRoles: ['carrier'] }],
        [{ debtorNumber: '100' }, { creditorNumber: '200' }],
        [{ partnerRoles: { kunde: true } }, { taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }],
      ].entries()) {
        await admin.doc('businessPartners/reminder-customer').set({ companyName: 'Renamed customer', ...roles[0] })
        await admin.doc('businessPartners/reminder-carrier').set({ companyName: 'Renamed carrier', ...roles[1] })
        const linked = await service.createTodo({ ...next, title: `Historical linked reminder ${index}` }, actor, users).catch((error) => { error.message = `Historical role variant ${index}: ${error.message}`; throw error })
        assert.equal((await service.getTodoById(linked)).reminderTime, '12:00')
      }
    })
    await t.test('creation still rejects each missing mandatory field in open and self-assigned tasks', async () => {
      const required = ['title', 'description', 'dueDate', 'creatorUserId', 'creatorName', 'audienceType', 'audienceId', 'audienceLabel', 'assignedUserId', 'assignedUserName', 'assignedAt', 'status', 'completedAt', 'completedByUserId', 'completedByName', 'withdrawnAt', 'withdrawnByUserId', 'createdAt', 'updatedAt']
      for (const audience of [{ audienceType: 'self' }, { audienceType: 'people', audienceIds: ['target-1'] }]) {
        const id = await service.createTodo({ ...values, ...audience }, actor, users)
        const stored = (await admin.doc(`todos/${id}`).get()).data()
        for (const field of required) {
          const payload = { ...stored, createdAt: firestore.serverTimestamp(), updatedAt: firestore.serverTimestamp(), assignedAt: stored.assignedAt ? firestore.serverTimestamp() : null }
          delete payload[field]
          const ref = firestore.doc(firestore.collection(db, 'todos'))
          await assert.rejects(firestore.setDoc(ref, payload), { code: 'permission-denied' }, `${audience.audienceType}: missing ${field}`)
          assert.equal((await admin.doc(ref.path).get()).exists, false)
        }
      }
    })
    await t.test('self creation and transfer to a colleague', async () => {
      const id = await service.createTodo(values, actor, users)
      const todo = await service.getTodoById(id)
      await service.updateTodoByCreator(todo, { ...values, audienceType: 'people', audienceIds: ['target-0'] }, users, true, actor)
      const saved = await service.getTodoById(id)
      assert.equal(saved.status, 'open')
      assert.deepEqual(saved.audienceIds, ['target-0'])
      assert.equal(saved.assignedUserId, null)
    })
    await t.test('handoff to a large valid audience keeps bounded history', async () => {
      const next = { ...values, audienceType: 'people', audienceIds: [...users.keys()] }
      const id = await service.createTodo(next, actor, users)
      const todo = await service.getTodoById(id)
      await service.updateTodoByCreator(todo, { ...values, audienceType: 'people', audienceIds: ['target-0'] }, users, true, actor)
      const updates = await service.listTodoUpdates(id)
      assert.ok(updates.every((update) => update.text.length <= 1000))
    })
    await t.test('unrelated users cannot read or modify a handed-off task; targets collaborate immediately', async () => {
      const id = await service.createTodo({ ...values, audienceType: 'people', audienceIds: ['target-0'] }, actor, users)
      for (const [uid, allowed] of [['target-0', true], ['target-1', false]]) {
        const targetApp = initializeApp({ projectId, apiKey: 'emulator-only' }, `security-${uid}-${Date.now()}`)
        const targetDb = firestore.getFirestore(targetApp)
        firestore.connectFirestoreEmulator(targetDb, host, Number(port), { mockUserToken: { sub: uid } })
        try {
          const ref = firestore.doc(targetDb, 'todos', id)
          if (allowed) {
            assert.equal((await firestore.getDoc(ref)).exists(), true)
            await firestore.updateDoc(ref, { title: 'Shared edit', updatedAt: firestore.serverTimestamp() })
            for (const restricted of [{ active: true, permissions: { todos: 'none' } }, { active: false, permissions: { todos: 'edit' } }]) {
              await admin.doc(`users/${uid}`).update(restricted)
              await assert.rejects(firestore.getDocFromServer(ref), { code: 'permission-denied' })
              await assert.rejects(firestore.updateDoc(ref, { updatedAt: firestore.serverTimestamp() }), { code: 'permission-denied' })
            }
          } else {
            await assert.rejects(firestore.getDoc(ref), { code: 'permission-denied' })
            await assert.rejects(firestore.updateDoc(ref, { updatedAt: firestore.serverTimestamp() }), { code: 'permission-denied' })
          }
        } finally { await firestore.terminate(targetDb); await deleteApp(targetApp) }
      }
    })
    await t.test('view-only and disabled creators cannot create or hand off tasks', async () => {
      const id = await service.createTodo(values, actor, users)
      const todo = await service.getTodoById(id)
      for (const restrictions of [{ active: true, permissions: { todos: 'view' } }, { active: false, role: 'superadmin' }]) {
        await admin.doc('users/todo-editor').set({ ...profile, ...restrictions })
        await assert.rejects(service.createTodo(values, actor, users), { code: 'permission-denied' })
        await assert.rejects(service.updateTodoByCreator(todo, { ...values, audienceType: 'people', audienceIds: ['target-0'] }, users, true, actor), { code: 'permission-denied' })
      }
      await admin.doc('users/todo-editor').set(profile)
    })
    await t.test('creation with single and padded names matches display name', async () => {
      for (const names of [{ firstName: 'Single', lastName: '' }, { firstName: '  Padded', lastName: 'Name  ' }, { firstName: null, lastName: null }, { firstName: '', lastName: '', email: 'profile@example.invalid' }, { firstName: '', lastName: '', name: 'Legacy name' }]) {
        Object.assign(profile, names)
        await admin.doc('users/todo-editor').set(profile)
        const id = await service.createTodo(values, actor, users)
        assert.equal((await service.getTodoById(id)).assignedUserId, null)
      }
    })
  } finally {
    await firestore.terminate(db)
    await deleteApp(app)
    await admin.terminate()
    await deleteAdminApp(adminApp)
  }
})
