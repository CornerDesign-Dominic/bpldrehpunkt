import { useEffect, useId, useRef } from 'react'
import { minutesLabel } from '../../lib/timeTracking.js'

export default function TimeDayCalculation({ day, today, subject, onClose }) {
  const dialog = useRef(null)
  const headingId = useId()
  useEffect(() => {
    const previous = document.activeElement
    const node = dialog.current
    node.showModal()
    return () => { node.close(); previous?.focus?.() }
  }, [])
  const known = !day.calculationIncomplete
  const settled = known && !day.incomplete && day.date <= today
  const running = day.date === today && ['working', 'break'].includes(day.status)
  const heading = subject === 'pause' ? 'Pausenberechnung' : subject === 'presence' ? 'Anwesenheit und Arbeitszeit' : 'Tagesrechnung'
  const date = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
  return <dialog ref={dialog} className="time-dialog time-day-calculation" aria-labelledby={headingId} onCancel={onClose}>
    <header><h2 id={headingId}>{heading} · {date}</h2><button type="button" className="button button--secondary" aria-label="Schließen" onClick={onClose}>×</button></header>
    <dl className="time-calculation-rows">
      <dt>Anwesenheit</dt><dd>{minutesLabel((day.workedMinutes || 0) + (day.bookedBreakMinutes || 0))}</dd>
      <dt>− Genommene Pause</dt><dd>{minutesLabel(day.bookedBreakMinutes)}</dd>
      <dt>− Automatischer Zusatzabzug</dt><dd>{known ? minutesLabel(day.automaticBreakMinutes) : '—'}</dd>
      <dt className="time-calculation-result">= Angerechnete Arbeitszeit</dt><dd className="time-calculation-result">{known ? minutesLabel(day.creditedMinutes) : '—'}</dd>
      <dt>− Sollzeit</dt><dd>{known ? minutesLabel(day.targetMinutes) : '—'}</dd>
      {day.overtimeDebitMinutes > 0 && <><dt>− Genehmigter Überstundenabbau</dt><dd>{minutesLabel(day.overtimeDebitMinutes)}</dd></>}
      <dt className="time-calculation-result">= Tagessaldo{running ? ' · vorläufig' : ''}</dt><dd className="time-calculation-result">{settled ? minutesLabel(day.balanceMinutes, true) : '—'}</dd>
    </dl>
    <div className="time-calculation-explanation"><p>„Auf Arbeit“ ist die erfasste Anwesenheit einschließlich der gebuchten Pausen. Zeiten zwischen Ausstempeln und erneutem Einstempeln zählen nicht dazu.</p><p>Genommene Pause stammt aus deinen Pausenbuchungen. Der zusätzliche Abzug ergänzt die nach dem Arbeitszeitmodell berechnete Pause. Er wächst nach Überschreiten einer Pausengrenze schrittweise. Bereits gebuchte Pausen werden dabei berücksichtigt.</p><p>Sollzeit und Überstundenabbau enthalten die für diesen Tag berücksichtigten genehmigten Abwesenheiten und Feiertage.</p></div>
    {running && <p className="time-notice">Der heutige Tag läuft noch. Die Werte entsprechen dem zuletzt geladenen Stand.</p>}
    {!settled && <p className="time-notice">{day.date > today ? 'Für einen zukünftigen Tag gibt es noch keinen Tagessaldo.' : 'Der Tag ist noch nicht vollständig berechenbar. Fehlende Buchungen oder Arbeitszeitvorgaben müssen geklärt werden.'}</p>}
    {(day.issues || []).length > 0 && <ul className="time-muted">{day.issues.map((issue, index) => <li key={index}>{typeof issue === 'string' ? issue : issue.message}</li>)}</ul>}
  </dialog>
}
