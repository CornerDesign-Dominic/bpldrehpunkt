import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDeadlineParent, validateSystemCalendarQuery } from './calendarQueries.js'

const data = { from: '2026-10-01', until: '2026-12-31', upcomingFrom: '2026-10-31', calendarIds: ['system-damages'] }
test('server calendar independently enforces selected source permissions for users and administrators', () => {
  assert.equal(validateSystemCalendarQuery(data, { permissions: { damages: 'view' } }).selected[0].collection, 'damageCases')
  assert.throws(() => validateSystemCalendarQuery(data, { role: 'admin', permissions: {} }), { code: 'permission-denied' })
  assert.equal(validateSystemCalendarQuery(data, { role: 'superadmin' }).selected.length, 1)
  assert.throws(() => validateSystemCalendarQuery({ ...data, calendarIds: ['todos'] }, { role: 'superadmin' }), { code: 'invalid-argument' })
  for (const from of ['2026-99-01', '2026-02-30', '2027-01-01', '2020-01-01']) assert.throws(() => validateSystemCalendarQuery({ ...data, from }, { role: 'superadmin' }), { code: 'invalid-argument' })
})

test('collection-group results cannot expose other modules or nested private records', () => {
  const allowed = new Set(['damageCases'])
  assert.equal(calendarDeadlineParent('damageCases/case1/deadlines/d1', allowed), 'damageCases/case1')
  assert.equal(calendarDeadlineParent('todos/task/deadlines/d1', allowed), null)
  assert.equal(calendarDeadlineParent('damageCases/case1/private/a/deadlines/d1', allowed), null)
  assert.equal(calendarDeadlineParent('insolvencies/case1/deadlines/d1', allowed), null)
})
