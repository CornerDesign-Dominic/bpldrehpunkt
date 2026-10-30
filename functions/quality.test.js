import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeQualityInput, persistQualityRecord, requireQualityEdit, QUALITY_TOPIC_OPTIONAL_FIELDS } from './quality.js'

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

test('structured goals, cycle dates and Act decisions validate without rejecting legacy clients', () => {
  assert.deepEqual(input().values, topic)
  const values = { ...topic, cycleStartDate: '2026-10-29', smartSpecific: ' Clear goal ', smartMeasurable: '95 %', smartAchievable: 'Team capacity', smartRelevant: 'Fewer mistakes', smartTimeBound: 'November', actDecision: 'establish', actDate: '2026-11-30' }
  assert.equal(input(values).values.smartSpecific, 'Clear goal')
  for (const patch of [
    { cycleStartDate: '2026-02-30' }, { actDate: '2026-13-01', actDecision: 'correct' },
    { actDecision: 'complete' }, { actDate: '2026-11-30', actDecision: '' },
    { smartAchievable: 'x'.repeat(2001) }, { smartSpecific: 'x'.repeat(20001) }, { smartMeasurable: null }, { cycleStartDate: 123 },
  ]) assert.throws(() => input({ ...topic, ...patch }), { code: 'invalid-argument' })
})

test('legacy goals remain distinguishable from explicitly empty structured goal values', async () => {
  const db = fakeDb()
  const legacy = { ...topic, goal: 'Existing legacy goal', measure: 'Existing measure' }
  await persistQualityRecord(db, input(legacy), { uid: 'editor' })
  await persistQualityRecord(db, input({ ...legacy, check: 'Later review' }, 'topic', 1), { uid: 'editor' })
  const saved = db.records.get('qualityTopics/topic-1')
  assert.equal(saved.goal, legacy.goal)
  assert.equal(saved.measure, legacy.measure)
  assert.equal(Object.hasOwn(saved, 'smartSpecific'), false)
  assert.equal(Object.hasOwn(saved, 'smartMeasurable'), false)
})

test('legacy long goal and measurement fit their structured counterparts without truncation', () => {
  const goal = 'g'.repeat(20000)
  const measure = 'm'.repeat(20000)
  const normalized = input({ ...topic, goal, measure, smartSpecific: goal, smartMeasurable: measure }).values
  assert.equal(normalized.smartSpecific, goal)
  assert.equal(normalized.smartMeasurable, measure)
})

test('legacy saves preserve structured current-cycle data and immutable earlier snapshots', async () => {
  const db = fakeDb()
  const extra = { cycleStartDate: '2026-10-29', smartSpecific: 'Fewer errors', smartMeasurable: '95 %', smartAchievable: 'Team', smartRelevant: 'Quality', smartTimeBound: 'November', actDecision: 'correct', actDate: '2026-11-30' }
  await persistQualityRecord(db, input({ ...topic, ...extra }), { uid: 'editor' })
  await persistQualityRecord(db, input({ ...topic, check: 'New finding' }, 'topic', 1), { uid: 'editor' })
  const saved = db.records.get('qualityTopics/topic-1')
  for (const [key, value] of Object.entries(extra)) assert.equal(saved[key], value)
  assert.equal(saved.check, 'New finding')
  const first = db.records.get('qualityTopics/topic-1/revisions/1')
  assert.equal(first.check, '')
  assert.equal(first.smartSpecific, extra.smartSpecific)
  await persistQualityRecord(db, input({ ...topic, smartSpecific: '', actDecision: '', actDate: '' }, 'topic', 2), { uid: 'editor' })
  const cleared = db.records.get('qualityTopics/topic-1')
  assert.equal(cleared.smartSpecific, '')
  assert.equal(cleared.smartMeasurable, extra.smartMeasurable)
  assert.equal(cleared.actDecision, '')
})

test('a legacy new-cycle request resets optional cycle data rather than carrying old decisions', async () => {
  const db = fakeDb()
  await persistQualityRecord(db, input({ ...topic, smartSpecific: 'Original goal', actDecision: 'discard', actDate: '2026-10-29' }), { uid: 'editor' })
  await persistQualityRecord(db, input({ ...topic, cycle: 2 }, 'topic', 1), { uid: 'editor' })
  const saved = db.records.get('qualityTopics/topic-1')
  for (const key of QUALITY_TOPIC_OPTIONAL_FIELDS) assert.equal(saved[key], '')
  assert.equal(db.records.get('qualityTopics/topic-1/revisions/1').actDecision, 'discard')
})

test('a completed topic requires a separate reopen before another cycle', async () => {
  const db = fakeDb()
  await persistQualityRecord(db, input({ ...topic, status: 'completed' }), { uid: 'editor' })
  await assert.rejects(persistQualityRecord(db, input({ ...topic, status: 'active', cycle: 2 }, 'topic', 1), { uid: 'editor' }), { code: 'failed-precondition' })
  assert.equal(db.records.get('qualityTopics/topic-1').revision, 1)
  await persistQualityRecord(db, input({ ...topic, status: 'active' }, 'topic', 1), { uid: 'editor' })
  await persistQualityRecord(db, input({ ...topic, cycle: 2 }, 'topic', 2), { uid: 'editor' })
  assert.equal(db.records.get('qualityTopics/topic-1').cycle, 2)
})

test('clearing an Act decision while retaining its date is rejected atomically', async () => {
  const db = fakeDb()
  await persistQualityRecord(db, input({ ...topic, actDecision: 'correct', actDate: '2026-10-29' }), { uid: 'editor' })
  await assert.rejects(persistQualityRecord(db, input({ ...topic, actDecision: '' }, 'topic', 1), { uid: 'editor' }), { code: 'invalid-argument' })
  assert.equal(db.records.get('qualityTopics/topic-1').actDecision, 'correct')
  assert.equal(db.records.get('qualityTopics/topic-1').revision, 1)
})


test('handbook review dates validate and survive older clients with revision history', async () => {
  const values = { departmentId: 'accounting', title: 'Invoice', process: 'Billing', situation: '', consequences: '', action: '', prevention: '' }
  for (const patch of [{ owner: 'x'.repeat(501) }, { owner: 123 }, { lastReviewedDate: '2026-02-30' }, { nextReviewDate: 'invalid' }, { lastReviewedDate: '2026-11-02', nextReviewDate: '2026-11-01' }]) assert.throws(() => input({ ...values, ...patch }, 'handbook'), { code: 'invalid-argument' })
  const db = fakeDb({ 'users/editor': { ...editor, permissions: { handbook: 'edit' } } })
  await persistQualityRecord(db, input({ ...values, owner: ' Anna Beispiel ', lastReviewedDate: '2026-10-30', nextReviewDate: '2026-11-30' }, 'handbook'), { uid: 'editor' })
  await persistQualityRecord(db, input({ ...values, action: 'Updated' }, 'handbook', 1), { uid: 'editor' })
  const saved = db.records.get('qualityHandbook/topic-1')
  assert.equal(saved.lastReviewedDate, '2026-10-30')
  assert.equal(saved.owner, 'Anna Beispiel')
  assert.equal(saved.nextReviewDate, '2026-11-30')
  assert.equal(saved.updatedByName, 'editor')
  assert.equal(saved.revision, 2)
  assert.equal(db.records.get('qualityHandbook/topic-1/revisions/1').action, '')
  await assert.rejects(persistQualityRecord(db, input({ ...values, lastReviewedDate: '2026-12-01' }, 'handbook', 2), { uid: 'editor' }), { code: 'invalid-argument' })
  await persistQualityRecord(db, input({ ...values, lastReviewedDate: '', nextReviewDate: '' }, 'handbook', 2), { uid: 'editor' })
  assert.equal(db.records.get('qualityHandbook/topic-1').nextReviewDate, '')
})
