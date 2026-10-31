import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarQueryRange } from './calendarQueryRange.js'
import { calendarWindowAndUpcoming } from './calendarQueryPages.js'

test('calendar range includes adjacent-month grid and buffer across year and leap boundaries', () => {
  assert.deepEqual(calendarQueryRange(2026, 0, '2026-01-01'), { from: '2025-12-01', until: '2026-02-28', upcomingFrom: '2026-01-01' })
  assert.equal(calendarQueryRange(2028, 0, '2028-01-01').until, '2028-02-29')
  assert.equal(calendarQueryRange(2026, 11, '2026-10-31').until, '2027-01-31')
})

test('upcoming completes an equal-date page and merges overlapping visible records once', async () => {
  const item = (id, startDate) => ({ id, data: () => ({ startDate }) })
  const first = Array.from({ length: 20 }, (_, i) => item(`same-${i}`, '2026-11-01'))
  const second = [item('same-20', '2026-11-01'), item('later', '2026-11-02')]
  const cursors = []
  const results = await calendarWindowAndUpcoming(async () => [first[0]], async (cursor) => { cursors.push(cursor?.id || null); return cursor ? second : first })
  assert.equal(results.length, 22)
  assert.deepEqual(cursors, [null, 'same-19'])
})

test('empty calendar remains empty and query failures reject instead of becoming successful empty states', async () => {
  assert.deepEqual(await calendarWindowAndUpcoming(async () => [], async () => []), [])
  await assert.rejects(calendarWindowAndUpcoming(async () => { throw new Error('denied') }, async () => []), /denied/)
})

test('legacy To-do entries excluded from presentation cannot consume the upcoming cutoff', async () => {
  const item = (id, startDate) => ({ id, data: () => ({ startDate }) })
  const first = Array.from({ length: 20 }, (_, i) => item(`invalid-${i}`, ''))
  const second = [...Array.from({ length: 19 }, (_, i) => item(`invalid-next-${i}`, '')), item('first-valid', '2026-11-01')]
  const last = Array.from({ length: 10 }, (_, i) => item(`valid-${i}`, `2026-11-${String(i + 2).padStart(2, '0')}`))
  let calls = 0
  const results = await calendarWindowAndUpcoming(async () => [], async () => [first, second, last][calls++], (entry) => Boolean(entry.data().startDate))
  assert.equal(calls, 3)
  assert.equal(results.filter((entry) => entry.data().startDate).length, 11)
})
