import test from 'node:test'
import assert from 'node:assert/strict'
import { bookingClient, bookingVersions, timeBookingRows } from './timeBookingRows.js'

const date = '2026-11-11'
const original = { id: 'one', type: 'come', at: `${date}T07:00:00Z`, source: 'live' }
const changed = { ...original, at: `${date}T08:00:00Z`, source: 'correction' }
const entry = (id, before, after, kind = 'correction') => ({ id, date, kind, before, after, createdBy: 'actor', createdAt: `${date}T${id}:00:00Z` })
const versions = (events, history) => bookingVersions(timeBookingRows([{ date, events }], history)[0])

test('current state appears once; earlier states preserve the first booking and metadata', () => {
  const result = versions([changed], [entry('10', [original], [changed]), entry('09', null, original, 'stamp')])
  assert.equal(result.current.method, 'Korrektur')
  assert.deepEqual(result.current.event, changed)
  assert.equal(result.current.changed.at, true)
  assert.equal(result.previous.length, 1)
  assert.equal(result.previous[0].method, 'Gestempelt')
  assert.deepEqual(result.previous[0].event, original)
})
test('unchanged saves do not create versions or replace the effective author', () => {
  const result = versions([original], [{ ...entry('09', null, original, 'stamp'), createdBy: 'employee' }, entry('10', [original], [original])])
  assert.equal(result.previous.length, 0)
  assert.equal(result.current.createdBy, 'employee')
  assert.equal(result.saves.length, 1)
  assert.equal(result.saves[0].createdBy, 'actor')
})
test('deleted states retain the previous value, first booking and deletion author', () => {
  const result = versions([], [entry('09', null, original, 'stamp'), entry('10', [original], [changed]), entry('11', [changed], [])])
  assert.equal(result.current.method, 'Gelöscht')
  assert.equal(result.current.event, null)
  assert.deepEqual(result.current.displayEvent, changed)
  assert.equal(result.previous.length, 2)
  assert.deepEqual(result.previous[1].event, original)
})
test('manual creation and reverted corrections remain separate states', () => {
  const result = versions([original], [entry('09', [], [original], 'addition'), entry('10', [original], [changed]), entry('11', [changed], [original])])
  assert.equal(result.current.method, 'Korrektur')
  assert.equal(result.previous.length, 2)
  assert.equal(result.previous[1].method, 'Manueller Nachtrag')
  assert.deepEqual(result.previous[0].event, changed)
  assert.equal(bookingClient(original.source), 'Nicht erfasst')
  assert.equal(bookingClient('web'), 'Web')
  assert.equal(bookingClient('mobile'), 'Handy')
})
test('missing creation evidence preserves the known before-value without inventing an actor', () => {
  const result = versions([changed], [entry('10', [original], [changed])])
  assert.equal(result.previous.length, 1)
  assert.deepEqual(result.previous[0].event, original)
  assert.equal(result.previous[0].createdBy, undefined)
  const unknown = versions([{ ...original, source: undefined }], [])
  assert.equal(unknown.current.method, 'Nicht erfasst')
  assert.equal(unknown.previous.length, 0)
})
test('thirty versions produce exactly 29 earlier states, newest first, and separate saves', () => {
  const states = Array.from({ length: 30 }, (_, index) => ({ ...original, at: new Date(Date.parse(original.at) + index * 60000).toISOString() }))
  const history = states.map((state, index) => ({ id: `change-${index}`, date, kind: index ? 'correction' : 'stamp', before: index ? [states[index - 1]] : null, after: index ? [state] : state, createdAt: new Date(Date.parse(original.at) + index * 120000).toISOString() }))
  history.push({ ...history.at(-1), id: 'same', before: [states[29]], createdAt: `${date}T10:00:00Z` })
  const result = versions([states[29]], history.reverse())
  assert.deepEqual(result.current.event, states[29])
  assert.equal(result.previous.length, 29)
  assert.deepEqual(result.previous[0].event, states[28])
  assert.deepEqual(result.previous[28].event, states[0])
  assert.equal(result.saves.length, 1)
})
