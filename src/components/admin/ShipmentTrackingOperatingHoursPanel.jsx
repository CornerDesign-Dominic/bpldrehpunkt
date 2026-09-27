import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../../auth/useAuth.js'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { db, functions } from '../../lib/firebase.js'
import { DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS, SHIPMENT_TRACKING_TIMEZONE, WEEK_DAYS, normalizeShipmentTrackingOperatingHours, validateShipmentTrackingOperatingHours } from '../../../shared/shipmentTrackingOperatingHours.js'

const settingsRef = doc(db, 'systemSettings', 'shipmentTrackingOperatingHours')
const berlinDate = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: SHIPMENT_TRACKING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
const berlinTime = () => new Intl.DateTimeFormat('en-GB', { timeZone: SHIPMENT_TRACKING_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
const germanDateTime = ({ date, time }) => date ? `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}, ${time} Uhr` : '—'

function WeekRow({ day, value, onChange }) {
  return <div className="shipment-tracking-hours__week-row"><strong>{day.label}</strong><label className="admin-checkbox"><input type="checkbox" checked={value.isOpen} onChange={(event) => onChange({ isOpen: event.target.checked, from: event.target.checked ? (value.from || '07:00') : null, to: event.target.checked ? (value.to || '17:00') : null })} />Geöffnet</label><input type="time" value={value.from || ''} disabled={!value.isOpen} aria-label={`${day.label} von`} onChange={(event) => onChange({ ...value, from: event.target.value })} /><input type="time" value={value.to || ''} disabled={!value.isOpen} aria-label={`${day.label} bis`} onChange={(event) => onChange({ ...value, to: event.target.value })} /></div>
}

function ExceptionRow({ date, value, onChange, onDelete }) {
  return <div className="shipment-tracking-hours__exception-row"><input type="date" value={date} aria-label="Ausnahmedatum" onChange={(event) => onChange(event.target.value, value)} /><input type="text" value={value.note || ''} maxLength="240" placeholder="Bezeichnung oder Notiz (optional)" aria-label="Ausnahme-Notiz" onChange={(event) => onChange(date, { ...value, note: event.target.value })} /><label className="admin-checkbox"><input type="checkbox" checked={value.isOpen} onChange={(event) => onChange(date, { isOpen: event.target.checked, from: event.target.checked ? (value.from || '07:00') : null, to: event.target.checked ? (value.to || '17:00') : null, note: value.note || '' })} />Geöffnet</label><input type="time" value={value.from || ''} disabled={!value.isOpen} aria-label="Ausnahme von" onChange={(event) => onChange(date, { ...value, from: event.target.value })} /><input type="time" value={value.to || ''} disabled={!value.isOpen} aria-label="Ausnahme bis" onChange={(event) => onChange(date, { ...value, to: event.target.value })} /><button className="button button--secondary" type="button" onClick={() => onDelete(date)}>Löschen</button></div>
}

function previewErrorMessage(error) {
  if (error?.code === 'functions/permission-denied') return 'Keine Berechtigung für die Zeitprüfung.'
  if (error?.code === 'functions/failed-precondition') return error.message || 'Die eingegebenen Betriebszeiten können nicht ausgewertet werden.'
  return 'Die Zeitprüfung ist momentan nicht verfügbar. Bitte erneut versuchen.'
}

function RulePreview() {
  const [referenceDate, setReferenceDate] = useState(berlinDate)
  const [referenceTime, setReferenceTime] = useState(berlinTime)
  const [workingHours, setWorkingHours] = useState('6')
  const [mode, setMode] = useState('subtract')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function calculate() {
    setLoading(true); setError(''); setPreview(null)
    try {
      const response = await httpsCallable(functions, 'previewShipmentTrackingOperatingHours')({ referenceDate, referenceTime, workingHours: Number(workingHours), mode })
      setPreview(response.data?.preview || null)
    } catch (requestError) { setError(previewErrorMessage(requestError)) } finally { setLoading(false) }
  }
  const calculateBackwards = mode === 'subtract'
  return <section className="admin-panel shipment-tracking-hours shipment-tracking-hours--preview"><div className="admin-panel__heading"><div><h2>Zeitpunkt mit Betriebszeiten prüfen</h2><p>Prüft anhand der oben gespeicherten Öffnungszeiten, wann eine Aktion fällig wäre. Es werden keine Daten verändert.</p></div></div><div className="shipment-tracking-hours__preview-inputs"><label className="form-field"><span>Ausgangsdatum</span><input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} /></label><label className="form-field"><span>Ausgangsuhrzeit</span><input type="time" value={referenceTime} onChange={(event) => setReferenceTime(event.target.value)} /></label><label className="form-field"><span>Prüfung</span><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="subtract">Zeitpunkt vorher berechnen</option><option value="latest">Letzten offenen Zeitpunkt finden</option></select></label>{calculateBackwards && <label className="form-field"><span>Arbeitsstunden vorher</span><input type="number" min="0" step="0.5" value={workingHours} onChange={(event) => setWorkingHours(event.target.value)} /></label>}</div><p className="shipment-tracking-hours__preview-help">{calculateBackwards ? 'Beispiel: 4 Arbeitsstunden vorher bedeutet: Von der Ausgangszeit vier geöffnete BPL-Stunden zurückrechnen. Nacht, Wochenende und geschlossene Ausnahmen werden übersprungen.' : 'Zeigt, bis wann BPL spätestens aktiv sein müsste, wenn der Ausgangszeitpunkt außerhalb der Betriebszeiten liegt.'}</p><div className="shipment-tracking-hours__actions"><button className="button" type="button" disabled={loading || !referenceDate || !referenceTime || (calculateBackwards && (!workingHours || Number(workingHours) < 0))} onClick={calculate}>{loading ? 'Zeitpunkt wird geprüft …' : 'Zeitpunkt prüfen'}</button></div>{error && <p className="form-error">{error}</p>}{preview && <div className="shipment-tracking-hours__preview-result"><h3>Ergebnis</h3><dl><div><dt>Ausgangszeit</dt><dd>{germanDateTime(preview.reference)}</dd></div><div><dt>Berücksichtigte Zeit</dt><dd>{preview.usedRule}</dd></div><div><dt>{calculateBackwards ? 'Errechneter Zeitpunkt' : 'Letzter offener Zeitpunkt'}</dt><dd>{germanDateTime(preview.result)}</dd></div></dl><p>{preview.explanation}</p>{preview.reasons?.length > 0 && <ul>{preview.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}</div>}</section>
}

export default function ShipmentTrackingOperatingHoursPanel() {
  const { user } = useAuth()
  const [settings, setSettings] = useState(DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS)
  const [loading, setLoading] = useState(Boolean(user))
  const [readError, setReadError] = useState('')
  const [savedSettingsKey, setSavedSettingsKey] = useState('')
  useEffect(() => {
    if (!user) return undefined
    return onSnapshot(settingsRef, (snapshot) => { setSettings(normalizeShipmentTrackingOperatingHours(snapshot.exists() ? snapshot.data() : DEFAULT_SHIPMENT_TRACKING_OPERATING_HOURS)); setLoading(false); setReadError('') }, () => { setLoading(false); setReadError('Die Betriebszeiten konnten nicht geladen werden.') })
  }, [user])
  const settingsKey = JSON.stringify(settings)
  return <ShipmentTrackingOperatingHoursEditor key={settingsKey} settings={settings} loading={loading} readError={readError} initialFeedback={savedSettingsKey === settingsKey ? 'Betriebszeiten gespeichert.' : ''} onSaved={setSavedSettingsKey} />
}

function ShipmentTrackingOperatingHoursEditor({ settings, loading, readError, initialFeedback, onSaved }) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(initialFeedback)
  const [feedbackIsError, setFeedbackIsError] = useState(false)
  const [exceptionPendingDeletion, setExceptionPendingDeletion] = useState(null)
  const validationError = useMemo(() => { try { validateShipmentTrackingOperatingHours(draft); return '' } catch (error) { return error.message } }, [draft])
  const clearFeedback = () => { setFeedback(''); setFeedbackIsError(false) }
  const updateWeekly = (key, value) => { clearFeedback(); setDraft((current) => ({ ...current, weekly: { ...current.weekly, [key]: value } })) }
  const updateException = (currentDate, nextDate, value) => { clearFeedback(); setDraft((current) => {
    const exceptions = { ...current.exceptions }
    delete exceptions[currentDate]
    if (nextDate) exceptions[nextDate] = value
    return { ...current, exceptions }
  }) }
  const addException = () => {
    const date = berlinDate()
    if (draft.exceptions[date]) { setFeedback('Für dieses Datum existiert bereits eine Ausnahme.'); setFeedbackIsError(true); return }
    clearFeedback(); setDraft((current) => ({ ...current, exceptions: { ...current.exceptions, [date]: { isOpen: false, from: null, to: null, note: '' } } }))
  }
  const deleteException = (date) => setExceptionPendingDeletion(date)
  const confirmDeleteException = () => {
    if (!exceptionPendingDeletion) return
    clearFeedback(); setDraft((current) => { const exceptions = { ...current.exceptions }; delete exceptions[exceptionPendingDeletion]; return { ...current, exceptions } })
    setExceptionPendingDeletion(null)
  }
  async function save() {
    if (validationError) return
    setSaving(true); clearFeedback()
    try { await httpsCallable(functions, 'updateShipmentTrackingOperatingHours')({ settings: draft }); onSaved(JSON.stringify(draft)); setFeedback('Betriebszeiten gespeichert.') } catch (error) { setFeedback(error?.code === 'functions/permission-denied' ? 'Keine Berechtigung zum Speichern der Betriebszeiten.' : 'Die Betriebszeiten konnten nicht gespeichert werden. Bitte erneut versuchen.'); setFeedbackIsError(true) } finally { setSaving(false) }
  }
  const exceptionEntries = Object.entries(draft.exceptions).sort(([left], [right]) => left.localeCompare(right))
  return <><ConfirmDialog open={Boolean(exceptionPendingDeletion)} title="Betriebszeit-Ausnahme löschen?" message={`Möchtest du die Ausnahme für ${exceptionPendingDeletion || ''} wirklich löschen?`} confirmLabel="Ausnahme löschen" variant="danger" onCancel={() => setExceptionPendingDeletion(null)} onConfirm={confirmDeleteException} /><section className="admin-panel shipment-tracking-hours" aria-labelledby="shipment-tracking-hours-title"><div className="admin-panel__heading"><div><h2 id="shipment-tracking-hours-title">Betriebszeiten Sendungsverfolgung</h2><p>Die spätere Sendungsverfolgungs-Automatik berücksichtigt diese Zeiten in <strong>{SHIPMENT_TRACKING_TIMEZONE}</strong>. Die Zeitzone ist in diesem Schritt fest.</p></div></div>{loading ? <p> BPL-Betriebszeiten werden geladen …</p> : readError ? <p className="form-error">{readError}</p> : <><div className="shipment-tracking-hours__week"><div className="shipment-tracking-hours__week-header"><span>Tag</span><span>Geöffnet</span><span>Von</span><span>Bis</span></div>{WEEK_DAYS.map((day) => <WeekRow key={day.key} day={day} value={draft.weekly[day.key]} onChange={(value) => updateWeekly(day.key, value)} />)}</div><section className="shipment-tracking-hours__exceptions"><div><h3>Ausnahmen für einzelne Tage</h3><p>Eine Ausnahme ersetzt die Standardzeit des jeweiligen Wochentags vollständig.</p></div>{exceptionEntries.length ? <div className="shipment-tracking-hours__exception-list">{exceptionEntries.map(([date, value]) => <ExceptionRow key={date} date={date} value={value} onChange={(nextDate, nextValue) => updateException(date, nextDate, nextValue)} onDelete={deleteException} />)}</div> : <p className="shipment-tracking-hours__empty">Noch keine Ausnahmen angelegt.</p>}<button className="button button--secondary" type="button" onClick={addException}>Ausnahme hinzufügen</button></section>{(validationError || feedback) && <p className={validationError || feedbackIsError ? 'form-error' : 'shipment-tracking-hours__success'}>{validationError || feedback}</p>}<div className="shipment-tracking-hours__actions"><button className="button" type="button" disabled={saving || Boolean(validationError)} onClick={save}>{saving ? 'Wird gespeichert …' : 'Betriebszeiten speichern'}</button></div></>}</section><RulePreview /></>
}
