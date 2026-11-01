import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { runCaseDeadlineReminderDispatch } from './caseDeadlineReminders.js'
import { refreshReminderSource } from './reminders.js'
import { legacyReminderDeliveryId, loadReminderSource, reminderDeliveryId } from './reminderSources.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const app = enabled ? initializeApp({ projectId: `demo-reminder-deadlines-${process.pid}` }, `deadlines-${process.pid}`) : null
const db = enabled ? getFirestore(app) : null
const before = new Date('2026-11-02T08:59:00Z')
const now = new Date('2026-11-02T09:00:20Z')
if (enabled) {
  test.before(async () => {
    await db.doc('users/owner').set({ active: true, role: 'superadmin', email: 'owner@example.test', firstName: 'Owner' })
  })
  test.after(async () => { await db.terminate(); await deleteApp(app) })
}

test('all five existing deadline families use the central scheduler and current responsible user', { skip: !enabled }, async () => {
  for (const root of ['damageCases', 'inkassoCases', 'legalDisputes', 'insolvencies', 'todos']) {
    await db.doc(`${root}/c`).set({ title: root, status: 'open', responsibleUserId: 'owner', creatorUserId: 'old-creator', assignedUserId: 'owner' })
    const path = `${root}/c/deadlines/d`
    await db.doc(path).set({ date: '2026-11-02', time: '10:00', reminderEnabled: true, reminderRecipientEmail: 'old-creator@example.test' })
    await refreshReminderSource(db, path, { now: before })
  }
  const sent = []
  await runCaseDeadlineReminderDispatch(now, { db, environment: 'production', clock: () => now, send: async (message) => { sent.push(message); return { status: 'accepted' } } })
  assert.equal(sent.length, 5)
  assert(sent.every((item) => item.recipient === 'owner@example.test' && item.templateId === 'central_reminder'))
  await runCaseDeadlineReminderDispatch(new Date('2026-11-02T09:02:00Z'), { db, environment: 'production', clock: () => new Date('2026-11-02T09:02:00Z'), send: async () => { throw new Error('late mail forbidden') } })
})

test('a successful legacy receipt fences the same source/time/current-user delivery after migration', { skip: !enabled }, async () => {
  const path = 'damageCases/legacy/deadlines/d'
  await db.doc('damageCases/legacy').set({ title: 'Legacy', responsibleUserId: 'owner', status: 'new' })
  await db.doc(path).set({ date: '2026-11-02', time: '10:00', reminderEnabled: true })
  const source = await loadReminderSource(db, path)
  await db.doc(`caseDeadlineReminderDeliveries/${legacyReminderDeliveryId(source, 'owner@example.test')}`).set({ status: 'sent' })
  await refreshReminderSource(db, path, { now: before })
  await runCaseDeadlineReminderDispatch(now, { db, environment: 'production', clock: () => now, send: async () => { throw new Error('legacy send must not repeat') } })
  assert.equal((await db.doc(`reminderDeliveries/${reminderDeliveryId(source, 'owner')}`).get()).data().status, 'accepted')
})
