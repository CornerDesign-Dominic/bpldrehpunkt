import assert from 'node:assert/strict'
import test from 'node:test'
import { schoolHolidayDaysForMonth } from '../src/lib/schoolHolidayCalendar.js'

test('marks Nordrhein-Westfalen school holidays for every day in the visible period', () => {
  const days = schoolHolidayDaysForMonth([
    { id: 'nrw-autumn', subdivisionCode: 'DE-NW', startDate: '2026-10-17', endDate: '2026-10-31', name: 'Herbstferien' },
  ], 2026, 9)
  assert.equal(days['2026-10-17']?.[0]?.name, 'Herbstferien')
  assert.equal(days['2026-10-31']?.[0]?.name, 'Herbstferien')
  assert.equal(days['2026-11-01'], undefined)
})

test('keeps cross-year Christmas holidays visible in each affected month and state', () => {
  const records = [
    { id: 'nrw-christmas', subdivisionCode: 'DE-NW', startDate: '2026-12-23', endDate: '2027-01-06', name: 'Weihnachtsferien' },
    { id: 'bavaria-christmas', subdivisionCode: 'DE-BY', startDate: '2026-12-24', endDate: '2027-01-05', name: 'Weihnachtsferien' },
  ]
  const december = schoolHolidayDaysForMonth(records.filter((holiday) => holiday.subdivisionCode === 'DE-NW'), 2026, 11)
  const january = schoolHolidayDaysForMonth(records.filter((holiday) => holiday.subdivisionCode === 'DE-NW'), 2027, 0)
  const bavaria = schoolHolidayDaysForMonth(records.filter((holiday) => holiday.subdivisionCode === 'DE-BY'), 2027, 0)
  assert.equal(december['2026-12-23']?.[0]?.name, 'Weihnachtsferien')
  assert.equal(january['2027-01-06']?.[0]?.name, 'Weihnachtsferien')
  assert.equal(january['2027-01-07'], undefined)
  assert.equal(bavaria['2027-01-05']?.[0]?.name, 'Weihnachtsferien')
  assert.equal(bavaria['2027-01-06'], undefined)
})
