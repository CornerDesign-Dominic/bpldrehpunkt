import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { normalizeContractMutation, persistContractMutation } from './contracts.js'

test('contract transactions preserve revisions, idempotency, history and document recovery', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-drehpunkt-contracts' }, `contracts-mutations-${Date.now()}`)
  const db = getFirestore(app)
  const actor = { uid: 'contract-mutation-editor' }
  const parentRef = db.doc('contracts/contract-mutation-file')
  let counter = 0
  const blobs = new Map()
  let storageFailure = null
  const bucket = { file: (path) => ({
    getMetadata: async () => { if (storageFailure) throw storageFailure; if (!blobs.has(path)) throw Object.assign(new Error('Missing'), { code: 404 }); return [{ ...blobs.get(path) }] },
    delete: async (options) => { if (storageFailure) throw storageFailure; assert.equal(String(options.ifGenerationMatch), String(blobs.get(path)?.generation)); blobs.delete(path) },
  }) }
  const input = (action, values = {}, options = {}) => normalizeContractMutation({ contractId: parentRef.id, mutationId: `mutation-${++counter}`, action, values, ...options })
  const mutate = (data, selectedActor = actor) => persistContractMutation(db, data, selectedActor, bucket)
  try {
    await db.doc(`users/${actor.uid}`).set({ active: true, role: 'user', permissions: { contracts: 'edit' }, firstName: 'Editor', lastName: 'Name' })
    await parentRef.set({ partnerName: 'Legacy GmbH', createdAt: new Date(), createdBy: actor.uid })
    await t.test('legacy details revision zero, same mutation replay and changed payload rejection', async () => {
      const data = input('details', { partnerName: 'Neue GmbH' })
      const first = await mutate(data)
      assert.deepEqual(first, { id: parentRef.id, revision: 1, parentRevision: 1 })
      assert.deepEqual(await mutate(data), first)
      assert.equal((await parentRef.collection('history').get()).size, 1)
      await assert.rejects(mutate({ ...data, values: { ...data.values, partnerName: 'Andere GmbH' } }), { code: 'already-exists' })
      await assert.rejects(mutate(input('details', { partnerName: 'Veraltet' })), { code: 'aborted' })
      assert.equal((await parentRef.get()).get('createdBy'), actor.uid)
    })
    await t.test('concurrent child updates serialize and unrelated changes advance parent revision', async () => {
      const saved = await mutate(input('position.save', { title: 'Lizenz', grossAmountCents: 1980, billingCycle: 'monthly', anchorDate: '2026-11-05' }, { recordId: 'license' }))
      assert.equal(saved.revision, 1)
      const writes = await Promise.allSettled([mutate(input('position.save', { title: 'A', grossAmountCents: 1980, billingCycle: 'monthly', anchorDate: '2026-11-05' }, { recordId: 'license', expectedRevision: 1 })), mutate(input('position.save', { title: 'B', grossAmountCents: 1980, billingCycle: 'monthly', anchorDate: '2026-11-05' }, { recordId: 'license', expectedRevision: 1 }))])
      assert.equal(writes.filter((entry) => entry.status === 'fulfilled').length, 1)
      assert.equal(writes.find((entry) => entry.status === 'rejected').reason.code, 'aborted')
      const note = input('note.add', { text: 'Interne Notiz' })
      await mutate(note); await mutate(note)
      assert.equal((await parentRef.collection('notes').get()).size, 1)
      await mutate(input('deadline.save', { title: 'Verlängerung', type: 'renewal', date: '2026-12-31', completed: false }, { recordId: 'deadline' }))
      const remove = input('deadline.delete', {}, { recordId: 'deadline', expectedRevision: 1 })
      assert.deepEqual(await mutate(remove), await mutate(remove))
      assert.equal((await parentRef.collection('deadlines').doc('deadline').get()).exists, false)
      const parent = (await parentRef.get()).data()
      assert.equal(parent.updatedByName, 'Editor Name')
      assert.equal((await parentRef.collection('history').get()).size, parent.revision)
      assert.equal(JSON.stringify((await parentRef.collection('history').get()).docs.map((doc) => doc.data())).includes('Interne Notiz'), false)
    })
    await t.test('transactions recheck revoked rights and reject active admin or inactive superadmin', async () => {
      for (const [name, profile] of Object.entries({ view: { active: true, role: 'user', permissions: { contracts: 'view' } }, admin: { active: true, role: 'admin', permissions: {} }, inactive: { active: false, role: 'superadmin' } })) {
        await db.doc(`users/contract-mutation-${name}`).set(profile)
        await assert.rejects(mutate(input('note.add', { text: 'Denied' }), { uid: `contract-mutation-${name}` }), { code: 'permission-denied' })
      }
      await assert.rejects(mutate(input('note.add', { text: 'Denied' }), { uid: 'missing' }), { code: 'permission-denied' })
      const replay = input('note.add', { text: 'Vor Rechteentzug gespeichert' })
      await mutate(replay)
      await db.doc(`users/${actor.uid}`).update({ 'permissions.contracts': 'view' })
      await assert.rejects(mutate(replay), { code: 'permission-denied' })
      await db.doc(`users/${actor.uid}`).update({ 'permissions.contracts': 'edit' })
    })
    await t.test('PDF finalize retries after absent upload and completed receipts avoid duplicate history', async () => {
      const reserve = input('document.reserve', { title: 'PDF', description: '', fileName: 'contract.pdf', fileSize: 100, contentType: 'application/pdf' }, { recordId: 'pdf' })
      const reserved = await mutate(reserve)
      assert.equal(reserved.status, 'pending')
      assert.deepEqual((await parentRef.get()).get('documentStorageAccess.pdf'), { status: 'pending', fileSize: 100 })
      const revisionBeforeRepair = (await parentRef.get()).get('revision')
      await parentRef.update({ 'documentStorageAccess.pdf': FieldValue.delete(), 'documentStorageAccess.other': { status: 'pending', fileSize: 42 } })
      assert.deepEqual(await mutate(reserve), reserved)
      assert.deepEqual((await parentRef.get()).get('documentStorageAccess.pdf'), { status: 'pending', fileSize: 100 })
      assert.equal((await parentRef.get()).get('revision'), revisionBeforeRepair)
      assert.deepEqual((await parentRef.get()).get('documentStorageAccess.other'), { status: 'pending', fileSize: 42 })
      const finalize = input('document.finalize', {}, { recordId: 'pdf', expectedRevision: 1 })
      await assert.rejects(mutate(finalize), (error) => error.code === 'failed-precondition' && error.details.reason === 'upload-missing')
      assert.equal((await parentRef.collection('documents').doc('pdf').get()).get('status'), 'pending')
      assert.deepEqual((await parentRef.get()).get('documentStorageAccess.pdf'), { status: 'pending', fileSize: 100 })
      // Live pre-fix uploads can already have a processing finalize receipt,
      // a pending child and no parent manifest. The same retained client retry
      // must repair its upload permit when the server confirms no blob exists.
      assert.equal((await parentRef.collection('mutations').doc(finalize.mutationId).get()).get('status'), 'processing')
      await parentRef.update({ 'documentStorageAccess.pdf': FieldValue.delete() })
      await assert.rejects(mutate(finalize), (error) => error.details.reason === 'upload-missing')
      assert.deepEqual((await parentRef.get()).get('documentStorageAccess.pdf'), { status: 'pending', fileSize: 100 })
      blobs.set(reserved.storagePath, { size: '100', contentType: 'text/plain', generation: '1', metadata: { contractId: parentRef.id, documentId: 'pdf' } })
      await assert.rejects(mutate(finalize), (error) => error.details.reason === 'upload-mismatch')
      blobs.get(reserved.storagePath).contentType = 'application/pdf'
      const ready = await mutate(finalize)
      assert.equal(ready.status, 'ready'); assert.equal(ready.revision, 2)
      assert.deepEqual(await mutate(finalize), ready)
      assert.deepEqual((await parentRef.get()).get('documentStorageAccess.pdf'), { status: 'ready', fileSize: 100 })
      await parentRef.update({ 'documentStorageAccess.pdf': FieldValue.delete() })
      // Replaying an old reserve repairs actual ready state, not old pending.
      assert.deepEqual(await mutate(reserve), reserved)
      assert.deepEqual((await parentRef.get()).get('documentStorageAccess.pdf'), { status: 'ready', fileSize: 100 })
      await parentRef.update({ 'documentStorageAccess.pdf': FieldValue.delete() })
      const update = await mutate(input('document.update', { title: 'Neue Bezeichnung' }, { recordId: 'pdf', expectedRevision: 2 }))
      assert.equal(update.revision, 3)
      assert.deepEqual((await parentRef.get()).get('documentStorageAccess.pdf'), { status: 'ready', fileSize: 100 })
      const deletion = input('document.delete', {}, { recordId: 'pdf', expectedRevision: 3 })
      storageFailure = new Error('Storage unavailable')
      await assert.rejects(mutate(deletion), /Storage unavailable/)
      assert.equal((await parentRef.collection('documents').doc('pdf').get()).get('status'), 'deleting')
      assert.deepEqual((await parentRef.get()).get('documentStorageAccess.pdf'), { status: 'deleting', fileSize: 100 })
      assert.equal((await parentRef.collection('documents').doc('pdf').get()).get('operationActorId'), actor.uid)
      await db.doc('users/contract-second-editor').set({ active: true, role: 'user', permissions: { contracts: 'edit' } })
      await assert.rejects(mutate(deletion, { uid: 'contract-second-editor' }), { code: 'already-exists' })
      await assert.rejects(mutate(input('document.update', { title: 'Race' }, { recordId: 'pdf', expectedRevision: 3 })), { code: 'failed-precondition' })
      storageFailure = null
      const deleted = await mutate(deletion)
      assert.equal(deleted.status, 'deleted'); assert.deepEqual(await mutate(deletion), deleted)
      assert.equal(blobs.has(reserved.storagePath), false)
      assert.equal((await parentRef.collection('documents').doc('pdf').get()).exists, false)
      assert.equal((await parentRef.get()).get('documentStorageAccess.pdf'), undefined)
      // A reserve replay after deletion must not recreate an upload permit.
      await mutate(reserve)
      assert.equal((await parentRef.get()).get('documentStorageAccess.pdf'), undefined)
      assert.equal((await parentRef.collection('history').get()).size, (await parentRef.get()).get('revision'))
    })
    await t.test('pending PDFs can be discarded without a blob and finalizing locks block competing mutations', async () => {
      const values = { title: 'Unvollständiges PDF', fileName: 'pending.pdf', fileSize: 6, contentType: 'application/pdf' }
      await mutate(input('document.reserve', values, { recordId: 'pending' }))
      const removal = input('document.delete', {}, { recordId: 'pending', expectedRevision: 1 })
      assert.equal((await mutate(removal)).status, 'deleted')
      assert.equal((await parentRef.get()).get('documentStorageAccess.pending'), undefined)
      assert.deepEqual(await mutate(removal), await mutate(removal))
      await mutate(input('document.reserve', values, { recordId: 'finalizing' }))
      await parentRef.collection('documents').doc('finalizing').update({ status: 'finalizing', operationMutationId: 'other-mutation' })
      await assert.rejects(mutate(input('document.delete', {}, { recordId: 'finalizing', expectedRevision: 1 })), { code: 'failed-precondition' })
      await assert.rejects(mutate(input('document.finalize', {}, { recordId: 'finalizing', expectedRevision: 1 })), { code: 'failed-precondition' })
      await parentRef.collection('documents').doc('finalizing').update({ status: 'pending' })
      await mutate(input('document.delete', {}, { recordId: 'finalizing', expectedRevision: 1 }))
    })
  } finally { await deleteApp(app) }
})
