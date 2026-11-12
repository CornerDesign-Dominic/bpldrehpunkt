import assert from 'node:assert/strict'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, setLogLevel, terminate, writeBatch } from 'firebase/firestore'
import { mergeComparison } from './partnerMergeDecisions.js'
import { loadMergeReversal, performPartnerMerge, performPartnerMergeReversal } from './partnerMerges.js'

test('new follow-up todos preserve proven case origins after rename, merge and separation without master-data access', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const projectId = `${process.env.GCLOUD_PROJECT || 'demo-drehpunkt-linked-todos'}-${randomUUID().slice(0, 12)}-origins`
  assert.ok(projectId.startsWith('demo-'), 'A real project must never be used')
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  assert.ok(['127.0.0.1', 'localhost'].includes(host), 'Only a local emulator is allowed')
  const rulesResponse = await fetch(`http://${host}:${port}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }] } }),
  })
  assert.equal(rulesResponse.status, 200, await rulesResponse.text())
  const adminApp = initializeAdminApp({ projectId }, `todo-origins-admin-${Date.now()}`)
  const admin = getAdminFirestore(adminApp)
  const clients = []
  const casePermissions = { damages: 'view', inkasso: 'view', insolvencies: 'view', legalDisputes: 'view' }
  const profiles = [
    { id: 'todo-origin-editor', active: true, role: 'user', permissions: { todos: 'edit', masterData: 'none', transportOrders: 'view', ...casePermissions } },
    { id: 'todo-origin-no-cases', active: true, role: 'user', permissions: { todos: 'edit', masterData: 'none' } },
    { id: 'todo-origin-viewer', active: true, role: 'user', permissions: { todos: 'view', ...casePermissions } },
    { id: 'todo-origin-disabled', active: false, role: 'superadmin', permissions: {} },
    { id: 'todo-origin-no-order', active: true, role: 'user', permissions: { todos: 'edit', ...casePermissions, transportOrders: 'none' } },
    { id: 'todo-origin-missing-profile', active: true, role: 'user', permissions: { todos: 'edit', ...casePermissions }, skipSeed: true },
  ]
  setLogLevel('silent')
  let sequence = 0
  try {
    for (const profile of profiles) {
      if (!profile.skipSeed) await admin.doc(`users/${profile.id}`).set({ ...profile, firstName: 'Origins', lastName: 'Test' })
      const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `${profile.id}-${Date.now()}`)
      const db = getFirestore(app)
      connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: profile.id } })
      clients.push({ app, db, profile })
    }
    const editor = clients[0]
    const partner = (id, companyName, debtorNumber, creditorNumber) => ({ id, companyName, status: 'active', debtorNumber, creditorNumber, dycosReferences: { debtorNumbers: [debtorNumber], creditorNumbers: [creditorNumber] }, businessPartnerRoles: ['customer', 'carrier'] })
    const target = admin.doc('businessPartners/todo-origin-target')
    const source = admin.doc('businessPartners/todo-origin-source')
    await Promise.all([
      target.set(partner(target.id, 'Before target', '11001', '21001')),
      source.set(partner(source.id, 'Before source', '11002', '21002')),
      admin.doc('businessPartners/todo-origin-customer-only').set({ companyName: 'Customer only', businessPartnerRoles: ['customer'] }),
      admin.doc('damageCases/todo-origin-damage').set({ claimantPartnerId: target.id, claimant: 'Before target', contractorPartnerId: source.id, contractor: 'Before source' }),
      admin.doc('inkassoCases/todo-origin-inkasso-customer').set({ debtorPartnerId: target.id, debtorPartnerRole: 'customer', debtorName: 'Before target' }),
      admin.doc('inkassoCases/todo-origin-inkasso-carrier').set({ debtorPartnerId: source.id, debtorPartnerRole: 'carrier', debtorName: 'Before source' }),
      admin.doc('inkassoCases/todo-origin-inkasso-legacy').set({ debtorPartnerId: source.id, debtorName: 'Before source' }),
      admin.doc(`insolvencies/${source.id}`).set({ partnerId: source.id, partnerName: 'Before source' }),
      admin.doc('legalDisputes/todo-origin-legal-customer').set({ counterpartyPartnerId: source.id, counterpartyPartnerRole: 'customer', counterparty: 'Before source' }),
      admin.doc('legalDisputes/todo-origin-legal-carrier').set({ counterpartyPartnerId: source.id, counterpartyPartnerRole: 'carrier', counterparty: 'Before source' }),
      admin.doc('transportOrders/todo-origin-order').set({ externalNumber: 'TA-ORIGIN', imported: { customer: { partnerId: target.id, name: 'Before target', partnerName: 'Historic customer alias' }, carrier: { partnerId: source.id, originalName: 'Before source', partnerName: 'Historic carrier alias' } } }),
    ])
    const defaults = { title: 'Follow-up', description: '', dueDate: null, priority: 'medium', reminderDate: null, customerId: null, customerName: null, carrierId: null, carrierName: null, reference: null, transportOrderId: null, transportOrderNumber: null, transportOrderLinks: [], damageCaseId: null, insolvencyId: null, inkassoCaseId: null, legalDisputeId: null }
    async function create(values, client = editor, audience = 'all', unsafe = {}, omittedFields = []) {
      const id = `todo-origin-created-${++sequence}`
      const self = audience === 'self'
      const selection = self ? { audienceType: 'person', audienceId: client.profile.id, audienceIds: null, audienceLabel: 'Origins Test' }
        : audience === 'person' ? { audienceType: 'person', audienceId: profiles[1].id, audienceIds: null, audienceLabel: 'Origins Test' }
          : audience === 'department' ? { audienceType: 'department', audienceId: 'Disposition', audienceIds: null, audienceLabel: 'Abteilung: Disposition' }
          : audience === 'people' ? { audienceType: 'people', audienceId: null, audienceIds: [profiles[1].id], audienceLabel: 'Personen: Origins Test' }
            : { audienceType: 'all', audienceId: null, audienceIds: null, audienceLabel: 'Alle' }
      const batch = writeBatch(client.db)
      const payload = {
        ...defaults, ...values, creatorUserId: client.profile.id, creatorName: 'Origins Test', ...selection,
        assignedUserId: null, assignedUserName: null, assignedAt: null, status: 'open', completedAt: null, completedByUserId: null, completedByName: null, withdrawnAt: null, withdrawnByUserId: null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...unsafe,
      }
      for (const field of omittedFields) delete payload[field]
      batch.set(doc(client.db, `todos/${id}`), payload)
      batch.set(doc(client.db, `todos/${id}/updates/created`), { type: 'system', text: 'Origins Test hat die Aufgabe erstellt.', createdByUserId: client.profile.id, createdByName: 'Origins Test', createdAt: serverTimestamp() })
      try { await batch.commit() } catch (error) { throw Object.assign(new Error(`${error.message}\nSynthetic creation: ${JSON.stringify(values)}`, { cause: error }), { code: error.code }) }
      const saved = (await admin.doc(`todos/${id}`).get()).data()
      for (const [key, value] of Object.entries(values)) assert.deepEqual(saved[key], value, `preserved ${key}`)
      return id
    }
    const damage = { damageCaseId: 'todo-origin-damage', customerId: target.id, customerName: 'Before target', carrierId: source.id, carrierName: 'Before source' }
    const order = { transportOrderLinks: [{ id: 'todo-origin-order', number: 'TA-ORIGIN' }], customerId: target.id, customerName: 'Before target', carrierId: source.id, carrierName: 'Before source' }
    const origins = [
      damage,
      { inkassoCaseId: 'todo-origin-inkasso-customer', customerId: target.id, customerName: 'Before target' },
      { inkassoCaseId: 'todo-origin-inkasso-carrier', carrierId: source.id, carrierName: 'Before source' },
      { inkassoCaseId: 'todo-origin-inkasso-legacy', carrierId: source.id, carrierName: 'Before source' },
      { insolvencyId: source.id, carrierId: source.id, carrierName: 'Before source' },
      { legalDisputeId: 'todo-origin-legal-customer', customerId: source.id, customerName: 'Before source' },
      { legalDisputeId: 'todo-origin-legal-carrier', carrierId: source.id, carrierName: 'Before source' },
      order,
    ]
    await t.test('all source modules and both roles retain exact IDs and snapshots before and after a real merge/split', async () => {
      for (const values of origins) await create(values)
      await source.update({ companyName: 'Updated source' })
      await create(damage)
      const [left, right] = await Promise.all([target.get(), source.get()])
      const comparison = mergeComparison({ partners: [{ ...left.data(), id: target.id }, { ...right.data(), id: source.id }] }, target.id)
      const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([key, choice]) => [key, key === 'companyName' ? { resolution: 'source', value: right.get('companyName') } : choice.resolution ? choice : { ...choice, resolution: 'target' }]))
      const actor = { userId: editor.profile.id, name: 'Origins Test' }
      const merged = await performPartnerMerge({ db: admin, targetId: target.id, sourceId: source.id, partnerVersions: { [target.id]: left.updateTime.toMillis(), [source.id]: right.updateTime.toMillis() }, decisions, actor })
      assert.equal((await target.get()).get('companyName'), 'Updated source')
      assert.equal((await source.get()).get('mergedIntoPartnerId'), target.id)
      for (const values of origins) await create(values)
      await assert.rejects(getDoc(doc(editor.db, target.path)), { code: 'permission-denied' })
      const preview = await loadMergeReversal(admin, merged.mergeId, target.id)
      assert.equal(preview.canSeparate, true)
      await performPartnerMergeReversal({ db: admin, mergeId: merged.mergeId, targetPartnerId: target.id, fingerprint: preview.fingerprint, actor })
      assert.equal((await source.get()).get('mergedIntoPartnerId'), undefined)
      for (const values of origins) await create(values)
    })
    await t.test('historical-name exceptions require source access and actual exact name, ID and role evidence', async () => {
      await target.update({ companyName: 'Renamed target again' })
      for (const values of [
        { ...damage, customerName: 'Forged' },
        { ...damage, customerId: source.id },
        { ...damage, damageCaseId: 'missing-case' },
        { ...damage, damageCaseId: '' },
        { ...damage, damageCaseId: null },
        { ...damage, damageCaseId: 'invalid/path' },
        { inkassoCaseId: 'todo-origin-inkasso-customer', carrierId: target.id, carrierName: 'Before target' },
        { inkassoCaseId: 'todo-origin-inkasso-legacy', customerId: source.id, customerName: 'Before source' },
        { legalDisputeId: 'todo-origin-legal-customer', carrierId: source.id, carrierName: 'Before source' },
        { legalDisputeId: 'todo-origin-legal-carrier', customerId: source.id, customerName: 'Before source' },
        { damageCaseId: 'todo-origin-damage', carrierId: 'todo-origin-customer-only', carrierName: 'Customer only' },
      ]) await assert.rejects(create(values), { code: 'permission-denied' })
      for (const client of [clients[1], clients[2], clients[3], clients[5]]) await assert.rejects(create(damage, client), { code: 'permission-denied' })
      await admin.doc('insolvencies/todo-origin-archived-shell').set({ partnerId: source.id, partnerName: 'Before source', mergedIntoPartnerId: target.id })
      await assert.rejects(create({ insolvencyId: 'todo-origin-archived-shell', carrierId: source.id, carrierName: 'Before source' }), { code: 'permission-denied' })
      await admin.doc('damageCases/todo-origin-hybrid').set({ claimantPartnerId: target.id, claimant: 'Before target' })
      await assert.rejects(create({ ...damage, damageCaseId: 'todo-origin-hybrid', inkassoCaseId: 'todo-origin-inkasso-legacy' }), { code: 'permission-denied' })
    })
    await t.test('TA inheritance is bounded to the exact readable first link and the imported role identity/name', async () => {
      await create(order)
      await create({ ...order, customerName: 'Historic customer alias', carrierName: 'Historic carrier alias' })
      for (const values of [
        { ...order, customerName: 'Forged TA name' },
        { ...order, customerId: source.id },
        { ...order, transportOrderLinks: [] },
        { ...order, transportOrderLinks: [{ id: 'missing-order', number: 'TA-MISSING' }, order.transportOrderLinks[0]] },
        { ...order, transportOrderLinks: [{ id: 'invalid/path' }] },
        { ...order, transportOrderLinks: ['todo-origin-order'] },
        { ...order, transportOrderLinks: null },
      ]) await assert.rejects(create(values), { code: 'permission-denied' })
      for (const client of clients.slice(1)) await assert.rejects(create(order, client), { code: 'permission-denied' })
    })
    await t.test('self, all, department and people assignments include the trusted creation history', async () => {
      for (const audience of ['self', 'all', 'department', 'people', 'person']) {
        const id = await create(damage, editor, audience)
        const saved = (await admin.doc(`todos/${id}`).get()).data()
        assert.equal(saved.assignedUserId, null)
        assert.equal(saved.status, 'open')
        assert.equal((await admin.doc(`todos/${id}/updates/created`).get()).get('type'), 'system')
      }
      await create(order, editor, 'self')
      for (const unsafe of [{ assignedUserName: 'Forged' }, { audienceLabel: 'Forged' }, { creatorName: 'Forged' }, { creatorUserId: profiles[1].id }]) {
        await assert.rejects(create(damage, editor, 'self', unsafe), { code: 'permission-denied' })
      }
      await admin.doc(`users/${profiles[1].id}`).update({ active: false })
      await assert.rejects(create(damage, editor, 'person'), { code: 'permission-denied' })
      await admin.doc(`users/${profiles[1].id}`).update({ active: true })
    })
    await t.test('view-only notes keep their existing audience boundary and cannot forge system history', async () => {
      const publicId = await create(damage)
      const privateId = await create(damage, editor, 'self')
      async function note(todoId, client, type = 'note') {
        const batch = writeBatch(client.db)
        batch.set(doc(client.db, `todos/${todoId}/updates/viewer-${++sequence}`), { type, text: 'Local view-only note', createdByUserId: client.profile.id, createdByName: 'Origins Test', createdAt: serverTimestamp() })
        await batch.commit()
      }
      await note(publicId, clients[2])
      await assert.rejects(note(publicId, clients[2], 'system'), { code: 'permission-denied' })
      await assert.rejects(note(privateId, clients[2]), { code: 'permission-denied' })
      await assert.rejects(note(publicId, clients[3]), { code: 'permission-denied' })
      await assert.rejects(note(publicId, editor, 'forged-type'), { code: 'permission-denied' })
    })
    await t.test('normal manual selections keep their strict name validation and readable current sources still work', async () => {
      for (const field of ['customerId', 'customerName', 'carrierId', 'carrierName']) {
        await assert.rejects(create({}, editor, 'all', {}, [field]), { code: 'permission-denied' })
      }
      await create({}, editor, 'all', {}, ['customerId', 'customerName', 'carrierId', 'carrierName'])
      await create({ customerId: target.id, customerName: 'Renamed target again' }, clients[1])
      await assert.rejects(create({ customerId: target.id, customerName: 'Before target' }, clients[1]), { code: 'permission-denied' })
      await create(damage)
      await create({ ...damage, transportOrderLinks: [{ id: 'missing-unrelated-order', number: 'Unavailable optional TA' }] })
      await create({ ...damage, transportOrderLinks: order.transportOrderLinks }, clients[4])
      await create({ ...damage, inkassoCaseId: 'todo-origin-inkasso-customer', insolvencyId: source.id, legalDisputeId: 'todo-origin-legal-carrier', transportOrderLinks: order.transportOrderLinks })
      await create({ ...damage, customerId: null, customerName: null, carrierId: null, carrierName: null })
      await create({ ...damage, customerId: 'todo-origin-customer-only', customerName: 'Customer only' })
      await admin.doc('businessPartners/todo-origin-manual-carrier').set({ companyName: 'Manual carrier', businessPartnerRoles: ['carrier'] })
      await create({ ...damage, carrierId: 'todo-origin-manual-carrier', carrierName: 'Manual carrier' })
      await admin.doc('businessPartners/todo-origin-role-only').set({ companyName: 'Current role-only name', businessPartnerRoles: ['customer', 'carrier'] })
      await admin.doc('damageCases/todo-origin-role-only').set({ claimantPartnerId: 'todo-origin-role-only', claimant: 'Historical role-only name', contractorPartnerId: 'todo-origin-role-only', contractor: 'Historical role-only name' })
      await create({ damageCaseId: 'todo-origin-role-only', customerId: 'todo-origin-role-only', customerName: 'Historical role-only name', carrierId: 'todo-origin-role-only', carrierName: 'Historical role-only name' })
      await admin.doc('transportOrders/todo-origin-role-only').set({ externalNumber: 'TA-ROLE-ONLY', imported: { customer: { partnerId: 'todo-origin-role-only', name: 'Historical role-only name' }, carrier: { partnerId: 'todo-origin-role-only', originalName: 'Historical role-only name' } } })
      await create({ transportOrderLinks: [{ id: 'todo-origin-role-only', number: 'TA-ROLE-ONLY' }], customerId: 'todo-origin-role-only', customerName: 'Historical role-only name', carrierId: 'todo-origin-role-only', carrierName: 'Historical role-only name' }, editor, 'self')
      const taRoleShapes = [
        [{ customer: true, carrier: true }, { customer: true, carrier: true }],
        [{ kunde: true, unternehmer: true }, { kunde: true, unternehmer: true }],
        ['customer', 'carrier'], ['kunde', 'unternehmer'],
      ]
      for (const [index, [customerRole, carrierRole]] of taRoleShapes.entries()) {
        const customerId = `todo-origin-ta-customer-${index}`
        const carrierId = `todo-origin-ta-carrier-${index}`
        await admin.doc(`businessPartners/${customerId}`).set({ companyName: 'Current TA customer', businessPartnerRoles: customerRole })
        await admin.doc(`businessPartners/${carrierId}`).set({ companyName: 'Current TA carrier', businessPartnerRoles: carrierRole })
        const orderId = `todo-origin-ta-role-shape-${index}`
        await admin.doc(`transportOrders/${orderId}`).set({ externalNumber: 'TA-ROLE-SHAPE', imported: { customer: { partnerId: customerId, name: 'Historical TA customer' }, carrier: { partnerId: carrierId, originalName: 'Historical TA carrier' } } })
        await create({ transportOrderLinks: [{ id: orderId, number: 'TA-ROLE-SHAPE' }], customerId, customerName: 'Historical TA customer', carrierId, carrierName: 'Historical TA carrier' }, editor, 'self')
      }

      const roleVariants = [
        ['customer', { debtorNumber: '123' }], ['carrier', { creditorNumber: '456' }],
        ['customer', { dycosReferences: { debtorNumbers: ['123'] } }], ['carrier', { dycosReferences: { creditorNumbers: ['456'] } }],
        ['customer', { partnerRoles: { kunde: true } }], ['carrier', { businessPartnerRoles: 'unternehmer' }],
        ['customer', { businessPartnerRoles: ['kunde'] }], ['carrier', { taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }],
      ]
      for (const [index, [role, facts]] of roleVariants.entries()) {
        const id = `todo-origin-variant-${index}`
        await admin.doc(`businessPartners/${id}`).set({ companyName: 'Current variant name', ...facts })
        await admin.doc(`legalDisputes/${id}`).set({ counterpartyPartnerId: id, counterpartyPartnerRole: role, counterparty: 'Historical variant name' })
        await create({ legalDisputeId: id, [`${role}Id`]: id, [`${role}Name`]: 'Historical variant name' })
      }
    })
  } finally {
    for (const { db, app } of clients) { await terminate(db); await deleteApp(app) }
    await admin.terminate()
    await deleteAdminApp(adminApp)
  }
})
