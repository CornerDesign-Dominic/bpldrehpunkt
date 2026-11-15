import { useState } from 'react'
import { EditIcon } from '../icons.jsx'
import { addDays, formatTime, minutesLabel, TIME_ACTIONS, weekRange } from '../../lib/timeTracking.js'
import TimeDayCalculation from './TimeDayCalculation.jsx'

const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
const actions = { ...TIME_ACTIONS, pause_start: 'Pause Start', pause_end: 'Pause Ende' }

export default function TimeWeekOverview({ days, from, today, disabled, canCorrect, onEdit, onWeekChange, navigationDisabled = disabled }) {
  const [detailDate, setDetailDate] = useState(null)
  const byDate = new Map(days.map(day => [day.date, day]))
  const week = Array.from({ length: 7 }, (_, index) => byDate.get(addDays(from, index)) || { date: addDays(from, index), events: [], calculationIncomplete: true })
  const currentWeek = weekRange(today).from
  const periodLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
  const scale = Math.max(60, ...week.flatMap(day => [(day.creditedMinutes || 0) + (day.bookedBreakMinutes || 0), day.targetMinutes || 0]))
  const selectedDay = week.find(day => day.date === detailDate)
  return <section className="time-card time-week-card" aria-label="Wochenübersicht">
    <header className="time-week-heading"><h3>{from === currentWeek ? 'Aktuelle Woche' : 'Woche'} · {periodLabel(from)} – {periodLabel(addDays(from, 6))}</h3>
      <nav className="calendar-navigation time-week-nav" aria-label="Woche wählen">
        <button type="button" className="calendar-navigation__button calendar-navigation__button--previous" aria-label="Vorherige Woche" disabled={navigationDisabled || addDays(from, -7) < '2000-01-01'} onClick={() => onWeekChange(addDays(from, -7))}>‹</button>
        <button type="button" className="calendar-navigation__button calendar-navigation__button--today" disabled={navigationDisabled} onClick={() => onWeekChange(currentWeek)}>Heute</button>
        <button type="button" className="calendar-navigation__button calendar-navigation__button--next" aria-label="Nächste Woche" disabled={navigationDisabled || addDays(from, 13) > '2199-12-31'} onClick={() => onWeekChange(addDays(from, 7))}>›</button>
      </nav>
    </header>
    <div className="time-week-scroll"><div className="time-week-grid">
      {week.map(day => {
        const actual = day.creditedMinutes || 0
        const pause = day.bookedBreakMinutes || 0
        const target = day.calculationIncomplete ? null : day.targetMinutes || 0
        const settled = target !== null && !day.incomplete && day.date <= today
        const running = day.date === today && ['working', 'break'].includes(day.status)
        const barHeight = actual / scale * 100
        const targetHeight = (target || 0) / scale * 100
        const events = [...(day.events || [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))
        const weekday = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short' })
        const editable = !disabled && canCorrect(day.date)
        const addButton = <button type="button" className="time-week-add" disabled={!editable} onClick={() => onEdit(day, null)}>Buchung hinzufügen</button>
        return <article key={day.date} className={`time-week-day${day.date === today ? ' time-week-day--today' : ''}`} aria-label={`${weekday} ${dateLabel(day.date)}`}>
          <header className="time-week-day-heading"><div><strong>{weekday}</strong> <time dateTime={day.date}>{dateLabel(day.date)}</time></div><button type="button" className="time-week-info" aria-label={`Tagesrechnung öffnen am ${dateLabel(day.date)}`} onClick={() => setDetailDate(day.date)}>ⓘ</button></header>
          <div className="time-week-amount"><strong>{minutesLabel(target === null ? day.workedMinutes : actual)} <small>Std.</small></strong><span>{target === null ? 'Erfasste Zeit' : 'Arbeitszeit'}</span></div>
          <div className="time-week-chart" role="img" aria-label={`Arbeitszeit ${target === null ? 'noch nicht berechenbar' : minutesLabel(actual)}, Pause ${minutesLabel(pause)}, Soll ${target === null ? 'nicht hinterlegt' : minutesLabel(target)}`}>
            <div className="time-week-bar-track"><div className="time-week-bar" title={`Arbeitszeit ${minutesLabel(actual)}`} style={{ height: `${barHeight}%`, borderTopLeftRadius: pause ? 0 : undefined, borderTopRightRadius: pause ? 0 : undefined }} />{pause > 0 && <div className="time-week-bar time-week-bar--pause" title={`Genommene Pause ${minutesLabel(pause)}`} style={{ height: `${pause / scale * 100}%`, bottom: `${barHeight}%` }} />}
              {target !== null ? <span className="time-week-target" style={{ bottom: `${targetHeight}%` }}><span>Soll {minutesLabel(target)}</span></span> : <span className="time-week-target-unknown">Soll —</span>}
            </div>
          </div>
          <div className="time-week-values">
            <div className="time-week-pause-summary"><span><span className="time-week-pause">Pause</span><strong>{minutesLabel(pause)}</strong></span><span><span>Abzug</span><strong className={target !== null && day.automaticBreakMinutes > 0 ? 'time-week-deduction' : undefined}>{target === null ? '—' : minutesLabel(day.automaticBreakMinutes)}</strong></span></div>
            <div className="time-week-balance"><span>Saldo</span><strong aria-label={running && settled ? 'Vorläufiger Tagessaldo' : undefined}>{settled ? minutesLabel(day.balanceMinutes, true) : '—'}</strong></div>
          </div>
          {events.length > 0 ? <details className="time-week-day-bookings"><summary>{events.length} {events.length === 1 ? 'Buchung' : 'Buchungen'} <span className="time-week-show">anzeigen</span><span className="time-week-hide">ausblenden</span></summary>
            <table className="time-week-bookings"><caption className="sr-only">Buchungen vom {dateLabel(day.date)}</caption><thead className="sr-only"><tr><th>Stempelzeit</th><th>Buchung</th></tr></thead><tbody>
            {events.map(event => <tr key={event.id}><td><time dateTime={event.at}>{formatTime(event.at)}</time></td><td><span className="time-week-booking-action">{actions[event.type] || event.type}<button type="button" className="time-week-edit" disabled={!editable} aria-label={`${actions[event.type]} um ${formatTime(event.at)} am ${dateLabel(day.date)} bearbeiten`} title="Buchung bearbeiten" onClick={() => onEdit(day, event)}><EditIcon size={14} /></button></span></td></tr>)}
          </tbody></table>
            {addButton}
          </details> : <><p className="time-week-empty">Keine Buchungen</p>{addButton}</>}
          {day.incomplete && <span className="time-week-warning">Unvollständig</span>}
        </article>
      })}
    </div></div>
    {selectedDay && <TimeDayCalculation day={selectedDay} today={today} subject="balance" onClose={() => setDetailDate(null)} />}
  </section>
}
