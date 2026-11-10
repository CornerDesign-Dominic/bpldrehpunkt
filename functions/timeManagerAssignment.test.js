import assert from 'node:assert/strict'
import test from 'node:test'
import { timeManagerFields } from './timeManagerAssignment.js'

const lookup = async (id) => ({ office: { active: true }, old: { active: false } })[id]
test('time-manager assignment is independent and deduplicates department IDs', async () => {
  assert.deepEqual(await timeManagerFields({ timeManager: true, timeManagerDepartments: [' office ', 'office'], vacationManager: true }, {}, lookup), {
    timeManager: true, timeManagerAllDepartments: false, timeManagerDepartments: ['office'],
  })
})
test('disabled manager loses all scope, omitted input preserves existing assignment', async () => {
  const old = { timeManager: true, timeManagerAllDepartments: false, timeManagerDepartments: ['office'] }
  assert.deepEqual(await timeManagerFields({}, old, lookup), old)
  assert.deepEqual(await timeManagerFields({ timeManager: false }, old, lookup), { timeManager: false, timeManagerAllDepartments: false, timeManagerDepartments: [] })
})
test('all-department scope does not retain a conflicting list', async () => {
  assert.deepEqual(await timeManagerFields({ timeManager: true, timeManagerAllDepartments: true, timeManagerDepartments: ['office'] }, {}, lookup), { timeManager: true, timeManagerAllDepartments: true, timeManagerDepartments: [] })
})
test('unknown, malformed and newly inactive departments are rejected', async () => {
  for (const departments of [['missing'], ['old'], ['a/b'], [42], 'office']) {
    await assert.rejects(timeManagerFields({ timeManager: true, timeManagerDepartments: departments }, {}, lookup), { code: 'invalid-argument' })
  }
  assert.deepEqual((await timeManagerFields({}, { timeManager: true, timeManagerDepartments: ['old'] }, lookup)).timeManagerDepartments, ['old'])
})
