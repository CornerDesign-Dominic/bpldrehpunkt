import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectFirestoreEmulator, collection, doc, getDoc, getDocs, getFirestore, setDoc, setLogLevel, terminate, onSnapshot } from 'firebase/firestore'

test('personal mailbox collections remain server-only even for their owner and active superadmins', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-mailboxes'
  assert.ok(projectId.startsWith('demo-'), 'This integration test must never use a real Firebase project')
  const adminApp = initializeAdminApp({ projectId }, 'mailbox-rules-admin')
  const admin = getAdminFirestore(adminApp)
  const clients = []
  const collections = ['mailboxConnections', 'mailboxDrafts', 'mailboxOAuthStates', 'mailboxOAuthPending', 'mailboxSendOperations', 'mailboxSecretRetirements', 'mailboxDiagnosticQuotas', 'mailboxTrackingPreviews', 'mailboxTrackingQuotas', 'personalMailTrackingApplications', 'invoiceCheckReports', 'transportOrders/invoice-test/invoiceChecks']
  collections.push('mailboxActionRuns', 'mailboxActionScopes/private-scope/actions', 'mailboxRecommendationScopes', 'mailboxRecommendationScopes/private-scope/messages', 'mailboxRecommendationRuns', 'mailboxRecommendationSubscriptions')
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

test('recommendation push signals are readable only through an owned live mailbox and never writable/listable', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-mail-recommendations'; assert.ok(projectId.startsWith('demo-'))
  const adminApp = initializeAdminApp({ projectId }, 'signals-rules-admin'), admin = getAdminFirestore(adminApp)
  const clients = []
  try {
    await admin.doc('users/signal-owner').set({ active: true, role: 'user', permissions: { mailboxes: 'view' } })
    await admin.doc('users/signal-other').set({ active: true, role: 'superadmin' })
    await admin.doc('mailboxConnections/signal-personal').set({ ownerId: 'signal-owner', kind: 'personal', status: 'connected' })
    await admin.doc('mailboxConnections/signal-shared').set({ ownerId: 'signal-owner', kind: 'shared', status: 'connected', parentConnectionId: 'signal-personal' })
    await admin.doc('mailboxRecommendationSignals/signal-shared').set({ ownerId: 'signal-owner', revision: 'synthetic' })
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
    for (const uid of ['signal-owner', 'signal-other']) {
      const app = initializeApp({ projectId, apiKey: 'emulator-only' }, uid), db = getFirestore(app); clients.push({ app, db })
      connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid } })
      const ref = doc(db, 'mailboxRecommendationSignals', 'signal-shared')
      if (uid === 'signal-owner') {
        assert.equal((await getDoc(ref)).data().revision, 'synthetic')
        let stop
        const pushed = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Push signal was not delivered')), 8000)
          stop = onSnapshot(ref, snapshot => { if (snapshot.data()?.revision === 'pushed') { clearTimeout(timer); resolve() } }, reject)
        })
        await admin.doc('mailboxRecommendationSignals/signal-shared').update({ revision: 'pushed' })
        await pushed; stop()
      }
      else await assert.rejects(getDoc(ref), { code: 'permission-denied' })
      await assert.rejects(getDocs(collection(db, 'mailboxRecommendationSignals')), { code: 'permission-denied' })
      await assert.rejects(setDoc(ref, { revision: 'spoof' }), { code: 'permission-denied' })
      if (uid === 'signal-owner') {
        await admin.doc('mailboxConnections/signal-personal').update({ status: 'disconnected' })
        await assert.rejects(getDoc(ref), { code: 'permission-denied' })
        await admin.doc('mailboxConnections/signal-personal').update({ status: 'connected' })
      }
    }
  } finally {
    for (const { app, db } of clients) { await terminate(db); await deleteApp(app) }
    await admin.terminate(); await deleteAdminApp(adminApp)
  }
})
