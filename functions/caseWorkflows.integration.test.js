import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setLogLevel, terminate } from 'firebase/firestore'
import { listCaseReminderUsersHandler, setReminderResponsibilityHandler } from './reminderAdmin.js'
import { createInkassoCase as createInkassoCallable } from './inkassoCases.js'

// Exercise the actual browser persistence functions and exact repository rules.
// Only Firebase initialization and the callable transport are replaced: callable
// requests execute the real server handler against the same local database.
test('real case services: linked creation, self/other responsibility and enabled deadlines in all four modules', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/)
  // Windows can reuse a recent process ID while the emulator still retains
  // that run's data. Give every execution an independent project namespace.
  const projectId = `demo-cases-${randomUUID().replaceAll('-', '').slice(0, 16)}`
  const hostAddress = process.env.FIRESTORE_EMULATOR_HOST
  const response = await fetch(`http://${hostAddress}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }] } }),
  })
  assert.equal(response.status, 200, await response.text())
  const adminApp = initializeAdminApp({ projectId })
  const admin = getAdminFirestore(adminApp)
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, projectId)
  const db = getFirestore(app)
  const [host, port] = hostAddress.split(':')
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: 'editor' } })
  setLogLevel('silent')
  const modules = ['damages', 'inkasso', 'legalDisputes', 'insolvencies']
  const permissions = Object.fromEntries(modules.map((module) => [module, 'edit']))
  const profile = { active: true, role: 'user', firstName: 'Test', lastName: 'Editor', email: 'editor@example.invalid', permissions: { ...permissions, masterData: 'none', transportOrders: 'view' } }
  const actor = { user: { uid: 'editor', email: profile.email }, profile }
  const request = (data, uid = 'editor') => ({ auth: { uid }, data })
  const partner = (companyName, businessPartnerRoles) => ({ companyName, businessPartnerRoles, status: 'active' })
  await admin.doc('users/editor').set(profile)
  await admin.doc('users/recipient').set({ ...profile, firstName: 'Other', lastName: 'Employee', email: 'recipient@example.invalid', permissions: Object.fromEntries(modules.map((module) => [module, 'view'])) })
  await admin.doc('users/disabled').set({ ...profile, active: false })
  await admin.doc('users/wrong-module').set({ ...profile, permissions: { transportOrders: 'view' } })
  await admin.doc('businessPartners/customer').set(partner('Test Customer', ['customer']))
  await admin.doc('businessPartners/carrier').set(partner('Test Carrier', ['carrier']))
  await admin.doc('businessPartners/insolvent').set(partner('Test Insolvent', ['customer', 'carrier']))
  await admin.doc('transportOrders/order').set({ externalNumber: '261100028', imported: { customer: { partnerId: 'customer', name: 'Test Customer' }, carrier: { partnerId: 'carrier', originalName: 'Test Carrier' } } })
  globalThis.__caseWorkflowDb = db
  globalThis.__caseWorkflowCallable = async (name, data) => {
    assert.equal(name, 'createInkassoCase')
    return { data: await createInkassoCallable.run(request(data)) }
  }
  const bootstrap = 'data:text/javascript,' + encodeURIComponent('export const db=globalThis.__caseWorkflowDb; export const auth={currentUser:null}; export const functions={}; export const waitForAppCheckToken=async()=>{}')
  const callableBootstrap = 'data:text/javascript,' + encodeURIComponent('export const httpsCallable=(_functions,name)=>data=>globalThis.__caseWorkflowCallable(name,data)')
  const hooks = registerHooks({ resolve(specifier, context, next) {
    const result = next(specifier, context)
    if (result.url.endsWith('/src/lib/firebase.js')) return { url: bootstrap, shortCircuit: true }
    if (specifier === 'firebase/functions' && context.parentURL?.includes('/src/lib/')) return { url: callableBootstrap, shortCircuit: true }
    return result
  } })
  try {
    const damage = await import('../src/lib/damages.js')
    const legal = await import('../src/lib/legalDisputes.js')
    const inkasso = await import('../src/lib/inkasso.js')
    const insolvency = await import('../src/lib/insolvencies.js')
    const links = await import('../src/lib/caseTransportLinks.js')
    hooks.deregister()
    const users = new Map([['editor', { id: 'editor', ...profile }], ['recipient', { id: 'recipient', firstName: 'Other', lastName: 'Employee' }]])
    const linkOptions = { transportOrderIds: ['order'] }
    const definitions = [
      { module: 'damages', root: 'damageCases', type: 'damage', create: (changes = {}) => damage.createDamageCase({ ...damage.createEmptyDamageCase(), damageDate: '2026-11-11', damageType: 'Bruchschaden', damageAmount: 100, claimantPartnerId: 'customer', claimant: 'Test Customer', contractorPartnerId: 'carrier', contractor: 'Test Carrier', responsibleUserId: 'editor', ...changes }, actor, users, linkOptions), deadline: damage.createDamageCaseDeadline },
      { module: 'inkasso', root: 'inkassoCases', type: 'inkasso', create: () => inkasso.createInkassoCase({ debtorPartnerId: 'carrier', debtorPartnerRole: 'carrier', description: 'Synthetic case', invoices: [{ invoiceNumber: 'TEST-1', netAmount: '100', vatAmount: '19' }] }, linkOptions), deadline: inkasso.createInkassoCaseDeadline },
      { module: 'legalDisputes', root: 'legalDisputes', type: 'legalDispute', create: () => legal.createLegalDispute({ ...legal.createEmptyLegalDispute(), transportReference: '261100028', counterpartyPartnerId: 'carrier', counterpartyPartnerRole: 'carrier', counterparty: 'Test Carrier', counterpartySourceTransportOrderId: 'order' }, actor, linkOptions), deadline: legal.createLegalDisputeDeadline },
      { module: 'insolvencies', root: 'insolvencies', type: 'insolvency', create: () => insolvency.createInsolvency({ ...insolvency.createEmptyInsolvency(), insolvencyDate: '2026-11-11', courtReference: 'TEST-REF' }, { id: 'insolvent', companyName: 'Test Insolvent' }, actor, linkOptions), deadline: insolvency.createInsolvencyDeadline },
    ]
    for (const definition of definitions) await t.test(`${definition.module}: actual create + TA link + responsibility + reminder`, async () => {
      assert.equal((await admin.collection(definition.root).get()).size, 0, 'Each module starts without cases in this isolated test project')
      for (const deniedProfile of [
        { ...profile, active: false },
        { ...profile, permissions: { ...profile.permissions, [definition.module]: 'view' } },
        { ...profile, permissions: { ...profile.permissions, [definition.module]: 'none' } },
        { ...profile, permissions: { ...profile.permissions, transportOrders: 'none' } },
      ]) {
        await admin.doc('users/editor').set(deniedProfile)
        try { await assert.rejects(definition.create(), { code: 'permission-denied' }) }
        finally { await admin.doc('users/editor').set(profile) }
        assert.equal((await admin.collection(definition.root).get()).size, 0)
      }
      if (definition.module === 'damages') {
        for (const changes of [
          { claimant: 'Forged customer name' }, { contractor: 'Forged carrier name' },
          { claimantPartnerId: 'carrier', claimant: 'Test Carrier' },
          { contractorPartnerId: 'customer', contractor: 'Test Customer' },
          { claimantPartnerId: 'missing', claimant: 'Missing partner' },
          { responsibleUserId: 'disabled', responsibleUserName: 'Test Editor' },
        ]) await assert.rejects(definition.create(changes), { code: 'permission-denied' })
        assert.equal((await admin.collection(definition.root).get()).size, 0)
        const assignedId = await definition.create({ responsibleUserId: 'recipient' })
        assert.equal((await admin.doc(definition.root + '/' + assignedId).get()).get('responsibleUserId'), 'recipient')
        for (const [customerRole, carrierRole] of [
          [{ businessPartnerRoles: 'kunde' }, { partnerRoles: { unternehmer: true } }],
          [{ debtorNumber: '10001' }, { creditorNumber: '20001' }],
          [{ dycosReferences: { debtorNumbers: ['10001'] } }, { dycosReferences: { creditorNumbers: ['20001'] } }],
          [{ partnerRoles: ['customer'] }, { taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }],
        ]) {
          await admin.doc('businessPartners/customer').set({ companyName: 'Test Customer', status: 'active', ...customerRole })
          await admin.doc('businessPartners/carrier').set({ companyName: 'Test Carrier', status: 'active', ...carrierRole })
          await assert.doesNotReject(definition.create({ responsibleUserId: 'recipient' }), JSON.stringify([customerRole, carrierRole]))
        }
        await admin.doc('businessPartners/customer').set(partner('Test Customer', ['customer']))
        await admin.doc('businessPartners/carrier').set(partner('Test Carrier', ['carrier']))
      }
      const id = await definition.create()
      const path = `${definition.root}/${id}`
      const created = await getDoc(doc(db, path))
      assert.equal(created.exists(), true)
      const linkPath = `caseTransportOrderLinks/${definition.type}|${id}|order`
      assert.equal((await admin.doc(linkPath).get()).exists, true)
      const options = await listCaseReminderUsersHandler(request({ parentPath: path }))
      assert(options.users.some((entry) => entry.id === 'recipient'))
      assert(!options.users.some((entry) => ['disabled', 'wrong-module'].includes(entry.id)))
      const originalResponsible = created.get('responsibleUserId') || null
      await setReminderResponsibilityHandler(request({ parentPath: path, userId: 'editor', expectedUserId: originalResponsible }))
      await setReminderResponsibilityHandler(request({ parentPath: path, userId: 'recipient', expectedUserId: 'editor' }))
      const entry = { id, ...(await getDoc(doc(db, path))).data() }
      assert.equal(entry.responsibleUserId, 'recipient')
      if (definition.module === 'damages') await damage.updateDamageCaseFields(entry, { responsibleUserId: 'recipient', description: 'Synthetic populated damage', legalBasis: 'cmr', cargoWeightKg: 250, liabilityLimit: 1000, insuranceRelevance: 'yes', bplInsuranceCaseNumber: 'INS-TEST', contractorInsurance: 'Synthetic insurance', contractorInsuranceCaseNumber: 'C-TEST', customerInsurance: 'Customer insurance', customerInsuranceNumber: 'U-TEST', contractorLiability: 'open' }, actor, users)
      await definition.deadline(entry, { date: '2026-12-01', time: '09:30', reminderEnabled: true, reminderOccurrence: null, note: 'Synthetic reminder', type: 'deadline' }, actor)
      const deadlines = await admin.collection(`${path}/deadlines`).get()
      assert.equal(deadlines.size, 1)
      assert.equal(deadlines.docs[0].get('reminderEnabled'), true)
      assert.equal(deadlines.docs[0].get('time'), '09:30')
      assert.equal(deadlines.docs[0].get('reminderRecipientEmail'), undefined)
      for (const userId of ['disabled', 'wrong-module']) await assert.rejects(setReminderResponsibilityHandler(request({ parentPath: path, userId, expectedUserId: 'recipient' })), { code: 'failed-precondition' })
      await assert.rejects(setReminderResponsibilityHandler(request({ parentPath: path, userId: 'editor', expectedUserId: 'recipient' }, 'recipient')), { code: 'permission-denied' })
      await assert.rejects(setReminderResponsibilityHandler(request({ parentPath: path, userId: 'editor', expectedUserId: null })), { code: 'aborted' })
      assert.equal((await admin.doc(path).get()).get('responsibleUserId'), 'recipient')
      await links.unlinkTransportOrderFromCase({ caseType: definition.type, caseId: id, transportOrderId: 'order' })
      assert.equal((await admin.doc(linkPath).get()).exists, false)
      await links.linkTransportOrderToCase({ caseType: definition.type, caseId: id, transportOrderId: 'order', actor })
      assert.equal((await admin.doc(linkPath).get()).exists, true)
    })
  } finally {
    hooks.deregister()
    delete globalThis.__caseWorkflowDb
    delete globalThis.__caseWorkflowCallable
    await terminate(db)
    await Promise.all([deleteApp(app), deleteAdminApp(adminApp)])
  }
})
