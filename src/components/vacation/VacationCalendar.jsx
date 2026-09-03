import { dateValue } from '../../lib/vacationRequests.js'
import { VACATION_MONTHS, vacationMonthDays } from '../../lib/vacationCalendar.js'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export default function VacationCalendar({ entriesForDate, month, today, year }) {
  const days = vacationMonthDays(year, month)
  return <div className="vacation-calendar" aria-label={`Urlaubskalender ${VACATION_MONTHS[month]} ${year}`}><div className="vacation-calendar__weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div><div className="vacation-calendar__days">{days.map((date, index) => {
    if (!date) return <div key={`empty-${index}`} className="vacation-day vacation-day--empty" />
    const value = dateValue(date)
    const entries = entriesForDate(value)
    return <div key={value} className={`vacation-day ${value === today ? 'vacation-day--today' : ''}`}><time dateTime={value}>{date.getDate()}</time><div className="vacation-day__entries">{entries.slice(0, 3).map((entry) => <span key={entry.id} className={`vacation-day-entry vacation-day-entry--${entry.kind || 'pending'} ${entry.modifier ? `vacation-day-entry--${entry.modifier}` : ''} ${entry.own ? 'vacation-day-entry--own' : ''}`} title={entry.title || entry.label}>{entry.label}</span>)}{entries.length > 3 && <span className="vacation-day-entry vacation-day-entry--more">+{entries.length - 3}</span>}</div></div>
  })}</div></div>
}
