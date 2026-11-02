import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectFirestoreEmulator, deleteDoc, deleteField, doc, getFirestore, serverTimestamp, setDoc, setLogLevel, terminate, updateDoc, writeBatch } from 'firebase/firestore'
import { mergeComparison } from './partnerMergeDecisions.js'
import { loadMergeReversal, performPartnerMerge, performPartnerMergeReversal } from './partnerMerges.js'

test('partner references retain provenance and client writes cannot bypass merge management', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const projectId = `${process.env.GCLOUD_PROJECT || 'demo-drehpunkt-partner-references'}-references`
  assert.ok(projectId.startsWith('demo-'), 'This suite must never access a real project')
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  assert.ok(['127.0.0.1', 'localhost'].includes(host), 'Only a local emulator is allowed')
  const adminApp = initializeAdminApp({ projectId }, `partner-reference-admin-${Date.now()}`)
  const admin = getAdminFirestore(adminApp)
  const clients = []
  const permissions = { masterData: 'edit', partnerMerges: 'none', damages: 'edit', inkasso: 'edit', todos: 'edit', legalDisputes: 'edit', transportOrders: 'view' }
  const profiles = [
    { id: 'reference-editor', active: true, role: 'user', permissions },
    { id: 'reference-viewer', active: true, role: 'user', permissions: Object.fromEntries(Object.keys(permissions).map((key) => [key, 'view'])) },
    { id: 'reference-superadmin', active: true, role: 'superadmin', permissions: {} },
    { id: 'reference-disabled', active: false, role: 'superadmin', permissions: {} },
    { id: 'reference-no-orders', active: true, role: 'user', permissions: { ...permissions, transportOrders: 'none' } },
    { id: 'reference-case-only', active: true, role: 'user', permissions: { ...permissions, masterData: 'none' } },
  ]
  const metadata = () => ({ updatedAt: serverTimestamp(), updatedBy: profiles[0].id, updatedByName: 'Reference Test' })
  const audit = () => ({ createdAt: Timestamp.now(), createdBy: profiles[0].id, createdByName: 'Reference Test', updatedAt: Timestamp.now(), updatedBy: profiles[0].id, updatedByName: 'Reference Test' })
  const basePartner = (id, companyName, number) => ({ id, companyName, status: 'active', debtorNumber: number, creditorNumber: '', dycosReferences: { debtorNumbers: [number], creditorNumbers: [] }, businessPartnerRoles: ['customer', 'carrier'] })
  setLogLevel('silent')
  try {
    for (const profile of profiles) {
      await admin.doc(`users/${profile.id}`).set({ ...profile, firstName: 'Reference', lastName: 'Test' })
      const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `${profile.id}-${Date.now()}`)
      const db = getFirestore(app)
      connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: profile.id } })
      clients.push({ app, db, profile })
    }
    const editor = clients[0].db
    const target = admin.doc('businessPartners/reference-target')
    const source = admin.doc('businessPartners/reference-source')
    await target.set(basePartner(target.id, 'Target before merge', '50001'))
    await source.set(basePartner(source.id, 'Source name selected at merge', '50002'))
    await admin.doc('businessPartners/reference-customer-only').set({ companyName: 'Customer only', businessPartnerRoles: ['customer'], status: 'active' })

    await t.test('damage, Inkasso and todo remain editable through a real merge with rename and separation', async () => {
      const damage = {
        ...audit(), caseNumber: 'S-2026-9990', caseYear: '2026', caseSequence: 9990, status: 'new', damageDate: '2026-11-01', title: 'S-2026-9990 – 2026-11-01',
        description: null, transportReference: null, claimant: 'Target before merge', claimantPartnerId: target.id,
        contractor: 'Source name selected at merge', contractorPartnerId: source.id, responsibleUserId: null, responsibleUserName: null, damageAmount: 10, openBplRisk: null,
      }
      const inkassoNulls = ['description', 'debtorNumber', 'debtorContactName', 'debtorAddress', 'debtorEmail', 'debtorPhone', 'responsibleUserId', 'responsibleUserName', 'invoiceNumbers', 'invoiceDate', 'originalDueDate', 'lastReminderDate', 'lawFirm', 'lawyerReference', 'lawFirmContactName', 'lawFirmEmail', 'lawFirmPhone', 'lawyerHandoverDate', 'court', 'courtReference', 'paymentOrderDate', 'enforcementOrderDate', 'completedAt']
      const inkasso = { ...Object.fromEntries(inkassoNulls.map((key) => [key, null])), ...audit(), caseNumber: 'I-2026-9990', title: 'Historical title', status: 'open', isClosed: false, debtorName: 'Target before merge', debtorPartnerId: target.id, debtorPartnerRole: 'customer', titleAvailable: false }
      const todo = {
        title: 'Reference task', description: '', dueDate: null, customerId: target.id, customerName: 'Target before merge', carrierId: source.id, carrierName: 'Source name selected at merge',
        creatorUserId: profiles[0].id, creatorName: 'Reference Test', audienceType: 'all', audienceId: null, audienceLabel: 'Alle', assignedUserId: null, assignedUserName: null, assignedAt: null,
        status: 'open', completedAt: null, completedByUserId: null, completedByName: null, withdrawnAt: null, withdrawnByUserId: null, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      }
      await Promise.all([admin.doc('damageCases/reference-history').set(damage), admin.doc('inkassoCases/reference-history').set(inkasso), admin.doc('todos/reference-history').set(todo)])
      async function editAndCheck(phase) {
        await updateDoc(doc(editor, 'damageCases/reference-history'), { description: phase, ...metadata() })
        await updateDoc(doc(editor, 'inkassoCases/reference-history'), { description: phase, ...metadata() })
        await updateDoc(doc(editor, 'todos/reference-history'), { description: phase, updatedAt: serverTimestamp() })
        for (const [path, expected] of [
          ['damageCases/reference-history', { claimantPartnerId: target.id, claimant: damage.claimant, contractorPartnerId: source.id, contractor: damage.contractor }],
          ['inkassoCases/reference-history', { debtorPartnerId: target.id, debtorName: inkasso.debtorName, debtorPartnerRole: 'customer' }],
          ['todos/reference-history', { customerId: target.id, customerName: todo.customerName, carrierId: source.id, carrierName: todo.carrierName }],
        ]) {
          const saved = (await admin.doc(path).get()).data()
          assert.equal(saved.description, phase)
          for (const [key, value] of Object.entries(expected)) assert.equal(saved[key], value, `${phase}: ${path}.${key}`)
        }
      }
      await editAndCheck('Before merge')
      const [beforeTarget, beforeSource] = await Promise.all([target.get(), source.get()])
      const comparison = mergeComparison({ partners: [{ ...beforeTarget.data(), id: target.id }, { ...beforeSource.data(), id: source.id }] }, target.id)
      const decisions = Object.fromEntries(Object.entries(comparison.decisions).map(([key, value]) => [key, key === 'companyName' ? { resolution: 'source', value: beforeSource.get('companyName') } : value.resolution ? value : { ...value, resolution: 'target' }]))
      const actor = { userId: profiles[0].id, name: 'Reference Test' }
      const merged = await performPartnerMerge({ db: admin, targetId: target.id, sourceId: source.id, partnerVersions: { [target.id]: beforeTarget.updateTime.toMillis(), [source.id]: beforeSource.updateTime.toMillis() }, decisions, actor })
      assert.equal((await target.get()).get('companyName'), beforeSource.get('companyName'))
      assert.equal((await source.get()).get('mergedIntoPartnerId'), target.id)
      await editAndCheck('During merged target rename')
      for (const [path, patch] of [
        ['damageCases/reference-history', { claimant: 'Forged current name' }],
        ['damageCases/reference-history', { contractorPartnerId: 'reference-customer-only', contractor: 'Customer only' }],
        ['damageCases/reference-history', { claimantPartnerId: 'missing-partner', claimant: 'Missing' }],
        ['inkassoCases/reference-history', { debtorName: 'Forged current name' }],
        ['inkassoCases/reference-history', { debtorPartnerId: 'reference-customer-only', debtorName: 'Customer only', debtorPartnerRole: 'carrier' }],
      ]) await assert.rejects(updateDoc(doc(editor, path), { ...patch, ...metadata() }), { code: 'permission-denied' })
      await assert.rejects(updateDoc(doc(editor, 'todos/reference-history'), { customerName: 'Forged current name', updatedAt: serverTimestamp() }), { code: 'permission-denied' })
      await assert.rejects(updateDoc(doc(editor, 'todos/reference-history'), { carrierId: 'reference-customer-only', carrierName: 'Customer only', updatedAt: serverTimestamp() }), { code: 'permission-denied' })
      for (const { db } of [clients[1], clients[3]]) {
        for (const path of ['damageCases/reference-history', 'inkassoCases/reference-history']) await assert.rejects(updateDoc(doc(db, path), { description: 'Denied', ...metadata() }), { code: 'permission-denied' })
        await assert.rejects(updateDoc(doc(db, 'todos/reference-history'), { description: 'Denied', updatedAt: serverTimestamp() }), { code: 'permission-denied' })
      }
      const preview = await loadMergeReversal(admin, merged.mergeId, target.id)
      assert.equal(preview.canSeparate, true)
      await performPartnerMergeReversal({ db: admin, mergeId: merged.mergeId, targetPartnerId: target.id, fingerprint: preview.fingerprint, actor })
      assert.equal((await target.get()).get('companyName'), 'Target before merge')
      await editAndCheck('After separation')
      await updateDoc(doc(editor, source.path), { 'contact.email': 'reference@example.test' })
      assert.equal((await source.get()).get('contact.email'), 'reference@example.test')
      // An intentional valid new selection still changes a binding.
      await updateDoc(doc(editor, 'todos/reference-history'), { customerId: 'reference-customer-only', customerName: 'Customer only', updatedAt: serverTimestamp() })
      assert.equal((await admin.doc('todos/reference-history').get()).get('customerId'), 'reference-customer-only')
      const newTodo = { ...todo, customerName: 'Forged', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      await assert.rejects(setDoc(doc(editor, 'todos/new-invalid-reference'), newTodo), { code: 'permission-denied' })
    })

    await t.test('new legal cases retain an archived TA origin only with matching role and actual case relation', async () => {
      const originalId = 'reference-legal-origin'
      await admin.doc(`businessPartners/${originalId}`).set({ companyName: 'Archived origin', status: 'merged', mergedIntoPartnerId: target.id, businessPartnerRoles: ['customer', 'carrier'] })
      await admin.doc('transportOrders/reference-legal-order').set({ externalNumber: 'TA-ORIGIN', imported: { customer: { partnerId: originalId } } })
      await admin.doc('transportOrders/reference-wrong-order').set({ imported: { customer: { partnerId: target.id } } })
      const nullFields = ['description', 'caseType', 'participant', 'opposingCounsel', 'responsibleUserId', 'responsibleUserName', 'lawFirm', 'ownCounsel', 'lawyerReference', 'lawyerPhone', 'lawyerEmail', 'court', 'courtReference', 'judgeOrChamber', 'nextDeadline', 'nextDeadlineLabel', 'nextHearing', 'nextHearingTime', 'procedureType', 'proceedingStage', 'instance', 'startedAt', 'completedAt', 'originalClaim', 'counterClaim', 'amountInDispute', 'paidAmount', 'openAmount', 'legalFees', 'courtCosts', 'otherCosts']
      let sequence = 0
      async function create({ db = editor, changes = {}, linkOrder = 'reference-legal-order', withLink = true, wrongCase = false } = {}) {
        sequence += 1
        const uid = clients.find((client) => client.db === db).profile.id
        const caseNumber = `G-2099-${String(sequence).padStart(4, '0')}`
        await admin.doc('legalDisputeCaseCounters/2099').set({ year: '2099', nextNumber: sequence - 1 })
        const batch = writeBatch(db)
        batch.update(doc(db, 'legalDisputeCaseCounters/2099'), { year: '2099', nextNumber: sequence, updatedAt: serverTimestamp() })
        batch.set(doc(db, `legalDisputes/${caseNumber}`), {
          ...Object.fromEntries(nullFields.map((key) => [key, null])), caseNumber, caseYear: '2099', caseSequence: sequence, status: 'open', isClosed: false,
          title: `${caseNumber} – TA-ORIGIN – Archived origin`, transportReference: 'TA-ORIGIN', counterparty: 'Archived origin', counterpartyPartnerId: originalId, counterpartyPartnerRole: 'customer', counterpartySourceTransportOrderId: 'reference-legal-order',
          createdAt: serverTimestamp(), createdBy: uid, createdByName: 'Reference Test', updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: 'Reference Test', ...changes,
        })
        batch.set(doc(db, `legalDisputes/${caseNumber}/updates/created`), { type: 'system', text: 'Fall angelegt', createdAt: serverTimestamp(), createdByUserId: uid, createdByName: 'Reference Test' })
        if (withLink) {
          const caseId = wrongCase ? 'unrelated-case' : caseNumber
          batch.set(doc(db, `caseTransportOrderLinks/legalDispute|${caseId}|${linkOrder}`), { caseType: 'legalDispute', caseId, transportOrderId: linkOrder, createdAt: serverTimestamp(), createdByUserId: uid, createdByName: 'Reference Test' })
        }
        await batch.commit()
        return caseNumber
      }
      for (const options of [
        { withLink: false },
        { wrongCase: true },
        { changes: { counterpartySourceTransportOrderId: 'missing-order' }, linkOrder: 'missing-order' },
        { changes: { counterpartySourceTransportOrderId: 'reference-wrong-order' }, linkOrder: 'reference-wrong-order' },
        { changes: { counterpartyPartnerRole: 'carrier' } },
        { changes: { counterpartyPartnerId: 'missing-partner' } },
        { changes: { counterpartySourceTransportOrderId: null } },
        { db: clients[1].db }, { db: clients[3].db }, { db: clients[4].db },
      ]) await assert.rejects(create(options), { code: 'permission-denied' })
      const caseNumber = await create()
      assert.equal((await admin.doc(`legalDisputes/${caseNumber}`).get()).get('counterpartyPartnerId'), originalId)
      assert.equal((await admin.doc(`legalDisputes/${caseNumber}/updates/created`).get()).exists, true)
      const caseOnlyNumber = await create({ db: clients[5].db })
      assert.equal((await admin.doc(`legalDisputes/${caseOnlyNumber}`).get()).get('counterpartyPartnerId'), originalId)
      await admin.doc(`businessPartners/${originalId}`).update({ companyName: 'Later archived name' })
      await updateDoc(doc(editor, `legalDisputes/${caseNumber}`), { description: 'Historical origin remains editable', ...metadata() })
      const saved = (await admin.doc(`legalDisputes/${caseNumber}`).get()).data()
      assert.equal(saved.counterpartyPartnerId, originalId)
      assert.equal(saved.counterparty, 'Archived origin')
      await assert.rejects(updateDoc(doc(editor, `legalDisputes/${caseNumber}`), { counterpartySourceTransportOrderId: 'reference-wrong-order', ...metadata() }), { code: 'permission-denied' })
    })

    await t.test('technical merge fields, forged merge history and partner deletion are server-only even for superadmins', async () => {
      const fields = ['mergedIntoPartnerId', 'mergedIntoPartnerName', 'mergedByMergeId', 'mergedAt', 'mergedBy', 'statusBeforeMerge', 'latestMergeId', 'lastSeparatedMergeId', 'separatedAt']
      await admin.doc('businessPartners/reference-plain').set({ companyName: 'Plain', status: 'active' })
      const plain = 'businessPartners/reference-plain'
      for (const { db, profile } of [clients[0], clients[2]]) {
        for (const field of fields) {
          await assert.rejects(updateDoc(doc(db, plain), { [field]: 'forged' }), { code: 'permission-denied' })
          await assert.rejects(setDoc(doc(db, `businessPartners/forged-${profile.id}-${field}`), { companyName: 'Forged', [field]: null }), { code: 'permission-denied' })
          const existing = `businessPartners/existing-${profile.id}-${field}`
          await admin.doc(existing).set({ companyName: 'Existing server metadata', status: 'active', [field]: 'server-value' })
          await assert.rejects(updateDoc(doc(db, existing), { [field]: deleteField() }), { code: 'permission-denied' })
          await assert.rejects(updateDoc(doc(db, existing), { [field]: 'changed' }), { code: 'permission-denied' })
        }
        await assert.rejects(updateDoc(doc(db, plain), { status: 'merged' }), { code: 'permission-denied' })
        await assert.rejects(setDoc(doc(db, `businessPartners/forged-merged-${profile.id}`), { companyName: 'Forged', status: 'merged' }), { code: 'permission-denied' })
        for (const path of [plain, target.path, 'businessPartners/reference-legal-origin']) await assert.rejects(deleteDoc(doc(db, path)), { code: 'permission-denied' })
        for (const payload of [{ category: 'merge' }, { action: 'merged' }, { action: 'mergedInto' }, { action: 'separated' }, { mergeId: 'forged' }]) {
          await assert.rejects(setDoc(doc(db, `${plain}/history/forged-${profile.id}`), { ...payload, summary: 'Forged' }), { code: 'permission-denied' })
        }
      }
      await setDoc(doc(editor, 'businessPartners/reference-created'), { companyName: 'Ordinary creation', status: 'active' })
      await updateDoc(doc(editor, 'businessPartners/reference-created'), { companyName: 'Ordinary update', status: 'inactive' })
      await setDoc(doc(editor, `${plain}/history/ordinary-edit`), { category: 'masterData', action: 'updated', summary: 'Ordinary edit' })
      for (const { db } of [clients[1], clients[3]]) await assert.rejects(updateDoc(doc(db, plain), { companyName: 'Denied' }), { code: 'permission-denied' })
      assert.equal((await target.get()).exists, true)
    })
  } finally {
    for (const { app, db } of clients) { await terminate(db); await deleteApp(app) }
    await admin.terminate()
    await deleteAdminApp(adminApp)
  }
})
