import test from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp as adminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as adminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator, doc, collection, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore'

test('even quality reviewers and cleanup users cannot bypass callables to read or mutate private feedback', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT
  assert.ok(projectId?.startsWith('demo-'))
  const suffix = randomUUID(), server = adminApp({ projectId }, `triage-rules-${suffix}`), db = adminFirestore(server)
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  const apps = [], refs = []
  const paths = [`mailboxTriageFeedback/${suffix}`, `mailboxTriageFeedbackStates/${suffix}`]
  try {
    for (const path of paths) { const ref = db.doc(path); refs.push(ref); await ref.set({ private: 'synthetic' }) }
    for (const [name, profile] of Object.entries({
      mailUser: { active: true, role: 'user', permissions: { mailboxes: 'edit' } },
      reviewer: { active: true, role: 'user', permissions: { mailTriageQuality: 'edit', mailTriageCleanup: 'edit' } },
      administrator: { active: true, role: 'superadmin' },
    })) {
      const uid = `${name}-${suffix}`, user = db.doc(`users/${uid}`); refs.push(user); await user.set(profile)
      const app = initializeApp({ projectId, apiKey: 'test' }, uid); apps.push(app)
      const client = getFirestore(app)
      connectFirestoreEmulator(client, host, Number(port), { mockUserToken: { sub: uid } })
      for (const path of paths) {
        await assert.rejects(getDoc(doc(client, path)), { code: 'permission-denied' })
        await assert.rejects(getDocs(collection(client, path.split('/')[0])), { code: 'permission-denied' })
        await assert.rejects(setDoc(doc(client, path), { forged: true }), { code: 'permission-denied' })
        await assert.rejects(deleteDoc(doc(client, path)), { code: 'permission-denied' })
      }
    }
  } finally {
    await Promise.all(apps.map(app => deleteApp(app)))
    await Promise.all(refs.map(ref => ref.delete()))
    await deleteAdminApp(server)
  }
})
