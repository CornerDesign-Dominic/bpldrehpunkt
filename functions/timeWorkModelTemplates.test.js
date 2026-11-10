import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanTimeTemplate, persistTimeTemplate, persistTimeTemplateArchive, requireTimeTemplateAdmin } from './timeWorkModelTemplates.js'

const admin = { active: true, role: 'superadmin' }
const input = { name: ' Büro 40 Stunden ', weekdays: { 1: { targetMinutes: 480, breaks: [{ afterMinutes: 360, requiredMinutes: 30 }, { afterMinutes: 540, requiredMinutes: 45 }] } }, holidayCountryCode: 'DE', holidaySubdivisionCode: 'DE-NW' }
function fakeDb() {
  const values = new Map([['users/admin', admin]])
  let pending = Promise.resolve()
  return {
    values, doc: path => ({ path }),
    runTransaction(callback) {
      const promise = pending.then(async () => {
        let wrote = false
        const writes = []
        const result = await callback({
          get: async ref => { assert.equal(wrote, false, 'reads must precede writes'); return { exists: values.has(ref.path), data: () => values.get(ref.path) } },
          set: (ref, data, options) => { wrote = true; writes.push([ref.path, options?.merge ? { ...values.get(ref.path), ...data } : data]) },
          create: (ref, data) => { wrote = true; assert.equal(values.has(ref.path), false); writes.push([ref.path, data]) },
        })
        for (const [path, value] of writes) values.set(path, value)
        return result
      })
      pending = promise.catch(() => {})
      return promise
    },
  }
}
test('only active superadmins can read or mutate work-model templates', async () => {
  requireTimeTemplateAdmin(admin)
  for (const profile of [{ active: false, role: 'superadmin' }, { active: true, role: 'admin' }, { active: true, role: 'user', timeManager: true }, { active: true, role: 'user', permissions: { personnel: 'edit' } }]) {
    assert.throws(() => requireTimeTemplateAdmin(profile), { code: 'permission-denied' })
    const db = fakeDb(); db.values.set('users/admin', profile)
    await assert.rejects(persistTimeTemplate(db, 'admin', input), { code: 'permission-denied' })
    assert.equal(db.values.size, 1)
  }
})
test('template copies only editable schedule data and never employee, validity or opening balance', () => {
  const template = cleanTimeTemplate({ ...input, userId: 'employee', validFrom: '2026-01-01', validTo: '', openingBalanceMinutes: 600 })
  assert.deepEqual(Object.keys(template).sort(), ['holidayCountryCode', 'holidaySubdivisionCode', 'name', 'weekdays'])
  assert.equal(template.name, 'Büro 40 Stunden')
  assert.equal(template.holidaySubdivisionCode, 'NW')
  template.weekdays[1].breaks[0].requiredMinutes = 99
  assert.equal(input.weekdays[1].breaks[0].requiredMinutes, 30)
})
test('invalid names and ambiguous, decreasing or excessive pause rules are rejected', () => {
  for (const name of ['', ' ', 'x'.repeat(81)]) assert.throws(() => cleanTimeTemplate({ ...input, name }), { code: 'invalid-argument' })
  for (const breaks of [[{ afterMinutes: 1, requiredMinutes: 30 }, { afterMinutes: 1, requiredMinutes: 45 }], [{ afterMinutes: 1, requiredMinutes: 45 }, { afterMinutes: 2, requiredMinutes: 30 }], [{ afterMinutes: 1441, requiredMinutes: 30 }]]) assert.throws(() => cleanTimeTemplate({ ...input, weekdays: { 1: { targetMinutes: 480, breaks } } }), { code: 'invalid-argument' })
})
test('same normalized name cannot be concurrently saved twice and creates immutable audit', async () => {
  const db = fakeDb()
  const results = await Promise.allSettled([persistTimeTemplate(db, 'admin', input), persistTimeTemplate(db, 'admin', { ...input, name: 'büro 40 stunden' })])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'already-exists')
  const history = [...db.values.entries()].filter(([path]) => path.includes('/history/'))
  assert.equal(history.length, 1); assert.equal(history[0][1].createdBy, 'admin')
})
test('stale edits are rejected, rename releases old name, archival retains the schedule and audit', async () => {
  const db = fakeDb()
  const { template } = await persistTimeTemplate(db, 'admin', input)
  await assert.rejects(persistTimeTemplate(db, 'admin', { ...template, expectedRevision: 9 }), { code: 'aborted' })
  const { template: renamed } = await persistTimeTemplate(db, 'admin', { ...template, name: 'Büro neu', expectedRevision: 1 })
  assert.equal(renamed.revision, 2)
  await persistTimeTemplate(db, 'admin', input)
  await assert.rejects(persistTimeTemplateArchive(db, 'admin', { id: renamed.id, expectedRevision: 1 }), { code: 'aborted' })
  await persistTimeTemplateArchive(db, 'admin', { id: renamed.id, expectedRevision: 2 })
  const archived = db.values.get(`timeWorkModelTemplates/${renamed.id}`)
  assert.equal(archived.archived, true); assert.equal(archived.weekdays[1].targetMinutes, 480)
  assert.equal(archived.revision, 3)
  await persistTimeTemplate(db, 'admin', { ...input, name: 'Büro neu' })
  assert.equal([...db.values.values()].filter(v => v.kind === 'archived').length, 1)
})
