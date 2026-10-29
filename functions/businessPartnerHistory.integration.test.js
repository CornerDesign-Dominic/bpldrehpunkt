import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { registerHooks } from 'node:module'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as adminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectFirestoreEmulator, getFirestore, collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'

test('actual browser persistence: compact creation, precise atomic edits, no-op and history permissions', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-dycos'
  const stamp = Date.now(); const uid = `history-editor-${stamp}`; const viewer = `history-viewer-${stamp}`
  const adminApp = initializeAdminApp({ projectId }, `history-admin-${stamp}`)
  const admin = adminFirestore(adminApp)
  const app = initializeApp({ projectId, apiKey: 'test' }, `history-editor-${stamp}`)
  const viewerApp = initializeApp({ projectId, apiKey: 'test' }, `history-viewer-${stamp}`)
  const db = getFirestore(app); const viewerDb = getFirestore(viewerApp)
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid } })
  connectFirestoreEmulator(viewerDb, host, Number(port), { mockUserToken: { sub: viewer } })
  await admin.doc(`users/${uid}`).set({ active: true, role: 'user', permissions: { masterData: 'edit' } })
  await admin.doc(`users/${viewer}`).set({ active: true, role: 'user', permissions: { masterData: 'view' } })
  // Use the real browser implementation against the emulator. Substitute only
  // its environment bootstrap; no cloud configuration, auth or App Check calls.
  globalThis.__partnerHistoryTestDb = db
  globalThis.__partnerHistoryTestAuth = { currentUser: { uid, email: 'editor@example.test' } }
  const bootstrap = 'data:text/javascript,' + encodeURIComponent('export const db=globalThis.__partnerHistoryTestDb; export const auth=globalThis.__partnerHistoryTestAuth')
  const hooks = registerHooks({ resolve(specifier, context, next) {
    const result = next(specifier, context)
    return result.url.endsWith('/src/lib/firebase.js') ? { url: bootstrap, shortCircuit: true } : result
  } })
  try {
    const { createEmptyBusinessPartner, createBusinessPartner, updateBusinessPartner } = await import('../src/lib/businessPartners.js')
    hooks.deregister()
    const values = { ...createEmptyBusinessPartner(), companyName: 'Firma Alt' }
    const id = await createBusinessPartner(values, null, { id: uid, name: 'Anna Beispiel' })
    const ref = doc(db, 'businessPartners', id)
    let history = await getDocs(collection(ref, 'history'))
    assert.equal(history.size, 1)
    assert.equal(history.docs[0].get('action'), 'created')
    assert.equal(history.docs[0].get('createdByName'), 'Anna Beispiel')
    assert.deepEqual(history.docs[0].get('metadata'), {})
    const next = { ...(await getDoc(ref)).data(), companyName: 'Firma Neu', contact: { ...values.contact, email: 'neu@example.test' }, creditLimit: 0 }
    await updateBusinessPartner(id, next, { id: uid, name: 'Ben Beispiel' })
    history = await getDocs(collection(ref, 'history'))
    const changes = history.docs.flatMap((entry) => entry.get('metadata.changes') || [])
    assert.deepEqual(changes.find((entry) => entry.path === 'companyName').oldValue, 'Firma Alt')
    assert.deepEqual(changes.find((entry) => entry.path === 'contact.email').oldValue, null)
    assert.equal(changes.find((entry) => entry.path === 'creditLimit').newValue, 0)
    assert.ok(history.docs.filter((entry) => entry.get('action') === 'updated').every((entry) => entry.get('createdByUserId') === uid))
    const count = history.size
    await updateBusinessPartner(id, next, { id: uid, name: 'Ben Beispiel' })
    assert.equal((await getDocs(collection(ref, 'history'))).size, count)
    const viewerHistory = collection(viewerDb, 'businessPartners', id, 'history')
    assert.equal((await getDocs(viewerHistory)).size, count)
    await assert.rejects(setDoc(doc(viewerHistory), { action: 'updated' }), /permission|insufficient/i)
  } finally {
    hooks.deregister()
    delete globalThis.__partnerHistoryTestDb; delete globalThis.__partnerHistoryTestAuth
    await Promise.all([deleteApp(app), deleteApp(viewerApp), deleteAdminApp(adminApp)])
  }
})
