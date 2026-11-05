import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDeadlineParent, loadSystemCalendarSources, validateSystemCalendarQuery } from './calendarQueries.js'

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

test('contract calendar requires contracts access even when calendar or other case access is assigned', () => {
  const selection = { ...data, calendarIds: ['system-contracts'] }
  assert.equal(validateSystemCalendarQuery(selection, { permissions: { contracts: 'view' } }).selected[0].collection, 'contracts')
  for (const profile of [{ role: 'admin', permissions: {} }, { permissions: { calendar: 'edit', damages: 'edit' } }]) assert.throws(() => validateSystemCalendarQuery(selection, profile), { code: 'permission-denied' })
  assert.throws(() => validateSystemCalendarQuery({ ...selection, calendarIds: ['system-contracts', 'system-damages'] }, { permissions: { contracts: 'view' } }), { code: 'permission-denied' })
})

function calendarFixture(values) {
  const reads = []
  const snapshot = ([path, data]) => ({ id: path.split('/').at(-1), ref: { path }, exists: true, data: () => data, get: field => data[field] })
  function query(filters = [], size = Infinity, after = null) {
    return {
      where: (field, operator, value) => query([...filters, [field, operator, value]], size, after),
      orderBy: () => query(filters, size, after),
      limit: value => query(filters, value, after),
      startAfter: value => query(filters, size, value),
      async get() {
        let docs = Object.entries(values).filter(([path]) => path.split('/').length >= 4 && path.split('/').at(-2) === 'deadlines').map(snapshot)
        docs = docs.filter(doc => filters.every(([field, operator, value]) => operator === '>=' ? doc.get(field) >= value : doc.get(field) <= value)).sort((a, b) => a.get('date').localeCompare(b.get('date')))
        if (after) docs = docs.slice(docs.findIndex(doc => doc.ref.path === after.ref.path) + 1)
        docs = docs.slice(0, size)
        return { docs, size: docs.length }
      },
    }
  }
  return {
    reads,
    collectionGroup: () => query(),
    doc: path => ({ path }),
    async getAll(...references) { return references.map(({ path }) => { reads.push(path); return values[path] ? snapshot([path, values[path]]) : { ref: { path }, exists: false } }) },
  }
}

test('contract calendar returns minimal active deadline fields and never loads unselected private sources', async () => {
  const db = calendarFixture({
    'contracts/open': { partnerName: 'Telekom', contractNumber: 'V-5', customerNumber: 'private-customer-number', description: 'private-description' },
    'contracts/open/deadlines/active': { title: 'Kündigungsfrist', date: '2026-11-20', time: '10:00', type: 'cancellation', note: 'Prüfen', reminderRecipientEmail: 'private@example.invalid' },
    'contracts/completed-only': { partnerName: 'Erledigt' },
    'contracts/completed-only/deadlines/done': { title: 'Nicht mehr anzeigen', date: '2026-11-20', completed: true },
    'contracts/invalid-only': { partnerName: 'Ungültig' },
    'contracts/invalid-only/deadlines/invalid': { date: '2026-02-30' },
    'damageCases/private': { title: 'private damage' },
    'damageCases/private/deadlines/private': { date: '2026-11-20' },
    'todos/private/deadlines/private': { date: '2026-11-20' },
  })
  const options = validateSystemCalendarQuery({ from: '2026-11-01', until: '2026-11-30', upcomingFrom: '2026-11-05', calendarIds: ['system-contracts'] }, { permissions: { contracts: 'view' } })
  const result = await loadSystemCalendarSources(db, options)
  assert.deepEqual(result.cases, { contracts: [{ id: 'open', partnerName: 'Telekom', contractNumber: 'V-5' }] })
  assert.deepEqual(result.deadlines, [{ id: 'active', parentPath: 'contracts/open', date: '2026-11-20', time: '10:00', type: 'cancellation', note: 'Prüfen', reminderEnabled: false, title: 'Kündigungsfrist' }])
  assert.deepEqual(db.reads, ['contracts/open'])
  assert.equal(JSON.stringify(result).includes('private'), false)
})
