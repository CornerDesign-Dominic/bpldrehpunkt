import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { advanceReminderPreparation, listReminderStatusesHandler, refreshReminderParent, refreshReminderSource, runReminderDispatch } from './reminders.js'
import { loadReminderSource, reminderDeliveryId, reminderSourceKey } from './reminderSources.js'

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const app = enabled ? initializeApp({ projectId: `demo-reminders-core-${process.pid}` }, `reminders-core-${process.pid}`) : null
const db = enabled ? getFirestore(app) : null
const due = new Date('2026-11-02T09:00:00Z')
const clockAt = (seconds) => new Date(due.getTime() + seconds * 1000)
const modules = { calendar: 'view', todos: 'view', damages: 'view', insolvencies: 'view', inkasso: 'view', legalDisputes: 'view' }
const profile = (id, extra = {}) => ({ firstName: id, lastName: 'Test', active: true, role: 'user', email: `${id}@example.test`, permissions: modules, ...extra })
const run = (now, send) => runReminderDispatch(now, { db, clock: () => now, send, environment: 'production' })
async function user(id, extra) { await db.doc(`users/${id}`).set(profile(id, extra)) }
async function todo(id, extra = {}) {
  const path = `todos/${id}`
  await db.doc(path).set({ title: id, creatorUserId: 'creator', assignedUserId: null, status: 'open', audienceType: 'person', audienceId: 'creator', reminderDate: '2026-11-02', reminderTime: '10:00', ...extra })
  await refreshReminderSource(db, path, { now: clockAt(-60) })
  return path
}
async function statuses(paths, uid = 'super') {
  return (await listReminderStatusesHandler({ auth: { uid }, data: { sourcePaths: paths } }, { db, authorize: async () => (await db.doc(`users/${uid}`).get()).data(), now: clockAt(20), environment: 'production' })).statuses
}
if (enabled) {
  test.before(async () => {
    await Promise.all([user('creator'), user('assignee'), user('reader'), user('super', { role: 'superadmin' })])
  })
  test.after(async () => { await db.terminate(); await deleteApp(app) })
}

test('central reminders: creator receives unassigned To-do, then only current assignee; duplicate runs send once', { skip: !enabled }, async () => {
  const path = await todo('assignment', { description: 'Do not email the long main To-do description.' })
  await db.doc(path).update({ assignedUserId: 'assignee' })
  const sent = []
  await run(clockAt(20), async (message) => { assert(await message.beforeSend()); assert.equal(message.values.note, '–'); assert(!JSON.stringify(message.values).includes('long main To-do')); sent.push(message.recipient); return { status: 'accepted' } })
  assert.deepEqual(sent, ['assignee@example.test'])
  await run(clockAt(30), async () => { throw new Error('duplicate send') })
  assert.equal((await statuses([path]))[0].status, 'accepted')
  assert.deepEqual((await statuses([path]))[0].recipients.map((item) => item.userId), ['assignee'])
})

test('central reminders: shared calendar includes current active readers and superadmins; personal calendar only its owner', { skip: !enabled }, async () => {
  await user('inactive', { active: false })
  await user('no-module', { permissions: { calendar: 'none' } })
  await user('no-email', { email: '' })
  await db.doc('calendars/shared').set({ kind: 'shared', ownerUserId: null, active: true })
  for (const id of ['reader', 'inactive', 'no-module', 'no-email']) await db.doc(`calendarPermissions/shared_${id}`).set({ calendarId: 'shared', userId: id, level: 'view' })
  const shared = 'calendars/shared/events/current'
  await db.doc(shared).set({ title: 'Shared', reminderEnabled: true, reminderDate: '2026-11-02', reminderTime: '10:00' })
  await refreshReminderSource(db, shared, { now: clockAt(-60) })
  await db.doc('calendars/personal').set({ kind: 'personal', ownerUserId: 'creator', active: true })
  const personal = 'calendars/personal/events/current'
  await db.doc(personal).set({ title: 'Personal', description: 'Personal event note', reminderEnabled: true, reminderDate: '2026-11-02', reminderTime: '10:00' })
  await refreshReminderSource(db, personal, { now: clockAt(-60) })
  const sent = []
  await run(clockAt(20), async (message) => { assert(await message.beforeSend()); if (message.values.title === 'Personal') assert.equal(message.values.note, 'Personal event note'); sent.push([message.values.title, message.recipient]); return { status: 'accepted' } })
  assert.deepEqual(sent.filter(([title]) => title === 'Personal').map(([, email]) => email), ['creator@example.test'])
  assert.deepEqual(sent.filter(([title]) => title === 'Shared').map(([, email]) => email).sort(), ['reader@example.test', 'super@example.test'])
  const result = (await statuses([shared]))[0]
  assert.equal(result.status, 'partial')
  assert(result.recipients.some((item) => item.userId === 'no-email' && item.status === 'blocked'))
  assert(!JSON.stringify(result).includes('@'))
  assert(!result.recipients.some((item) => ['inactive', 'no-module'].includes(item.userId)))
})

test('central reminders: missed is terminal without catch-up; closed, unassigned cases and inactive assignees never fall back to creator', { skip: !enabled }, async () => {
  const missed = await todo('missed')
  const closed = await todo('closed', { status: 'completed' })
  const inactive = await todo('inactive-assignee', { assignedUserId: 'inactive' })
  await db.doc('damageCases/config').set({ title: 'Config', status: 'new', createdBy: 'creator' })
  const noOwner = 'damageCases/config/deadlines/d'
  await db.doc(noOwner).set({ date: '2026-11-02', time: '10:00', reminderEnabled: true, reminderRecipientEmail: 'creator@example.test' })
  await refreshReminderSource(db, noOwner, { now: clockAt(-60) })
  assert.equal((await statuses([noOwner]))[0].status, 'configuration_required')
  const calls = []
  await run(clockAt(60), async (message) => { calls.push(message); return { status: 'accepted' } })
  assert.equal(calls.length, 0)
  for (const path of [missed, closed, inactive, noOwner]) assert.equal((await db.doc(`reminderWork/${reminderSourceKey(path)}`).get()).exists, false)
  await run(clockAt(120), async () => { throw new Error('catch-up must never send') })
})

test('central reminders: explicit case responsible user, permission changes, parent deletion and ordinary disabled sources', { skip: !enabled }, async () => {
  await db.doc('legalDisputes/case').set({ title: 'Legal', caseNumber: 'LAW-2026-1', status: 'open', responsibleUserId: 'assignee', createdBy: 'creator' })
  const path = 'legalDisputes/case/deadlines/d'
  await db.doc(path).set({ date: '2026-11-02', time: '10:00', reminderEnabled: true, note: 'Keep this deadline note' })
  await refreshReminderSource(db, path, { now: clockAt(-60) })
  const sent = []
  await run(clockAt(20), async (message) => { sent.push(message.recipient); assert.equal(message.values.title, 'LAW-2026-1'); assert.equal(message.values.note, 'Keep this deadline note'); return { status: 'accepted' } })
  assert.deepEqual(sent, ['assignee@example.test'])
  const disabled = await todo('disabled')
  await db.doc(disabled).update({ reminderDate: null })
  await refreshReminderSource(db, disabled, { now: clockAt(-60) })
  assert.equal((await statuses([disabled]))[0].status, 'disabled')
  const revoked = await todo('revoked', { assignedUserId: 'reader' })
  await db.doc('users/reader').update({ 'permissions.todos': 'none' })
  const orphan = await todo('orphan')
  await db.doc(orphan).delete()
  await refreshReminderParent(db, 'todos/orphan')
  await run(clockAt(20), async () => { throw new Error('revoked or deleted source cannot send') })
  assert.equal((await statuses([revoked]))[0].status, 'configuration_required')
})

test('central reminders: source assignment/email/minute are rechecked immediately before the simulated HTTP action', { skip: !enabled }, async () => {
  const path = await todo('fencing')
  let httpCalls = 0
  await run(clockAt(20), async (message) => {
    await db.doc(path).update({ assignedUserId: 'assignee' })
    if (!await message.beforeSend()) return { status: 'blocked', reason: 'no-longer-eligible' }
    httpCalls += 1
    return { status: 'accepted' }
  })
  assert.equal(httpCalls, 0)
  const minute = await todo('minute-fencing')
  let current = clockAt(59)
  await runReminderDispatch(current, { db, clock: () => current, environment: 'production', send: async (message) => {
    // The other changed source may also be seen; only test this source's window.
    if (message.values.title !== 'minute-fencing') return { status: 'accepted' }
    current = clockAt(60)
    assert.equal(await message.beforeSend(), false)
    return { status: 'blocked', reason: 'no-longer-eligible' }
  } })
  assert.equal((await db.doc(`reminderWork/${reminderSourceKey(minute)}`).get()).exists, false)
})

test('central reminders: ambiguous provider outcome or crashed permanent reservation is never sent again', { skip: !enabled }, async () => {
  const path = await todo('uncertain')
  let calls = 0
  await run(clockAt(20), async () => { calls += 1; throw new Error('synthetic network interruption') })
  await refreshReminderSource(db, path, { now: clockAt(30) })
  await run(clockAt(30), async () => { calls += 1; return { status: 'accepted' } })
  assert.equal(calls, 1)
  assert.equal((await statuses([path]))[0].status, 'uncertain')
  const crashed = await todo('crashed')
  const context = await loadReminderSource(db, crashed)
  const receipt = db.doc(`reminderDeliveries/${reminderDeliveryId(context, 'creator')}`)
  await receipt.set({ sourcePath: crashed, scheduleId: context.scheduleId, dueAt: context.dueAt, userId: 'creator', status: 'sending', token: 'crashed', attemptedAt: Timestamp.fromMillis(0) })
  await run(clockAt(20), async () => { throw new Error('reserved send must not be repeated') })
  assert.equal((await db.doc(`reminderWork/${reminderSourceKey(crashed)}`).get()).exists, true)
  await run(clockAt(60), async () => { throw new Error('uncertain send must not be repeated later') })
  assert.equal((await receipt.get()).data().status, 'uncertain')
})

test('central reminders: status endpoint refuses foreign personal sources, mirrors, mixed batches and disabled users without leaking source contents', { skip: !enabled }, async () => {
  await assert.rejects(statuses(['calendars/personal/events/current'], 'reader'), { code: 'permission-denied' })
  await assert.rejects(statuses(['todoCalendarEntries/mirror']), { code: 'invalid-argument' })
  await assert.rejects(statuses(Array(51).fill('todos/assignment')), { code: 'invalid-argument' })
  await assert.rejects(statuses(['todos/assignment', 'calendars/personal/events/current'], 'assignee'), { code: 'permission-denied' })
  await assert.rejects(statuses(['todos/assignment'], 'inactive'), { code: 'permission-denied' })
})

test('central reminders: registry migration resumes in bounded pages, includes calendars/main reminders/deadlines and records old times as missed', { skip: !enabled }, async () => {
  for (let offset = 0; offset < 501; offset += 200) {
    const batch = db.batch()
    for (let index = offset; index < Math.min(offset + 200, 501); index++) batch.set(db.doc(`todos/history-${index}`), { title: 'History', creatorUserId: 'creator', status: 'open', reminderDate: '2026-11-01', reminderTime: '10:00' })
    await batch.commit()
  }
  // A reset simulates an explicit versioned bootstrap, not a source fallback.
  await db.doc('reminderState/preparation').delete()
  let result, calls = 0
  do { result = await advanceReminderPreparation(db, { now: clockAt(20) }); calls += 1; assert(result.processed <= 100) } while (!result.complete && calls < 50)
  assert.equal(result.complete, true)
  assert(calls > 5)
  const archived = (await db.collection('reminderSourceStatus').get()).docs.filter((item) => item.data().sourcePath.startsWith('todos/history-'))
  assert.equal(archived.length, 501)
  assert(archived.every((item) => item.data().status === 'missed'))
  assert.equal((await advanceReminderPreparation(db, { now: clockAt(20) })).processed, 0)
})

test('central reminders: duplicate projections avoid writes and parent scans resume past 100 without restarting registry preparation', { skip: !enabled }, async () => {
  const path = await todo('idempotent', { reminderDate: '2026-11-03' })
  const work = db.doc(`reminderWork/${reminderSourceKey(path)}`), status = db.doc(`reminderSourceStatus/${reminderSourceKey(path)}`)
  const [firstWork, firstStatus] = await Promise.all([work.get(), status.get()])
  await refreshReminderSource(db, path, { now: clockAt(-60) })
  const [secondWork, secondStatus] = await Promise.all([work.get(), status.get()])
  assert(firstWork.updateTime.isEqual(secondWork.updateTime))
  assert(firstStatus.updateTime.isEqual(secondStatus.updateTime))
  const parent = db.doc('calendars/many-children')
  await parent.set({ kind: 'personal', ownerUserId: 'creator', active: false })
  const batch = db.batch()
  for (let index = 0; index < 101; index++) batch.set(parent.collection('events').doc(String(index).padStart(3, '0')), { title: 'Many', reminderEnabled: true, reminderDate: '2026-11-03', reminderTime: '10:00' })
  await batch.commit()
  const initialRegistry = (await db.doc('reminderState/preparation').get()).data()
  assert.equal((await refreshReminderParent(db, parent.path)).complete, false)
  // A new parent revision must reset its own cursor, not overwrite the newer
  // revision with the old worker's completion or reset the global archive scan.
  await parent.update({ active: true })
  assert.equal((await refreshReminderParent(db, parent.path)).complete, false)
  await parent.update({ updatedAt: Timestamp.now(), lastComment: 'unrelated metadata' })
  const finalPage = await refreshReminderParent(db, parent.path)
  assert.equal(finalPage.complete, true)
  assert.equal(finalPage.processed, 1)
  assert.deepEqual((await db.doc('reminderState/preparation').get()).data(), initialRegistry)
  const last = `calendars/many-children/events/100`
  assert.equal((await db.doc(`reminderSourceStatus/${reminderSourceKey(last)}`).get()).data().status, 'scheduled')
  await parent.delete()
  assert.equal((await refreshReminderParent(db, parent.path)).complete, false)
  assert.equal((await refreshReminderParent(db, parent.path)).complete, true)
  assert.equal((await db.doc(`reminderWork/${reminderSourceKey(last)}`).get()).exists, false)
})

test('central reminders: explicit HTTP failure is recorded and diagnosed without exposing a note or automatically retrying', { skip: !enabled }, async () => {
  const path = await todo('explicit-failure')
  const result = await run(clockAt(20), async () => ({ status: 'failed', reason: 'provider-http-error' }))
  assert.equal(result.failed, 1)
  assert.equal((await statuses([path]))[0].status, 'failed')
  const diagnostics = await db.collection('diagnosticEvents').where('module', '==', 'reminders').get()
  assert(diagnostics.docs.some((item) => item.data().code === 'provider-http-error'))
  assert(!JSON.stringify(diagnostics.docs.map((item) => item.data())).includes('@example.test'))
  await refreshReminderSource(db, path, { now: clockAt(25) })
  await run(clockAt(30), async () => { throw new Error('a known failed delivery is not automatically retried') })
})

test('central reminders: 100 retained sending reservations cannot starve a later eligible job or loop with a frozen test clock', { skip: !enabled, timeout: 60_000 }, async () => {
  const paths = []
  for (let index = 0; index < 101; index++) paths.push(await todo(`overlap-${index}`))
  paths.sort((a, b) => reminderSourceKey(a).localeCompare(reminderSourceKey(b)))
  const batch = db.batch()
  for (const path of paths.slice(0, 100)) {
    const context = await loadReminderSource(db, path)
    batch.set(db.doc(`reminderDeliveries/${reminderDeliveryId(context, 'creator')}`), { sourcePath: path, scheduleId: context.scheduleId, dueAt: context.dueAt, userId: 'creator', status: 'sending', token: 'another-worker' })
  }
  await batch.commit()
  let sends = 0
  const first = await run(clockAt(20), async () => { sends += 1; return { status: 'accepted' } })
  assert.equal(sends, 1)
  assert(first.scanned >= 101 && first.scanned < 110)
  assert.equal((await statuses([paths.at(-1)]))[0].status, 'accepted')
  const overlap = await Promise.all([run(clockAt(30), async () => { throw new Error('reserved recipient cannot be called') }), run(clockAt(30), async () => { throw new Error('reserved recipient cannot be called') })])
  assert(overlap.every((result) => result.scanned <= 100))
})
