import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { after, before, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { correctTimeDay, listTimeWorkspace, persistTimeStamp, saveTimeAccount, saveTimeWorkModel, stampTime } from './timeTracking.js'
import { addTimeDays, berlinTimeDate } from './shared/timeTracking.js'

const emulator = process.env.FIRESTORE_EMULATOR_HOST
const options = { skip: !emulator }
const projectId = process.env.GCLOUD_PROJECT || 'demo-drehpunkt-time'
const today = berlinTimeDate()
const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay()
const testMonday = addTimeDays(today, -14 - ((weekday(today) + 6) % 7))
const dateOf = (days) => addTimeDays(testMonday, days)
const standardBreaks = [{ afterMinutes: 360, requiredMinutes: 30 }, { afterMinutes: 540, requiredMinutes: 45 }]
const week = (days) => Object.fromEntries(Object.entries(days).map(([day, setting]) => [
  day, typeof setting === 'number' ? { targetMinutes: setting, breaks: [] } : setting,
]))

let app
let db
let processVacationRequest

before(async () => {
  if (!emulator) return
  assert.match(emulator, /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/)
  assert.match(projectId, /^demo-[a-z0-9-]+$/)
  app = initializeApp({ projectId })
  db = getFirestore(app)
  const vacationFunctions = await import('./index.js')
  processVacationRequest = vacationFunctions.processVacationRequest
})

after(async () => {
  if (!app) return
  await db.terminate()
  await deleteApp(app)
})

function call(handler, uid, data = {}) {
  return handler.run({ auth: { uid }, data: { expectedUserId: uid, ...data } })
}

async function fixture(t, setup) {
  const tag = `account-${randomUUID()}`
  const employee = `${tag}-employee`
  const admin = `${tag}-admin`
  const departmentId = `${tag}-office`
  const vacationManager = `${tag}-vacation`
  const explicitRefs = [
    db.doc(`users/${employee}`),
    db.doc(`users/${admin}`),
    db.doc(`users/${vacationManager}`),
    db.doc(`timeAccounts/${employee}`),
  ]
  t.after(async () => {
    const collections = ['timeDays', 'timeHistory', 'timeWorkModels', 'vacationRequests', 'vacationHistory']
    const matching = await Promise.all(collections.map((name) => db.collection(name).where('userId', '==', employee).get()))
    const batch = db.batch()
    for (const ref of [...explicitRefs, ...matching.flatMap((snapshot) => snapshot.docs.map((doc) => doc.ref))]) batch.delete(ref)
    await batch.commit()
  })
  await Promise.all([
    explicitRefs[0].set({ active: true, role: 'user', departmentId, permissions: { timeTracking: 'edit', vacation: 'edit' } }),
    explicitRefs[1].set({ active: true, role: 'superadmin', departmentId }),
    explicitRefs[2].set({ active: true, role: 'user', departmentId, vacationManager: true, vacationManagerDepartments: [departmentId] }),
  ])
  const account = (startDate, openingBalanceMinutes = 0) => call(saveTimeAccount, admin, { userId: employee, startDate, openingBalanceMinutes })
  const model = (validFrom, validTo, weekdays, extra = {}) => call(saveTimeWorkModel, admin, { model: { userId: employee, validFrom, validTo, weekdays, ...extra } })
  const read = (from, to) => call(listTimeWorkspace, employee, { from, to, ownOnly: true })
  const correction = (date, events, extra = {}) => call(correctTimeDay, admin, { userId: employee, date, events, expectedRevision: 0, reason: 'forgot_stamp', ...extra })
  const scopedRef = (collection, key) => db.collection(collection).doc(`${tag}-${key}`)
  const leave = async (key, startDate, extra = {}) => {
    const ref = scopedRef('vacationRequests', key)
    await ref.set({ userId: employee, startDate, endDate: startDate, days: 1, status: 'approved', vacationType: 'normal', type: 'vacation', ...extra })
    return ref
  }
  const holiday = async (key, date, extra = {}) => {
    const ref = scopedRef('publicHolidays', key)
    explicitRefs.push(ref)
    await ref.set({ date, countryCode: 'DE', ...extra })
  }
  return setup({ employee, admin, vacationManager, account, model, read, correction, leave, holiday })
}

const timeEvent = (date, type, hours) => ({ id: `${date}-${type}-${hours.replace(':', '')}`, type, at: `${date}T${hours}:00Z` })
const shift = (date, start, end) => [timeEvent(date, 'come', start), timeEvent(date, 'go', end)]

test('emulator: opening balance, inclusive model change, booked and automatic breaks, plus on a free day and totals outside the displayed range', options, async (t) => {
  await fixture(t, async ({ employee, admin, account, model, read, correction }) => {
    await account(dateOf(1), -90)
    const old = (await model(dateOf(0), dateOf(3), week({
      1: 480, 2: 480, 3: { targetMinutes: 480, breaks: standardBreaks }, 4: 240,
    }))).model
    await assert.rejects(model(dateOf(3), dateOf(6), week({ 5: 180 })), { code: 'failed-precondition' })
    const next = (await model(dateOf(4), dateOf(6), week({ 5: 180 }))).model
    await model(dateOf(7), '', week({}))

    await correction(dateOf(0), shift(dateOf(0), '07:00', '16:00'))
    await correction(dateOf(2), [
      timeEvent(dateOf(2), 'come', '07:00'),
      timeEvent(dateOf(2), 'pause_start', '11:00'),
      timeEvent(dateOf(2), 'pause_end', '11:20'),
      timeEvent(dateOf(2), 'go', '16:20'),
    ])
    await correction(dateOf(3), [...shift(dateOf(3), '07:00', '09:00'), ...shift(dateOf(3), '12:00', '14:00')])
    await correction(dateOf(4), shift(dateOf(4), '07:00', '11:00'))
    await correction(dateOf(5), shift(dateOf(5), '07:00', '15:30'))

    const result = await read(dateOf(0), dateOf(6))
    assert.deepEqual(result.account, { startDate: dateOf(1), openingBalanceMinutes: -90 })
    assert.deepEqual(result.days.map(({ workedMinutes, bookedBreakMinutes, automaticBreakMinutes, targetMinutes, balanceMinutes }) =>
      [workedMinutes, bookedBreakMinutes, automaticBreakMinutes, targetMinutes, balanceMinutes]), [
      [540, 0, 0, 480, 60], [0, 0, 0, 480, -480], [540, 20, 10, 480, 50],
      [240, 0, 0, 240, 0], [240, 0, 0, 180, 60], [510, 0, 0, 0, 510], [0, 0, 0, 0, 0],
    ])
    assert.equal(result.balanceMinutes, 50)
    assert.equal(result.balanceProvisional, false)
    assert.equal((await read(dateOf(4), dateOf(4))).balanceMinutes, 50)
    await account(dateOf(1), 100)
    await model(dateOf(4), dateOf(6), week({ 5: 210 }), { id: next.id })
    assert.equal((await read(dateOf(4), dateOf(4))).balanceMinutes, 210)
    const adminView = await call(listTimeWorkspace, admin, { userId: employee, from: dateOf(3), to: dateOf(4) })
    assert.deepEqual(adminView.models.slice(0, 2).map(({ id, validFrom, validTo }) => ({ id, validFrom, validTo })), [
      { id: old.id, validFrom: dateOf(0), validTo: dateOf(3) },
      { id: next.id, validFrom: dateOf(4), validTo: dateOf(6) },
    ])
    const audit = (await db.collection('timeHistory').where('userId', '==', employee).get()).docs.map((doc) => doc.data())
    assert.ok(audit.some((record) => record.kind === 'account' && record.before?.openingBalanceMinutes === -90 && record.after.openingBalanceMinutes === 100 && record.createdBy === admin))
    assert.ok(audit.some((record) => record.kind === 'model' && record.before?.weekdays['5'].targetMinutes === 180 && record.after.weekdays['5'].targetMinutes === 210 && record.createdBy === admin))
  })
})

test('emulator: a closely spaced second break threshold never makes the deduction jump', options, async (t) => {
  await fixture(t, async ({ account, model, read, correction }) => {
    await account(dateOf(0))
    const setting = { targetMinutes: 360, breaks: [{ afterMinutes: 360, requiredMinutes: 30 }, { afterMinutes: 365, requiredMinutes: 45 }] }
    await model(dateOf(0), dateOf(2), week({ 1: setting, 2: setting, 3: setting }))
    await model(dateOf(3), '', week({}))
    await correction(dateOf(0), shift(dateOf(0), '07:00', '13:05'))
    await correction(dateOf(1), shift(dateOf(1), '07:00', '13:06'))
    await correction(dateOf(2), shift(dateOf(2), '07:00', '13:45'))
    const result = await read(dateOf(0), dateOf(2))
    assert.deepEqual(result.days.map(({ automaticBreakMinutes }) => automaticBreakMinutes), [5, 6, 45])
    assert.deepEqual(result.days.map(({ creditedMinutes }) => creditedMinutes), [360, 360, 360])
    assert.equal(result.balanceMinutes, 0)
  })
})

test('emulator: approved full, half and manual leave, pending and zero-day requests, regional holidays and unallocated legacy half day', options, async (t) => {
  await fixture(t, async ({ account, model, read, correction, leave, holiday }) => {
    await account(dateOf(0), 15)
    const setting = { targetMinutes: 480, breaks: standardBreaks }
    await model(dateOf(0), dateOf(6), week({ 1: setting, 2: setting, 3: setting, 4: setting, 5: setting }), { holidaySubdivisionCode: 'DE-NW' })
    await model(dateOf(8), '', week({}))
    await Promise.all([
      leave('whole', dateOf(0)),
      leave('half', dateOf(1), { days: 0.5, halfDayDate: dateOf(1) }),
      leave('pending', dateOf(3), { status: 'pending' }),
      leave('zero', dateOf(3), { days: 0 }),
      leave('manual', dateOf(4), { status: 'manual', hrManualEntry: true }),
      leave('zero-overtime', dateOf(4), { days: 0, vacationType: 'overtime' }),
      leave('weekend', dateOf(5), { vacationType: 'overtime' }),
      leave('legacy', dateOf(6), { endDate: dateOf(7), days: 1.5 }),
      holiday('matching', dateOf(2), { subdivisionCodes: ['DE-NW'] }),
      holiday('different', dateOf(3), { subdivisionCodes: ['DE-NI'] }),
    ])
    await correction(dateOf(1), shift(dateOf(1), '07:00', '16:30'))
    await correction(dateOf(2), shift(dateOf(2), '07:00', '15:30'))
    await correction(dateOf(7), shift(dateOf(7), '07:00', '08:30'))
    const result = await read(dateOf(0), dateOf(7))
    assert.deepEqual(result.days.map(({ targetMinutes }) => targetMinutes), [0, 240, 0, 480, 0, 0, 0, 0])
    assert.equal(result.days[1].automaticBreakMinutes, 45)
    assert.equal(result.days[1].balanceMinutes, 285)
    assert.equal(result.days[2].automaticBreakMinutes, 0)
    assert.equal(result.days[2].balanceMinutes, 510)
    assert.equal(result.days[4].overtimeDebitMinutes, 0)
    assert.deepEqual(result.days[4].overtimeRequestIds, [])
    assert.equal(result.days[5].overtimeDebitMinutes, 0)
    assert.ok(result.days[6].issues.includes('Halben Urlaubstag für diesen Zeitraum zuordnen.'))
    assert.ok(result.days[7].issues.includes('Kein Arbeitszeitmodell hinterlegt.'))
    assert.equal(result.days[7].workedMinutes, 90)
    assert.deepEqual(result.days.map(({ calculationIncomplete }) => calculationIncomplete), [false, false, false, false, false, false, true, true])
    assert.equal(result.balanceMinutes, 330)
    assert.equal(result.balanceProvisional, true)
  })
})

test('emulator: approving, changing and cancelling overtime changes the original leave effect, without a second debit or a future debit today', options, async (t) => {
  await fixture(t, async ({ employee, admin, vacationManager, account, model, read, correction, leave }) => {
    const fullDate = addTimeDays(today, -4)
    const halfDate = addTimeDays(today, -3)
    const future = addTimeDays(today, 1)
    await account(fullDate, 1200)
    await model(fullDate, '', week({ [weekday(fullDate)]: 480, [weekday(halfDate)]: 480, [weekday(future)]: 480 }))
    await correction(halfDate, shift(halfDate, '07:00', '11:00'))
    const root = await leave('overtime', fullDate, { status: 'pending', mainStatus: 'pending', vacationType: 'overtime' })
    const futureRequest = await leave('future-overtime', future, { vacationType: 'overtime' })
    const approve = (ref) => call(processVacationRequest, vacationManager, { requestId: ref.id, decision: 'approved' })
    const load = () => read(fullDate, future)

    const pending = await load()
    assert.equal(pending.days[0].overtimeDebitMinutes, 0)
    assert.equal(pending.days.at(-1).overtimeDebitMinutes, 480)
    assert.deepEqual(pending.days.at(-1).overtimeRequestIds, [futureRequest.id])
    assert.equal(pending.balanceMinutes, 480)

    await approve(root)
    const full = await load()
    assert.equal((await root.get()).data().timeAccountEffect, 'overtime_debit')
    assert.equal(full.days[0].targetMinutes, 0)
    assert.equal(full.days[0].overtimeDebitMinutes, 480)
    assert.deepEqual(full.days[0].overtimeRequestIds, [root.id])
    assert.equal(full.balanceMinutes, 480)

    const change = await leave('change', halfDate, {
      status: 'change_requested', requestStatus: 'pending', originalRequestId: root.id, vacationId: root.id,
      days: 0.5, halfDayDate: halfDate, vacationType: 'overtime',
    })
    await approve(change)
    const half = await load()
    assert.equal(half.days[0].overtimeDebitMinutes, 0)
    assert.equal(half.days[1].targetMinutes, 240)
    assert.equal(half.days[1].overtimeDebitMinutes, 240)
    assert.equal(half.days[1].balanceMinutes, -240)
    assert.deepEqual(half.days[1].overtimeRequestIds, [root.id])
    assert.equal(half.balanceMinutes, 480)
    const personnel = await call(listTimeWorkspace, admin, { userId: employee, from: halfDate, to: halfDate, personnelOnly: true })
    assert.deepEqual(personnel.days, [{ date: halfDate, overtimeDebitMinutes: 240, overtimeRequestIds: [root.id], calculationIncomplete: false }])

    const cancel = await leave('cancel', halfDate, {
      status: 'cancellation_requested', requestStatus: 'pending', requestKind: 'cancellation', originalRequestId: root.id, vacationId: root.id,
    })
    await approve(cancel)
    const cancelled = await load()
    assert.equal((await root.get()).data().status, 'cancelled')
    assert.equal(cancelled.days[1].targetMinutes, 480)
    assert.equal(cancelled.days[1].overtimeDebitMinutes, 0)
    assert.deepEqual(cancelled.days[1].overtimeRequestIds, [])
    assert.equal(cancelled.balanceMinutes, 480)
    assert.equal(cancelled.balanceProvisional, false)
  })
})

test('emulator: stamp concurrency, past-day prompt, stale and successful correction, and audit provenance', options, async (t) => {
  await fixture(t, async ({ employee, account, model, read }) => {
    const yesterday = addTimeDays(today, -1)
    await account(yesterday, 20)
    await model(yesterday, '', week({ [weekday(yesterday)]: 480 }))
    const come = timeEvent(yesterday, 'come', '07:00')
    const go = timeEvent(yesterday, 'go', '16:00')
    const book = ({ id, type, at }, offline = true) => call(stampTime, employee, { eventId: id, type, at, offline })
    await assert.rejects(book(go), { code: 'failed-precondition' })
    const racing = await Promise.all([book(come), book(come)])
    assert.equal(racing.filter((result) => result.duplicate).length, 1)
    assert.ok(racing.every((result) => result.revision === 1))
    await assert.rejects(book({ ...come, at: `${yesterday}T07:01:00Z` }), { code: 'already-exists' })
    await book({ id: 'today-live', type: 'come', at: new Date().toISOString() }, false)
    const unresolved = await read(yesterday, today)
    assert.deepEqual(unresolved.unresolvedDays.map(({ date }) => date), [yesterday])
    assert.equal(unresolved.days[0].workedMinutes, 0)
    assert.equal(unresolved.days[0].incomplete, true)
    assert.equal(unresolved.days[1].status, 'working')
    assert.equal(unresolved.balanceMinutes, 20 + unresolved.days[1].balanceMinutes)
    assert.equal(unresolved.balanceProvisional, true)

    const draft = { date: yesterday, events: [come, go], note: ' Nachtrag nach Rückfrage ' }
    await assert.rejects(call(correctTimeDay, employee, { ...draft, expectedRevision: 1 }), { code: 'invalid-argument' })
    await assert.rejects(call(correctTimeDay, employee, { ...draft, expectedRevision: 0, reason: 'forgot_stamp' }), { code: 'aborted' })
    await call(correctTimeDay, employee, { ...draft, expectedRevision: 1, reason: 'forgot_stamp' })
    const corrected = await read(yesterday, today)
    assert.deepEqual(corrected.unresolvedDays, [])
    assert.equal(corrected.days[0].revision, 2)
    assert.equal(corrected.days[0].balanceMinutes, 60)
    assert.equal(corrected.balanceMinutes, 80 + corrected.days[1].balanceMinutes)
    assert.equal(corrected.balanceProvisional, false)
    assert.equal(corrected.history.length, 1)
    const audit = corrected.history[0]
    assert.equal(audit.kind, 'correction')
    assert.equal(audit.createdBy, employee)
    assert.equal(audit.reason, 'forgot_stamp')
    assert.equal(audit.note, 'Nachtrag nach Rückfrage')
    assert.ok(Number.isFinite(Date.parse(audit.createdAt)))
    assert.deepEqual(audit.before.map(({ type, source }) => [type, source]), [['come', 'offline']])
    assert.deepEqual(audit.after.map(({ type, source }) => [type, source]), [['come', 'offline'], ['go', 'correction']])
    assert.equal(audit.after[0].receivedAt, audit.before[0].receivedAt)
    const stored = (await db.collection('timeHistory').where('userId', '==', employee).where('kind', '==', 'stamp').get()).docs.map((doc) => doc.data())
    assert.equal(stored.length, 2)
    assert.ok(stored.some((item) => item.offline && item.after.id === come.id))
    assert.ok(stored.some((item) => !item.offline && item.after.id === 'today-live'))
  })
})

test('emulator: offline stamping respects the seven-day limit without breaking already accepted retries', options, async (t) => {
  await fixture(t, async ({ employee }) => {
    const lastAllowed = addTimeDays(today, -7)
    const expired = addTimeDays(today, -8)
    const book = ({ id, type, at }, offline = true) => call(stampTime, employee, { eventId: id, type, at, offline })
    const stillValid = timeEvent(lastAllowed, 'come', '07:00')
    const historic = timeEvent(expired, 'come', '07:00')
    await assert.rejects(book(stillValid, false), { code: 'invalid-argument' })
    assert.equal((await book(stillValid)).accepted, true)
    await assert.rejects(book({ ...historic, id: 'first-send-too-old' }), { code: 'failed-precondition' })
    const oldRef = db.doc(`timeDays/${employee}_${expired}`)
    assert.equal((await oldRef.get()).exists, false)

    const originallyAccepted = { ...historic, at: new Date(historic.at).toISOString(), source: 'offline' }
    await persistTimeStamp(db, employee, originallyAccepted, new Date(`${expired}T08:00:00Z`))
    assert.equal((await book(historic)).duplicate, true)
    await assert.rejects(book(timeEvent(expired, 'go', '16:00')), { code: 'failed-precondition' })
    assert.deepEqual((await oldRef.get()).data().events.map(({ type }) => type), ['come'])
  })
})
