import assert from 'node:assert/strict'
import test from 'node:test'
import { vacationHalfDayDate } from './vacationDayAllocation.js'
test('single half-day is unambiguous; whole days do not retain a half-day date', () => {
  assert.equal(vacationHalfDayDate({ startDate: '2026-11-10', endDate: '2026-11-10', days: 0.5 }), '2026-11-10')
  assert.equal(vacationHalfDayDate({ startDate: '2026-11-10', endDate: '2026-11-12', days: 3, halfDayDate: '2026-11-10' }), '')
})
test('multi-day fractional leave requires a valid allocation inside its range', () => {
  const values = { startDate: '2026-11-10', endDate: '2026-11-12', days: 2.5 }
  assert.equal(vacationHalfDayDate({ ...values, halfDayDate: '2026-11-11' }), '2026-11-11')
  for (const halfDayDate of [undefined, '', '2026-11-09', '2026-11-13', '2026-02-30']) {
    assert.throws(() => vacationHalfDayDate({ ...values, halfDayDate }), { code: 'invalid-argument' })
  }
})
