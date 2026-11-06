import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

// firebase emulators:exec --only firestore --project demo-drehpunkt-contracts
// "node --test functions/contracts.rules.integration.test.js"
test('contracts enforce module access, creation validation and immutable files', { skip: !enabled }, async (t) => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-contracts'
  const stamp = Date.now()
  const adminApp = initializeAdminApp({ projectId }, `contracts-admin-${stamp}`)
  const admin = getAdminFirestore(adminApp)
  const apps = []
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  const profiles = {
    viewer: { active: true, role: 'user', permissions: { contracts: 'view' } },
    editor: { active: true, role: 'user', permissions: { contracts: 'edit' } },
    none: { active: true, role: 'user', permissions: { contracts: 'none' } },
    admin: { active: true, role: 'admin', permissions: {} },
    superadmin: { active: true, role: 'superadmin', permissions: {} },
    inactive: { active: false, role: 'superadmin', permissions: { contracts: 'edit' } },
    legacy: { role: 'superadmin', permissions: { contracts: 'edit' } },
  }
  function client(name) {
    const app = initializeApp({ projectId, apiKey: 'test' }, `contracts-${name}-${stamp}`)
    apps.push(app)
    const db = getFirestore(app)
    connectFirestoreEmulator(db, host, Number(port), { mockUserToken: name === 'anonymous' ? undefined : { sub: `contracts-${name}` } })
    return db
  }
  const clients = Object.fromEntries([...Object.keys(profiles), 'missing', 'anonymous'].map((name) => [name, client(name)]))
  const values = (name) => ({ partnerName: 'Muster GmbH', createdBy: `contracts-${name}`, createdAt: serverTimestamp() })
  try {
    await Promise.all([
      ...Object.entries(profiles).map(([name, profile]) => admin.doc(`users/contracts-${name}`).set(profile)),
      admin.doc('contracts/contracts-seeded').set({ partnerName: 'Bestehender Vertragspartner', createdBy: 'contracts-editor', createdAt: new Date() }),
    ])
    await t.test('only assigned readers and superadmins may get or list contract files', async () => {
      for (const [name, db] of Object.entries(clients)) {
        for (const operation of [() => getDoc(doc(db, 'contracts', 'contracts-seeded')), () => getDocs(collection(db, 'contracts'))]) {
          if (['viewer', 'editor', 'superadmin'].includes(name)) await operation()
          else await assert.rejects(operation(), { code: 'permission-denied' })
        }
      }
    })
    await t.test('creation requires edit access and supports the client transaction', async () => {
      for (const [name, db] of Object.entries(clients)) {
        const create = () => runTransaction(db, async (transaction) => {
          const ref = doc(db, 'contracts', `contracts-created-${name}`)
          const existing = await transaction.get(ref)
          assert.equal(existing.exists(), false)
          transaction.set(ref, values(name))
        })
        if (['editor', 'superadmin'].includes(name)) await create()
        else await assert.rejects(create(), { code: 'permission-denied' })
      }
    })
    await t.test('empty or malformed partner names and forged audit data are rejected', async () => {
      const db = clients.editor
      const invalid = [
        { partnerName: '' }, { partnerName: '   ' }, { partnerName: '\t\n' },
        { partnerName: ' Muster GmbH' }, { partnerName: 'Muster GmbH ' },
        { partnerName: 'A'.repeat(241) }, { partnerName: 42 }, { partnerName: null },
        { createdBy: 'contracts-superadmin' }, { createdAt: Timestamp.fromMillis(1) },
        { extra: true }, { documentStorageAccess: { forged: { status: 'ready', fileSize: 6 } } },
      ]
      for (const [index, override] of invalid.entries()) {
        await assert.rejects(setDoc(doc(db, 'contracts', `contracts-invalid-${index}`), { ...values('editor'), ...override }), { code: 'permission-denied' })
      }
      for (const field of ['partnerName', 'createdBy', 'createdAt']) {
        const incomplete = values('editor')
        delete incomplete[field]
        await assert.rejects(setDoc(doc(db, 'contracts', `contracts-missing-${field}`), incomplete), { code: 'permission-denied' })
      }
      await setDoc(doc(db, 'contracts', 'contracts-long-name'), { ...values('editor'), partnerName: 'A'.repeat(240) })
    })
    await t.test('updates, deletion and child writes are denied to every role', async () => {
      for (const db of Object.values(clients)) {
        const ref = doc(db, 'contracts', 'contracts-seeded')
        for (const operation of [
          () => updateDoc(ref, { partnerName: 'Geändert' }),
          () => deleteDoc(ref),
          () => setDoc(doc(ref, 'documents', 'forged'), { title: 'Forged' }),
        ]) await assert.rejects(operation(), { code: 'permission-denied' })
      }
    })
    await t.test('declared child collections are readable only with module rights and an existing parent', async () => {
      for (const [name, db] of Object.entries(clients)) {
        for (const child of ['positions', 'deadlines', 'notes', 'history', 'documents']) {
          const operation = () => getDocs(collection(db, 'contracts', 'contracts-seeded', child))
          if (['viewer', 'editor', 'superadmin'].includes(name)) await operation()
          else await assert.rejects(operation(), { code: 'permission-denied' })
          await assert.rejects(getDocs(collection(db, 'contracts', 'contracts-missing-parent', child)), { code: 'permission-denied' })
        }
        await assert.rejects(getDocs(collection(db, 'contracts', 'contracts-seeded', 'mutations')), { code: 'permission-denied' })
      }
    })
  } finally {
    await Promise.all(apps.map((app) => deleteApp(app)))
    await deleteAdminApp(adminApp)
  }
})
