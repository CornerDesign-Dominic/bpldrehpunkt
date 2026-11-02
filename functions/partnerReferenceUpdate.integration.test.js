import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app'
import { getFirestore as getAdminFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import * as firestore from 'firebase/firestore'
import { partnerReferenceVersion } from '../src/lib/partnerReference.js'

// The module mock supplies only an emulator-bound client. It prevents importing
// the browser's Vite/Firebase initialization and needs no real app credentials.
// Run with: node --experimental-test-module-mocks --test functions/partnerReferenceUpdate.integration.test.js
test('actual client partner updates preserve origin and reject stale redirects transactionally', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async (t) => {
  assert.equal(typeof t.mock.module, 'function', 'Run this integration suite with --experimental-test-module-mocks')
  const projectId = `${process.env.GCLOUD_PROJECT || 'demo-drehpunkt-partner-updates'}-client-updates`
  assert.ok(projectId.startsWith('demo-'), 'This suite must never access a real project')
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  assert.ok(['127.0.0.1', 'localhost'].includes(host), 'Only a local emulator is allowed')
  const suffix = Date.now()
  const adminApp = initializeAdminApp({ projectId }, `reference-update-admin-${suffix}`)
  const admin = getAdminFirestore(adminApp)
  const clientApp = initializeApp({ projectId, apiKey: 'emulator-only' }, `reference-update-client-${suffix}`)
  const db = firestore.getFirestore(clientApp)
  firestore.connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: 'reference-update-editor' } })
  firestore.setLogLevel('silent')
  let afterReads = null
  let transactionAttempts = 0
  t.mock.module('firebase/firestore', { namedExports: {
    ...firestore,
    runTransaction: (client, update, options) => firestore.runTransaction(client, async (transaction) => {
      transactionAttempts += 1
      const result = await update(transaction)
      if (afterReads) {
        const hook = afterReads
        afterReads = null
        await hook()
      }
      return result
    }, options),
  } })
  t.mock.module(new URL('../src/lib/firebase.js', import.meta.url).href, { namedExports: { db, functions: {}, auth: { currentUser: { uid: 'reference-update-editor' } } } })
  try {
    const { createEmptyBusinessPartner, getBusinessPartner, updateBusinessPartner } = await import('../src/lib/businessPartners.js')
    const actor = { id: 'reference-update-editor', name: 'Reference Update' }
    await admin.doc(`users/${actor.id}`).set({ active: true, role: 'user', firstName: 'Reference', lastName: 'Update', permissions: { masterData: 'edit', partnerMerges: 'none' } })
    const origin = admin.doc('businessPartners/update-origin')
    const target = admin.doc('businessPartners/update-target')
    await origin.set({ ...createEmptyBusinessPartner(), id: origin.id, companyName: 'Origin', status: 'merged', mergedIntoPartnerId: target.id, mergedByMergeId: 'server-merge', updatedAt: new Timestamp(100, 123456000) })
    await target.set({ ...createEmptyBusinessPartner(), id: target.id, companyName: 'Target', debtorNumber: '10020', updatedAt: new Timestamp(100, 123456000) })

    await t.test('normal original URL saves only its current target and its trusted edit history', async () => {
      const beforeOrigin = (await origin.get()).data()
      const viewed = await getBusinessPartner(target.id)
      await updateBusinessPartner(target.id, { ...viewed, palletNote: 'Saved through original reference' }, actor, { referencePartnerId: origin.id, expectedReferenceVersion: partnerReferenceVersion(viewed) })
      assert.deepEqual((await origin.get()).data(), beforeOrigin)
      assert.equal((await target.get()).get('palletNote'), 'Saved through original reference')
      assert.equal((await origin.collection('history').get()).size, 0)
      const history = await target.collection('history').get()
      assert.ok(history.size > 0)
      for (const entry of history.docs) {
        assert.equal(entry.get('createdByUserId'), actor.id)
        assert.equal(entry.get('action'), 'updated')
      }
    })

    await t.test('a persisted sub-millisecond version change blocks stale input without writing history', async () => {
      // Firestore persists timestamp values at microsecond precision. Keep the
      // difference below one millisecond while verifying the exact stored pair.
      await target.update({ updatedAt: new Timestamp(200, 123456000) })
      const viewed = await getBusinessPartner(target.id)
      const nextTime = new Timestamp(viewed.updatedAt.seconds, viewed.updatedAt.nanoseconds + 1000)
      assert.equal(nextTime.toDate().getTime(), viewed.updatedAt.toDate().getTime(), 'A Date-based check would miss this change')
      await target.update({ updatedAt: nextTime, palletNote: 'Other user changed this' })
      const before = (await target.get()).data()
      assert.equal(before.updatedAt.nanoseconds, nextTime.nanoseconds)
      const historyCount = (await target.collection('history').get()).size
      await assert.rejects(updateBusinessPartner(target.id, { ...viewed, palletNote: 'Stale overwrite' }, actor, { referencePartnerId: origin.id, expectedReferenceVersion: partnerReferenceVersion(viewed) }), { code: 'failed-precondition' })
      assert.deepEqual((await target.get()).data(), before)
      assert.equal((await target.collection('history').get()).size, historyCount)
    })

    await t.test('an original partner detached before save never writes the former target', async () => {
      const viewed = await getBusinessPartner(target.id)
      await origin.update({ status: 'active', mergedIntoPartnerId: FieldValue.delete(), mergedByMergeId: FieldValue.delete() })
      const before = (await target.get()).data()
      const historyCount = (await target.collection('history').get()).size
      await assert.rejects(updateBusinessPartner(target.id, { ...viewed, palletNote: 'Wrong former target' }, actor, { referencePartnerId: origin.id, expectedReferenceVersion: partnerReferenceVersion(viewed) }), { code: 'failed-precondition' })
      assert.deepEqual((await target.get()).data(), before)
      assert.equal((await target.collection('history').get()).size, historyCount)
      assert.equal((await origin.get()).get('palletNote'), '')
    })

    await t.test('a detach after transaction reads forces a retry and blocks the complete stale write', async () => {
      await origin.update({ status: 'merged', mergedIntoPartnerId: target.id, mergedByMergeId: 'server-merge-again' })
      const viewed = await getBusinessPartner(target.id)
      const before = (await target.get()).data()
      const historyCount = (await target.collection('history').get()).size
      transactionAttempts = 0
      let hookCalls = 0
      afterReads = async () => {
        hookCalls += 1
        await origin.update({ status: 'active', mergedIntoPartnerId: FieldValue.delete(), mergedByMergeId: FieldValue.delete() })
      }
      await assert.rejects(updateBusinessPartner(target.id, { ...viewed, palletNote: 'Concurrent stale write' }, actor, { referencePartnerId: origin.id, expectedReferenceVersion: partnerReferenceVersion(viewed) }), { code: 'failed-precondition' })
      assert.equal(hookCalls, 1)
      assert.ok(transactionAttempts >= 2, 'The real client transaction must retry after its source read becomes stale')
      assert.deepEqual((await target.get()).data(), before)
      assert.equal((await target.collection('history').get()).size, historyCount)
      assert.equal((await origin.get()).get('status'), 'active')
    })
  } finally {
    afterReads = null
    await firestore.terminate(db)
    await deleteApp(clientApp)
    await admin.terminate()
    await deleteAdminApp(adminApp)
  }
})
