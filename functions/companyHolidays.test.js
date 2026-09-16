import assert from 'node:assert/strict'
import test from 'node:test'
import { companyHolidayEntries, DEFAULT_COMPANY_HOLIDAY_REGION } from '../src/lib/companyHolidays.js'

const holidays = [
  { id: 'national', countryCode: 'DE', date: '2026-10-03', sourceName: 'German Unity Day', nationalHoliday: true, subdivisionCodes: [] },
  { id: 'nrw', countryCode: 'DE', date: '2026-06-04', sourceName: 'Corpus Christi', nationalHoliday: false, subdivisionCodes: ['NW'] },
  { id: 'all-saints', countryCode: 'DE', date: '2026-11-01', sourceName: "All Saints' Day", nationalHoliday: false, subdivisionCodes: ['NW', 'RP'] },
  { id: 'bavaria', countryCode: 'DE', date: '2026-08-15', sourceName: 'Assumption Day', nationalHoliday: false, subdivisionCodes: ['BY'] },
  { id: 'saxony', countryCode: 'DE', date: '2026-11-18', sourceName: 'Repentance and Prayer Day', nationalHoliday: false, subdivisionCodes: ['SN'] },
  { id: 'foreign', countryCode: 'FR', date: '2026-07-14', sourceName: 'Bastille Day', nationalHoliday: true, subdivisionCodes: [] },
]

test('projects national and Nordrhein-Westfalen public holidays into work calendars', () => {
  const entries = companyHolidayEntries(holidays, DEFAULT_COMPANY_HOLIDAY_REGION)
  assert.deepEqual(entries.map((entry) => entry.label), ['Feiertag: Fronleichnam', 'Feiertag: Tag der Deutschen Einheit', 'Feiertag: Allerheiligen'])
  assert(entries.every((entry) => entry.kind === 'company-holiday' && entry.readOnly === true))
})

test('does not project holidays that only apply to Bavaria or Saxony', () => {
  const labels = companyHolidayEntries(holidays, { countryCode: 'DE', subdivisionCode: 'DE-NW' }).map((entry) => entry.label)
  assert.equal(labels.some((label) => label.includes('Mariä Himmelfahrt') || label.includes('Buß- und Bettag')), false)
})

test('uses the same central projection when the configured state changes', () => {
  const northRhineWestphalia = companyHolidayEntries(holidays, { countryCode: 'DE', subdivisionCode: 'DE-NW' }).map((entry) => entry.label)
  const bavaria = companyHolidayEntries(holidays, { countryCode: 'DE', subdivisionCode: 'DE-BY' }).map((entry) => entry.label)
  assert(northRhineWestphalia.includes('Feiertag: Fronleichnam'))
  assert.equal(bavaria.includes('Feiertag: Fronleichnam'), false)
  assert(bavaria.includes('Feiertag: Mariä Himmelfahrt'))
})
