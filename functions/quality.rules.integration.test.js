import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, query, setDoc, updateDoc, where } from 'firebase/firestore'
import { normalizeQualityInput, persistQualityRecord } from './quality.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const handbook = { departmentId: 'quality-accounting', title: 'Was mache ich wenn …?', process: 'Rechnung erstellen', situation: '', consequences: '', action: '', prevention: '' }

test('handbook requires a nonempty process section', () => {
  for (const process of ['', '   ']) assert.throws(() => normalizeQualityInput({ kind: 'handbook', id: 'entry', expectedRevision: 0, values: { ...handbook, process } }), { code: 'invalid-argument' })
})

// firebase emulators:exec --only firestore --project demo-drehpunkt-quality
// "node --test functions/quality.rules.integration.test.js"
test('quality module rules and transactional department safeguards', { skip: !enabled }, async (t) => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-quality'
  const stamp = Date.now()
  const adminApp = initializeAdminApp({ projectId }, `quality-admin-${stamp}`)
  const admin = getAdminFirestore(adminApp)
  const apps = []
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  const profiles = {
    viewer: { active: true, role: 'user', permissions: { kvp: 'view', handbook: 'none' } },
    editor: { active: true, role: 'user', permissions: { kvp: 'edit', handbook: 'edit' } },
    handbook: { active: true, role: 'user', permissions: { kvp: 'none', handbook: 'view' } },
    none: { active: true, role: 'user', permissions: { kvp: 'none', handbook: 'none' } },
    inactive: { active: false, role: 'superadmin', permissions: { kvp: 'edit', handbook: 'edit' } },
    admin: { active: true, role: 'admin', permissions: {} },
    superadmin: { active: true, role: 'superadmin', permissions: {} },
    legacy: { role: 'superadmin', permissions: {} },
  }
  function client(name) {
    const app = initializeApp({ projectId, apiKey: 'test' }, `quality-${name}-${stamp}`)
    apps.push(app)
    const db = getFirestore(app)
    connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: `quality-${name}` } })
    return db
  }
  const clients = Object.fromEntries([...Object.keys(profiles), 'missing'].map((name) => [name, client(name)]))
  const collections = ['qualityTopics', 'qualityMeetings', 'qualityHandbook']
  try {
    await Promise.all([
      ...Object.entries(profiles).map(([name, profile]) => admin.doc(`users/quality-${name}`).set(profile)),
      admin.doc('departments/quality-accounting').set({ name: 'Accounting', active: true }),
      ...collections.flatMap((name) => [
        admin.doc(`${name}/quality-seeded`).set({ departmentId: 'quality-accounting', title: name, revision: 1 }),
        admin.doc(`${name}/quality-seeded/revisions/1`).set({ departmentId: 'quality-accounting', title: name, revision: 1 }),
      ]),
    ])
    await t.test('module view/edit and superadmin can get and list only their permitted records and histories', async () => {
      for (const [name, db] of Object.entries(clients)) {
        for (const collectionName of collections) {
          const permitted = name === 'editor' || name === 'superadmin' || (name === 'viewer' && collectionName !== 'qualityHandbook') || (name === 'handbook' && collectionName === 'qualityHandbook')
          const operations = [
            () => getDoc(doc(db, collectionName, 'quality-seeded')),
            () => getDoc(doc(db, collectionName, 'quality-seeded', 'revisions', '1')),
            () => getDocs(query(collection(db, collectionName), where('departmentId', '==', 'quality-accounting'))),
            () => getDocs(collection(db, collectionName, 'quality-seeded', 'revisions')),
          ]
          for (const operation of operations) {
            if (permitted) await operation()
            else await assert.rejects(operation(), { code: 'permission-denied' })
          }
        }
      }
    })
    await t.test('all clients including editors and superadmins are denied direct writes and history forgery', async () => {
      for (const db of Object.values(clients)) {
        for (const collectionName of collections) {
          const target = doc(db, collectionName, 'quality-seeded')
          const revision = doc(db, collectionName, 'quality-seeded', 'revisions', '1')
          for (const operation of [
            () => setDoc(doc(db, collectionName, 'quality-forged'), { departmentId: 'quality-accounting' }),
            () => updateDoc(target, { title: 'Forged' }), () => deleteDoc(target),
            () => setDoc(doc(db, collectionName, 'quality-seeded', 'revisions', '2'), { revision: 2 }),
            () => updateDoc(revision, { title: 'Forged' }), () => deleteDoc(revision),
          ]) await assert.rejects(operation(), { code: 'permission-denied' })
        }
      }
    })
    await t.test('inactive departments reject new records while existing records remain maintainable', async () => {
      const normalize = (id, expectedRevision, values = handbook) => normalizeQualityInput({ kind: 'handbook', id, expectedRevision, values })
      const actor = { uid: 'quality-editor' }
      await persistQualityRecord(admin, normalize('quality-maintain', 0), actor)
      await admin.doc('departments/quality-accounting').update({ active: false })
      await assert.rejects(persistQualityRecord(admin, normalize('quality-new-inactive', 0), actor), { code: 'failed-precondition' })
      assert.equal((await admin.doc('qualityHandbook/quality-new-inactive').get()).exists, false)
      await persistQualityRecord(admin, normalize('quality-maintain', 1, { ...handbook, action: 'Updated' }), actor)
      assert.equal((await admin.doc('qualityHandbook/quality-maintain').get()).get('revision'), 2)
      assert.equal((await admin.doc('qualityHandbook/quality-maintain/revisions/1').get()).get('action'), '')
      assert.equal((await admin.doc('qualityHandbook/quality-maintain/revisions/2').get()).get('action'), 'Updated')
    })
  } finally {
    await Promise.all(apps.map((app) => deleteApp(app)))
    await deleteAdminApp(adminApp)
  }
})
