import { VACATION_CALENDAR_LEGEND } from '../../lib/vacationCalendar.js'

export default function VacationCalendarLegend() {
  return <div className="vacation-legend">{VACATION_CALENDAR_LEGEND.map((item) => <span className={`vacation-legend__item vacation-legend__item--${item.kind}`} key={item.kind}>{item.label}</span>)}</div>
}
