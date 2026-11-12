import assert from 'node:assert/strict'
import test from 'node:test'
import { canCollaborateTodo, canManageTodoAudience, canReadTodoForUser, normalizeTodoReminderRecipients, todoReminderRecipientIds } from './todoCollaboration.js'

const profile = (department = 'Buchhaltung', level = 'edit') => ({ active: true, role: 'user', department, permissions: { todos: level } })
const directory = [{ id: 'a', ...profile() }, { id: 'b', ...profile() }, { id: 'c', ...profile('Disposition') }, { id: 'disabled', ...profile(), active: false }]

test('collaboration follows current audience and permissions, not former takeover', () => {
  const todo = { creatorUserId: 'owner', audienceType: 'people', audienceIds: ['a', 'b'], assignedUserId: 'c', status: 'open' }
  assert(canCollaborateTodo(todo, { user: { uid: 'a' }, profile: profile() }))
  assert(!canCollaborateTodo(todo, { user: { uid: 'a' }, profile: profile('', 'view') }))
  assert(!canReadTodoForUser(todo, 'c', profile()))
  assert(!canManageTodoAudience(todo, { user: { uid: 'a' }, profile: profile() }))
  assert(canManageTodoAudience(todo, { user: { uid: 'owner' }, profile: profile() }))
  assert(!canReadTodoForUser({ ...todo, audienceIds: ['b'] }, 'a', profile()))
  assert(!canReadTodoForUser(todo, 'a', { ...profile('', 'none'), todoAccessLevel: 'edit' }))
})

test('all is dynamic, selected is intersected with current personal or department membership', () => {
  const department = { audienceType: 'department', audienceId: 'Buchhaltung' }
  assert.deepEqual(todoReminderRecipientIds(department, {}, directory), ['a', 'b'])
  assert.deepEqual(todoReminderRecipientIds(department, { reminderRecipientMode: 'selected', reminderRecipientUserIds: ['a', 'c', 'disabled'] }, directory), ['a'])
  assert.deepEqual(todoReminderRecipientIds(department, {}, directory.map((entry) => entry.id === 'a' ? { ...entry, department: 'Disposition' } : entry)), ['b'])
  assert.deepEqual(todoReminderRecipientIds({ audienceType: 'people', audienceIds: ['c'] }, { reminderRecipientMode: 'selected', reminderRecipientUserIds: ['a'] }, directory), [])
  assert.deepEqual(normalizeTodoReminderRecipients({}), { reminderRecipientMode: 'all', reminderRecipientUserIds: [] })
  assert.throws(() => normalizeTodoReminderRecipients({ reminderRecipientMode: 'selected', reminderRecipientUserIds: ['a/private'] }))
})
