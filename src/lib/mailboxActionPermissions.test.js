import test from 'node:test'
import assert from 'node:assert/strict'
import { canStartMailboxAction } from './mailboxActionPermissions.js'

test('a correction offers only actions the reporter may actually start', () => {
  const profile = { active: true, role: 'user', permissions: { mailboxes: 'edit', transportOrders: 'edit', masterData: 'none', damages: 'view', calendar: 'view' } }
  assert.equal(canStartMailboxAction(profile, 'invoice'), true)
  assert.equal(canStartMailboxAction(profile, 'order'), false)
  assert.equal(canStartMailboxAction(profile, 'damage'), false)
  assert.equal(canStartMailboxAction(profile, 'calendar'), true)
  assert.equal(canStartMailboxAction({ ...profile, permissions: { ...profile.permissions, mailboxes: 'view' } }, 'invoice'), false)
  assert.equal(canStartMailboxAction({ active: true, role: 'superadmin' }, 'court'), true)
  assert.equal(canStartMailboxAction({ active: true, role: 'superadmin' }, 'unknown'), false)
  assert.equal(canStartMailboxAction({ active: false, role: 'superadmin' }, 'invoice'), false)
})
