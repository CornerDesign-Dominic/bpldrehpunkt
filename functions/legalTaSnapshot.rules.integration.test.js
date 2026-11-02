import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, terminate, writeBatch } from 'firebase/firestore'

test('legal TA origins preserve exact role snapshots after renaming without master-data access', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/)
  const projectId = `${process.env.GCLOUD_PROJECT || 'demo-legal-ta-snapshot'}-legal-snapshot`
  assert.ok(projectId.startsWith('demo-'))
  const adminApp = initializeAdminApp({ projectId }, `legal-snapshot-admin-${Date.now()}`), admin = getAdminFirestore(adminApp)
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  const clients = []
  async function client(id, permissions) {
    await admin.doc(`users/${id}`).set({ active: true, role: 'user', firstName: 'Snapshot', lastName: 'Test', permissions })
    const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `${id}-${Date.now()}`), db = getFirestore(app)
    connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: id } })
    const result = { id, app, db }; clients.push(result); return result
  }
  const nullFields = ['description', 'caseType', 'participant', 'opposingCounsel', 'responsibleUserId', 'responsibleUserName', 'lawFirm', 'ownCounsel', 'lawyerReference', 'lawyerPhone', 'lawyerEmail', 'court', 'courtReference', 'judgeOrChamber', 'nextDeadline', 'nextDeadlineLabel', 'nextHearing', 'nextHearingTime', 'procedureType', 'proceedingStage', 'instance', 'startedAt', 'completedAt', 'originalClaim', 'counterClaim', 'amountInDispute', 'paidAmount', 'openAmount', 'legalFees', 'courtCosts', 'otherCosts']
  const fixtures = Object.fromEntries(['customer', 'carrier'].map(role => [role, { role, id: `snapshot-${role}`, orderId: `snapshot-order-${role}`, currentName: `Renamed ${role}`, historicName: `Historical ${role}`, aliasName: `Imported alias ${role}` }]))
  const counterRef = admin.doc('legalDisputeCaseCounters/2026')
  async function create(actor, fixture, changes = {}, { link = true, source = fixture.orderId } = {}) {
    const before = await counterRef.get(), sequence = (before.data()?.nextNumber || 0) + 1
    const id = `G-2026-${String(sequence).padStart(4, '0')}`
    const values = { ...Object.fromEntries(nullFields.map(key => [key, null])), caseNumber: id, caseYear: '2026', caseSequence: sequence, status: 'open', isClosed: false,
      counterpartyPartnerId: fixture.id, counterpartyPartnerRole: fixture.role, counterpartySourceTransportOrderId: source,
      counterparty: fixture.historicName, transportReference: `TA-${fixture.role}`, ...changes }
    values.title = `${id} – ${values.transportReference}${values.counterparty == null ? '' : ` – ${values.counterparty}`}`
    const batch = writeBatch(actor.db)
    batch.set(doc(actor.db, counterRef.path), { year: '2026', nextNumber: sequence, updatedAt: serverTimestamp() })
    batch.set(doc(actor.db, `legalDisputes/${id}`), { ...values, createdAt: serverTimestamp(), createdBy: actor.id, createdByName: 'Snapshot Test', updatedAt: serverTimestamp(), updatedBy: actor.id, updatedByName: 'Snapshot Test' })
    batch.set(doc(actor.db, `legalDisputes/${id}/updates/created`), { type: 'system', text: 'Created from TA', createdAt: serverTimestamp(), createdByUserId: actor.id, createdByName: 'Snapshot Test' })
    const linkId = `legalDispute|${id}|${source}`
    if (link) batch.set(doc(actor.db, `caseTransportOrderLinks/${linkId}`), { caseType: 'legalDispute', caseId: id, transportOrderId: source, createdAt: serverTimestamp(), createdByUserId: actor.id, createdByName: 'Snapshot Test' })
    try { await batch.commit() } catch (error) {
      assert.equal((await counterRef.get()).data()?.nextNumber || 0, before.data()?.nextNumber || 0)
      assert.equal((await admin.doc(`legalDisputes/${id}`).get()).exists, false)
      assert.equal((await admin.doc(`legalDisputes/${id}/updates/created`).get()).exists, false)
      if (link) assert.equal((await admin.doc(`caseTransportOrderLinks/${linkId}`).get()).exists, false)
      throw Object.assign(new Error(`${error.message}\nRole: ${fixture.role}; name: ${values.counterparty}; source: ${source}; relation: ${link}`, { cause: error }), { code: error.code })
    }
    assert.equal((await admin.doc(`legalDisputes/${id}`).get()).get('counterparty'), values.counterparty)
    assert.equal((await admin.doc(`legalDisputes/${id}/updates/created`).get()).exists, true)
    if (link) assert.equal((await admin.doc(`caseTransportOrderLinks/${linkId}`).get()).exists, true)
    return id
  }
  try {
    const permissions = { legalDisputes: 'edit', transportOrders: 'view', masterData: 'none' }
    const editor = await client('snapshot-editor', permissions)
    const noOrder = await client('snapshot-no-order', { ...permissions, transportOrders: 'none' })
    const viewer = await client('snapshot-viewer', { ...permissions, legalDisputes: 'view' })
    for (const fixture of Object.values(fixtures)) {
      await admin.doc(`businessPartners/${fixture.id}`).set({ companyName: fixture.currentName, status: 'active', businessPartnerRoles: ['customer', 'carrier'] })
      await admin.doc(`transportOrders/${fixture.orderId}`).set({ externalNumber: `TA-${fixture.role}`, imported: { [fixture.role]: { partnerId: fixture.id, [fixture.role === 'customer' ? 'name' : 'originalName']: fixture.historicName, partnerName: fixture.aliasName } } })
      await admin.doc(`transportOrders/wrong-${fixture.orderId}`).set({ externalNumber: 'WRONG', imported: { [fixture.role]: { partnerId: 'different-original', name: fixture.historicName, originalName: fixture.historicName } } })
      await admin.doc(`transportOrders/nameless-${fixture.orderId}`).set({ externalNumber: 'NAMELESS', imported: { [fixture.role]: { partnerId: fixture.id } } })
      await assert.rejects(getDoc(doc(editor.db, `businessPartners/${fixture.id}`)), { code: 'permission-denied' })
    }
    await t.test('both exact primary TA names and aliases commit the complete creation batch after rename', async () => {
      for (const fixture of Object.values(fixtures)) {
        await create(editor, fixture)
        await create(editor, fixture, { counterparty: fixture.aliasName })
        await create(editor, fixture, { counterparty: fixture.currentName })
      }
    })
    await t.test('forged names, another TA or role, a missing relation and absent TA names are rejected atomically', async () => {
      for (const fixture of Object.values(fixtures)) {
        await assert.rejects(create(editor, fixture, { counterparty: 'Forged historical name' }), { code: 'permission-denied' })
        await assert.rejects(create(editor, fixture, {}, { source: `wrong-${fixture.orderId}` }), { code: 'permission-denied' })
        await assert.rejects(create(editor, fixture, { counterpartyPartnerRole: fixture.role === 'customer' ? 'carrier' : 'customer' }), { code: 'permission-denied' })
        await assert.rejects(create(editor, fixture, {}, { link: false }), { code: 'permission-denied' })
        await assert.rejects(create(editor, fixture, { counterparty: null }, { source: `nameless-${fixture.orderId}` }), { code: 'permission-denied' })
      }
    })
    await t.test('TA visibility and legal edit remain mandatory', async () => {
      for (const fixture of Object.values(fixtures)) {
        await assert.rejects(create(noOrder, fixture), { code: 'permission-denied' })
        await assert.rejects(create(viewer, fixture), { code: 'permission-denied' })
      }
    })
    await t.test('manual bindings require current active originals while proven archived TA origins retain their snapshot', async () => {
      for (const fixture of Object.values(fixtures)) {
        await assert.rejects(create(editor, fixture, {}, { source: null, link: false }), { code: 'permission-denied' })
        await create(editor, fixture, { counterparty: fixture.currentName }, { source: null, link: false })
        await admin.doc(`businessPartners/${fixture.id}`).update({ status: 'merged', mergedIntoPartnerId: 'current-root' })
        await assert.rejects(create(editor, fixture, { counterparty: fixture.currentName }, { source: null, link: false }), { code: 'permission-denied' })
        await create(editor, fixture)
      }
    })
  } finally {
    for (const { app, db } of clients) { await terminate(db); await deleteApp(app) }
    await admin.terminate(); await deleteAdminApp(adminApp)
  }
})
