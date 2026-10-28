import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { updateOwnTransportOrderListPreferencesHandler } from './userPreferences.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled) initializeApp({ projectId: 'demo-drehpunkt-preferences' })
const request = (uid, data) => ({ auth: uid ? { uid } : null, data })

test('Firestore emulator: list settings persist on the own profile without changing rights or another user', { skip: !enabled }, async () => {
  const db = getFirestore()
  const own = db.doc('users/preferences-owner')
  const other = db.doc('users/preferences-other')
  const permissions = { transportOrders: 'view' }
  await own.set({ active: true, role: 'user', permissions, userPreferences: { unrelated: 'keep' } })
  await other.set({ active: true, role: 'admin' })
  const result = await updateOwnTransportOrderListPreferencesHandler(request(own.id, { preferences: { search: '  261000035 ', trackingFilter: 'in_progress', pageSize: 50 } }))
  const saved = (await own.get()).data()
  assert.deepEqual(saved.userPreferences.transportOrderList, result.preferences)
  assert.equal(saved.userPreferences.transportOrderList.search, '261000035')
  assert.equal(saved.userPreferences.transportOrderList.pageSize, 50)
  assert.ok(saved.userPreferences.transportOrderListUpdatedAt.toDate() instanceof Date)
  assert.equal(saved.userPreferences.unrelated, 'keep')
  assert.equal(saved.role, 'user')
  assert.deepEqual(saved.permissions, permissions)
  assert.deepEqual((await other.get()).data(), { active: true, role: 'admin' })
  await assert.rejects(updateOwnTransportOrderListPreferencesHandler(request(own.id, { preferences: {}, userId: other.id })), { code: 'invalid-argument' })
  assert.deepEqual((await own.get()).data(), saved)
})

test('Firestore emulator: unauthenticated, inactive and missing profiles cannot save list settings', { skip: !enabled }, async () => {
  await getFirestore().doc('users/preferences-inactive').set({ active: false })
  await assert.rejects(updateOwnTransportOrderListPreferencesHandler(request(null, { preferences: {} })), { code: 'unauthenticated' })
  for (const uid of ['preferences-inactive', 'preferences-missing']) {
    await assert.rejects(updateOwnTransportOrderListPreferencesHandler(request(uid, { preferences: {} })), { code: 'permission-denied' })
  }
  assert.deepEqual((await getFirestore().doc('users/preferences-inactive').get()).data(), { active: false })
})

test('Firestore emulator: invalid preferences cannot modify protected profile fields', { skip: !enabled }, async () => {
  const ref = getFirestore().doc('users/preferences-invalid')
  const original = { active: true, role: 'user' }
  await ref.set(original)
  for (const preferences of [{ role: 'superadmin' }, { loadingFrom: '2026-11-01', loadingUntil: '2026-10-01' }]) {
    await assert.rejects(updateOwnTransportOrderListPreferencesHandler(request(ref.id, { preferences })), { code: 'invalid-argument' })
  }
  assert.deepEqual((await ref.get()).data(), original)
})
