import test from 'node:test'
import assert from 'node:assert/strict'
import { bookingClient, timeBookingRows } from './timeBookingRows.js'

const date = '2026-11-11'
const original = { id: 'one', type: 'come', at: `${date}T07:00:00Z`, source: 'live' }
const changed = { ...original, at: `${date}T08:00:00Z`, source: 'correction' }
const entry = (id, before, after, kind = 'correction') => ({ id, date, kind, before, after, createdBy: 'actor', createdAt: `${date}T${id}:00:00Z` })

test('one row per stable booking, latest edit and full before/after trail', () => {
  const rows = timeBookingRows([{ date, events: [changed] }], [entry('10', [original], [changed]), entry('09', null, original, 'stamp')])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].deleted, false)
  assert.deepEqual(rows[0].changes.map(change => change.method), ['Schaltfläche', 'Bearbeitet'])
  assert.deepEqual(rows[0].changes.at(-1).before, original)
})
test('unchanged events are not attributed to someone editing another event', () => {
  const rows = timeBookingRows([{ date, events: [original] }], [entry('10', [original], [original])])
  assert.deepEqual(rows[0].changes, [])
})
test('deletions retain the last booking value and their original history', () => {
  const rows = timeBookingRows([{ date, events: [] }], [entry('09', null, original, 'stamp'), entry('10', [original], [changed]), entry('11', [changed], [])])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].deleted, true)
  assert.deepEqual(rows[0].event, changed)
  assert.equal(rows[0].changes.at(-1).method, 'Gelöscht')
})
test('manual additions and reverted changes are retained; old device source stays unknown', () => {
  const rows = timeBookingRows([{ date, events: [original] }], [entry('09', [], [original], 'addition'), entry('10', [original], [changed]), entry('11', [changed], [original])])
  assert.equal(rows[0].changes.length, 3)
  assert.equal(rows[0].changes[0].method, 'Nachtrag')
  assert.equal(bookingClient(original.source), 'Nicht erfasst')
  assert.equal(bookingClient('web'), 'Web')
  assert.equal(bookingClient('mobile'), 'Handy')
})
