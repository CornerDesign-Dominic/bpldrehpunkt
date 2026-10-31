import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled && !getApps().length) initializeApp({ projectId: 'demo-drehpunkt-deadline-reminders' })
const { advanceDeadlineReminderWork, refreshDeadlineReminderWork, runCaseDeadlineReminderDispatch } = await import('./caseDeadlineReminders.js')
const db = () => getFirestore()
const nonce = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

if (enabled) {
  test.before(async () => { for (const collection of await db().listCollections()) await db().recursiveDelete(collection) })
  test.after(async () => {
    await db().terminate()
  })
}

async function createDeadlineBatch(caseRef, prefix, count, date) {
  for (let offset = 0; offset < count; offset += 500) {
    const batch = db().batch()
    for (let index = offset; index < Math.min(count, offset + 500); index += 1) {
      batch.set(caseRef.collection('deadlines').doc(`${prefix}-${String(index).padStart(4, '0')}`), {
        date, time: '08:00', note: `Frist ${index}`, reminderEnabled: true, reminderRecipientEmail: 'release-test@example.test',
      })
    }
    await batch.commit()
  }
}

test('Firestore emulator: deadline scheduler pages beyond 500, sends each due reminder once and excludes future dates', { skip: !enabled }, async () => {
  const key = nonce(); const caseRef = db().collection('todos').doc(`deadline-${key}`)
  await caseRef.set({ title: `Release-Frist ${key}` })
  await createDeadlineBatch(caseRef, 'due', 501, '2026-09-29')
  await createDeadlineBatch(caseRef, 'future', 1, '2026-10-01')
  const sent = []
  const now = new Date('2026-09-30T10:00:00.000Z')
  const sendMail = async (message) => { sent.push(message); return true }
  while (!(await advanceDeadlineReminderWork(db())).complete) { /* explicit deployment bootstrap, 200 sources/page */ }
  const first = await runCaseDeadlineReminderDispatch(now, { db: db(), sendMail })
  assert.deepEqual(first, { scanned: 501, sent: 501, failed: 0, paused: false })
  assert.equal(sent.length, 501)
  assert(sent.every((message) => message.recipient === 'release-test@example.test'))
  assert.equal((await db().collection('caseDeadlineReminderDeliveries').where('status', '==', 'sent').get()).size, 501)
  const second = await runCaseDeadlineReminderDispatch(now, { db: db(), sendMail })
  assert.deepEqual(second, { scanned: 0, sent: 0, failed: 0, paused: false })
  assert.equal(sent.length, 501)
})

test('Firestore emulator: reminder projection survives stale refresh, reschedule, recipient change, pause and delivery failure', { skip: !enabled }, async () => {
  const caseRef = db().collection('damageCases').doc(`changes-${nonce()}`)
  await caseRef.set({ caseNumber: 'S-Test' })
  const ref = caseRef.collection('deadlines').doc('D-1')
  const initial = { date: '2026-10-02', time: '09:00', reminderEnabled: true, reminderRecipientEmail: 'first@example.test' }
  await ref.set(initial)
  await refreshDeadlineReminderWork(db(), ref)
  await ref.update({ date: '2026-09-30', time: '08:00', reminderRecipientEmail: 'changed@example.test' })
  // Both delayed and repeated events read the current source, not old payloads.
  await refreshDeadlineReminderWork(db(), ref)
  await refreshDeadlineReminderWork(db(), ref)
  const now = new Date('2026-09-30T10:00:00Z')
  const sent = []
  const sendMail = async (message) => { sent.push(message); return true }
  await db().doc('systemSettings/automaticMailDelivery').set({ paused: true })
  assert.equal((await runCaseDeadlineReminderDispatch(now, { db: db(), sendMail })).paused, true)
  assert.equal(sent.length, 0)
  await db().doc('systemSettings/automaticMailDelivery').set({ paused: false })
  assert.equal((await runCaseDeadlineReminderDispatch(now, { db: db(), sendMail: async () => { throw new Error('synthetic provider failure') } })).failed, 1)
  assert.equal((await runCaseDeadlineReminderDispatch(now, { db: db(), sendMail })).sent, 1)
  assert.equal(sent[0].recipient, 'changed@example.test')
  await refreshDeadlineReminderWork(db(), ref)
  assert.equal((await runCaseDeadlineReminderDispatch(now, { db: db(), sendMail })).scanned, 0)
  await ref.update({ reminderRecipientEmail: 'third@example.test' })
  await refreshDeadlineReminderWork(db(), ref)
  assert.equal((await runCaseDeadlineReminderDispatch(now, { db: db(), sendMail })).sent, 1)
  assert.equal(sent[1].recipient, 'third@example.test')
  await ref.update({ reminderEnabled: false })
  await refreshDeadlineReminderWork(db(), ref)
  assert.equal((await runCaseDeadlineReminderDispatch(now, { db: db(), sendMail })).scanned, 0)
})
