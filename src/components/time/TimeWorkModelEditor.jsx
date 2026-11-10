import { useEffect, useId, useRef, useState } from 'react'
import { EUROPEAN_COUNTRIES, GERMAN_STATES } from '../../lib/holidayCalendar.js'
import { minutesLabel, saveTimeWorkModel, saveTimeWorkModelTemplate, timeError } from '../../lib/timeTracking.js'
import { applyTimeTemplateToDraft } from '../../lib/timeWorkModelTemplates.js'
import '../../styles/timeWorkModelTemplates.css'

const order = [1, 2, 3, 4, 5, 6, 0]
const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
function minutes(value) {
  if (!/^\d{1,3}:[0-5]\d$/.test(value)) throw new Error('Bitte Zeiten im Format Stunden:Minuten angeben, z. B. 08:00.')
  const [hours, rest] = value.split(':').map(Number)
  return hours * 60 + rest
}
function editForm(model) {
  return { ...model, holidayCountryCode: model.holidayCountryCode || 'DE', holidaySubdivisionCode: (model.holidaySubdivisionCode || '').replace(/^DE-/, ''), weekdays: Object.fromEntries(order.map(day => [day, { target: minutesLabel(model.weekdays?.[day]?.targetMinutes || 0), breaks: (model.weekdays?.[day]?.breaks || []).map(rule => ({ after: minutesLabel(rule.afterMinutes), required: minutesLabel(rule.requiredMinutes) })) }])) }
}
function schedule(form) {
  return { holidayCountryCode: form.holidayCountryCode, holidaySubdivisionCode: form.holidaySubdivisionCode, weekdays: Object.fromEntries(order.map(day => [day, { targetMinutes: minutes(form.weekdays[day].target), breaks: form.weekdays[day].breaks.map(rule => ({ afterMinutes: minutes(rule.after), requiredMinutes: minutes(rule.required) })) }])) }
}
export function TimeModelDialog({ title, children, onClose, busy = false, wide = false }) {
  const dialog = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement
    const node = dialog.current
    node.showModal()
    return () => { node.close(); previous?.focus?.() }
  }, [])
  return <dialog ref={dialog} className={`time-dialog${wide ? ' time-model-dialog' : ''}`} aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); else onClose() }}><header><h2 id={titleId}>{title}</h2><button type="button" className="button button--secondary" disabled={busy} onClick={onClose} aria-label="Schließen">×</button></header>{children}</dialog>
}
function TemplateNameDialog({ values, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (!navigator.onLine) throw new Error('Vorlagen können nur online gespeichert werden.')
      const result = await saveTimeWorkModelTemplate({ ...values, name })
      await onSaved(result.template)
      onClose()
    } catch (failure) { setError(timeError(failure)) }
    finally { setBusy(false) }
  }
  return <TimeModelDialog title="Als Vorlage speichern" onClose={onClose} busy={busy}><form onSubmit={submit}><p className="time-muted">Gespeichert werden die aktuellen Tagesstunden, Pausenstufen und Feiertagsregion. Mitarbeiter, Zeitraum und Zeitkonto gehören nicht zur Vorlage.</p><label>Vorlagenname<input autoFocus required maxLength="80" value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>{error && <p role="alert" className="form-error">{error}</p>}<footer><button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>Abbrechen</button><button className="button" disabled={busy}>{busy ? 'Wird gespeichert …' : 'Vorlage speichern'}</button></footer></form></TimeModelDialog>
}
export default function TimeWorkModelEditor({ model, templates = [], templateMode = false, onClose, onSaved, onTemplatesChanged }) {
  const [form, setForm] = useState(() => editForm(model))
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templateValues, setTemplateValues] = useState(null)
  const [revision, setRevision] = useState(model.revision)
  const [stale, setStale] = useState(false)
  function updateDay(day, update) { setForm(current => ({ ...current, weekdays: { ...current.weekdays, [day]: { ...current.weekdays[day], ...update } } })) }
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      if (!navigator.onLine) throw new Error('Arbeitszeitmodelle und Vorlagen können nur online gespeichert werden.')
      const values = schedule(form)
      if (templateMode) await saveTimeWorkModelTemplate({ id: model.id, expectedRevision: revision, name: form.name, ...values })
      else await saveTimeWorkModel({ ...(model.id ? { id: model.id } : {}), userId: model.userId, validFrom: form.validFrom, validTo: form.validTo, ...values })
      await onSaved(); onClose()
    } catch (failure) { setError(timeError(failure)); if (failure.code === 'functions/aborted') setStale(true) }
    finally { setSaving(false) }
  }
  function saveAsTemplate() {
    try { setTemplateValues(schedule(form)); setError('') }
    catch (failure) { setError(timeError(failure)) }
  }
  function applyTemplate() {
    const template = templates.find(item => item.id === selectedTemplate)
    if (!template) return
    setForm(current => editForm(applyTimeTemplateToDraft(current, template)))
    setMessage(`„${template.name}“ als bearbeitbare Kopie übernommen. Das Modell ist noch nicht gespeichert.`)
  }
  return <><TimeModelDialog wide title={templateMode ? 'Vorlage bearbeiten' : model.id ? 'Arbeitszeitmodell bearbeiten' : 'Arbeitszeitmodell hinzufügen'} onClose={onClose} busy={saving}>
    <form onSubmit={submit} className="time-model-form"><fieldset disabled={saving}>
      {!templateMode && <div className="time-template-picker"><label>Vorlage verwenden<select value={selectedTemplate} onChange={event => setSelectedTemplate(event.target.value)}><option value="">Ohne Vorlage / eigene Eingaben</option>{templates.map(template => <option value={template.id} key={template.id}>{template.name}</option>)}</select></label><button type="button" className="button button--secondary" disabled={!selectedTemplate} onClick={applyTemplate}>Vorlage übernehmen</button><p className="time-muted">Eine Vorlage ist nur eine Ausgangsbasis. Du kannst alle Werte ändern; spätere Vorlagenänderungen wirken nicht auf dieses Modell.</p></div>}
      {templateMode && <label>Vorlagenname<input required maxLength="80" value={form.name || ''} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>}
      <div className="time-form-grid">{!templateMode && <><label>Gültig ab<input type="date" required value={form.validFrom} onChange={event => setForm(current => ({ ...current, validFrom: event.target.value }))} /></label><label>Gültig bis (einschließlich, optional)<input type="date" min={form.validFrom} value={form.validTo} onChange={event => setForm(current => ({ ...current, validTo: event.target.value }))} /></label></>}
      <label>Feiertagskalender · Land<select value={form.holidayCountryCode} onChange={event => setForm(current => ({ ...current, holidayCountryCode: event.target.value, holidaySubdivisionCode: '' }))}>{EUROPEAN_COUNTRIES.map(country => <option value={country.code} key={country.code}>{country.name}</option>)}</select></label>{form.holidayCountryCode === 'DE' ? <label>Bundesland<select value={form.holidaySubdivisionCode} onChange={event => setForm(current => ({ ...current, holidaySubdivisionCode: event.target.value }))}><option value="">Drehpunkt-Standard</option>{GERMAN_STATES.map(state => <option value={state.code} key={state.code}>{state.name}</option>)}</select></label> : <label>Region (optional)<input value={form.holidaySubdivisionCode} maxLength="16" onChange={event => setForm(current => ({ ...current, holidaySubdivisionCode: event.target.value.toUpperCase() }))} /></label>}</div>
      {!templateMode && <p className="time-notice">Zeiträume dürfen sich nicht überschneiden. Vor dem Hinzufügen eines Folgemodells das vorherige Modell entsprechend beenden. Änderungen an vergangenen Zeiträumen berechnen deren Zeitkonto neu.</p>}
      <button type="button" className="button button--secondary" onClick={() => setForm(current => ({ ...current, weekdays: { ...current.weekdays, ...Object.fromEntries([2, 3, 4, 5].map(day => [day, { target: current.weekdays[1].target, breaks: current.weekdays[1].breaks.map(rule => ({ ...rule })) }])) } }))}>Montag auf Dienstag–Freitag übernehmen</button>
      <div className="time-model-days">{order.map(day => <section className="time-model-day" key={day}><div><h3>{dayNames[day]}</h3><label>Sollzeit (hh:mm)<input required type="text" inputMode="numeric" pattern="[0-9]{1,3}:[0-5][0-9]" value={form.weekdays[day].target} onChange={event => updateDay(day, { target: event.target.value })} /></label></div><div className="time-break-rules"><span className="time-muted">Schrittweiser Pausenabzug nach tatsächlicher Arbeitsdauer</span>{form.weekdays[day].breaks.map((rule, index) => <div className="time-break-rule" key={index}><label>Bei mehr als (hh:mm)<input required pattern="[0-9]{1,3}:[0-5][0-9]" value={rule.after} onChange={event => updateDay(day, { breaks: form.weekdays[day].breaks.map((value, i) => i === index ? { ...value, after: event.target.value } : value) })} /></label><label>Gesamtpause (hh:mm)<input required pattern="[0-9]{1,3}:[0-5][0-9]" value={rule.required} onChange={event => updateDay(day, { breaks: form.weekdays[day].breaks.map((value, i) => i === index ? { ...value, required: event.target.value } : value) })} /></label><button type="button" className="button button--secondary" aria-label={`${dayNames[day]} Pausenstufe ${index + 1} entfernen`} onClick={() => updateDay(day, { breaks: form.weekdays[day].breaks.filter((_, i) => i !== index) })}>Entfernen</button></div>)}<button type="button" className="button button--secondary" disabled={form.weekdays[day].breaks.length >= 8} onClick={() => updateDay(day, { breaks: [...form.weekdays[day].breaks, { after: '', required: '' }] })}>Pausenstufe hinzufügen</button></div></section>)}</div>
      <p className="time-muted">Gebuchte Pausen werden angerechnet. Höhere Stufen geben die gesamte erforderliche Pause an. Halber Urlaub halbiert die Sollzeit; Pausenregeln gelten weiterhin nach tatsächlicher Arbeit.</p>
    </fieldset>{message && <p className="time-positive" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}{stale && templateMode && <button type="button" className="button button--secondary" disabled={saving} onClick={async () => {
      setSaving(true)
      try {
        const result = await onSaved()
        const fresh = result.templates?.find(template => template.id === model.id)
        if (!fresh) throw new Error('Die Vorlage wurde archiviert oder ist nicht mehr verfügbar.')
        setForm(editForm(fresh)); setRevision(fresh.revision); setStale(false); setError('')
      } catch (failure) { setError(timeError(failure)) }
      finally { setSaving(false) }
    }}>Entwurf verwerfen und aktuellen Vorlagenstand laden</button>}<footer>{!templateMode && <button type="button" className="button button--secondary" disabled={saving} onClick={saveAsTemplate}>Als Vorlage speichern</button>}<button type="button" className="button button--secondary" disabled={saving} onClick={onClose}>Abbrechen</button><button className="button" disabled={saving || stale}>{saving ? 'Wird gespeichert …' : templateMode ? 'Vorlage speichern' : 'Modell speichern'}</button></footer></form>
  </TimeModelDialog>{templateValues && <TemplateNameDialog values={templateValues} onClose={() => setTemplateValues(null)} onSaved={async template => { await onTemplatesChanged(); setMessage(`Vorlage „${template.name}“ gespeichert. Das Arbeitszeitmodell bleibt unverändert geöffnet.`) }} />}</>
}
