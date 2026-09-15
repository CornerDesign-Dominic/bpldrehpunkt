import { VACATION_MONTHS, vacationMonthDays } from '../../lib/vacationCalendar.js'
import { getHolidayStateNames } from '../../lib/holidayCalendar.js'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function dateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function HolidayMonthCalendar({ holidays, month, today, year }) {
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
        return <div className={`holiday-day${value === today ? ' holiday-day--today' : ''}`} key={value}>
          <time dateTime={value}>{date.getDate()}</time>
          <div className="holiday-day__entries">{(holidaysByDate[value] || []).map((holiday) => {
            const states = holiday.scope === 'regional' ? getHolidayStateNames(holiday.stateCodes) : []
            const detail = states.length ? `${holiday.name} · Gilt in: ${states.join(', ')}` : holiday.name
            return <span className={`holiday-entry holiday-entry--${holiday.scope}`} key={`${holiday.date}-${holiday.name}`} title={detail} aria-label={detail}>{holiday.name}</span>
          })}</div>
        </div>
      })}
    </div>)}</div>
  </div>
}
