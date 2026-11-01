import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { refreshReminderSource, runReminderDispatch, listReminderStatusesHandler } from './reminders.js'
import { legacyReminderDeliveryId, loadReminderSource, reminderDeliveryId } from './reminderSources.js'
import { reminderRecipientPolicy } from './reminderRecipientPolicy.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const now = new Date('2026-11-02T09:00:10.000Z')
let sequence = 0
async function scenario(execute) {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^127\.0\.0\.1:\d+$/)
  const projectId = `demo-reminder-recipient-policy-${process.pid}-${++sequence}`
  const app = initializeApp({ projectId }, projectId)
  const db = getFirestore(app)
  try { await db.doc('reminderState/preparation').set({ complete: true }); await execute(db) }
  finally { await db.terminate(); await deleteApp(app) }
}
const profile = email => ({ active: true, role: 'superadmin', firstName: 'Test', email })
async function source(db, email, { deadline = false } = {}) {
  await db.doc('users/owner').set(profile(email))
  const path = deadline ? 'damageCases/case/deadlines/date' : 'todos/task'
  if (deadline) {
    await db.doc('damageCases/case').set({ title: 'Synthetic case', responsibleUserId: 'owner', status: 'new' })
    await db.doc(path).set({ date: '2026-11-02', time: '10:00', reminderEnabled: true })
  } else await db.doc(path).set({ title: 'Synthetic task', creatorUserId: 'owner', status: 'open', reminderDate: '2026-11-02', reminderTime: '10:00' })
  await refreshReminderSource(db, path, { now: new Date('2026-11-02T08:59:00Z') })
  return path
}
const run = (db, send, environment = 'development') => runReminderDispatch(now, { db, send, environment, clock: () => now })
const never = async () => assert.fail('Excluded recipient must never reach a provider')
async function status(db, path, environment = 'development') {
  return (await listReminderStatusesHandler({ auth: { uid: 'owner' }, data: { sourcePaths: [path], environment: 'production' } }, { db, now, environment, authorize: async () => profile('irrelevant@example.test') })).statuses[0]
}

test('Dev DF/other and noncanonical case recipients are blocked before any permanent reservation and expose test-mode status', { skip: !enabled }, async () => {
  for (const email of ['df@brennpunkt-logistik.de', 'other@example.test', 'BB@brennpunkt-logistik.de', 'NO-REPLY@brennpunkt-logistik.de']) await scenario(async db => {
    const path = await source(db, email)
    await run(db, never)
    assert.equal((await db.collection('reminderDeliveries').get()).size, 0)
    assert.equal((await db.collection('diagnosticEvents').get()).size, 0)
    const result = await status(db, path)
    assert.equal(result.recipients[0].status, 'blocked')
    assert.match(result.reason, /Dev-Testmodus/)
    assert.equal(result.status, 'configuration_required')
    assert.ok(!JSON.stringify(result).includes(email))
  })
})

test('Dev policy precedes legacy receipt import; no accepted or failed new claim for excluded legacy recipient', { skip: !enabled }, async () => {
  await scenario(async db => {
    const email = 'df@brennpunkt-logistik.de'
    const path = await source(db, email, { deadline: true })
    const context = await loadReminderSource(db, path)
    await db.doc(`caseDeadlineReminderDeliveries/${legacyReminderDeliveryId(context, email)}`).set({ status: 'sent' })
    await run(db, never)
    assert.equal((await db.doc(`reminderDeliveries/${reminderDeliveryId(context, 'owner')}`).get()).exists, false)
    assert.equal((await status(db, path)).recipients[0].status, 'blocked')
  })
})

test('Dev no-reply and BB each receive exactly one mocked delivery; Production and unknown policy remain unchanged', { skip: !enabled }, async () => {
  for (const [environment, email, accepted] of [['development', 'no-reply@brennpunkt-logistik.de', true], ['development', 'bb@brennpunkt-logistik.de', true], ['production', 'df@brennpunkt-logistik.de', true], ['unknown', 'no-reply@brennpunkt-logistik.de', false]]) await scenario(async db => {
    await source(db, email)
    let sends = 0
    const send = async message => { sends++; assert.equal(message.recipient, email); assert.equal(await message.beforeSend(), true); return { status: 'accepted' } }
    await run(db, send, environment)
    await run(db, send, environment)
    assert.equal(sends, accepted ? 1 : 0)
    assert.equal((await db.collection('reminderDeliveries').get()).size, accepted ? 1 : 0)
  })
})

test('fresh transactional profile recheck blocks an excluded address changed after recipient selection', { skip: !enabled }, async () => {
  await scenario(async db => {
    const path = await source(db, 'no-reply@brennpunkt-logistik.de')
    let changed = false
    const guardedDb = new Proxy(db, { get(target, key) {
      if (key === 'runTransaction') return async (...args) => {
        if (!changed) { changed = true; await db.doc('users/owner').update({ email: 'df@brennpunkt-logistik.de' }) }
        return target.runTransaction(...args)
      }
      const value = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    await run(guardedDb, never)
    assert.equal(changed, true)
    assert.equal((await db.collection('reminderDeliveries').get()).size, 0)
    assert.equal((await status(db, path)).recipients[0].status, 'blocked')
  })
})

test('beforeSend rejects address changes between two allowed recipients in both directions', { skip: !enabled }, async () => {
  for (const [original, changed] of [['no-reply@brennpunkt-logistik.de', 'bb@brennpunkt-logistik.de'], ['bb@brennpunkt-logistik.de', 'no-reply@brennpunkt-logistik.de']]) await scenario(async db => {
    const path = await source(db, original)
    let callback = false
    await run(db, async message => {
      assert.equal(message.recipient, original)
      assert.equal(reminderRecipientPolicy(original, 'development').allowed, true)
      assert.equal(reminderRecipientPolicy(changed, 'development').allowed, true)
      await db.doc('users/owner').update({ email: changed })
      callback = await message.beforeSend()
      return { status: 'blocked', reason: 'no-longer-eligible' }
    })
    assert.equal(callback, false)
    const context = await loadReminderSource(db, path)
    assert.equal((await db.doc(`reminderDeliveries/${reminderDeliveryId(context, 'owner')}`).get()).get('status'), 'blocked')
  })
})
