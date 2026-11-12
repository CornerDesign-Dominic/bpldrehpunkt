import test from 'node:test'
import assert from 'node:assert/strict'
import { isTimeHoliday, mayManageTime, personnelTimeProjection, persistTimeCorrection, persistTimeStamp, readOwnTimeBookings, requestTimeClient, requireExpectedTimeUser, requireOwnTimeAccess, requirePersonnelTimeAccess } from './timeTracking.js'

const user = { active: true, role: 'user', departmentId: 'office', permissions: { timeTracking: 'edit' } }
const now = new Date('2026-11-10T20:00:00Z')
function fakeDb(initial = {}) {
  const values = new Map(Object.entries({ 'users/employee': user, ...initial }))
  let pending = Promise.resolve()
  const ref = (path) => ({ path })
  return {
    values, doc: ref,
    runTransaction(callback) {
      const result = pending.then(async () => {
        const writes = []
        let writing = false
        const result = await callback({
          get: async ({ path }) => { assert.equal(writing, false, 'all reads precede writes'); return { exists: values.has(path), data: () => values.get(path) } },
          set: (reference, data, options) => { writing = true; writes.push([reference.path, options?.merge ? { ...values.get(reference.path), ...data } : data]) },
          create: (reference, data) => { writing = true; assert.equal(values.has(reference.path), false); writes.push([reference.path, data]) },
        })
        for (const [path, data] of writes) values.set(path, data)
        return result
      })
      pending = result.catch(() => {})
      return result
    },
  }
}
const stamp = { id: 'first', type: 'come', at: '2026-11-10T07:00:00.000Z', source: 'offline' }
const correction = { userId: 'employee', date: '2026-11-10', events: [stamp], reason: 'forgot_stamp', note: '', expectedRevision: 0 }
test('booking pages are user-scoped, keep history for deleted events, and advance past 30 days', async () => {
  const snapshots = entries => ({ docs: entries.map((data, index) => ({ id: String(index), data: () => data })) })
  const entries = Array.from({ length: 31 }, (_, index) => ({ date: `2026-10-${String(31 - index).padStart(2, '0')}`, events: [] }))
  const scopes = []
  const db = { collection(name) {
    const query = {
      where(field, op, value) { scopes.push([name, field, op, value]); return query },
      orderBy() { return query }, startAfter(value) { assert.equal(value, '2026-11-01'); return query },
      limit(value) { assert.equal(value, 31); return query },
      async get() { return snapshots(name === 'timeDays' ? entries : [{ date: entries[0].date, kind: 'correction', before: [stamp], after: [], createdByName: 'Manager', createdAt: null }]) },
    }
    return query
  } }
  const page = await readOwnTimeBookings(db, 'employee', '2026-11-01')
  assert.equal(page.days.length, 30)
  assert.equal(page.nextBefore, '2026-10-02')
  assert.equal(page.history[0].before[0].id, stamp.id)
  assert.deepEqual(scopes.filter(([, field]) => field === 'userId').map(([, , , uid]) => uid), ['employee', 'employee'])
  await assert.rejects(readOwnTimeBookings(db, 'employee', 'bad'), { code: 'invalid-argument' })
})
test('existing mobile origin is recognized without relabeling unknown legacy clients', () => {
  assert.equal(requestTimeClient({ rawRequest: { headers: { origin: 'https://db-bpl-drehpunkt-dev-time.web.app' } } }), 'mobile')
  assert.equal(requestTimeClient({ rawRequest: { headers: { origin: 'https://db-bpl-drehpunkt-dev-time.web.app.other.test' } } }), 'unknown')
  assert.equal(requestTimeClient({ rawRequest: { headers: { origin: 'https://db-bpl-drehpunkt-time.web.app' } } }), 'mobile')
  assert.equal(requestTimeClient({ rawRequest: { headers: { origin: 'https://db-bpl-drehpunkt-time.web.app.other.test' } } }), 'unknown')
  assert.equal(requestTimeClient({ data: { client: 'web' } }), 'web')
  assert.equal(requestTimeClient({}), 'unknown')
})
test('web origin and actor are recorded; unchanged original booking retains its origin', async () => {
  const db = fakeDb({ 'users/employee': { ...user, firstName: 'Test', lastName: 'Person' } })
  await persistTimeStamp(db, 'employee', { ...stamp, client: 'mobile' }, now)
  await persistTimeCorrection(db, { ...correction, client: 'web', expectedRevision: 1 }, 'employee', now)
  assert.equal(db.values.get('timeDays/employee_2026-11-10').events[0].client, 'mobile')
  const audit = [...db.values.values()].find(value => value.kind === 'correction')
  assert.equal(audit.client, 'web')
  assert.equal(audit.createdByName, 'Test Person')
  await persistTimeCorrection(db, { ...correction, client: 'web', expectedRevision: 2, events: [{ ...stamp, at: '2026-11-10T08:00:00.000Z' }] }, 'employee', now)
  assert.equal(db.values.get('timeDays/employee_2026-11-10').events[0].client, 'web')
})
test('module access is distinct from role and disabled superadmin has no override', () => {
  requireOwnTimeAccess(user, true)
  for (const profile of [{ ...user, permissions: { timeTracking: 'view' } }, { active: true, role: 'admin' }, { active: false, role: 'superadmin' }]) assert.throws(() => requireOwnTimeAccess(profile, true), { code: 'permission-denied' })
})
test('manager scopes are independent of vacation and admin role', () => {
  assert.equal(mayManageTime({ ...user, timeManager: true, timeManagerDepartments: ['office'] }, user), true)
  assert.equal(mayManageTime({ ...user, timeManager: true, timeManagerDepartments: ['other'] }, user), false)
  assert.equal(mayManageTime({ ...user, vacationManager: true }, user), false)
  assert.equal(mayManageTime({ ...user, role: 'admin' }, user), false)
})
test('stamp is idempotent including concurrent retransmission; altered replay rejected', async () => {
  const db = fakeDb()
  const result = await Promise.all([persistTimeStamp(db, 'employee', stamp, now), persistTimeStamp(db, 'employee', stamp, now)])
  assert.equal(result.filter((value) => value.duplicate).length, 1)
  assert.equal(db.values.get('timeDays/employee_2026-11-10').events.length, 1)
  assert.equal(db.values.get('timeDays/employee_2026-11-10').revision, 1)
  await assert.rejects(persistTimeStamp(db, 'employee', { ...stamp, type: 'go' }, now), { code: 'already-exists' })
  assert.equal([...db.values.values()].find((entry) => entry.kind === 'stamp').createdBy, 'employee')
})
test('invalid state fails atomically and disabled actor cannot flush offline queue', async () => {
  const db = fakeDb()
  await assert.rejects(persistTimeStamp(db, 'employee', { ...stamp, type: 'go' }, now), { code: 'failed-precondition' })
  assert.equal(db.values.has('timeDays/employee_2026-11-10'), false)
  db.values.set('users/employee', { ...user, active: false })
  await assert.rejects(persistTimeStamp(db, 'employee', stamp, now), { code: 'permission-denied' })
})
test('correction stores previous values and stale revision cannot lose simultaneous stamp', async () => {
  const db = fakeDb()
  await persistTimeStamp(db, 'employee', stamp, now)
  await assert.rejects(persistTimeCorrection(db, correction, 'employee', now), { code: 'aborted' })
  await persistTimeCorrection(db, { ...correction, expectedRevision: 1, events: [] }, 'employee', now)
  const audit = [...db.values.values()].find((entry) => entry.kind === 'correction')
  assert.equal(audit.before[0].id, 'first')
  assert.deepEqual(audit.after, [])
  assert.equal(db.values.get('timeDays/employee_2026-11-10').revision, 2)
})
test('seven day self window and scoped manager historical corrections checked inside transaction', async () => {
  const older = { ...correction, date: '2026-10-01', events: [] }
  const db = fakeDb({ 'users/manager': { ...user, timeManager: true, timeManagerDepartments: ['office'] } })
  await assert.rejects(persistTimeCorrection(db, older, 'employee', now), { code: 'permission-denied' })
  await persistTimeCorrection(db, older, 'manager', now)
  db.values.set('users/manager', { ...user, timeManager: true, timeManagerDepartments: ['other'] })
  await assert.rejects(persistTimeCorrection(db, { ...older, expectedRevision: 1 }, 'manager', now), { code: 'permission-denied' })
})
test('company region fallback uses NW and ignores foreign or other regional holidays', () => {
  const date = '2026-11-01'
  const holiday = { date, countryCode: 'DE', nationalHoliday: false, subdivisionCodes: ['NW'] }
  assert.equal(isTimeHoliday(date, null, [holiday]), true)
  assert.equal(isTimeHoliday(date, { holidayCountryCode: 'DE', holidaySubdivisionCode: 'NI' }, [holiday]), false)
  assert.equal(isTimeHoliday(date, null, [{ ...holiday, countryCode: 'FR', nationalHoliday: true }]), false)
  assert.equal(isTimeHoliday(date, null, [{ name: 'missing date' }]), false)
})
test('personnel account view requires module access and excludes stamps, models and corrections', () => {
  requirePersonnelTimeAccess({ ...user, permissions: { personnel: 'view' } })
  requirePersonnelTimeAccess({ active: true, role: 'superadmin' })
  for (const profile of [{ ...user, role: 'admin' }, { ...user, timeManager: true }, { active: false, role: 'superadmin' }]) assert.throws(() => requirePersonnelTimeAccess(profile), { code: 'permission-denied' })
  const result = personnelTimeProjection({ user: { id: 'employee' }, account: { startDate: '2026-11-01', openingBalanceMinutes: 0 }, balanceMinutes: -480, balanceProvisional: false, history: [{ note: 'private correction' }], models: [{ weekdays: {} }], days: [{ date: '2026-11-10', events: [stamp], reason: 'private', overtimeDebitMinutes: 480, overtimeRequestIds: ['root'], calculationIncomplete: false, targetMinutes: 480 }] })
  assert.deepEqual(Object.keys(result).sort(), ['account', 'balanceMinutes', 'balanceProvisional', 'days', 'user'])
  assert.deepEqual(result.days, [{ date: '2026-11-10', overtimeDebitMinutes: 480, overtimeRequestIds: ['root'], calculationIncomplete: false }])
})
test('queued stamps and corrections cannot cross accounts during authentication restoration', () => {
  requireExpectedTimeUser({ auth: { uid: 'employee' }, data: { expectedUserId: 'employee' } })
  for (const data of [{}, { expectedUserId: 'different-employee' }, { expectedUserId: null }]) assert.throws(() => requireExpectedTimeUser({ auth: { uid: 'employee' }, data }), { code: 'permission-denied' })
  assert.throws(() => requireExpectedTimeUser({ data: { expectedUserId: 'employee' } }), { code: 'unauthenticated' })
})
test('unchanged corrected events preserve their original offline/live provenance', async () => {
  const db = fakeDb()
  await persistTimeStamp(db, 'employee', stamp, now)
  await persistTimeCorrection(db, { ...correction, expectedRevision: 1, events: [{ ...stamp, source: 'correction' }] }, 'employee', now)
  assert.equal(db.values.get('timeDays/employee_2026-11-10').events[0].source, 'offline')
  assert.equal(db.values.get('timeDays/employee_2026-11-10').events[0].receivedAt, now.toISOString())
})
test('idempotency keys remain distinct for ambiguous underscore combinations', async () => {
  const db = fakeDb({ 'users/user_a': user, 'users/user': user })
  await persistTimeStamp(db, 'user_a', { ...stamp, id: 'b' }, now)
  await persistTimeStamp(db, 'user', { ...stamp, id: 'a_b' }, now)
  assert.equal([...db.values.values()].filter((entry) => entry.kind === 'stamp').length, 2)
  assert.equal(db.values.get('timeDays/user_a_2026-11-10').events[0].id, 'b')
  assert.equal(db.values.get('timeDays/user_2026-11-10').events[0].id, 'a_b')
})
