import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectFirestoreEmulator, collection, doc, getDoc, getDocs, getFirestore, setDoc, setLogLevel, terminate } from 'firebase/firestore'

test('personal mailbox collections remain server-only even for their owner and active superadmins', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-mailboxes'
  assert.ok(projectId.startsWith('demo-'), 'This integration test must never use a real Firebase project')
  const adminApp = initializeAdminApp({ projectId }, 'mailbox-rules-admin')
  const admin = getAdminFirestore(adminApp)
  const clients = []
  const collections = ['mailboxConnections', 'mailboxDrafts', 'mailboxOAuthStates', 'mailboxOAuthPending', 'mailboxSendOperations', 'mailboxSecretRetirements', 'mailboxDiagnosticQuotas', 'mailboxTrackingPreviews', 'mailboxTrackingQuotas', 'personalMailTrackingApplications', 'invoiceCheckReports', 'transportOrders/invoice-test/invoiceChecks']
  const profiles = [
    { uid: 'mail-owner', active: true, role: 'user', permissions: { mailboxes: 'edit' } },
    { uid: 'mail-other', active: true, role: 'user', permissions: { mailboxes: 'view' } },
    { uid: 'mail-admin', active: true, role: 'superadmin', permissions: {} },
    { uid: 'mail-disabled', active: false, role: 'superadmin', permissions: {} },
    { uid: 'mail-no-module', active: true, role: 'user', permissions: {} },
  ]
  setLogLevel('silent')
  try {
    for (const profile of profiles) await admin.doc(`users/${profile.uid}`).set(profile)
    for (const name of collections) await admin.doc(`${name}/private-record`).set({ ownerId: 'mail-owner', synthetic: true })
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
    for (const profile of profiles) {
      const app = initializeApp({ projectId, apiKey: 'emulator-only' }, profile.uid)
      const db = getFirestore(app)
      clients.push({ app, db })
      connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: profile.uid } })
      if (profile.active) assert.equal((await getDoc(doc(db, 'users', profile.uid))).exists(), true)
      else await assert.rejects(getDoc(doc(db, 'users', profile.uid)), { code: 'permission-denied' })
      for (const name of collections) {
        await assert.rejects(getDoc(doc(db, name, 'private-record')), { code: 'permission-denied' })
        await assert.rejects(getDocs(collection(db, name)), { code: 'permission-denied' })
        await assert.rejects(setDoc(doc(db, name, `attempt-${profile.uid}`), { ownerId: profile.uid }), { code: 'permission-denied' })
      }
    }
  } finally {
    for (const { app, db } of clients) { await terminate(db); await deleteApp(app) }
    await admin.terminate()
    await deleteAdminApp(adminApp)
  }
})
