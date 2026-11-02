import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

// Run with firebase emulators:exec --only firestore --project demo-drehpunkt-links
// "node --test functions/legalCounterparty.rules.integration.test.js".
test('Firestore rules enforce legal counterparties and insolvency TA links without broadening master-data access', { skip: !enabled }, async (t) => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-links'
  const adminApp = initializeAdminApp({ projectId }, `legal-rules-admin-${Date.now()}`)
  const admin = getAdminFirestore(adminApp)
  const apps = []
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  function client(uid) {
    const app = initializeApp({ projectId, apiKey: 'test' }, `legal-rules-${uid}-${Date.now()}`)
    apps.push(app)
    const db = getFirestore(app)
    connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid } })
    return db
  }
  const editor = client('link-editor')
  const viewer = client('link-viewer')
  const limited = client('link-limited')
  const permissions = { legalDisputes: 'edit', insolvencies: 'edit', transportOrders: 'view', masterData: 'none' }
  const profile = (permissions) => ({ active: true, role: 'user', firstName: 'Rules', lastName: 'Test', permissions })
  const nullFields = ['description', 'caseType', 'participant', 'opposingCounsel', 'responsibleUserId', 'responsibleUserName', 'lawFirm', 'ownCounsel', 'lawyerReference', 'lawyerPhone', 'lawyerEmail', 'court', 'courtReference', 'judgeOrChamber', 'nextDeadline', 'nextDeadlineLabel', 'nextHearing', 'nextHearingTime', 'procedureType', 'proceedingStage', 'instance', 'startedAt', 'completedAt', 'originalClaim', 'counterClaim', 'amountInDispute', 'paidAmount', 'openAmount', 'legalFees', 'courtCosts', 'otherCosts']
  const legacy = {
    ...Object.fromEntries(nullFields.map((field) => [field, null])),
    caseNumber: 'legacy-links', status: 'open', isClosed: false, title: 'Alter Fall', counterparty: 'Historischer Name',
    createdAt: Timestamp.now(), createdBy: 'link-editor', createdByName: 'Rules Test', updatedAt: Timestamp.now(), updatedBy: 'link-editor', updatedByName: 'Rules Test',
  }
  const metadata = () => ({ updatedAt: serverTimestamp(), updatedBy: 'link-editor', updatedByName: 'Rules Test' })
  try {
    await Promise.all([
      admin.doc('users/link-editor').set(profile(permissions)),
      admin.doc('users/link-viewer').set(profile({ ...permissions, legalDisputes: 'view', insolvencies: 'view' })),
      admin.doc('users/link-limited').set(profile({ ...permissions, legalDisputes: 'none', insolvencies: 'none' })),
      admin.doc('businessPartners/legal-customer').set({ companyName: 'Kunde GmbH', businessPartnerRoles: ['customer'] }),
      admin.doc('businessPartners/legal-carrier').set({ companyName: 'Unternehmer KG', businessPartnerRoles: ['carrier'] }),
      admin.doc('legalDisputes/legacy-links').set(legacy),
      admin.doc('insolvencies/legal-customer').set({ partnerId: 'legal-customer', partnerName: 'Kunde GmbH' }),
      admin.doc('transportOrders/legal-order-1').set({ externalNumber: 'TA-1' }),
      admin.doc('transportOrders/legal-order-2').set({ externalNumber: 'TA-2' }),
    ])
    await t.test('legacy cases remain editable without assigning an identity from their name', async () => {
      await updateDoc(doc(editor, 'legalDisputes/legacy-links'), { caseType: 'Klage', ...metadata() })
      const stored = (await admin.doc('legalDisputes/legacy-links').get()).data()
      assert.equal(stored.counterpartyPartnerId, undefined)
    })
    await t.test('correct ID, role and name bind; invalid combinations and unauthorized edits fail', async () => {
      const ref = doc(editor, 'legalDisputes/legacy-links')
      for (const changes of [
        { counterpartyPartnerId: 'missing', counterpartyPartnerRole: 'customer', counterparty: 'Kunde GmbH' },
        { counterpartyPartnerId: 'legal-customer', counterpartyPartnerRole: 'carrier', counterparty: 'Kunde GmbH' },
        { counterpartyPartnerId: 'legal-customer', counterpartyPartnerRole: 'customer', counterparty: 'Falscher Name' },
        { counterpartyPartnerId: null, counterpartyPartnerRole: 'customer' },
      ]) await assert.rejects(updateDoc(ref, { ...changes, ...metadata() }), { code: 'permission-denied' })
      await updateDoc(ref, { counterpartyPartnerId: 'legal-customer', counterpartyPartnerRole: 'customer', counterparty: 'Kunde GmbH', ...metadata() })
      await assert.rejects(updateDoc(doc(viewer, 'legalDisputes/legacy-links'), { caseType: 'Nein', ...metadata() }), { code: 'permission-denied' })
      await assert.rejects(getDoc(doc(limited, 'legalDisputes/legacy-links')), { code: 'permission-denied' })
      await assert.rejects(getDoc(doc(editor, 'businessPartners/legal-customer')), { code: 'permission-denied' })
    })
    await t.test('all existing accounting, alias, map and provisional role facts can bind', async () => {
      const variants = [
        ['customer', { debtorNumber: '100' }],
        ['carrier', { creditorNumber: '200' }],
        ['customer', { dycosReferences: { debtorNumbers: ['101'] } }],
        ['carrier', { dycosReferences: { creditorNumbers: ['201'] } }],
        ['customer', { partnerRoles: { kunde: true } }],
        ['carrier', { businessPartnerRoles: 'unternehmer' }],
        ['customer', { businessPartnerRoles: ['kunde'] }],
        ['carrier', { taImportStatus: { source: 'dycosTransportOrder', missingRequiredFields: ['creditorNumber'] } }],
      ]
      for (const [index, [role, facts]] of variants.entries()) {
        const partnerId = `legal-role-${index}`
        await admin.doc(`businessPartners/${partnerId}`).set({ companyName: partnerId, ...facts })
        await updateDoc(doc(editor, 'legalDisputes/legacy-links'), { counterpartyPartnerId: partnerId, counterpartyPartnerRole: role, counterparty: partnerId, ...metadata() })
      }
      await updateDoc(doc(editor, 'legalDisputes/legacy-links'), { counterpartyPartnerId: 'legal-customer', counterpartyPartnerRole: 'customer', counterparty: 'Kunde GmbH', ...metadata() })
    })
    await t.test('populated cases retain editable content and can change their counterparty', async () => {
      const financial = new Set(['originalClaim', 'counterClaim', 'amountInDispute', 'paidAmount', 'openAmount', 'legalFees', 'courtCosts', 'otherCosts'])
      const dates = new Set(['nextDeadline', 'nextHearing', 'startedAt'])
      const populated = Object.fromEntries(nullFields.map((field) => [field, financial.has(field) ? 10 : dates.has(field) ? '2026-10-28' : field === 'completedAt' ? null : 'Angabe']))
      await admin.doc('legalDisputes/populated-links').set({ ...legacy, ...populated, caseNumber: 'populated-links' })
      await updateDoc(doc(editor, 'legalDisputes/populated-links'), { counterpartyPartnerId: 'legal-carrier', counterpartyPartnerRole: 'carrier', counterparty: 'Unternehmer KG', ...metadata() })
      await updateDoc(doc(editor, 'legalDisputes/populated-links'), { description: 'Überarbeitet', amountInDispute: 20, ...metadata() })
      await assert.rejects(updateDoc(doc(editor, 'legalDisputes/populated-links'), { lawyerPhone: 123, ...metadata() }), { code: 'permission-denied' })
    })
    await t.test('merge and renamed partners do not block unrelated updates or rewrite original IDs', async () => {
      await admin.doc('businessPartners/legal-customer').update({ companyName: 'Archiv', mergedIntoPartnerId: 'legal-carrier', status: 'merged' })
      await updateDoc(doc(editor, 'legalDisputes/legacy-links'), { description: 'Nach Merge weiter bearbeitet', ...metadata() })
      assert.equal((await admin.doc('legalDisputes/legacy-links').get()).get('counterpartyPartnerId'), 'legal-customer')
      await assert.rejects(updateDoc(doc(editor, 'legalDisputes/legacy-links'), { counterparty: 'Archiv', ...metadata() }), { code: 'permission-denied' })
    })
    await t.test('creation validates counterparty role alongside the existing case-number transaction', async () => {
      async function create(role, changes = {}) {
        const batch = writeBatch(editor)
        batch.set(doc(editor, 'legalDisputeCaseCounters/2026'), { year: '2026', nextNumber: 1, updatedAt: serverTimestamp() })
        batch.set(doc(editor, 'legalDisputes/G-2026-0001'), {
          ...legacy, caseNumber: 'G-2026-0001', caseYear: '2026', caseSequence: 1,
          counterparty: 'Unternehmer KG', counterpartyPartnerId: 'legal-carrier', counterpartyPartnerRole: role,
          title: 'G-2026-0001 – TA-1 – Unternehmer KG', transportReference: 'TA-1', createdAt: serverTimestamp(), ...metadata(), ...changes,
        })
        batch.set(doc(editor, 'legalDisputes/G-2026-0001/updates/created'), { type: 'system', text: 'Fall angelegt', createdAt: serverTimestamp(), createdByUserId: 'link-editor', createdByName: 'Rules Test' })
        batch.set(doc(editor, 'caseTransportOrderLinks/legalDispute|G-2026-0001|legal-order-1'), { caseType: 'legalDispute', caseId: 'G-2026-0001', transportOrderId: 'legal-order-1', createdAt: serverTimestamp(), createdByUserId: 'link-editor', createdByName: 'Rules Test' })
        return batch.commit()
      }
      await assert.rejects(create('customer'), { code: 'permission-denied' })
      await assert.rejects(create('carrier', { amountInDispute: -1 }), { code: 'permission-denied' })
      await assert.rejects(create('carrier', { court: 123 }), { code: 'permission-denied' })
      await create('carrier')
    })
    await t.test('new insolvency, partner status and multiple TA links commit atomically using getAfter', async () => {
      const partnerId = 'legal-new-insolvency'
      await admin.doc(`businessPartners/${partnerId}`).set({ companyName: 'Neuer Partner', status: 'active' })
      function create(partnerName) {
        const batch = writeBatch(editor)
        batch.set(doc(editor, `insolvencies/${partnerId}`), {
          partnerId, partnerName, insolvencyDate: null, knownDate: null, courtReference: null, courtVenue: null, description: null,
          createdAt: serverTimestamp(), createdBy: 'link-editor', createdByName: 'Rules Test', ...metadata(),
        })
        batch.update(doc(editor, `businessPartners/${partnerId}`), { status: 'insolvency', ...metadata() })
        for (const transportOrderId of ['legal-order-1', 'legal-order-2']) batch.set(doc(editor, `caseTransportOrderLinks/insolvency|${partnerId}|${transportOrderId}`), {
          caseType: 'insolvency', caseId: partnerId, transportOrderId, createdAt: serverTimestamp(), createdByUserId: 'link-editor', createdByName: 'Rules Test',
        })
        return batch.commit()
      }
      await assert.rejects(create('Falscher Partnername'), { code: 'permission-denied' })
      assert.equal((await admin.doc(`businessPartners/${partnerId}`).get()).get('status'), 'active')
      assert.equal((await admin.doc(`insolvencies/${partnerId}`).get()).exists, false)
      assert.equal((await admin.doc(`caseTransportOrderLinks/insolvency|${partnerId}|legal-order-1`).get()).exists, false)
      await create('Neuer Partner')
      assert.equal((await admin.doc(`businessPartners/${partnerId}`).get()).get('status'), 'insolvency')
      assert.equal((await admin.collection('caseTransportOrderLinks').where('caseType', '==', 'insolvency').where('caseId', '==', partnerId).get()).size, 2)
    })
    await t.test('a partner merged after selection cannot become insolvent and the whole creation batch rolls back', async () => {
      const states = [
        { status: 'merged', mergedIntoPartnerId: 'legal-carrier' },
        { status: 'merged' },
        { status: 'active', mergedIntoPartnerId: 'legal-carrier' },
      ]
      for (const [index, state] of states.entries()) {
        const partnerId = `stale-insolvency-selection-${index}`
        const stored = { companyName: 'Archivierte Auswahl', ...state }
        await admin.doc(`businessPartners/${partnerId}`).set(stored)
        const batch = writeBatch(editor)
        batch.set(doc(editor, `insolvencies/${partnerId}`), {
          partnerId, partnerName: stored.companyName, insolvencyDate: null, knownDate: null, courtReference: null, courtVenue: null, description: null,
          createdAt: serverTimestamp(), createdBy: 'link-editor', createdByName: 'Rules Test', ...metadata(),
        })
        batch.update(doc(editor, `businessPartners/${partnerId}`), { status: 'insolvency', ...metadata() })
        for (const transportOrderId of ['legal-order-1', 'legal-order-2']) batch.set(doc(editor, `caseTransportOrderLinks/insolvency|${partnerId}|${transportOrderId}`), {
          caseType: 'insolvency', caseId: partnerId, transportOrderId, createdAt: serverTimestamp(), createdByUserId: 'link-editor', createdByName: 'Rules Test',
        })
        await assert.rejects(batch.commit(), { code: 'permission-denied' })
        assert.deepEqual((await admin.doc(`businessPartners/${partnerId}`).get()).data(), stored)
        assert.equal((await admin.doc(`insolvencies/${partnerId}`).get()).exists, false)
        for (const transportOrderId of ['legal-order-1', 'legal-order-2']) assert.equal((await admin.doc(`caseTransportOrderLinks/insolvency|${partnerId}|${transportOrderId}`).get()).exists, false)
        // An existing shell must not permit the status-only update either.
        await admin.doc(`insolvencies/${partnerId}`).set({ partnerId })
        await assert.rejects(updateDoc(doc(editor, `businessPartners/${partnerId}`), { status: 'insolvency', ...metadata() }), { code: 'permission-denied' })
      }
    })
    await t.test('new TA links cannot target merged or split-archived insolvency shells', async () => {
      for (const [index, archive] of [{ mergedIntoPartnerId: 'legal-carrier' }, { splitArchivedAt: Timestamp.now() }].entries()) {
        const caseId = `archived-insolvency-shell-${index}`
        await admin.doc(`insolvencies/${caseId}`).set({ partnerId: caseId, ...archive })
        const batch = writeBatch(editor)
        batch.set(doc(editor, `caseTransportOrderLinks/insolvency|${caseId}|legal-order-1`), {
          caseType: 'insolvency', caseId, transportOrderId: 'legal-order-1', createdAt: serverTimestamp(), createdByUserId: 'link-editor', createdByName: 'Rules Test',
        })
        await assert.rejects(batch.commit(), { code: 'permission-denied' })
        assert.equal((await admin.doc(`caseTransportOrderLinks/insolvency|${caseId}|legal-order-1`).get()).exists, false)
      }
    })
    await t.test('one insolvency supports multiple TAs while viewers and unrelated modules cannot write or read links', async () => {
      const link = (transportOrderId) => ({ caseType: 'insolvency', caseId: 'legal-customer', transportOrderId, createdAt: serverTimestamp(), createdByUserId: 'link-editor', createdByName: 'Rules Test' })
      const batch = writeBatch(editor)
      for (const id of ['legal-order-1', 'legal-order-2']) batch.set(doc(editor, `caseTransportOrderLinks/insolvency|legal-customer|${id}`), link(id))
      await batch.commit()
      await getDoc(doc(viewer, 'caseTransportOrderLinks/insolvency|legal-customer|legal-order-1'))
      await assert.rejects(getDoc(doc(limited, 'caseTransportOrderLinks/insolvency|legal-customer|legal-order-1')), { code: 'permission-denied' })
      const denied = writeBatch(viewer)
      denied.delete(doc(viewer, 'caseTransportOrderLinks/insolvency|legal-customer|legal-order-1'))
      await assert.rejects(denied.commit(), { code: 'permission-denied' })
    })
  } finally {
    await Promise.all(apps.map((app) => deleteApp(app)))
    await deleteAdminApp(adminApp)
  }
})
