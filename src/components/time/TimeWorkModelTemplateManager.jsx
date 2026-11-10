import { useState } from 'react'
import { archiveTimeWorkModelTemplate, minutesLabel, timeError } from '../../lib/timeTracking.js'
import TimeWorkModelEditor, { TimeModelDialog } from './TimeWorkModelEditor.jsx'

export default function TimeWorkModelTemplateManager({ templates, onClose, onChanged }) {
  const [editing, setEditing] = useState(null)
  const [archiving, setArchiving] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function archive() {
    setBusy(true); setError('')
    try {
      if (!navigator.onLine) throw new Error('Vorlagen können nur online verwaltet werden.')
      await archiveTimeWorkModelTemplate({ id: archiving.id, expectedRevision: archiving.revision })
      await onChanged(); setArchiving(null)
    } catch (failure) { setError(timeError(failure)); await onChanged().catch(() => {}) }
    finally { setBusy(false) }
  }
  return <><TimeModelDialog wide title="Vorlagen verwalten" onClose={onClose} busy={busy}><p className="time-muted">Vorlagen enthalten Tagesstunden, Pausenregeln und die Feiertagsregion. Bereits übernommene Arbeitszeitmodelle bleiben bei jeder Änderung unverändert.</p>
    <div className="time-model-list">{templates.length ? templates.map(template => <article key={template.id}><div><strong>{template.name}</strong><span className="time-muted">{minutesLabel(Object.values(template.weekdays).reduce((sum, day) => sum + day.targetMinutes, 0))} Std. pro Woche · {template.holidayCountryCode}{template.holidaySubdivisionCode ? ` / ${template.holidaySubdivisionCode}` : ' / Drehpunkt-Standard'}</span></div><div className="time-template-actions"><button className="button button--secondary" type="button" disabled={busy} onClick={() => setEditing(template)}>Bearbeiten</button><button className="button button--secondary" type="button" disabled={busy} onClick={() => { setArchiving(template); setError('') }}>Archivieren</button></div></article>) : <p>Noch keine Vorlagen gespeichert. Öffne ein Arbeitszeitmodell und wähle „Als Vorlage speichern“.</p>}</div>
    <footer><button className="button button--secondary" type="button" disabled={busy} onClick={onClose}>Schließen</button></footer>
  </TimeModelDialog>{editing && <TimeWorkModelEditor templateMode model={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}{archiving && <TimeModelDialog title="Vorlage archivieren?" onClose={() => setArchiving(null)} busy={busy}><p className="time-muted">„{archiving.name}“ wird aus der Vorlagenauswahl entfernt. Bereits angelegte Arbeitszeitmodelle werden nicht verändert. Die Vorlage und ihr Verlauf bleiben gespeichert.</p>{error && <p role="alert" className="form-error">{error}</p>}<footer><button className="button button--secondary" type="button" disabled={busy} onClick={() => setArchiving(null)}>Abbrechen</button><button className="button" type="button" disabled={busy} onClick={archive}>{busy ? 'Wird archiviert …' : 'Vorlage archivieren'}</button></footer></TimeModelDialog>}</>
}
