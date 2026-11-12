import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTodoCalendarProjection, projectTodoCalendarEntries, todoProjectionCalendars, validateTodoCalendarQuery } from './todoCalendarProjection.js'

const profile = { active: true, role: 'user', department: 'Buchhaltung', permissions: { todos: 'view' } }
const range = { from: '2026-11-01', until: '2026-11-30', upcomingFrom: '2026-11-12' }
const todo = { id: 'task', title: 'Review', status: 'open', creatorUserId: 'creator', audienceType: 'people', audienceIds: ['alice', 'bob'], dueDate: '2026-11-16', reminderDate: '2026-11-16', reminderTime: '10:00', reminderRecipientMode: 'all' }
const deadlines = [
  { id: 'first', date: '2026-11-17', time: '11:00', type: 'appointment', reminderEnabled: false },
  { id: 'second', date: '2026-11-18', type: 'deadline', reminderEnabled: true, reminderRecipientMode: 'selected', reminderRecipientUserIds: ['bob'] },
]

function fixture(state) {
  const reads = []
  const snapshot = (data) => ({ id: data.id, data: () => ({ ...data }) })
  function collection(path, filters = []) {
    return {
      where(field, operator, value) { return collection(path, [...filters, [field, operator, value]]) },
      async get() {
        reads.push(path)
        assert.notEqual(path, 'todoCalendarEntries', 'Legacy physical mirrors must never be read')
        let values = path === 'todos' ? state.todos : state.deadlines[path] || []
        values = values.filter((item) => filters.every(([field, operator, value]) => operator === 'array-contains' ? item[field]?.includes(value) : item[field] === value))
        return { docs: values.map(snapshot) }
      },
    }
  }
  return { collection, reads }
}

test('projection validates caller module rights and rejects user/calendar override and invalid ranges', () => {
  assert.deepEqual(validateTodoCalendarQuery(range, profile), range)
  for (const forbidden of [{ ...profile, active: false }, { ...profile, role: 'admin', permissions: {} }, { ...profile, permissions: { calendar: 'edit' } }]) {
    assert.throws(() => validateTodoCalendarQuery(range, forbidden), { code: 'permission-denied' })
  }
  for (const data of [{ ...range, userId: 'victim' }, { ...range, calendarIds: ['unbound-shared-calendar'] }, { ...range, from: '2026-02-30' }, { ...range, until: '2028-11-30' }]) {
    assert.throws(() => validateTodoCalendarQuery(data, profile), { code: 'invalid-argument' })
  }
})

test('personal dates follow actual audience and per-date selection even when mail is off', () => {
  const alice = projectTodoCalendarEntries(todo, deadlines, 'alice', profile)
  assert.deepEqual(alice.map((entry) => entry.id), ['todo:task:due', 'todo:task:deadline:first'])
  assert(alice.every((entry) => entry.calendarId === 'personal-alice'))
  assert.equal(alice[1].reminderEnabled, false)
  assert.equal(projectTodoCalendarEntries(todo, deadlines, 'bob', profile).length, 3)
  assert.equal(projectTodoCalendarEntries(todo, deadlines, 'creator', profile).length, 0)
  assert.equal(projectTodoCalendarEntries(todo, deadlines, 'outsider', { ...profile, role: 'superadmin' }).length, 0)
  assert.equal(projectTodoCalendarEntries(todo, deadlines, 'alice', { ...profile, active: false }).length, 0)
  const noAlice = { ...deadlines[0], reminderRecipientMode: 'selected', reminderRecipientUserIds: ['bob'] }
  assert.equal(projectTodoCalendarEntries(todo, [noAlice], 'alice', profile).length, 1)
})

test('department↔people roundtrips replace placement without copies, stale entries or duplicates', async () => {
  const state = { todos: [{ ...todo }], deadlines: { 'todos/task/deadlines': deadlines } }
  const db = fixture(state)
  const ids = new Set()
  for (let pass = 0; pass < 3; pass += 1) {
    state.todos[0] = { ...todo, audienceType: 'department', audienceId: 'Buchhaltung' }
    const department = await loadTodoCalendarProjection(db, 'alice', profile, range)
    assert.equal(department.entries.length, 3)
    assert(department.entries.every((entry) => entry.calendarId === 'todo-department:Buchhaltung'))
    assert.equal(new Set(department.entries.map((entry) => entry.id)).size, department.entries.length)
    department.entries.forEach((entry) => ids.add(entry.id))
    state.todos[0] = { ...todo }
    const personal = await loadTodoCalendarProjection(db, 'alice', profile, range)
    assert.equal(personal.entries.length, 2)
    assert(personal.entries.every((entry) => entry.calendarId === 'personal-alice'))
  }
  assert.equal(ids.size, 3)
  state.todos[0] = { ...todo, audienceIds: ['bob'] }
  assert.equal((await loadTodoCalendarProjection(db, 'alice', profile, range)).entries.length, 0)
  state.todos[0] = { ...todo, audienceType: 'department', audienceId: 'Buchhaltung' }
  assert.equal((await loadTodoCalendarProjection(db, 'alice', { ...profile, department: 'Vertrieb' }, range)).entries.length, 0)
  assert.equal((await loadTodoCalendarProjection(db, 'alice', profile, range)).entries.length, 3)
  state.deadlines['todos/task/deadlines'] = []
  assert.equal((await loadTodoCalendarProjection(db, 'alice', profile, range)).entries.length, 1)
  state.todos = []
  assert.equal((await loadTodoCalendarProjection(db, 'alice', profile, range)).entries.length, 0)
})

test('date projection deduplicates main due/reminder, uses stable source IDs and preserves next ten outside range', async () => {
  const more = Array.from({ length: 15 }, (_, index) => ({ id: `future-${index}`, date: `2027-01-${String(index + 1).padStart(2, '0')}`, reminderEnabled: false }))
  const state = { todos: [{ ...todo, dueDate: null, reminderDate: null }], deadlines: { 'todos/task/deadlines': more } }
  const result = await loadTodoCalendarProjection(fixture(state), 'alice', profile, range)
  assert.equal(result.entries.length, 10)
  assert.equal(result.entries.at(-1).startDate, '2027-01-10')
  const twoDates = projectTodoCalendarEntries({ ...todo, reminderDate: '2026-11-15' }, [], 'alice', profile)
  assert.deepEqual(twoDates.map((entry) => entry.startDate), ['2026-11-16', '2026-11-15'])
  assert.equal(projectTodoCalendarEntries({ ...todo, status: 'withdrawn' }, deadlines, 'alice', profile).length, 0)
  const completed = projectTodoCalendarEntries({ ...todo, status: 'completed' }, deadlines, 'alice', profile)
  assert.equal(completed.length, 2)
  assert(completed.every((entry) => entry.completed && !entry.reminderEnabled))
  assert.deepEqual(completed.map((entry) => entry.id), projectTodoCalendarEntries(todo, deadlines, 'alice', profile).map((entry) => entry.id))
  assert.equal(projectTodoCalendarEntries(todo, deadlines, 'alice', profile)[0].reminderEnabled, true)
  const calendars = todoProjectionCalendars('alice', profile)
  assert.deepEqual(calendars.map((item) => item.id), ['personal-alice', 'todo-department:Buchhaltung'])
  assert(calendars.every((item) => item.accessLevel === 'view' && item.systemCalendar))
})
