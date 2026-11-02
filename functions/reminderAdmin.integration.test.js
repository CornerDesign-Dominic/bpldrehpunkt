import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { listCaseReminderUsersHandler, setReminderResponsibilityHandler } from './reminderAdmin.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const app = enabled ? initializeApp({ projectId: `demo-reminder-admin-${process.pid}` }, `reminder-admin-${process.pid}`) : null
const db = enabled ? getFirestore(app) : null
const editor = { active: true, role: 'user', firstName: 'Editor', permissions: { damages: 'edit', inkasso: 'edit', insolvencies: 'edit', legalDisputes: 'edit' } }
const viewer = { active: true, role: 'user', firstName: 'Recipient', email: 'recipient@example.test', permissions: { damages: 'view', inkasso: 'view', insolvencies: 'view', legalDisputes: 'view' } }
const options = { db, authorize: async () => editor }
const request = (parentPath, userId, expectedUserId = null) => ({ auth: { uid: 'editor' }, data: { parentPath, userId, expectedUserId } })
if (enabled) {
  test.before(async () => {
    await Promise.all([db.doc('users/editor').set(editor), db.doc('users/recipient').set(viewer), db.doc('users/no-mail').set({ ...viewer, firstName: 'No mail', email: '' }), db.doc('users/inactive').set({ ...viewer, active: false }), db.doc('users/no-access').set({ ...viewer, permissions: {} })])
  })
  test.after(async () => { await db.terminate(); await deleteApp(app) })
}

test('responsibility directory filters inactive and unauthorized profiles and returns no private fields', { skip: !enabled }, async () => {
  await db.doc('damageCases/directory').set({ title: 'Private case text' })
  const result = await listCaseReminderUsersHandler(request('damageCases/directory'), options)
  assert.deepEqual(result.users.map((entry) => entry.id).sort(), ['editor', 'no-mail', 'recipient'])
  assert.equal(result.users.find((entry) => entry.id === 'no-mail').canReceiveMail, false)
  assert(!JSON.stringify(result).includes('@'))
  assert(result.users.every((entry) => Object.keys(entry).sort().join() === 'canReceiveMail,id,name'))
})

test('all four case types commit responsibility and one history entry atomically, including clear and no-op', { skip: !enabled }, async () => {
  for (const collection of ['damageCases', 'inkassoCases', 'insolvencies', 'legalDisputes']) {
    const path = `${collection}/assignment`
    await db.doc(path).set({ title: 'Case', responsibleUserId: null })
    const result = await setReminderResponsibilityHandler(request(path, 'recipient'), options)
    assert.equal(result.responsibleUserName, 'Recipient')
    assert.equal((await db.doc(path).get()).get('responsibleUserId'), 'recipient')
    assert.equal((await db.doc(path).collection('updates').get()).size, 1)
    assert.equal((await setReminderResponsibilityHandler(request(path, 'recipient', 'recipient'), options)).changed, false)
    assert.equal((await db.doc(path).collection('updates').get()).size, 1)
    await setReminderResponsibilityHandler(request(path, null, 'recipient'), options)
    assert.equal((await db.doc(path).get()).get('responsibleUserId'), null)
    assert.equal((await db.doc(path).collection('updates').get()).size, 2)
  }
})

test('concurrent editors cannot silently overwrite responsibility or duplicate its history', { skip: !enabled }, async () => {
  const path = 'damageCases/concurrent'
  await db.doc(path).set({ responsibleUserId: null })
  const results = await Promise.allSettled(['recipient', 'no-mail'].map((id) => setReminderResponsibilityHandler(request(path, id), options)))
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1)
  assert.equal(results.find((item) => item.status === 'rejected').reason.code, 'aborted')
  assert.equal((await db.doc(path).collection('updates').get()).size, 1)
})

test('target access and actor revocation are rechecked inside the transaction without partial changes', { skip: !enabled }, async () => {
  const path = 'damageCases/denied'
  await db.doc(path).set({ responsibleUserId: null })
  for (const id of ['inactive', 'no-access', 'missing']) await assert.rejects(setReminderResponsibilityHandler(request(path, id), options), { code: 'failed-precondition' })
  await db.doc('users/editor').update({ active: false })
  try { await assert.rejects(setReminderResponsibilityHandler(request(path, 'recipient'), options), { code: 'permission-denied' }) }
  finally { await db.doc('users/editor').set(editor) }
  assert.equal((await db.doc(path).get()).get('responsibleUserId'), null)
  assert.equal((await db.doc(path).collection('updates').get()).size, 0)
})
