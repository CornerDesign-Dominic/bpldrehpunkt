import test from 'node:test'
import assert from 'node:assert/strict'
import { qualityValues, nextQualityCycle, searchQualityRecords, groupQualityCycles, qualityTopicUrl, qualityOverviewUrl, qualitySmartValues, SMART_FIELDS } from './qualityPresentation.js'

test('legacy goals remain visible while explicitly cleared structured goals stay empty', () => {
  const legacy = { revision: 1, goal: 'Existing goal', measure: '95%' }
  assert.equal(qualityValues('topic', legacy).smartSpecific, 'Existing goal')
  assert.equal(qualitySmartValues(legacy).smartMeasurable, '95%')
  assert.equal(qualitySmartValues({ ...legacy, smartSpecific: '' }).smartSpecific, '')
  assert.equal(qualityValues('topic', legacy).cycleStartDate, '')
})

test('a new cycle clears SMART and Act without changing the previous cycle or Do responsibility', () => {
  const previous = { ...qualityValues('topic', { revision: 1, cycle: 2 }), owner: 'Team', cycleStartDate: '2026-10-01', actDecision: 'establish', actDate: '2026-10-20', ...Object.fromEntries(SMART_FIELDS.map(({ key }) => [key, 'Previous goal'])) }
  const next = nextQualityCycle(previous)
  assert.equal(next.cycle, 3)
  assert.equal(next.owner, 'Team')
  assert.equal(next.actDecision, '')
  assert.equal(next.actDate, '')
  assert.match(next.cycleStartDate, /^\d{4}-\d{2}-\d{2}$/)
  for (const { key } of SMART_FIELDS) assert.equal(next[key], '')
  assert.equal(previous.smartSpecific, 'Previous goal')
  assert.equal(previous.actDecision, 'establish')
})

test('next cycle retains topic identity and responsibility but resets previous goals and results', () => {
  const previous = { ...qualityValues('topic', {}, 'accounting'), title: 'Missing evidence', owner: 'Team', plan: 'Cause', do: 'Test', check: 'Result', act: 'Adjust', goal: 'Target', measure: '50%', startDate: '2026-10-01', dueDate: '2026-10-29' }
  const next = nextQualityCycle(previous)
  assert.equal(next.cycle, 2)
  assert.equal(next.title, previous.title)
  assert.equal(next.departmentId, 'accounting')
  assert.equal(next.owner, 'Team')
  for (const field of ['plan', 'do', 'check', 'act', 'goal', 'measure', 'startDate', 'dueDate']) assert.equal(next[field], '')
  assert.equal(previous.plan, 'Cause')
})

test('meeting selection is copied and handbook stays independent of topics', () => {
  const selected = ['a', 'b']
  const meeting = qualityValues('meeting', { topicIds: selected }, 'accounting')
  meeting.topicIds.push('c')
  assert.deepEqual(selected, ['a', 'b'])
  assert.equal(Object.hasOwn(qualityValues('handbook'), 'topicIds'), false)
})

test('search finds situations, process steps and measures regardless of case', () => {
  const records = [{ title: 'Rechnung', process: 'Abrechnung', prevention: 'Belege prüfen' }, { title: 'Verhandlung' }]
  assert.deepEqual(searchQualityRecords(records, ' BELEGE '), [records[0]])
  assert.deepEqual(searchQualityRecords(records, 'ABRECHNUNG'), [records[0]])
  assert.deepEqual(searchQualityRecords(records, ''), records)
})

test('cycles use the latest saved revision for each iteration and include the current record', () => {
  const current = { id: 'problem-1', cycle: 3, revision: 8, title: 'Current', check: 'Current check' }
  const revisions = [
    { cycle: 1, revision: 2, title: 'First', act: 'First conclusion' },
    { cycle: 2, revision: 5, title: 'Second', check: 'Latest check' },
    { cycle: 1, revision: 1, title: 'First draft' },
    { cycle: 2, revision: 3, title: 'Second draft' },
    { cycle: 3, revision: 7, title: 'Earlier current' },
  ]
  const original = structuredClone(revisions)
  const cycles = groupQualityCycles(current, revisions)
  assert.deepEqual(cycles.map(({ cycle, revision }) => [cycle, revision]), [[3, 8], [2, 5], [1, 2]])
  assert.equal(cycles[0].check, 'Current check')
  assert.equal(cycles[1].check, 'Latest check')
  assert.equal(cycles[2].act, 'First conclusion')
  assert.ok(cycles.every((cycle) => cycle.id === 'problem-1'))
  assert.deepEqual(revisions, original)
  assert.notEqual(cycles[0], current)
})

test('cycle history does not invent absent cycles or accept invalid revision numbers', () => {
  const current = { id: 'problem', cycle: 4, revision: 9 }
  assert.deepEqual(groupQualityCycles(current, [{ cycle: 1, revision: 1 }]).map((item) => item.cycle), [4, 1])
  assert.deepEqual(groupQualityCycles(null), [])
  for (const invalid of [{ cycle: 0, revision: 1 }, { cycle: 1, revision: 0 }, { cycle: 1, revision: '2' }, { cycle: 1.5, revision: 2 }, { cycle: 1, revision: Infinity }]) {
    assert.throws(() => groupQualityCycles(current, [invalid]), TypeError)
  }
  assert.throws(() => groupQualityCycles(current, null), TypeError)
})

test('problem routes encode IDs and department filters and limit phase navigation to PDCA', () => {
  assert.equal(qualityTopicUrl('problem-1'), '/qualitaet/kvp/problem-1')
  const problemUrl = qualityTopicUrl('problem/with?unsafe#chars', { departmentId: 'Finance & Billing', phase: 'check' })
  assert.equal(problemUrl, '/qualitaet/kvp/problem%2Fwith%3Funsafe%23chars?department=Finance+%26+Billing&phase=check')
  assert.equal(qualityTopicUrl('problem', { phase: 'delete' }), '/qualitaet/kvp/problem')
  assert.equal(qualityOverviewUrl('Finance & Billing'), '/qualitaet/kvp?department=Finance+%26+Billing')
  assert.equal(qualityOverviewUrl(), '/qualitaet/kvp')
  assert.throws(() => qualityTopicUrl(''), TypeError)
})
