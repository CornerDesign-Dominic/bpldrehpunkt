import { dateValue } from '../../lib/vacationRequests.js'
import { VACATION_MONTHS, vacationMonthDays } from '../../lib/vacationCalendar.js'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function overlaps(entry, startDate, endDate) {
  return entry.startDate <= endDate && entry.endDate >= startDate
}

function weekDays(days) {
  return Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7))
}

function barsForWeek(entries, week, weekIndex) {
  const firstDayIndex = week.findIndex(Boolean)
  const lastDayIndex = week.length - 1 - [...week].reverse().findIndex(Boolean)
  const weekStart = dateValue(week[firstDayIndex])
  const weekEnd = dateValue(week[lastDayIndex])
  const laneEnds = []
  return entries.filter((entry) => entry.startDate && entry.endDate && overlaps(entry, weekStart, weekEnd)).sort((left, right) => left.startDate.localeCompare(right.startDate) || left.endDate.localeCompare(right.endDate)).map((entry) => {
    const startDate = entry.startDate > weekStart ? entry.startDate : weekStart
    const endDate = entry.endDate < weekEnd ? entry.endDate : weekEnd
    const startColumn = startDate === weekStart ? firstDayIndex + 1 : week.findIndex((day) => day && dateValue(day) === startDate) + 1
    const endColumn = endDate === weekEnd ? lastDayIndex + 1 : week.findIndex((day) => day && dateValue(day) === endDate) + 1
    let lane = laneEnds.findIndex((end) => end < startColumn)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = endColumn
    return { ...entry, startColumn, endColumn, lane, showLabel: (entry.startDate >= weekStart && entry.startDate <= weekEnd) || weekIndex === 0 }
  })
}

export default function VacationCalendar({ entries = [], month, today, year }) {
  const weeks = weekDays(vacationMonthDays(year, month))
  return <div className="vacation-calendar" aria-label={`Urlaubskalender ${VACATION_MONTHS[month]} ${year}`}><div className="vacation-calendar__weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div><div className="vacation-calendar__weeks">{weeks.map((week, weekIndex) => <div className="vacation-calendar-week" key={`week-${weekIndex}`}><div className="vacation-calendar-week__days">{week.map((date, index) => {
    if (!date) return <div key={`empty-${weekIndex}-${index}`} className="vacation-day vacation-day--empty" />
    const value = dateValue(date)
    return <div key={value} className={`vacation-day ${value === today ? 'vacation-day--today' : ''}`}><time dateTime={value}>{date.getDate()}</time></div>
  })}</div><div className="vacation-calendar-week__bars">{barsForWeek(entries, week, weekIndex).map((entry) => <span key={`${entry.id}-${weekIndex}`} className={`vacation-calendar-bar vacation-calendar-bar--${entry.kind || 'pending'} ${entry.modifier ? `vacation-calendar-bar--${entry.modifier}` : ''} ${entry.own ? 'vacation-calendar-bar--own' : ''}`} style={{ gridColumn: `${entry.startColumn} / ${entry.endColumn + 1}`, gridRow: entry.lane + 1 }} title={entry.title || entry.label}>{entry.showLabel ? entry.label : ''}</span>)}</div></div>)}</div></div>
}
