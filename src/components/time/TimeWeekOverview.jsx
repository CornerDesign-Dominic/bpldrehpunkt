import { useState } from 'react'
import { EditIcon } from '../icons.jsx'
import { addDays, formatTime, minutesLabel, TIME_ACTIONS, weekRange } from '../../lib/timeTracking.js'
import TimeDayCalculation from './TimeDayCalculation.jsx'

const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
const actions = { ...TIME_ACTIONS, pause_start: 'Pause Start', pause_end: 'Pause Ende' }

export default function TimeWeekOverview({ days, from, today, disabled, canCorrect, onEdit, onWeekChange, navigationDisabled = disabled }) {
  const [detail, setDetail] = useState(null)
  const byDate = new Map(days.map(day => [day.date, day]))
  const week = Array.from({ length: 7 }, (_, index) => byDate.get(addDays(from, index)) || { date: addDays(from, index), events: [], calculationIncomplete: true })
  const currentWeek = weekRange(today).from
  const periodLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
  const scale = Math.max(60, ...week.flatMap(day => [(day.creditedMinutes || 0) + (day.bookedBreakMinutes || 0), day.targetMinutes || 0]))
  const selectedDay = detail && week.find(day => day.date === detail.date)
  function info(day, subject, label) {
    return <button type="button" className="time-week-info" aria-label={`${label} am ${dateLabel(day.date)}`} onClick={() => setDetail({ date: day.date, subject })}>ⓘ</button>
  }
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
        const middle = barHeight / 2
        let labelHeight = Math.max(0, middle - 8)
        if (target === 0 && actual === 0) labelHeight = 24
        else if (target > 0 && Math.abs(middle - targetHeight) < 22) labelHeight = targetHeight >= 25 ? targetHeight - 25 : targetHeight + 15
        const events = [...(day.events || [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))
        const weekday = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short' })
        const editable = !disabled && canCorrect(day.date)
        return <article key={day.date} className={`time-week-day${day.date === today ? ' time-week-day--today' : ''}`} aria-label={`${weekday} ${dateLabel(day.date)}`}>
          <header className="time-week-day-heading"><div><strong>{weekday}</strong> <time dateTime={day.date}>{dateLabel(day.date)}</time></div></header>
          <div className="time-week-chart" role="img" aria-label={`Arbeitszeit ${target === null ? 'noch nicht berechenbar' : minutesLabel(actual)}, Pause ${minutesLabel(pause)}, Soll ${target === null ? 'nicht hinterlegt' : minutesLabel(target)}`}>
            <div className="time-week-bar-track"><div className="time-week-bar" title={`Arbeitszeit ${minutesLabel(actual)}`} style={{ height: `${barHeight}%`, borderTopLeftRadius: pause ? 0 : undefined, borderTopRightRadius: pause ? 0 : undefined }} />{pause > 0 && <div className="time-week-bar time-week-bar--pause" title={`Genommene Pause ${minutesLabel(pause)}`} style={{ height: `${pause / scale * 100}%`, bottom: `${barHeight}%` }} />}
              {target !== null ? <span className="time-week-target" style={{ bottom: `${targetHeight}%` }}><span>Soll {minutesLabel(target)}</span></span> : <span className="time-week-target-unknown">Soll —</span>}
              <span className="time-week-bar-label" style={{ bottom: `${labelHeight}%` }}><span>{target === null ? 'Erfasst' : 'Arbeitszeit'}</span><strong>{minutesLabel(target === null ? day.workedMinutes : actual)}</strong></span>
            </div>
          </div>
          <div className="time-week-values">
            <div><span>Auf Arbeit</span><span className="time-week-number"><strong>{minutesLabel((day.workedMinutes || 0) + pause)}</strong>{info(day, 'presence', 'Anwesenheit erklären')}</span></div>
            <div><span className="time-week-pause">Pause</span><span className="time-week-number"><strong>{minutesLabel(pause)}</strong>{info(day, 'pause', 'Pausenberechnung öffnen')}</span></div>
            <div className="time-week-balance"><span>Saldo</span><span className="time-week-number"><strong aria-label={running && settled ? 'Vorläufiger Tagessaldo' : undefined}>{settled ? minutesLabel(day.balanceMinutes, true) : '—'}</strong>{info(day, 'balance', 'Tagesrechnung öffnen')}</span></div>
          </div>
          <table className="time-week-bookings"><caption className="sr-only">Buchungen vom {dateLabel(day.date)}</caption><thead className="sr-only"><tr><th>Stempelzeit</th><th>Buchung</th></tr></thead><tbody>
            {events.map(event => <tr key={event.id}><td><time dateTime={event.at}>{formatTime(event.at)}</time></td><td><span className="time-week-booking-action">{actions[event.type] || event.type}<button type="button" className="time-week-edit" disabled={!editable} aria-label={`${actions[event.type]} um ${formatTime(event.at)} am ${dateLabel(day.date)} bearbeiten`} title="Buchung bearbeiten" onClick={() => onEdit(day, event)}><EditIcon size={14} /></button></span></td></tr>)}
            {!events.length && <tr><td colSpan="2" className="time-week-empty">Keine Buchungen</td></tr>}
          </tbody></table>
          <button type="button" className="time-week-add" disabled={!editable} onClick={() => onEdit(day, null)}>Buchung hinzufügen</button>
          {day.incomplete && <span className="time-week-warning">Unvollständig</span>}
        </article>
      })}
    </div></div>
    {selectedDay && <TimeDayCalculation day={selectedDay} today={today} subject={detail.subject} onClose={() => setDetail(null)} />}
  </section>
}
