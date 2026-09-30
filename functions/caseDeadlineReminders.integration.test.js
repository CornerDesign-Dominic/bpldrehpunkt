import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { runCaseDeadlineReminderDispatch } from './caseDeadlineReminders.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
if (enabled && !getApps().length) initializeApp({ projectId: 'demo-drehpunkt-deadline-reminders' })
const db = () => getFirestore()
const nonce = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

if (enabled) {
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
  const first = await runCaseDeadlineReminderDispatch(now, { db: db(), sendMail })
  assert.deepEqual(first, { scanned: 501, sent: 501, failed: 0 })
  assert.equal(sent.length, 501)
  assert(sent.every((message) => message.recipient === 'release-test@example.test'))
  assert.equal((await db().collection('caseDeadlineReminderDeliveries').where('status', '==', 'sent').get()).size, 501)
  const second = await runCaseDeadlineReminderDispatch(now, { db: db(), sendMail })
  assert.deepEqual(second, { scanned: 501, sent: 0, failed: 0 })
  assert.equal(sent.length, 501)
})
