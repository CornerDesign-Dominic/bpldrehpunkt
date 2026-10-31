import assert from 'node:assert/strict'
import process from 'node:process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { initializeApp as adminApp, deleteApp as deleteAdmin } from 'firebase-admin/app'
import { getFirestore as adminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, setLogLevel, terminate, updateDoc } from 'firebase/firestore'

test('cost projections stay private and pallet writes cannot bypass atomic accounting', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = 'demo-drehpunkt-cost-access'
  const address = process.env.FIRESTORE_EMULATOR_HOST
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
  const response = await fetch(`http://${address}/emulator/v1/projects/${projectId}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) })
  assert.equal(response.status, 200, await response.text())
  const app = adminApp({ projectId }, 'cost-access-admin')
  const admin = adminFirestore(app)
  const clients = []
  const profiles = {
    viewer: { active: true, role: 'user', permissions: { pallets: 'view' } },
    editor: { active: true, role: 'user', permissions: { pallets: 'edit' } },
    administrator: { active: true, role: 'admin', permissions: {} },
    superadmin: { active: true, role: 'superadmin', permissions: {} },
    inactive: { active: false, role: 'superadmin', permissions: {} },
  }
  const privateCollections = ['palletSummaryState', 'palletSummaryGenerations', 'palletMutationReceipts', 'shipmentTrackingWork', 'caseDeadlineReminderWork', 'backgroundWorkState', 'transportOrderRelationMembers', 'transportOrderRelationCatalog', 'palletSummaryGenerations/generation/movements', 'palletSummaryGenerations/generation/closings']
  setLogLevel('silent')
  try {
    for (const [uid, profile] of Object.entries(profiles)) await admin.doc(`users/${uid}`).set(profile)
    for (const name of [...privateCollections, 'palletMovements', 'palletClosings']) await admin.doc(`${name}/synthetic`).set({ synthetic: true })
    for (const [uid] of Object.entries(profiles)) {
      const client = initializeApp({ projectId, apiKey: 'emulator-only' }, `cost-${uid}`)
      const db = getFirestore(client)
      clients.push({ client, db })
      const [host, port] = address.split(':')
      connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid } })
      for (const name of privateCollections) {
        await assert.rejects(getDoc(doc(db, name, 'synthetic')), { code: 'permission-denied' })
        await assert.rejects(getDocs(collection(db, name)), { code: 'permission-denied' })
        await assert.rejects(setDoc(doc(db, name, 'forged'), { synthetic: true }), { code: 'permission-denied' })
      }
      for (const name of ['palletMovements', 'palletClosings']) {
        const target = doc(db, name, 'synthetic')
        if (['viewer', 'editor', 'superadmin'].includes(uid)) {
          assert.equal((await getDoc(target)).exists(), true)
          assert.equal((await getDocs(collection(db, name))).size, 1)
        } else await assert.rejects(getDoc(target), { code: 'permission-denied' })
        await assert.rejects(setDoc(doc(db, name, 'forged'), { synthetic: true }), { code: 'permission-denied' })
        await assert.rejects(updateDoc(target, { synthetic: false }), { code: 'permission-denied' })
        await assert.rejects(deleteDoc(target), { code: 'permission-denied' })
      }
    }
  } finally {
    for (const { client, db } of clients) { await terminate(db); await deleteApp(client) }
    await admin.terminate()
    await deleteAdmin(app)
  }
})
