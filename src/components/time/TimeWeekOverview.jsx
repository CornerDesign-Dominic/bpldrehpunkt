import { EditIcon } from '../icons.jsx'
import { addDays, formatTime, minutesLabel, TIME_ACTIONS } from '../../lib/timeTracking.js'

const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
const actions = { ...TIME_ACTIONS, pause_start: 'Pause Start', pause_end: 'Pause Ende' }

export default function TimeWeekOverview({ days, from, today, disabled, canCorrect, onEdit }) {
  const byDate = new Map(days.map(day => [day.date, day]))
  const week = Array.from({ length: 7 }, (_, index) => byDate.get(addDays(from, index)) || { date: addDays(from, index), events: [], calculationIncomplete: true })
  const scale = Math.max(60, ...week.flatMap(day => [day.creditedMinutes || 0, day.targetMinutes || 0]))
  return <section className="time-card time-week-card" aria-label="Aktuelle Woche">
    <header className="time-week-heading"><h3>Aktuelle Woche · {dateLabel(from)} – {dateLabel(addDays(from, 6))}</h3><span className="time-muted time-week-legend"><span aria-hidden="true" /> Sollzeit</span></header>
    <div className="time-week-scroll"><div className="time-week-grid">
      {week.map(day => {
        const actual = day.creditedMinutes || 0
        const target = day.calculationIncomplete ? null : day.targetMinutes || 0
        const events = [...(day.events || [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))
        const weekday = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short' })
        const editable = !disabled && canCorrect(day.date)
        return <article key={day.date} className={`time-week-day${day.date === today ? ' time-week-day--today' : ''}`} aria-label={`${weekday} ${dateLabel(day.date)}`}>
          <header className="time-week-day-heading"><div><strong>{weekday}</strong> <time dateTime={day.date}>{dateLabel(day.date)}</time></div><button type="button" className="time-week-edit" disabled={!editable} aria-label={`Buchungen vom ${dateLabel(day.date)} bearbeiten`} title="Tagesbuchungen bearbeiten" onClick={() => onEdit(day)}><EditIcon size={15} /></button></header>
          <div className="time-week-chart" role="img" aria-label={`Ist ${minutesLabel(actual)}, Soll ${target === null ? 'nicht hinterlegt' : minutesLabel(target)}`}>
            <div className="time-week-bar-track"><div className="time-week-bar" style={{ height: `${actual / scale * 100}%` }} />{target > 0 && <span className="time-week-target" style={{ bottom: `${target / scale * 100}%` }} />}</div>
          </div>
          <div className="time-week-values"><div title="Angerechnete Arbeitszeit / Sollzeit"><span>Ist <strong>{minutesLabel(actual)}</strong></span><span>Soll <strong>{target === null ? '—' : minutesLabel(target)}</strong></span></div><span className="time-week-pause" title="Tatsächlich gebuchte Pausen">Pause <strong>{minutesLabel(day.bookedBreakMinutes)}</strong></span></div>
          <table className="time-week-bookings"><caption className="sr-only">Buchungen vom {dateLabel(day.date)}</caption><thead className="sr-only"><tr><th>Stempelzeit</th><th>Buchung</th></tr></thead><tbody>
            {events.map(event => <tr key={event.id}><td><time dateTime={event.at}>{formatTime(event.at)}</time></td><td>{actions[event.type] || event.type}</td></tr>)}
            {!events.length && <tr><td colSpan="2" className="time-week-empty">Keine Buchungen</td></tr>}
          </tbody></table>
          {day.incomplete && <span className="time-week-warning">Unvollständig</span>}
        </article>
      })}
    </div></div>
  </section>
}
