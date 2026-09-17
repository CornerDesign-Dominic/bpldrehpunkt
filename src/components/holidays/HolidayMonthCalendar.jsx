import { VACATION_MONTHS, vacationMonthDays } from '../../lib/vacationCalendar.js'
import { getHolidayStateNames } from '../../lib/holidayCalendar.js'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function dateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function holidayDetail(holiday) {
  const locations = holiday.countries.map((country) => {
    const states = getHolidayStateNames(country.stateCodes)
    return states.length ? `${country.name} (${states.join(', ')})` : country.name
  })
  return `${holiday.name} · Quelle: ${holiday.sourceName || holiday.name} · Gilt in: ${locations.join(', ')}`
}

export default function HolidayMonthCalendar({ holidays, month, onHolidayClick, schoolHolidayDays = {}, today, year }) {
  const holidaysByDate = holidays.reduce((items, holiday) => {
    items[holiday.date] = [...(items[holiday.date] || []), holiday]
    return items
  }, {})
  const weeks = Array.from({ length: vacationMonthDays(year, month).length / 7 }, (_, index) => vacationMonthDays(year, month).slice(index * 7, index * 7 + 7))

  return <div className="holiday-calendar" aria-label={`Feiertagskalender ${VACATION_MONTHS[month]} ${year}`}>
    <div className="holiday-calendar__weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
    <div className="holiday-calendar__weeks">{weeks.map((week, weekIndex) => <div className="holiday-calendar__week" key={`week-${weekIndex}`}>
      {week.map((date, index) => {
        if (!date) return <div key={`empty-${weekIndex}-${index}`} className="holiday-day holiday-day--empty" />
        const value = dateValue(date)
        const schoolHolidays = schoolHolidayDays[value] || []
        return <div className={`holiday-day${value === today ? ' holiday-day--today' : ''}${schoolHolidays.length ? ' holiday-day--school-holiday' : ''}`} key={value}>
          <time dateTime={value}>{date.getDate()}</time>
          <div className="holiday-day__entries">{schoolHolidays.map((holiday) => <span className="school-holiday-entry" key={`${holiday.id}-${value}`} title={holiday.name}>{holiday.name}</span>)}{(holidaysByDate[value] || []).map((holiday) => {
            const detail = holidayDetail(holiday)
            return <button className={`holiday-entry holiday-entry--${holiday.colorVariant}`} type="button" key={holiday.id} title={detail} aria-label={`${detail}. Details öffnen`} onClick={() => onHolidayClick(holiday)}>{holiday.name}</button>
          })}</div>
        </div>
      })}
    </div>)}</div>
  </div>
}
