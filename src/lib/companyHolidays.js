import { getHolidayDisplayNameDe } from '../../functions/holidayTranslations.js'

export const DEFAULT_COMPANY_HOLIDAY_REGION = Object.freeze({ countryCode: 'DE', subdivisionCode: 'DE-NW' })

export function normalizeCompanyHolidayRegion(value) {
  const countryCode = typeof value?.countryCode === 'string' ? value.countryCode.trim().toUpperCase() : ''
  const subdivisionCode = typeof value?.subdivisionCode === 'string' ? value.subdivisionCode.trim().toUpperCase() : ''
  if (countryCode !== 'DE' || !/^DE-(BW|BY|BE|BB|HB|HH|HE|MV|NI|NW|RP|SL|SN|ST|SH|TH)$/.test(subdivisionCode)) return DEFAULT_COMPANY_HOLIDAY_REGION
  return { countryCode, subdivisionCode }
}

function displayName(holiday) {
  const sourceName = holiday?.sourceName || holiday?.name || ''
  return getHolidayDisplayNameDe(holiday?.countryCode, sourceName) || holiday?.displayNameDe || sourceName
}

export function companyHolidayDetail(holiday) {
  const name = displayName(holiday)
  return {
    id: holiday.id,
    date: holiday.date,
    name,
    sourceName: holiday.sourceName || holiday.name || name,
    countries: [{ countryCode: holiday.countryCode, name: 'Deutschland', stateCodes: Array.isArray(holiday.subdivisionCodes) ? holiday.subdivisionCodes : [] }],
  }
}

// This projection is intentionally shared by every work calendar.  The
// standalone holiday calendar keeps its own country and state filtering.
export function companyHolidayEntries(records, configuredRegion) {
  const region = normalizeCompanyHolidayRegion(configuredRegion)
  const stateCode = region.subdivisionCode.slice(3)
  return (Array.isArray(records) ? records : [])
    .filter((holiday) => holiday?.countryCode === region.countryCode && /^\d{4}-\d{2}-\d{2}$/.test(holiday?.date || ''))
    .filter((holiday) => holiday.nationalHoliday === true || (Array.isArray(holiday.subdivisionCodes) && holiday.subdivisionCodes.includes(stateCode)))
    .map((holiday) => {
      const holidayDetail = companyHolidayDetail(holiday)
      const name = holidayDetail.name
      return {
        id: `company-holiday-${holiday.id || `${holiday.date}-${holiday.sourceName || name}`}`,
        startDate: holiday.date,
        endDate: holiday.date,
        label: `Feiertag: ${name}`,
        title: `Feiertag: ${name}`,
        kind: 'company-holiday',
        holidayDetail,
        allDay: true,
        readOnly: true,
        calendarName: 'Feiertage',
        calendarColor: '#6f7f90',
      }
    })
    .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.label.localeCompare(right.label, 'de'))
}
