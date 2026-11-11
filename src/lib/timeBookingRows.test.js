import test from 'node:test'
import assert from 'node:assert/strict'
import { bookingClient, bookingStatus, timeBookingRows } from './timeBookingRows.js'

const date = '2026-11-11'
const original = { id: 'one', type: 'come', at: `${date}T07:00:00Z`, source: 'live' }
const changed = { ...original, at: `${date}T08:00:00Z`, source: 'correction' }
const entry = (id, before, after, kind = 'correction') => ({ id, date, kind, before, after, createdBy: 'actor', createdAt: `${date}T${id}:00:00Z` })

test('one row per stable booking, latest edit and full before/after trail', () => {
  const rows = timeBookingRows([{ date, events: [changed] }], [entry('10', [original], [changed]), entry('09', null, original, 'stamp')])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].deleted, false)
  assert.deepEqual(rows[0].changes.map(change => change.method), ['Originalbuchung', 'Geändert'])
  assert.deepEqual(rows[0].changes.at(-1).before, original)
  assert.equal(bookingStatus(rows[0]).label, 'Geändert')
  assert.equal(bookingStatus(rows[0]).origin, 'Originalbuchung')
})
test('unchanged saves stay in the full trail without marking an original as edited or changing its author', () => {
  const rows = timeBookingRows([{ date, events: [original] }], [{ ...entry('09', null, original, 'stamp'), createdBy: 'employee' }, entry('10', [original], [original])])
  assert.equal(rows[0].changes.length, 2)
  assert.equal(rows[0].changes[1].method, 'Unverändert gespeichert')
  const status = bookingStatus(rows[0])
  assert.equal(status.label, 'Original')
  assert.equal(status.unchangedSaves, 1)
  assert.equal(status.latest.createdBy, 'employee')
})
test('deletions retain the last booking value and their original history', () => {
  const rows = timeBookingRows([{ date, events: [] }], [entry('09', null, original, 'stamp'), entry('10', [original], [changed]), entry('11', [changed], [])])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].deleted, true)
  assert.deepEqual(rows[0].event, changed)
  assert.equal(rows[0].changes.at(-1).method, 'Gelöscht')
  assert.equal(bookingStatus(rows[0]).label, 'Gelöscht')
})
test('manual additions and reverted changes are retained; old device source stays unknown', () => {
  const rows = timeBookingRows([{ date, events: [original] }], [entry('09', [], [original], 'addition'), entry('10', [original], [changed]), entry('11', [changed], [original])])
  assert.equal(rows[0].changes.length, 3)
  assert.equal(rows[0].changes[0].method, 'Manuell nachgetragen')
  assert.equal(bookingStatus(rows[0]).label, 'Geändert')
  assert.equal(bookingStatus(rows[0]).origin, 'Manueller Nachtrag')
  assert.equal(bookingClient(original.source), 'Nicht erfasst')
  assert.equal(bookingClient('web'), 'Web')
  assert.equal(bookingClient('mobile'), 'Handy')
})

test('manual additions stay distinct from originals and unknown historical manual sources', () => {
  const added = timeBookingRows([{ date, events: [original] }], [entry('09', [], [original], 'addition')])[0]
  assert.equal(bookingStatus(added).label, 'Manuell nachgetragen')
  const legacy = timeBookingRows([{ date, events: [{ ...original, source: 'correction' }] }])[0]
  assert.equal(bookingStatus(legacy).label, 'Manuell erfasst')
  const unknown = timeBookingRows([{ date, events: [{ ...original, source: undefined }] }])[0]
  assert.equal(bookingStatus(unknown).label, 'Nicht eindeutig erfasst')
})
