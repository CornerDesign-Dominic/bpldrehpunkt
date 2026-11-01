import assert from 'node:assert/strict'
import test from 'node:test'
import { canReadReminderSource, createReminderRecipientCache, loadReminderSource, reminderDeliveryId, reminderParentChanged, reminderParentSuppressed, reminderRecipientPolicy, reminderSourceDescriptor } from './reminderSources.js'

const profile = { active: true, role: 'user', permissions: { calendar: 'view', todos: 'view', damages: 'view' }, department: 'Dispo' }

test('registry accepts only canonical sources and never mirrors or unrelated tracking events', () => {
  for (const path of ['calendars/shared/events/e', 'todos/t', 'todos/t/deadlines/d', 'damageCases/c/deadlines/d', 'inkassoCases/c/deadlines/d', 'legalDisputes/c/deadlines/d', 'insolvencies/c/deadlines/d']) assert(reminderSourceDescriptor(path), path)
  for (const path of ['todoCalendarEntries/x', 'calendars/system-damages/events/e', 'transportOrderTrackings/o/events/e', 'notes/n/deadlines/d', 'todos/t/deadlines/d/extra/x', 'users/u', 'todos//deadlines/d']) assert.equal(reminderSourceDescriptor(path), null, path)
})

test('To-do routing switches exclusively from creator to assignee; cases never fall back to creator', () => {
  const todo = reminderSourceDescriptor('todos/t/deadlines/d')
  assert.deepEqual(reminderRecipientPolicy(todo, { creatorUserId: 'creator' }).userIds, ['creator'])
  assert.deepEqual(reminderRecipientPolicy(todo, { creatorUserId: 'creator', assignedUserId: 'assignee' }).userIds, ['assignee'])
  assert.deepEqual(reminderRecipientPolicy(reminderSourceDescriptor('damageCases/c/deadlines/d'), { createdBy: 'creator' }).userIds, [])
  assert.deepEqual(reminderRecipientPolicy(reminderSourceDescriptor('calendars/p/events/e'), { kind: 'personal', ownerUserId: 'owner' }).userIds, ['owner'])
})

test('actual parent closure and archive enums suppress reminders without inventing closed damage statuses', () => {
  const damage = reminderSourceDescriptor('damageCases/c/deadlines/d')
  assert(reminderParentSuppressed(damage, { status: 'economically_closed' }, {}))
  assert.equal(reminderParentSuppressed(damage, { status: 'settled' }, {}), null)
  for (const status of ['completed', 'withdrawn']) assert(reminderParentSuppressed(reminderSourceDescriptor('todos/t'), { status }, {}))
  assert(reminderParentSuppressed(reminderSourceDescriptor('legalDisputes/c/deadlines/d'), { isClosed: true }, {}))
  assert(reminderParentSuppressed(reminderSourceDescriptor('insolvencies/c/deadlines/d'), { splitArchivedAt: true }, {}))
})

test('parent continuation revisions ignore unrelated update metadata while retaining responsibility and closure changes', () => {
  const parent = { status: 'open', responsibleUserId: 'reader', title: 'Case' }
  assert.equal(reminderParentChanged(parent, { ...parent, updatedAt: 'later', updatedBy: 'someone', lastComment: 'unrelated' }), false)
  assert.equal(reminderParentChanged(parent, { ...parent, responsibleUserId: 'other' }), true)
  assert.equal(reminderParentChanged(parent, { ...parent, status: 'completed' }), true)
})

test('read predicates enforce active/module gates and the real calendar and To-do audience Rules', () => {
  const calendar = { ...reminderSourceDescriptor('calendars/c/events/e'), exists: true, parent: { ownerUserId: 'owner' } }
  assert.equal(canReadReminderSource(calendar, 'reader', profile, { level: 'view' }), true)
  assert.equal(canReadReminderSource(calendar, 'reader', { ...profile, permissions: {} }, { level: 'view' }), false)
  assert.equal(canReadReminderSource(calendar, 'reader', { ...profile, active: false }, { level: 'view' }), false)
  assert.equal(canReadReminderSource(calendar, 'owner', profile), true)
  assert.equal(canReadReminderSource(calendar, 'admin', { active: true, role: 'admin', permissions: { calendar: 'view' } }), false)
  assert.equal(canReadReminderSource(calendar, 'super', { active: true, role: 'superadmin' }), true)
  const todo = { ...reminderSourceDescriptor('todos/t'), exists: true, parent: { creatorUserId: 'creator', status: 'open', audienceType: 'department', audienceId: 'Dispo' } }
  assert.equal(canReadReminderSource(todo, 'reader', profile), true)
  assert.equal(canReadReminderSource({ ...todo, parent: { ...todo.parent, status: 'withdrawn' } }, 'reader', profile), false)
  assert.equal(canReadReminderSource({ ...todo, parent: { ...todo.parent, status: 'withdrawn' } }, 'creator', profile), true)
})

test('source adapter delegates Berlin overlap selection, validates missing time and binds dedupe to user identity rather than email', async () => {
  const documents = new Map([['todos/t', { title: 'Test', creatorUserId: 'creator', reminderDate: '2026-10-25', reminderTime: '02:30', status: 'open' }]])
  const db = { doc: (path) => ({ get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }) }) }
  const first = await loadReminderSource(db, 'todos/t')
  assert.equal(first.resolved.code, 'ambiguous-time')
  documents.get('todos/t').reminderOccurrence = 'later'
  const later = await loadReminderSource(db, 'todos/t')
  assert.equal(later.dueAt, '2026-10-25T01:30:00.000Z')
  assert.notEqual(reminderDeliveryId(later, 'first'), reminderDeliveryId(later, 'second'))
  assert.equal(reminderDeliveryId(later, 'first'), reminderDeliveryId({ ...later, email: 'changed@example.test' }, 'first'))
})

test('one status-call cache reuses the reduced shared user directory and canonical permission batch across events', async () => {
  let directories = 0, batches = 0
  const users = [
    { id: 'reader', data: () => ({ ...profile, firstName: 'Reader', email: 'reader@example.test' }) },
    { id: 'super', data: () => ({ active: true, role: 'superadmin', email: 'super@example.test' }) },
    { id: 'other', data: () => ({ active: true, role: 'user', permissions: {}, email: 'other@example.test' }) },
  ]
  const query = { where() { return this }, select(...fields) { assert(!fields.includes('birthDate')); return this }, async get() { directories += 1; return { docs: users } } }
  const db = {
    collection: () => query,
    doc: (path) => ({ path, get: () => { throw new Error('directory profiles must not be fetched again') } }),
    getAll: async (...refs) => { batches += 1; assert.deepEqual(refs.map((ref) => ref.path), ['calendarPermissions/shared_reader']); return refs.map(() => ({ data: () => ({ level: 'view' }) })) },
  }
  const context = { ...reminderSourceDescriptor('calendars/shared/events/one'), exists: true, policy: { type: 'calendar-readers' }, parent: { kind: 'shared' } }
  const cache = createReminderRecipientCache(db)
  const [one, two] = await Promise.all([cache.recipients(context), cache.recipients({ ...context, sourcePath: 'calendars/shared/events/two' })])
  assert.deepEqual(one.map((item) => item.userId), ['reader', 'super'])
  assert.deepEqual(two.map((item) => item.userId), ['reader', 'super'])
  assert.equal(directories, 1)
  assert.equal(batches, 1)
})
