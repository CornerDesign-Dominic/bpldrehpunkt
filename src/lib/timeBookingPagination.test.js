import test from 'node:test'
import assert from 'node:assert/strict'
import { bookingRangeCursor, loadTimeBookingPage, TIME_BOOKINGS_PAGE_SIZE } from './timeBookingPagination.js'

const event = index => ({ id: `event-${index}`, type: 'come', at: new Date(Date.parse('2026-11-12T07:00:00Z') + index * 60000).toISOString() })
const page = (date, count, nextBefore = null, offset = 0) => ({ days: [{ date, events: Array.from({ length: count }, (_, index) => event(index + offset)) }], history: [], nextBefore })

test('50-booking boundary can split a busy day without truncating its rows or history', async () => {
  let reads = 0
  const fetchPage = async () => { reads++; return page('2026-11-12', 52) }
  const first = await loadTimeBookingPage({ fetchPage })
  assert.equal(TIME_BOOKINGS_PAGE_SIZE, 50)
  assert.equal(first.rows.slice(0, 50).length, 50)
  const second = await loadTimeBookingPage({ cache: first, index: 1, fetchPage })
  assert.equal(second.rows.slice(50, 100).length, 2)
  assert.equal(reads, 1)
  assert.equal(new Set(second.rows.map(row => row.id)).size, 52)
})
test('sparse day pages are loaded until enough booking rows are available', async () => {
  const requests = []
  const result = await loadTimeBookingPage({ fetchPage: async args => {
    requests.push(args)
    return requests.length === 1 ? page('2026-11-12', 20, '2026-11-12') : page('2026-11-11', 35)
  } })
  assert.equal(requests.length, 2)
  assert.equal(requests[1].before, '2026-11-12')
  assert.equal(result.rows.length, 55)
})
test('date bounds are inclusive and stop further reads below the requested range', async () => {
  const requests = []
  const result = await loadTimeBookingPage({ from: '2026-11-10', to: '2026-11-12', fetchPage: async args => {
    requests.push(args)
    return { days: ['2026-11-15', '2026-11-12', '2026-11-10', '2026-11-01'].map(date => ({ date, events: [event(0)] })), history: [], nextBefore: '2026-11-01' }
  } })
  assert.deepEqual(result.rows.map(row => row.date), ['2026-11-12', '2026-11-10'])
  assert.equal(result.nextBefore, null)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].before, '2026-11-13')
  assert.equal(bookingRangeCursor('2026-12-31'), '2027-01-01')
  assert.equal(bookingRangeCursor('2199-12-31'), undefined)
})
test('deleted bookings count as one row and keep all versions', async () => {
  const initial = event(0)
  const result = await loadTimeBookingPage({ fetchPage: async () => ({ days: [{ date: '2026-11-12', events: [] }], history: [{ id: 'stamp', date: '2026-11-12', kind: 'stamp', after: initial, createdAt: '2026-11-12T08:00:00Z' }, { id: 'delete', date: '2026-11-12', kind: 'correction', before: [initial], after: [], createdAt: '2026-11-12T09:00:00Z' }], nextBefore: null }) })
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].deleted, true)
  assert.equal(result.rows[0].changes.length, 2)
})
test('cancelled searches do not publish or continue reading stale pages', async () => {
  let active = true
  let reads = 0
  const result = await loadTimeBookingPage({ isActive: () => active, fetchPage: async () => { reads++; active = false; return page('2026-11-12', 2, '2026-11-12') } })
  assert.equal(result, null)
  assert.equal(reads, 1)
})
