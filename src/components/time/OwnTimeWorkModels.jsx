import { useEffect, useState } from 'react'
import { EUROPEAN_COUNTRIES, GERMAN_STATES } from '../../lib/holidayCalendar.js'
import { getOwnTimeWorkModels, minutesLabel, timeError } from '../../lib/timeTracking.js'

const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const order = [1, 2, 3, 4, 5, 6, 0]
const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })

function holidayRegion(model) {
  const country = EUROPEAN_COUNTRIES.find(entry => entry.code === model.holidayCountryCode)?.name || model.holidayCountryCode
  const region = model.holidayCountryCode === 'DE' ? GERMAN_STATES.find(entry => entry.code === model.holidaySubdivisionCode)?.name || model.holidaySubdivisionCode : model.holidaySubdivisionCode
  return [country, region].filter(Boolean).join(' · ')
}

export default function OwnTimeWorkModels({ today, online }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!online) return
    let active = true
    getOwnTimeWorkModels().then(data => { if (active) { setResult(data); setError('') } })
      .catch(failure => { if (active) setError(timeError(failure)) })
    return () => { active = false }
  }, [online, refresh])
  const models = result?.models || []
  const current = models.find(model => model.validFrom <= today && (!model.validTo || model.validTo >= today))
  return <section className="time-card time-own-models" aria-labelledby="own-time-model-title">
    <header className="time-toolbar"><h3 id="own-time-model-title">Mein Arbeitszeitmodell</h3><button type="button" className="button button--secondary" disabled={!online} onClick={() => setRefresh(value => value + 1)}>Vorgaben aktualisieren</button></header>
    <p className="time-muted">Deine hinterlegten Sollstunden und Pausenregeln. Änderungen nimmt der Superadmin in Drehpunkt vor.</p>
    {!online && <p className="time-notice">Zum Laden deiner Arbeitszeitmodelle brauchst du eine Internetverbindung.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {online && !result && !error && <p role="status">Arbeitszeitmodelle werden geladen …</p>}
    {result && !models.length && <p>Noch kein Arbeitszeitmodell hinterlegt. Bitte den Superadmin kontaktieren.</p>}
    {models.length > 0 && !current && <p className="time-notice">Für heute ist kein gültiges Arbeitszeitmodell hinterlegt. Die aufgeführten Zeiträume gelten für andere Tage.</p>}
    {[...models].sort((a, b) => {
      const rank = model => model === current ? 0 : model.validFrom > today ? 1 : 2
      return rank(a) - rank(b) || (a.validFrom > today ? a.validFrom.localeCompare(b.validFrom) : b.validFrom.localeCompare(a.validFrom))
    }).map(model => <details className="time-own-model" key={model.validFrom} open={model === current}>
      <summary><span>{model === current ? 'Aktuell gültig' : model.validFrom > today ? 'Künftiges Modell' : 'Früheres Modell'}</span><span>{dateLabel(model.validFrom)} – {model.validTo ? dateLabel(model.validTo) : 'unbefristet'}</span></summary>
      <div className="time-own-model-content">
        <div className="time-own-model-facts"><span><strong>{minutesLabel(Object.values(model.weekdays).reduce((sum, day) => sum + day.targetMinutes, 0))} Std.</strong> Sollzeit pro Woche</span><span>Feiertagskalender: {holidayRegion(model)}</span></div>
        <div className="time-table-scroll"><table className="data-table time-own-model-table"><thead><tr><th>Wochentag</th><th>Sollzeit</th><th>Pausenstufen · Gesamtpause</th></tr></thead><tbody>{order.map(day => <tr key={day}><td>{weekdays[day]}</td><td>{minutesLabel(model.weekdays[day].targetMinutes)} Std.</td><td>{model.weekdays[day].breaks.length ? model.weekdays[day].breaks.map(rule => <span key={rule.afterMinutes}>Nach mehr als {minutesLabel(rule.afterMinutes)} Std. Arbeitszeit: insgesamt {minutesLabel(rule.requiredMinutes)} Std. Pause</span>) : 'Keine Mindestpause hinterlegt'}</td></tr>)}</tbody></table></div>
      </div>
    </details>)}
    {models.length > 0 && <div className="time-own-model-explanation"><h3>So wird die Pause berücksichtigt</h3><p>Die Grenze bezieht sich auf die erfasste Arbeitsdauer ohne gebuchte Pausen. Beim Überschreiten einer Grenze wächst der zusätzliche Abzug schrittweise pro weiterer Arbeitsminute, bis die hinterlegte Gesamtpause erreicht ist. Bereits gebuchte Pausen werden angerechnet.</p><p>Ein halber Urlaubstag reduziert die Sollzeit. Die Pausenregeln richten sich weiterhin nach der tatsächlich erfassten Arbeitsdauer. Urlaub und Feiertage werden in den Tageswerten berücksichtigt.</p></div>}
  </section>
}
