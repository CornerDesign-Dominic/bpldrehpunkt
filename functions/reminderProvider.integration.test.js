import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { sendReminderMail } from './systemMails.js'
import { reminderSenderAddress, reminderProviderTargets } from './reminderProviderContract.js'
import { refreshReminderSource, runReminderDispatch } from './reminders.js'
import { reminderSourceKey } from './reminderSources.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const instant = new Date('2026-11-02T09:00:20.000Z')
let scenarioSequence = 0
const identity = (payload) => ({ contractVersion: payload.contractVersion, projectId: payload.projectId, environment: payload.environment, deliveryId: payload.deliveryId, payloadDigest: payload.payloadDigest, sender: reminderSenderAddress })
async function localScenario(environment, execute) {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^127\.0\.0\.1:\d+$/)
  const projectId = `demo-reminder-provider-${environment}-${process.pid}-${++scenarioSequence}`
  const app = initializeApp({ projectId }, projectId)
  const db = getFirestore(app)
  try {
    await db.doc('reminderState/preparation').set({ complete: true })
    await db.doc('users/creator').set({ active: true, role: 'user', permissions: { todos: 'edit' }, firstName: 'Test', lastName: 'Creator', email: 'no-reply@brennpunkt-logistik.de' })
    const source = 'todos/task'
    await db.doc(source).set({ title: 'Synthetic task', creatorUserId: 'creator', audienceType: 'person', audienceId: 'creator', status: 'open', reminderDate: '2026-11-02', reminderTime: '10:00' })
    await refreshReminderSource(db, source, { now: new Date('2026-11-02T08:59:00Z') })
    await execute({ db, source })
  } finally { await db.terminate(); await deleteApp(app) }
}
const transport = (environment, fetchImpl) => (message) => sendReminderMail(message, {
  environment, now: () => instant, paused: async () => false,
  notificationUrl: () => 'https://defaultb829bbdcc0b74128a3416715a67b45.1b.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/synthetic/triggers/manual/paths/invoke?api-version=1',
  authorize: async () => 'Bearer synthetic-token',
  render: async () => ({ subject: 'Synthetic reminder', message: 'Synthetic only', messageHtml: '<p>Synthetic only</p>' }),
  fetchImpl,
})

test('local engine and real adapter accept only matching Dev/Production provider acknowledgements, then never call twice', { skip: !enabled }, async () => {
  for (const environment of ['development', 'production']) await localScenario(environment, async ({ db, source }) => {
    let calls = 0
    const send = transport(environment, async (_url, options) => {
      const payload = JSON.parse(options.body)
      assert.equal(payload.projectId, reminderProviderTargets[environment].projectId)
      assert.equal(options.headers['Idempotency-Key'], `${payload.projectId}:${payload.deliveryId}`)
      assert.equal(payload.from, reminderSenderAddress)
      calls += 1
      return { status: 200, json: async () => ({ ...identity(payload), accepted: true, outcome: 'accepted' }) }
    })
    await runReminderDispatch(instant, { db, environment: 'production', clock: () => instant, send })
    await runReminderDispatch(instant, { db, environment: 'production', clock: () => instant, send })
    assert.equal(calls, 1)
    assert.equal((await db.doc(`reminderSourceStatus/${reminderSourceKey(source)}`).get()).get('status'), 'accepted')
    assert.equal((await db.collection('reminderDeliveries').get()).docs[0].get('status'), 'accepted')
  })
})

test('provider-side expiry remains missed even when the caller clock is still in the due minute', { skip: !enabled }, async () => {
  await localScenario('development', async ({ db, source }) => {
    const send = transport('development', async (_url, options) => ({ status: 200, json: async () => ({ ...identity(JSON.parse(options.body)), accepted: false, outcome: 'missed' }) }))
    await runReminderDispatch(instant, { db, environment: 'production', clock: () => instant, send })
    assert.equal((await db.collection('reminderDeliveries').get()).docs[0].get('status'), 'missed')
    assert.equal((await db.doc(`reminderSourceStatus/${reminderSourceKey(source)}`).get()).get('status'), 'missed')
    await runReminderDispatch(instant, { db, environment: 'production', clock: () => instant, send: async () => assert.fail('No second provider attempt') })
  })
})

test('a queued or mismatched acknowledgement remains uncertain and is never automatically repeated', { skip: !enabled }, async () => {
  await localScenario('production', async ({ db, source }) => {
    let calls = 0
    const send = transport('production', async (_url, options) => {
      calls += 1
      return { status: 202, json: async () => ({ ...identity(JSON.parse(options.body)), accepted: true, outcome: 'accepted' }) }
    })
    await runReminderDispatch(instant, { db, environment: 'production', clock: () => instant, send })
    assert.equal((await db.doc(`reminderSourceStatus/${reminderSourceKey(source)}`).get()).get('status'), 'uncertain')
    await runReminderDispatch(instant, { db, environment: 'production', clock: () => instant, send })
    assert.equal(calls, 1)
  })
})
