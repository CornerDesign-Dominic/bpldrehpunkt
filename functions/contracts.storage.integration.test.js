import assert from 'node:assert/strict'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { getStorage as getAdminStorage } from 'firebase-admin/storage'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectStorageEmulator, deleteObject, getMetadata, getStorage, ref, uploadBytes } from 'firebase/storage'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST)
test('contract PDF Storage enforces reservations, immutability, visibility and cleanup', { skip: !enabled }, async (t) => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-contracts'
  const bucketName = `${projectId}.appspot.com`
  const stamp = Date.now()
  const adminApp = initializeAdminApp({ projectId, storageBucket: bucketName }, `contracts-storage-admin-${stamp}`)
  const db = getAdminFirestore(adminApp)
  const bucket = getAdminStorage(adminApp).bucket()
  const apps = []
  const [host, port] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':')
  const profiles = {
    editor: { active: true, role: 'user', permissions: { contracts: 'edit' } },
    viewer: { active: true, role: 'user', permissions: { contracts: 'view' } },
    none: { active: true, role: 'user', permissions: { contracts: 'none' } },
    admin: { active: true, role: 'admin', permissions: {} },
    inactive: { active: false, role: 'superadmin' },
    superadmin: { active: true, role: 'superadmin' },
  }
  const clients = Object.fromEntries([...Object.keys(profiles), 'missing', 'anonymous'].map((name) => {
    const app = initializeApp({ projectId, storageBucket: bucketName, apiKey: 'test' }, `contracts-storage-${name}-${stamp}`)
    apps.push(app)
    const storage = getStorage(app)
    connectStorageEmulator(storage, host, Number(port), name === 'anonymous' ? {} : { mockUserToken: { sub: `contracts-storage-${name}` } })
    return [name, storage]
  }))
  const contractId = 'storage-contract'
  const parent = db.doc(`contracts/${contractId}`)
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 49])
  const path = (documentId) => `contracts/${contractId}/documents/${documentId}.pdf`
  const metadata = (documentId) => ({ contentType: 'application/pdf', customMetadata: { contractId, documentId } })
  const seed = async (documentId, status = 'pending', extra = {}) => parent.collection('documents').doc(documentId).set({ title: 'Vertrag', status, fileSize: bytes.length, storagePath: path(documentId), revision: 1, ...extra })
  const denied = async (operation) => assert.rejects(operation(), (error) => error.code === 'storage/unauthorized')
  try {
    await Promise.all(Object.entries(profiles).map(([name, profile]) => db.doc(`users/contracts-storage-${name}`).set(profile)))
    await parent.set({ partnerName: 'PDF-Partner' })
    await t.test('only editors and superadmins can upload a correctly reserved immutable PDF', async () => {
      for (const [name, storage] of Object.entries(clients)) {
        const documentId = `upload-${name}`
        await seed(documentId)
        const target = ref(storage, path(documentId))
        if (['editor', 'superadmin'].includes(name)) {
          await uploadBytes(target, bytes, metadata(documentId))
          await denied(() => uploadBytes(target, bytes, metadata(documentId)))
          await denied(() => getMetadata(target))
        } else await denied(() => uploadBytes(target, bytes, metadata(documentId)))
      }
    })
    await t.test('ready blobs are readable by contract readers and cannot be deleted directly', async () => {
      const documentId = 'ready'
      await seed(documentId, 'ready')
      await bucket.file(path(documentId)).save(Buffer.from(bytes), { metadata: { contentType: 'application/pdf', metadata: { contractId, documentId } } })
      for (const [name, storage] of Object.entries(clients)) {
        const target = ref(storage, path(documentId))
        if (['viewer', 'editor', 'superadmin'].includes(name)) await getMetadata(target)
        else await denied(() => getMetadata(target))
        await denied(() => deleteObject(target))
      }
    })
    await t.test('forged reservation, wrong size/type, missing parent and finalizing states deny upload', async () => {
      const storage = clients.editor
      await denied(() => uploadBytes(ref(storage, path('unreserved')), bytes, metadata('unreserved')))
      for (const status of ['ready', 'finalizing', 'deleting']) {
        await seed(status, status)
        await denied(() => uploadBytes(ref(storage, path(status)), bytes, metadata(status)))
      }
      for (const [documentId, changedMetadata, content] of [
        ['bad-type', { contentType: 'text/plain' }, bytes],
        ['bad-contract', { customMetadata: { contractId: 'other', documentId: 'bad-contract' } }, bytes],
        ['bad-id', { customMetadata: { contractId, documentId: 'other' } }, bytes],
        ['bad-size', {}, new Uint8Array([1])],
      ]) {
        await seed(documentId)
        await denied(() => uploadBytes(ref(storage, path(documentId)), content, { ...metadata(documentId), ...changedMetadata }))
      }
      await db.doc('contracts/storage-orphan/documents/pdf').set({ status: 'pending', fileSize: bytes.length, storagePath: 'contracts/storage-orphan/documents/pdf.pdf' })
      await denied(() => uploadBytes(ref(storage, 'contracts/storage-orphan/documents/pdf.pdf'), bytes, { contentType: 'application/pdf', customMetadata: { contractId: 'storage-orphan', documentId: 'pdf' } }))
      await db.doc('contracts/storage-orphan/documents/pdf').update({ status: 'ready' })
      await bucket.file('contracts/storage-orphan/documents/pdf.pdf').save(Buffer.from(bytes), { contentType: 'application/pdf' })
      await denied(() => getMetadata(ref(storage, 'contracts/storage-orphan/documents/pdf.pdf')))
    })
    await t.test('only editors can clean up pending blobs, never finalizing or deleting locks', async () => {
      for (const [name, storage] of Object.entries(clients)) {
        const documentId = `cleanup-${name}`
        await seed(documentId)
        await bucket.file(path(documentId)).save(Buffer.from(bytes), { contentType: 'application/pdf' })
        if (['editor', 'superadmin'].includes(name)) await deleteObject(ref(storage, path(documentId)))
        else await denied(() => deleteObject(ref(storage, path(documentId))))
      }
      for (const status of ['finalizing', 'deleting']) {
        await seed(`locked-${status}`, status)
        await bucket.file(path(`locked-${status}`)).save(Buffer.from(bytes), { contentType: 'application/pdf' })
        await denied(() => deleteObject(ref(clients.editor, path(`locked-${status}`))))
      }
    })
  } finally {
    await Promise.all(apps.map((app) => deleteApp(app)))
    await deleteAdminApp(adminApp)
  }
})
