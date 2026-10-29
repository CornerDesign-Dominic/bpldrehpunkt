import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeQualityInput, persistQualityRecord, requireQualityEdit } from './quality.js'

const topic = { departmentId: 'accounting', title: 'Missing documents', status: 'active', plan: '', do: '', check: '', act: '', goal: '', measure: '', owner: '', startDate: '', dueDate: '', cycle: 1 }
const editor = { active: true, role: 'user', permissions: { kvp: 'edit', handbook: 'view' } }
function input(values = topic, kind = 'topic', revision = 0) { return normalizeQualityInput({ kind, id: 'topic-1', expectedRevision: revision, values }) }
function fakeDb(initial = {}) {
  const records = new Map(Object.entries({ 'users/editor': editor, 'departments/accounting': { name: 'Accounting' }, ...initial }))
  const ref = (path) => ({ path, collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }) })
  return {
    records, doc: ref,
    runTransaction: async (callback) => {
      const writes = []
      const result = await callback({
        get: async ({ path }) => ({ exists: records.has(path), data: () => records.get(path) }),
        set: (reference, data) => writes.push([reference.path, data]),
        create: (reference, data) => { assert.equal(records.has(reference.path), false); writes.push([reference.path, data]) },
      })
      for (const [path, data] of writes) records.set(path, data)
      return result
    },
  }
}

test('quality validates bounded fields, real dates, date order and unknown keys', () => {
  assert.equal(input().values.cycle, 1)
  for (const values of [{ ...topic, title: '' }, { ...topic, startDate: '2026-02-30' }, { ...topic, startDate: '2026-10-29', dueDate: '2026-10-28' }, { ...topic, plan: 'x'.repeat(20001) }, { ...topic, secret: 'unknown' }, { ...topic, cycle: 0 }]) assert.throws(() => input(values), { code: 'invalid-argument' })
})

test('permissions are separated, active profiles required and admin has no override', () => {
  requireQualityEdit(editor, 'topic')
  requireQualityEdit({ active: true, role: 'superadmin' }, 'handbook')
  for (const profile of [editor, { active: false, role: 'superadmin' }, { active: true, role: 'admin' }]) assert.throws(() => requireQualityEdit(profile, 'handbook'), { code: 'permission-denied' })
})

test('transaction records each version and rejects stale overwrites and skipped cycles', async () => {
  const db = fakeDb()
  assert.deepEqual(await persistQualityRecord(db, input(), { uid: 'editor' }), { id: 'topic-1', revision: 1 })
  assert.equal(db.records.get('qualityTopics/topic-1/revisions/1').title, topic.title)
  await assert.rejects(persistQualityRecord(db, input(), { uid: 'editor' }), { code: 'aborted' })
  await assert.rejects(persistQualityRecord(db, input({ ...topic, cycle: 3 }, 'topic', 1), { uid: 'editor' }), { code: 'invalid-argument' })
  await persistQualityRecord(db, input({ ...topic, cycle: 2, title: 'Updated' }, 'topic', 1), { uid: 'editor' })
  assert.equal(db.records.get('qualityTopics/topic-1/revisions/1').title, topic.title)
  assert.equal(db.records.get('qualityTopics/topic-1/revisions/2').cycle, 2)
})

test('meeting cannot include missing or other-department topics', async () => {
  const values = { departmentId: 'accounting', title: 'KVP', date: '2026-10-29', participants: 'Team', notes: '', topicIds: ['topic-1'] }
  for (const existing of [undefined, { ...topic, departmentId: 'dispatch' }]) {
    const db = fakeDb(existing ? { 'qualityTopics/topic-1': existing } : {})
    await assert.rejects(persistQualityRecord(db, input(values, 'meeting'), { uid: 'editor' }), { code: 'failed-precondition' })
    assert.equal(db.records.has('qualityMeetings/topic-1'), false)
  }
})

test('transaction checks current profile and department without writing on failure', async () => {
  const db = fakeDb({ 'users/editor': { ...editor, active: false } })
  await assert.rejects(persistQualityRecord(db, input(), { uid: 'editor' }), { code: 'permission-denied' })
  db.records.set('users/editor', editor)
  db.records.delete('departments/accounting')
  await assert.rejects(persistQualityRecord(db, input(), { uid: 'editor' }), { code: 'failed-precondition' })
  assert.equal(db.records.has('qualityTopics/topic-1'), false)
})
