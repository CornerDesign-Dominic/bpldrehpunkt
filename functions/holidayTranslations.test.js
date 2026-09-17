import assert from 'node:assert/strict'
import test from 'node:test'
import { getHolidayDisplayNameDe } from './holidayTranslations.js'
import { EUROPEAN_COUNTRIES, SYNCHRONIZED_HOLIDAY_COUNTRY_CODES, getVisibleHolidays } from '../src/lib/holidayCalendar.js'

test('maps German and foreign Nager source names to German display names', () => {
  assert.equal(getHolidayDisplayNameDe('DE', "New Year's Day"), 'Neujahr')
  assert.equal(getHolidayDisplayNameDe('NL', "King's Day"), 'Königstag')
  assert.equal(getHolidayDisplayNameDe('FR', 'Bastille Day'), 'Französischer Nationalfeiertag')
  assert.equal(getHolidayDisplayNameDe('GB', 'Spring Bank Holiday'), 'Bankfeiertag im Frühling')
  assert.equal(getHolidayDisplayNameDe('PL', 'Independence Day'), 'Unabhängigkeitstag')
  assert.equal(getHolidayDisplayNameDe('SE', 'National Day of Sweden'), 'Schwedischer Nationalfeiertag')
  assert.equal(getHolidayDisplayNameDe('TR', 'Democracy and National Unity Day'), 'Tag der Demokratie und nationalen Einheit')
  assert.equal(getHolidayDisplayNameDe('LV', 'Līgo Day'), 'Līgo-Tag')
})

test('makes the second expansion countries available while keeping the default selection controlled by the page', () => {
  for (const countryCode of ['SE', 'NO', 'FI', 'EE', 'LV', 'LT', 'BG', 'GR', 'TR', 'RS']) {
    assert.equal(SYNCHRONIZED_HOLIDAY_COUNTRY_CODES.includes(countryCode), true)
  }
  assert.equal(SYNCHRONIZED_HOLIDAY_COUNTRY_CODES.length, 30)
})

test('lists only countries backed by holiday synchronization and no placeholders', () => {
  assert.equal(EUROPEAN_COUNTRIES[0]?.code, 'DE')
  assert.deepEqual([...EUROPEAN_COUNTRIES.map((country) => country.code)].sort(), [...SYNCHRONIZED_HOLIDAY_COUNTRY_CODES].sort())
  assert.equal(EUROPEAN_COUNTRIES.every((country) => country.available), true)
  const countryNames = EUROPEAN_COUNTRIES.slice(1).map((country) => country.name)
  assert.deepEqual(countryNames, [...countryNames].sort((left, right) => left.localeCompare(right, 'de')))
})

test('shows selected second expansion national holidays with the foreign blue category', () => {
  const holidays = getVisibleHolidays([
    { countryCode: 'SE', year: 2027, date: '2027-06-06', sourceName: 'National Day of Sweden', nationalHoliday: true, subdivisionCodes: [] },
    { countryCode: 'TR', year: 2027, date: '2027-07-15', sourceName: 'Democracy and National Unity Day', nationalHoliday: true, subdivisionCodes: [] },
  ], 2027, false, [], ['SE', 'TR'])
  assert.deepEqual(holidays.map((holiday) => holiday.name), ['Schwedischer Nationalfeiertag', 'Tag der Demokratie und nationalen Einheit'])
  assert.deepEqual(holidays.map((holiday) => holiday.colorVariant), ['foreign-national', 'foreign-national'])
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
