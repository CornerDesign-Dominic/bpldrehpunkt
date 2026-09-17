import assert from 'node:assert/strict'
import test from 'node:test'
import { getHolidayDisplayNameDe } from './holidayTranslations.js'
import { getVisibleHolidays } from '../src/lib/holidayCalendar.js'

test('maps German and foreign Nager source names to German display names', () => {
  assert.equal(getHolidayDisplayNameDe('DE', "New Year's Day"), 'Neujahr')
  assert.equal(getHolidayDisplayNameDe('NL', "King's Day"), 'Königstag')
  assert.equal(getHolidayDisplayNameDe('FR', 'Bastille Day'), 'Französischer Nationalfeiertag')
  assert.equal(getHolidayDisplayNameDe('GB', 'Spring Bank Holiday'), 'Bankfeiertag im Frühling')
  assert.equal(getHolidayDisplayNameDe('PL', 'Independence Day'), 'Unabhängigkeitstag')
})

test('keeps unknown source names detectable without an automatic translation', () => {
  assert.equal(getHolidayDisplayNameDe('DE', 'Future Nager Holiday'), null)
})

test('calendar projection uses German names whenever a translation exists', () => {
  const holidays = getVisibleHolidays([
    { countryCode: 'DE', year: 2026, date: '2026-01-01', sourceName: "New Year's Day", displayNameDe: "New Year's Day", nationalHoliday: true, subdivisionCodes: [] },
    { countryCode: 'FR', year: 2026, date: '2026-07-14', sourceName: 'Bastille Day', nationalHoliday: true, subdivisionCodes: [] },
  ], 2026, true, [], ['DE', 'FR'])
  assert.deepEqual(holidays.map((holiday) => holiday.name), ['Neujahr', 'Französischer Nationalfeiertag'])
  assert.equal(holidays.some((holiday) => holiday.name === "New Year's Day" || holiday.name === 'Bastille Day'), false)
})

test('shows national holidays of selected foreign countries independently of German state filters', () => {
  const records = [
    { countryCode: 'FR', year: 2027, date: '2027-07-14', sourceName: 'Bastille Day', nationalHoliday: true, subdivisionCodes: [] },
    { countryCode: 'NL', year: 2027, date: '2027-04-27', sourceName: "King's Day", nationalHoliday: true, subdivisionCodes: [] },
    { countryCode: 'PL', year: 2027, date: '2027-11-11', sourceName: 'Independence Day', nationalHoliday: true, subdivisionCodes: [] },
  ]
  const holidays = getVisibleHolidays(records, 2027, false, [], ['FR', 'NL', 'PL'])
  assert.deepEqual(holidays.map((holiday) => holiday.name), ['Königstag', 'Französischer Nationalfeiertag', 'Unabhängigkeitstag'])
  assert.deepEqual(holidays.flatMap((holiday) => holiday.countries.map((country) => country.countryCode)).sort(), ['FR', 'NL', 'PL'])
})
