import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { resolveDycosPartnerConflictsHandler } from './dycosPartnerReview.js'
import { dycosConflictRows } from './shared/dycosPartnerConflicts.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) { assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(localhost|127\.0\.0\.1):/); initializeApp({ projectId: 'demo-drehpunkt-dycos-review' }) }
async function setup(extra = {}) {
  const db = getFirestore(), uid = randomUUID(), partnerId = randomUUID()
  await db.doc(`users/${uid}`).set({ active: true, permissions: { masterData: 'edit' }, firstName: 'Review', lastName: 'Test' })
  const partner = { companyName: 'Manueller Name', address: { city: 'Alt', street: 'Erhalten' }, creditLimit: 42, status: 'insolvency', dycosImport: { conflicts: [
    { path: 'companyName', label: 'Firmenname', currentValue: 'Manueller Name', incomingValue: 'DyCoS Name' },
    { path: 'address.city', label: 'Ort', currentValue: 'Alt', incomingValue: 'Neu' },
  ], sourceReferences: [{ entity: 'customer', id: '11' }] }, ...extra }
  const ref = db.doc(`businessPartners/${partnerId}`); await ref.set(partner)
  return { db, uid, ref, partnerId, partner, request: { auth: { uid }, data: { partnerId, decision: 'accept', expectedRows: dycosConflictRows(partner).slice(0, 1) } } }
}

test('emulator: review requires an active master-data editor; imports permission is insufficient', { skip: !enabled }, async () => {
  const state = await setup()
  await assert.rejects(resolveDycosPartnerConflictsHandler({ data: state.request.data }), { code: 'unauthenticated' })
  for (const patch of [{ active: false }, { active: true, permissions: { masterData: 'view', dataImports: 'edit' } }]) {
    await state.db.doc(`users/${state.uid}`).update(patch)
    await assert.rejects(resolveDycosPartnerConflictsHandler(state.request), { code: 'permission-denied' })
  }
  assert.equal((await state.ref.get()).get('companyName'), 'Manueller Name')
})

test('emulator: accept changes only the selected row and atomically records actor and before/after history', { skip: !enabled }, async () => {
  const s = await setup()
  const result = await resolveDycosPartnerConflictsHandler(s.request)
  assert.equal(result.changedFields, 1)
  const saved = (await s.ref.get()).data()
  assert.equal(saved.companyName, 'DyCoS Name'); assert.deepEqual(saved.address, { city: 'Alt', street: 'Erhalten' })
  assert.equal(saved.creditLimit, 42); assert.equal(saved.status, 'insolvency'); assert.equal(dycosConflictRows(saved).length, 1)
  const entries = await s.ref.collection('history').get()
  assert.equal(entries.size, 1); assert.equal(entries.docs[0].get('createdByName'), 'Review Test')
  assert.equal(entries.docs[0].get('metadata.changes')[0].oldValue, 'Manueller Name')
  assert.equal(entries.docs[0].get('metadata.changes')[0].newValue, 'DyCoS Name')
  await assert.rejects(resolveDycosPartnerConflictsHandler(s.request), { code: 'aborted' })
  assert.equal((await s.ref.collection('history').get()).size, 1)
})

test('emulator: keep preserves fields and closes only the identical comparison', { skip: !enabled }, async () => {
  const s = await setup(); s.request.data.decision = 'keep'
  await resolveDycosPartnerConflictsHandler(s.request)
  const saved = (await s.ref.get()).data()
  assert.equal(saved.companyName, 'Manueller Name'); assert.equal(saved.address.city, 'Alt')
  assert.equal(dycosConflictRows(saved).length, 1)
  assert.equal((await s.ref.collection('history').get()).docs[0].get('metadata.decision'), 'keep')
  saved.dycosImport.conflicts[0].incomingValue = 'Neue Quelldaten'
  assert.equal(dycosConflictRows(saved).length, 2)
  await assert.rejects(resolveDycosPartnerConflictsHandler(s.request), { code: 'aborted' })
})

test('emulator: concurrent manual/source changes, merge redirects and forged fields are never overwritten', { skip: !enabled }, async () => {
  for (const change of [{ companyName: 'Parallel' }, { 'dycosImport.conflicts': [{ path: 'companyName', label: 'Firmenname', incomingValue: 'Geändert' }] }, { mergedIntoPartnerId: 'target' }]) {
    const s = await setup(); await s.ref.update(change)
    await assert.rejects(resolveDycosPartnerConflictsHandler(s.request), { code: 'aborted' })
    assert.equal((await s.ref.collection('history').get()).size, 0)
  }
  const s = await setup(); s.request.data.expectedRows[0].incomingValue = 'Fälschung'
  await assert.rejects(resolveDycosPartnerConflictsHandler(s.request), { code: 'aborted' })
  const forbidden = await setup({ dycosImport: { conflicts: [{ path: 'creditLimit', label: 'Kreditlimit', incomingValue: 9999 }] } })
  await assert.rejects(resolveDycosPartnerConflictsHandler(forbidden.request), { code: 'aborted' })
  assert.equal((await forbidden.ref.get()).get('creditLimit'), 42)
})

test('emulator: independent row decisions preserve earlier rejections; bulk requests are rejected', { skip: !enabled }, async () => {
  const s = await setup()
  await assert.rejects(resolveDycosPartnerConflictsHandler({ ...s.request, data: { ...s.request.data, expectedRows: dycosConflictRows(s.partner) } }), { code: 'invalid-argument' })
  s.request.data.decision = 'keep'
  await resolveDycosPartnerConflictsHandler(s.request)
  const remaining = dycosConflictRows((await s.ref.get()).data())
  assert.equal(remaining.length, 1); assert.equal(remaining[0].path, 'address.city')
  await resolveDycosPartnerConflictsHandler({ ...s.request, data: { ...s.request.data, decision: 'accept', expectedRows: remaining } })
  const saved = (await s.ref.get()).data()
  assert.equal(saved.companyName, 'Manueller Name'); assert.equal(saved.address.city, 'Neu')
  assert.equal(saved.dycosImport.resolutions.length, 1); assert.equal(dycosConflictRows(saved).length, 0)
  assert.equal((await s.ref.collection('history').get()).size, 2)
})

test('emulator: contact acceptance follows stable IDs; legacy and ambiguous comparisons require review', { skip: !enabled }, async () => {
  const contactConflict = { path: 'contacts.0.phone', label: 'Ansprechpartner', currentValue: 'Alt', incomingValue: 'Neu', contactId: 'a' }
  const s = await setup({ contacts: [{ id: 'b', phone: 'Nicht ändern' }, { id: 'a', phone: 'Alt' }], dycosImport: { conflicts: [contactConflict] } })
  await resolveDycosPartnerConflictsHandler(s.request)
  assert.deepEqual((await s.ref.get()).get('contacts'), [{ id: 'b', phone: 'Nicht ändern' }, { id: 'a', phone: 'Neu' }])
  for (const entry of [{ ...contactConflict, contactId: null }, { path: 'companyName', label: 'Firmenname', incomingValue: 'Quelle A / Quelle B', resolvable: false }]) {
    const old = await setup({ contacts: [{ phone: 'Alt' }], dycosImport: { conflicts: [entry] } })
    await assert.rejects(resolveDycosPartnerConflictsHandler(old.request), { code: 'failed-precondition' })
    assert.equal((await old.ref.collection('history').get()).size, 0)
  }
})
