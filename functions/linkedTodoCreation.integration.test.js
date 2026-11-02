import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import * as firestore from 'firebase/firestore'
import { linkedTodoSubmission } from '../src/lib/linkedTodoCreation.js'
import { mergeComparison } from './partnerMergeDecisions.js'
import { loadMergeReversal, performPartnerMerge, performPartnerMergeReversal } from './partnerMerges.js'

// Actual browser data service, emulator-bound initialization only.
// node --experimental-test-module-mocks --test functions/linkedTodoCreation.integration.test.js
test('actual follow-up todo creation preserves edits and sources through merge, split and normal task lifecycle', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  assert.equal(typeof t.mock.module, 'function', 'Run with --experimental-test-module-mocks')
  const projectId = `${process.env.GCLOUD_PROJECT || 'demo-linked-todo-client'}-followup-client`
  assert.ok(projectId.startsWith('demo-'))
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  assert.ok(['127.0.0.1', 'localhost'].includes(host))
  const adminApp = initializeAdminApp({ projectId }, `linked-admin-${Date.now()}`)
  const admin = getAdminFirestore(adminApp)
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `linked-client-${Date.now()}`)
  const db = firestore.getFirestore(app)
  firestore.connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: 'followup-user' } })
  firestore.setLogLevel('silent')
  t.mock.module(new URL('../src/lib/firebase.js', import.meta.url).href, { namedExports: { db, functions: {}, auth: { currentUser: { uid: 'followup-user' }, onAuthStateChanged(callback) { callback({ uid: 'followup-user' }); return () => {} } }, waitForAppCheckToken: async () => { throw new Error('No external callable allowed') } } })
  try {
    const service = await import('../src/lib/todos.js')
    const profile = { active: true, role: 'user', firstName: 'Followup', lastName: 'User', department: 'Disposition', permissions: { todos: 'edit', damages: 'view', insolvencies: 'view', inkasso: 'view', legalDisputes: 'view', transportOrders: 'view', masterData: 'none', crm: 'none', pallets: 'none' } }
    const actor = { user: { uid: 'followup-user' }, profile }
    await admin.doc('users/followup-user').set(profile)
    await admin.doc('users/other-user').set({ active: true, role: 'user', firstName: 'Other', lastName: 'User', permissions: { todos: 'edit' } })
    const users = new Map([['other-user', { id: 'other-user', firstName: 'Other', lastName: 'User', active: true }]])
    const source = admin.doc('businessPartners/followup-source')
    const target = admin.doc('businessPartners/followup-target')
    const base = (id, name, debtor, creditor) => ({ id, companyName: name, status: 'active', debtorNumber: debtor, creditorNumber: creditor, dycosReferences: { debtorNumbers: [debtor], creditorNumbers: [creditor] }, businessPartnerRoles: ['customer', 'carrier'] })
    await source.set(base(source.id, 'Source historical', '10001', '70001'))
    await target.set(base(target.id, 'Target historical', '10002', '70002'))
    await admin.doc('businessPartners/followup-other').set({ companyName: 'Explicit other', businessPartnerRoles: ['customer'], status: 'active' })
    await admin.doc('transportOrders/selected-order').set({ externalNumber: 'NEW-TA' })
    await admin.doc('transportOrders/origin-order').set({ externalNumber: 'ORIGIN-TA', imported: { customer: { partnerId: target.id, name: 'Target historical' }, carrier: { partnerId: source.id, originalName: 'Carrier order historical' } } })
    const context = { userId: 'operator', name: 'Local Merge' }
    const sourceSnapshot = await source.get(), targetSnapshot = await target.get()
    const comparison = mergeComparison({ partners: [sourceSnapshot.data(), targetSnapshot.data()] }, target.id)
    const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([key, choice]) => [key, { ...choice, resolution: key === 'companyName' ? 'source' : choice.resolution || 'target' }]))
    const merge = await performPartnerMerge({ db: admin, sourceId: source.id, targetId: target.id, partnerVersions: { [source.id]: sourceSnapshot.updateTime.toMillis(), [target.id]: targetSnapshot.updateTime.toMillis() }, decisions, actor: context })
    assert.equal((await target.get()).get('companyName'), 'Source historical')
    const bindings = [
      { field: 'damageCaseId', id: 'damage-followup', values: { customerId: target.id, customerName: 'Target historical', carrierId: source.id, carrierName: 'Source historical', reference: 'Old reference' } },
      { field: 'inkassoCaseId', id: 'inkasso-followup', values: { customerId: target.id, customerName: 'Target historical' } },
      { field: 'insolvencyId', id: 'insolvency-followup', values: { carrierId: source.id, carrierName: 'Source historical' } },
      { field: 'legalDisputeId', id: 'legal-followup', values: { customerId: target.id, customerName: 'Target historical' } },
    ]
    await admin.doc('damageCases/damage-followup').set({ claimantPartnerId: target.id, claimant: 'Target historical', contractorPartnerId: source.id, contractor: 'Source historical' })
    await admin.doc('inkassoCases/inkasso-followup').set({ debtorPartnerId: target.id, debtorName: 'Target historical', debtorPartnerRole: 'customer' })
    await admin.doc('insolvencies/insolvency-followup').set({ partnerId: source.id, partnerName: 'Source historical' })
    await admin.doc('legalDisputes/legal-followup').set({ counterpartyPartnerId: target.id, counterparty: 'Target historical', counterpartyPartnerRole: 'customer' })
    const created = []
    const values = (binding, patch = {}) => linkedTodoSubmission({ ...service.createEmptyTodo(), ...binding.values, title: `Follow-up ${binding.field}`, ...patch }, binding)
    await t.test('all four source cases create and reload without master-data read access', async () => {
      await assert.rejects(firestore.getDoc(firestore.doc(db, source.path)), { code: 'permission-denied' })
      for (const binding of bindings) {
        const id = await service.createTodo(values(binding), actor, users)
        created.push(id)
        const saved = await service.getTodoById(id)
        assert.equal(saved[binding.field], binding.id)
        for (const key of ['customerId', 'carrierId', 'customerName', 'carrierName']) if (binding.values[key]) assert.equal(saved[key], binding.values[key])
        assert.equal(saved.status, 'in_progress')
        assert.equal(saved.assignedUserId, actor.user.uid)
        assert.equal((await service.listTodoUpdates(id)).length, 1)
      }
    })
    await t.test('actual TA follow-up keeps both historical partner names with self assignment and system history', async () => {
      const id = await service.createTodo({ ...service.createEmptyTodo(), title: 'Follow-up from TA', customerId: target.id, customerName: 'Target historical', carrierId: source.id, carrierName: 'Carrier order historical', reference: 'ORIGIN-TA', transportOrderLinks: [{ id: 'origin-order', number: 'ORIGIN-TA' }] }, actor, users)
      const saved = await service.getTodoById(id)
      assert.equal(saved.customerId, target.id)
      assert.equal(saved.customerName, 'Target historical')
      assert.equal(saved.carrierId, source.id)
      assert.equal(saved.carrierName, 'Carrier order historical')
      assert.deepEqual(saved.transportOrderLinks, [{ id: 'origin-order', number: 'ORIGIN-TA' }])
      assert.equal(saved.assignedUserId, actor.user.uid)
      assert.equal(saved.status, 'in_progress')
      assert.equal((await service.listTodoUpdates(id)).length, 1)
    })
    await t.test('explicit changed/unlinked partners, references, TA selection and audience reach actual storage', async () => {
      const changed = values(bindings[0], { customerId: 'followup-other', customerName: 'Explicit other', carrierId: '', carrierName: '', reference: 'Edited reference', transportOrderLinks: [{ id: 'selected-order', number: 'NEW-TA' }], audienceType: 'people', audienceIds: ['other-user'], damageCaseId: 'wrong-case', dueDate: '2026-11-20', reminderDate: '2026-11-19', reminderTime: '09:00', priority: 'high' })
      const id = await service.createTodo(changed, actor, users)
      const saved = await service.getTodoById(id)
      assert.equal(saved.damageCaseId, bindings[0].id)
      assert.equal(saved.customerId, 'followup-other')
      assert.equal(saved.carrierId, null)
      assert.equal(saved.carrierName, null)
      assert.equal(saved.reference, 'Edited reference')
      assert.deepEqual(saved.transportOrderLinks, changed.transportOrderLinks)
      assert.equal(saved.audienceType, 'people')
      assert.deepEqual(saved.audienceIds, ['other-user'])
      assert.equal(saved.status, 'open')
      assert.equal(saved.assignedUserId, null)
      assert.equal(saved.dueDate, '2026-11-20')
      assert.equal(saved.reminderDate, '2026-11-19')
      assert.equal(saved.reminderTime, '09:00')
      assert.equal(saved.priority, 'high')
      const empty = await service.createTodo(values(bindings[0], { customerId: '', customerName: '', carrierId: '', carrierName: '', audienceType: 'department', audienceId: 'Disposition' }), actor, users)
      assert.equal((await service.getTodoById(empty)).customerId, null)
      assert.equal((await service.getTodoById(empty)).audienceType, 'department')
    })
    await t.test('splitting changes effective ownership without modifying new todo origins; editing and completion still work', async () => {
      const preview = await loadMergeReversal(admin, merge.mergeId, target.id)
      assert.equal(preview.canSeparate, true)
      await performPartnerMergeReversal({ db: admin, mergeId: merge.mergeId, targetPartnerId: target.id, fingerprint: preview.fingerprint, actor: context })
      for (const id of created) {
        const saved = await service.getTodoById(id)
        assert.notEqual(saved.customerId, source.id)
        if (saved.carrierId) assert.equal(saved.carrierId, source.id)
      }
      const todo = await service.getTodoById(created[0])
      await service.updateTodoByCreator(todo, values(bindings[0], { title: 'Edited after split', description: 'Follow-up details' }), users, false, actor)
      await service.addTodoNote(todo.id, 'New note after split', actor)
      await service.completeTodoForCurrentUser(todo.id, actor)
      assert.equal((await service.getTodoById(todo.id)).status, 'completed')
      await service.reactivateTodoForCurrentUser(todo.id, actor)
      assert.equal((await service.getTodoById(todo.id)).status, 'in_progress')
      const visible = await service.listTodosForActor(actor)
      assert.ok(visible.some((entry) => entry.id === todo.id))
      assert.ok((await service.listTodoUpdates(todo.id)).length >= 5)
      const after = await service.createTodo(values(bindings[0], { audienceType: 'all' }), actor, users)
      const saved = await service.getTodoById(after)
      assert.equal(saved.damageCaseId, bindings[0].id)
      assert.equal(saved.carrierId, source.id)
      assert.equal(saved.audienceType, 'all')
    })
    await t.test('forged historical names fail atomically, without creating a task or history', async () => {
      const before = await admin.collection('todos').get()
      await assert.rejects(service.createTodo(values(bindings[0], { customerName: 'Forged historical name' }), actor, users), { code: 'permission-denied' })
      assert.equal((await admin.collection('todos').get()).size, before.size)
    })
  } finally {
    await firestore.terminate(db)
    await deleteApp(app)
    await admin.terminate()
    await deleteAdminApp(adminApp)
  }
})
