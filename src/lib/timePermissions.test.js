import assert from 'node:assert/strict'
import test from 'node:test'
import { canEdit, canManageTime, canView, getSafeProfileDefaults } from './permissions.js'
import { getPageTitle } from './pageTitles.js'

test('time management is independent from admin, vacation manager and personnel access', () => {
  assert.equal(canManageTime({ active: true, role: 'admin' }), false)
  assert.equal(canManageTime({ active: true, role: 'user', vacationManager: true, permissions: { personnel: 'edit' } }), false)
  assert.equal(canManageTime({ active: true, role: 'user', timeManager: true }), true)
  assert.equal(canManageTime({ active: true, role: 'superadmin' }), true)
  assert.equal(canManageTime({ active: false, role: 'superadmin', timeManager: true }), false)
  assert.equal(canManageTime({ role: 'superadmin' }), false)
})

test('safe profile normalizes time-manager department assignments separately from vacation', () => {
  const profile = getSafeProfileDefaults({ timeManager: true, timeManagerDepartments: [' dept-a ', 'dept-a', '', null, 7, 'dept-b'], vacationManager: true, vacationManagerDepartments: ['vacation-dept'] })
  assert.deepEqual(profile.timeManagerDepartments, ['dept-a', 'dept-b'])
  assert.deepEqual(profile.vacationManagerDepartments, ['vacation-dept'])
  const disabled = getSafeProfileDefaults({ timeManager: false, timeManagerAllDepartments: true, timeManagerDepartments: ['dept-a'] })
  assert.equal(disabled.timeManagerAllDepartments, false)
  assert.deepEqual(disabled.timeManagerDepartments, [])
  const all = getSafeProfileDefaults({ timeManager: true, timeManagerAllDepartments: true, timeManagerDepartments: ['stale-dept'] })
  assert.equal(all.timeManagerAllDepartments, true)
  assert.deepEqual(all.timeManagerDepartments, [])
})

test('own time viewing and editing remain distinct from manager assignment', () => {
  const viewer = { role: 'user', permissions: { timeTracking: 'view' } }
  assert.equal(canView(viewer, 'timeTracking'), true)
  assert.equal(canEdit(viewer, 'timeTracking'), false)
  assert.equal(canView({ role: 'admin', timeManager: true }, 'timeTracking'), false)
  assert.equal(canEdit({ role: 'user', permissions: { timeTracking: 'edit' } }, 'timeTracking'), true)
  assert.equal(getPageTitle('/zeiterfassung'), 'Meine Arbeitszeit')
  assert.equal(getPageTitle('/zeitmanagement'), 'Zeitmanagement')
  assert.equal(getPageTitle('/admin/arbeitszeitmodelle'), 'Arbeitszeitmodelle')
})
