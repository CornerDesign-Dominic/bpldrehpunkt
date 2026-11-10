import { useCallback, useEffect, useRef, useState } from 'react'
import TimeWorkModelEditor from '../components/time/TimeWorkModelEditor.jsx'
import TimeWorkModelTemplateManager from '../components/time/TimeWorkModelTemplateManager.jsx'
import { listTimeWorkspace, listTimeWorkModelTemplates, minutesLabel, saveTimeAccount, timeDate, timeError } from '../lib/timeTracking.js'
import '../styles/timeTracking.css'

const weekdayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
function durationMinutes(value) {
  if (!/^\d{1,5}:[0-5]\d$/.test(value)) throw new Error('Bitte Zeiten im Format Stunden:Minuten angeben, z. B. 08:00.')
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}
function blankModel(userId) {
  return { userId, validFrom: timeDate(), validTo: '', holidayCountryCode: 'DE', holidaySubdivisionCode: '', weekdays: Object.fromEntries(weekdayOrder.map(day => [day, { targetMinutes: 0, breaks: [] }])) }
}
function OpeningAccount({ userId, account, onSaved }) {
  const [startDate, setStartDate] = useState(account?.startDate || timeDate())
  const [balance, setBalance] = useState(minutesLabel(account?.openingBalanceMinutes || 0))
  const [negative, setNegative] = useState((account?.openingBalanceMinutes || 0) < 0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setSaving(true); setSaved(false); setError('')
    try {
      await saveTimeAccount({ userId, startDate, openingBalanceMinutes: durationMinutes(balance.replace(/^−/, '')) * (negative ? -1 : 1) })
      await onSaved()
      setSaved(true)
    } catch (failure) { setError(timeError(failure)) }
    finally { setSaving(false) }
  }
  return <section className="time-card"><h3>Zeitkonto · Beginn und Übernahme</h3><p className="time-muted">Der Anfangssaldo übernimmt Plus- oder Minusstunden aus dem bisherigen System. Standard ist 00:00. Änderungen wirken auf den gesamten Kontostand.</p><form className="time-account-form" onSubmit={submit}><label>Startdatum<input type="date" required value={startDate} disabled={saving} onChange={event => setStartDate(event.target.value)} /></label><label>Übernahme<select value={negative ? 'minus' : 'plus'} disabled={saving} onChange={event => setNegative(event.target.value === 'minus')}><option value="plus">Plusstunden</option><option value="minus">Minusstunden</option></select></label><label>Stunden:Minuten<input type="text" pattern="[0-9]{1,5}:[0-5][0-9]" required value={balance.replace(/^−/, '')} disabled={saving} onChange={event => setBalance(event.target.value)} /></label><button className="button" disabled={saving || !navigator.onLine}>{saving ? 'Wird gespeichert …' : 'Zeitkonto speichern'}</button></form>{error && <p className="form-error" role="alert">{error}</p>}{saved && <p role="status" className="time-positive">Zeitkonto gespeichert.</p>}</section>
}

export default function TimeWorkModelsPage() {
  const [userId, setUserId] = useState('')
  const [workspace, setWorkspace] = useState(null)
  const [editing, setEditing] = useState(null)
  const [templates, setTemplates] = useState([])
  const [templateManager, setTemplateManager] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const loadTemplates = useCallback(async () => {
    try { const result = await listTimeWorkModelTemplates(); setTemplates(result.templates || []); setTemplateError(''); return result }
    catch (failure) { setTemplateError(timeError(failure)); throw failure }
  }, [])
  useEffect(() => {
    let active = true
    listTimeWorkModelTemplates()
      .then(result => { if (active) { setTemplates(result.templates || []); setTemplateError('') } })
      .catch(failure => { if (active) setTemplateError(timeError(failure)) })
    return () => { active = false }
  }, [])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const requestId = useRef(0)
  const load = useCallback(async () => {
    const id = ++requestId.current
    try {
      const result = await listTimeWorkspace(userId ? { userId } : {})
      if (id === requestId.current) { setWorkspace(result); setError('') }
    } catch (failure) { if (id === requestId.current) setError(timeError(failure)); throw failure }
    finally { if (id === requestId.current) setLoading(false) }
  }, [userId])
  useEffect(() => { void load().catch(() => {}); return () => { requestId.current += 1 } }, [load])
  const pending = loading || Boolean(userId && workspace?.user?.id !== userId)
  const selectedUser = workspace?.user?.id

  return <div className="time-page"><div className="time-toolbar"><div><h2>Arbeitszeitmodelle</h2><p className="time-muted">Arbeitszeitvorgaben und Anfangssaldo · ausschließlich für Superadmins.</p></div><label>Mitarbeiter<select value={userId || selectedUser || ''} disabled={loading} onChange={event => { setLoading(true); setUserId(event.target.value) }}>{(workspace?.employees || []).map(employee => <option value={employee.id} key={employee.id}>{[employee.firstName, employee.lastName].filter(Boolean).join(' ') || employee.id}</option>)}</select></label></div>
    {error && <p className="form-error" role="alert">{error}</p>}{templateError && <p className="form-error" role="alert">Vorlagen konnten nicht geladen werden: {templateError}</p>}{loading && <p role="status">Arbeitszeitmodelle werden geladen …</p>}
    {workspace && !pending && <><OpeningAccount key={`${selectedUser}-${workspace.account?.startDate}-${workspace.account?.openingBalanceMinutes}`} userId={selectedUser} account={workspace.account} onSaved={load} /><section className="time-card"><header className="time-toolbar"><h3>Gültigkeitszeiträume</h3><button className="button button--secondary" type="button" disabled={!navigator.onLine} onClick={() => { setTemplateManager(true); void loadTemplates().catch(() => {}) }}>Vorlagen verwalten</button><button type="button" className="button" disabled={!navigator.onLine} onClick={() => setEditing(blankModel(selectedUser))}>Modell hinzufügen</button></header><div className="time-model-list">{(workspace.models || []).slice().sort((a, b) => a.validFrom.localeCompare(b.validFrom)).map(model => <article key={model.id}><div><strong>{model.validFrom} – {model.validTo || 'Unbefristet'}</strong><span className="time-muted">Sollzeit pro Woche: {minutesLabel(Object.values(model.weekdays || {}).reduce((sum, day) => sum + (Number(day.targetMinutes) || 0), 0))} Std. · Feiertage: {model.holidayCountryCode || 'DE'}{model.holidaySubdivisionCode ? ` / ${model.holidaySubdivisionCode}` : ''}</span><div className="time-model-week">{weekdayOrder.map(day => <div key={day}><span>{weekdayNames[day].slice(0, 2)}</span><strong>{minutesLabel(model.weekdays?.[day]?.targetMinutes)}</strong><small>{model.weekdays?.[day]?.breaks?.length || 0} Pausenstufen</small></div>)}</div></div><button type="button" className="button button--secondary" disabled={!navigator.onLine} onClick={() => setEditing(model)}>Bearbeiten</button></article>)}{!workspace.models?.length && <p className="time-muted">Noch kein Arbeitszeitmodell hinterlegt. Lege einen Zeitraum mit Sollstunden und Pausenregeln an.</p>}</div></section></>}
    {editing && <TimeWorkModelEditor model={editing} templates={templates} onClose={() => setEditing(null)} onSaved={load} onTemplatesChanged={loadTemplates} />}
    {templateManager && <TimeWorkModelTemplateManager templates={templates} onClose={() => setTemplateManager(false)} onChanged={loadTemplates} />}
  </div>
}
