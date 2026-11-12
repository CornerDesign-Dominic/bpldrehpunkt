import { minutesLabel } from '../../lib/timeTracking.js'

export default function TimeMonthSummary({ days, today }) {
  return <section className="time-card time-table-card">
    <div className="time-table-scroll"><table className="data-table time-month-table"><thead><tr><th>Tag</th><th>Sollzeit</th><th title="Erfasste Anwesenheit einschließlich gebuchter Pausen">Istzeit</th><th title="Gebuchte Pause und zusätzlicher automatischer Pausenabzug">Pause gesamt</th><th title="Angerechnete Arbeitszeit nach Pausenabzug">Arbeitszeit</th><th>Plus / Minus</th></tr></thead><tbody>
      {days.map(day => {
        const settled = day.date <= today && !day.incomplete && !day.calculationIncomplete
        return <tr key={day.date}><td>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
          <td>{day.calculationIncomplete ? '—' : minutesLabel(day.targetMinutes)}</td>
          <td>{minutesLabel((day.workedMinutes || 0) + (day.bookedBreakMinutes || 0))}</td>
          <td>{minutesLabel((day.bookedBreakMinutes || 0) + (day.automaticBreakMinutes || 0))}</td>
          <td title={day.calculationIncomplete ? 'Berechnung noch unvollständig: Arbeitszeitvorgaben fehlen.' : undefined}>{day.calculationIncomplete ? '—' : minutesLabel(day.creditedMinutes)}</td>
          <td className={settled && day.balanceMinutes !== 0 ? day.balanceMinutes < 0 ? 'time-negative' : 'time-positive' : undefined} title={!settled ? 'Noch kein abschließender Tagessaldo verfügbar.' : undefined}>{settled ? minutesLabel(day.balanceMinutes, true) : '—'}</td>
        </tr>
      })}
      {!days.length && <tr><td colSpan="6">Keine Zeitdaten für diesen Monat.</td></tr>}
    </tbody></table></div>
  </section>
}
