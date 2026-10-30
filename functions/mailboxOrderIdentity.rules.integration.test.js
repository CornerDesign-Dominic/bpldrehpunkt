import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { collection, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDoc, getDocs, getFirestore, setDoc, setLogLevel, terminate, updateDoc } from 'firebase/firestore'

// firebase emulators:exec --only firestore --project demo-drehpunkt-partners
// "node --test functions/mailboxOrderIdentity.rules.integration.test.js"
test('DyCoS source identities are server-managed while ordinary partner editing remains available', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-partners'
  assert.ok(projectId.startsWith('demo-'), 'This test must never use a real Firebase project')
  const suffix = `${Date.now()}`
  const adminApp = initializeAdminApp({ projectId }, `dycos-partner-admin-${suffix}`)
  const admin = getAdminFirestore(adminApp)
  const clients = []
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  const profiles = [
    { uid: `dycos-editor-${suffix}`, active: true, role: 'user', permissions: { masterData: 'edit', dataImports: 'edit' } },
    { uid: `dycos-viewer-${suffix}`, active: true, role: 'user', permissions: { masterData: 'view' } },
    { uid: `dycos-import-only-${suffix}`, active: true, role: 'user', permissions: { dataImports: 'edit' } },
    { uid: `dycos-superadmin-${suffix}`, active: true, role: 'superadmin', permissions: {} },
    { uid: `dycos-disabled-${suffix}`, active: false, role: 'superadmin', permissions: {} },
  ]
  const identities = { 'debtor-10042': { number: '10042', kind: 'debtor', sourceId: '33' } }
  setLogLevel('silent')
  try {
    for (const profile of profiles) {
      await admin.doc(`users/${profile.uid}`).set(profile)
      const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `${profile.uid}-app`)
      const db = getFirestore(app)
      connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: profile.uid } })
      clients.push({ app, db, profile })
    }
    const editor = clients[0].db
    const partnerPath = `businessPartners/dycos-protected-${suffix}`
    await admin.doc(partnerPath).set({ companyName: 'Synthetic customer', debtorNumber: '10042', dycosIdentities: identities, dycosReferences: { accounts: [{ entity: 'customer', number: '10042', sourceId: '33' }] }, dycosImport: { sourceReferences: [{ entity: 'customer', id: '33' }] } })

    await t.test('normal master-data edits retain trusted source identities', async () => {
      await updateDoc(doc(editor, partnerPath), { companyName: 'Updated company', 'address.city': 'Berlin' })
      assert.deepEqual((await admin.doc(partnerPath).get()).get('dycosIdentities'), identities)
      assert.equal((await getDoc(doc(clients[1].db, partnerPath))).get('companyName'), 'Updated company')
      const plainPath = `businessPartners/dycos-plain-${suffix}`
      await setDoc(doc(editor, plainPath), { companyName: 'Normal new customer' })
      await updateDoc(doc(editor, plainPath), { companyName: 'Normal edited customer' })
      await deleteDoc(doc(editor, plainPath))
      await admin.doc(plainPath).set({ companyName: 'Empty identities', dycosIdentities: {} })
      await deleteDoc(doc(editor, plainPath))
    })

    await t.test('source identity injection, changes, removal and deletion are denied even to superadmins', async () => {
      for (const { db, profile } of [clients[0], clients[3]]) {
        const ref = doc(db, partnerPath)
        for (const patch of [
          { 'dycosIdentities.debtor-10042.sourceId': '999' },
          { 'dycosIdentities.creditor-70042': { number: '70042', kind: 'creditor', sourceId: '77' } },
          { dycosIdentities: {} },
          { dycosIdentities: deleteField() },
          { 'dycosReferences.accounts': [{ entity: 'customer', number: '10042', sourceId: '999' }] },
          { dycosImport: { sourceReferences: [{ entity: 'customer', id: '999' }] } },
          { debtorNumber: '10043' },
          { creditorNumber: '70043' },
          { dycosReferences: { debtorNumbers: ['10043'] } },
        ]) await assert.rejects(updateDoc(ref, patch), { code: 'permission-denied' })
        await assert.rejects(deleteDoc(ref), { code: 'permission-denied' })
        await assert.rejects(setDoc(doc(db, `businessPartners/dycos-injected-${profile.uid}`), { companyName: 'Injected', dycosIdentities: identities }), { code: 'permission-denied' })
        await assert.rejects(setDoc(doc(db, `businessPartners/dycos-empty-injected-${profile.uid}`), { companyName: 'Injected', dycosIdentities: {} }), { code: 'permission-denied' })
        await assert.rejects(setDoc(doc(db, `businessPartners/dycos-account-injected-${profile.uid}`), { companyName: 'Injected', dycosReferences: { accounts: [{ entity: 'customer', number: '10042', sourceId: '999' }] } }), { code: 'permission-denied' })
        await assert.rejects(setDoc(doc(db, `businessPartners/dycos-origin-injected-${profile.uid}`), { companyName: 'Injected', dycosImport: { sourceReferences: [{ entity: 'customer', id: '999' }] } }), { code: 'permission-denied' })
      }
      assert.deepEqual((await admin.doc(partnerPath).get()).get('dycosIdentities'), identities)
    })

    await t.test('view-only, import-only and inactive profiles cannot modify partners', async () => {
      for (const { db, profile } of [clients[1], clients[2], clients[4]]) {
        await assert.rejects(updateDoc(doc(db, partnerPath), { companyName: 'Denied' }), { code: 'permission-denied' })
        await assert.rejects(setDoc(doc(db, `businessPartners/dycos-unauthorized-${profile.uid}`), { companyName: 'Denied' }), { code: 'permission-denied' })
        await assert.rejects(deleteDoc(doc(db, partnerPath)), { code: 'permission-denied' })
      }
    })

    await t.test('new importer account IDs and source references are protected without legacy identities', async () => {
      const path = `businessPartners/dycos-account-only-${suffix}`
      await admin.doc(path).set({ companyName: 'Imported customer', debtorNumber: '10042', dycosReferences: { debtorNumbers: ['10042'], accounts: [{ entity: 'customer', number: '10042', sourceId: '33' }] }, dycosImport: { sourceReferences: [{ entity: 'customer', id: '33' }] } })
      await updateDoc(doc(editor, path), { 'address.city': 'Berlin' })
      for (const { db } of [clients[0], clients[3]]) {
        await assert.rejects(updateDoc(doc(db, path), { 'dycosReferences.accounts': [{ entity: 'customer', number: '10042', sourceId: '999' }] }), { code: 'permission-denied' })
        await assert.rejects(updateDoc(doc(db, path), { dycosImport: deleteField() }), { code: 'permission-denied' })
        await assert.rejects(updateDoc(doc(db, path), { debtorNumber: '10043' }), { code: 'permission-denied' })
        await assert.rejects(updateDoc(doc(db, path), { dycosReferences: deleteField() }), { code: 'permission-denied' })
        await assert.rejects(deleteDoc(doc(db, path)), { code: 'permission-denied' })
      }
      const oldPath = `businessPartners/dycos-null-references-${suffix}`
      await admin.doc(oldPath).set({ companyName: 'Legacy customer', dycosReferences: null })
      await updateDoc(doc(editor, oldPath), { companyName: 'Legacy customer edited' })
    })

    await t.test('preview and quota records deny direct get, list and writes for every client role', async () => {
      for (const name of ['dycosPartnerPreviews', 'dycosPartnerQuotas']) {
        const id = `private-${suffix}`
        await admin.doc(`${name}/${id}`).set({ ownerId: profiles[0].uid, synthetic: true })
        for (const { db, profile } of clients) {
          await assert.rejects(getDoc(doc(db, name, id)), { code: 'permission-denied' })
          await assert.rejects(getDocs(collection(db, name)), { code: 'permission-denied' })
          await assert.rejects(setDoc(doc(db, name, `attempt-${profile.uid}`), { ownerId: profile.uid }), { code: 'permission-denied' })
          await assert.rejects(updateDoc(doc(db, name, id), { synthetic: false }), { code: 'permission-denied' })
          await assert.rejects(deleteDoc(doc(db, name, id)), { code: 'permission-denied' })
        }
      }
    })
  } finally {
    for (const { app, db } of clients) { await terminate(db); await deleteApp(app) }
    await admin.terminate()
    await deleteAdminApp(adminApp)
  }
})
