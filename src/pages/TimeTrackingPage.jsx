import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { canEdit } from '../lib/permissions.js'
import { addDays, berlinTimestamp, correctTimeDay, formatTime, listTimeWorkspace, localTimeValue, minutesLabel, monthRange, stampTime, TIME_ACTIONS, TIME_REASONS, timeDate, timeError, weekRange } from '../lib/timeTracking.js'
import TimeAppAccess from '../components/time/TimeAppAccess.jsx'
import '../styles/timeTracking.css'

function DayCorrection({ day, userId, onClose, onSaved }) {
  const { user: actor } = useAuth()
  const [events, setEvents] = useState(() => (day.events || []).map(event => ({ ...event, time: localTimeValue(event.at) })))
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(day.revision || 0)
  const [conflict, setConflict] = useState(false)
  const titleId = 'time-correction-title'
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const node = dialog.current
    node.showModal()
    return () => { node.close(); previous?.focus?.() }
  }, [])

  async function save(event) {
    event.preventDefault()
    setError('')
    if (!navigator.onLine) return setError('Korrekturen sind nur mit Internetverbindung möglich.')
    setSaving(true)
    try {
      await correctTimeDay({ expectedUserId: actor.uid, userId, date: day.date, reason, note, expectedRevision: revision, events: events.map(item => ({ id: item.id, type: item.type, at: item.at && item.time === localTimeValue(item.at) ? item.at : berlinTimestamp(day.date, item.time) })) })
      await onSaved()
      onClose()
    } catch (failure) {
      setError(timeError(failure))
      if (failure?.code === 'functions/aborted') { setConflict(true); await onSaved().catch(() => {}) }
    }
    finally { setSaving(false) }
  }

  return <dialog ref={dialog} className="time-dialog" aria-labelledby={titleId} onCancel={event => { if (saving) event.preventDefault(); else onClose() }}>
    <form onSubmit={save} className="time-correction-form">
      <header><h2 id={titleId}>Buchungen für {new Date(`${day.date}T12:00:00`).toLocaleDateString('de-DE')}</h2><button className="button button--secondary" type="button" disabled={saving} onClick={onClose} aria-label="Schließen">×</button></header>
      <p className="time-muted">Nachträge und Änderungen werden mit Grund, Bearbeiter und Zeitpunkt protokolliert.</p>
      {events.map((item, index) => <div className="time-correction-row" key={item.id}>
        <label>Aktion<select value={item.type} disabled={saving} onChange={event => setEvents(current => current.map((value, i) => i === index ? { ...value, type: event.target.value } : value))}>{Object.entries(TIME_ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Uhrzeit<input required type="time" value={item.time} disabled={saving} onChange={event => setEvents(current => current.map((value, i) => i === index ? { ...value, time: event.target.value } : value))} /></label>
        <button className="button button--secondary" type="button" disabled={saving} onClick={() => setEvents(current => current.filter((_, i) => i !== index))} aria-label={`Buchung ${index + 1} entfernen`}>Entfernen</button>
      </div>)}
      <button type="button" className="button button--secondary" disabled={saving || events.length >= 48} onClick={() => setEvents(current => [...current, { id: crypto.randomUUID(), type: current.length ? 'go' : 'come', time: '' }])}>Buchung hinzufügen</button>
      <label>Grund<select required value={reason} disabled={saving} onChange={event => setReason(event.target.value)}><option value="">Bitte auswählen</option>{Object.entries(TIME_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Hinweis (optional)<textarea rows="2" maxLength="1000" value={note} disabled={saving} onChange={event => setNote(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {conflict && <button className="button button--secondary" type="button" disabled={saving} onClick={async () => {
        setSaving(true)
        try {
          const fresh = await onSaved()
          const current = [...(fresh?.days || []), ...(fresh?.unresolvedDays || [])].find(value => value.date === day.date)
          if (!current) throw new Error('Der Buchungstag konnte nicht geladen werden.')
          setEvents((current.events || []).map(value => ({ ...value, time: localTimeValue(value.at) })))
          setRevision(current.revision || 0); setConflict(false); setError('')
        } catch (failure) { setError(timeError(failure)) }
        finally { setSaving(false) }
      }}>Eigene Änderungen verwerfen und aktuellen Stand laden</button>}
      <footer><button className="button button--secondary" type="button" disabled={saving} onClick={onClose}>Abbrechen</button><button className="button" disabled={saving || conflict}>{saving ? 'Wird gespeichert …' : 'Korrektur speichern'}</button></footer>
    </form>
  </dialog>
}

function MissingStampReminder({ day, onEdit, onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const node = dialog.current
    node.showModal()
    return () => { node.close(); previous?.focus?.() }
  }, [])
  return <dialog ref={dialog} className="time-dialog time-reminder" aria-labelledby="time-forgotten-title" onCancel={onClose}><h2 id="time-forgotten-title">Frühere Buchung ist unvollständig</h2><p>Dein heutiger Arbeitsstart ist gespeichert. Bitte ergänze die fehlenden Buchungen vom {new Date(`${day.date}T12:00:00`).toLocaleDateString('de-DE')}.</p><div className="time-toolbar-fields"><button className="button" type="button" onClick={onEdit}>Jetzt nachtragen</button><button className="button button--secondary" type="button" onClick={onClose}>Später</button></div></dialog>
}

export function TimeWorkspace({ managed = false }) {
  const { user, profile } = useAuth()
  const [month, setMonth] = useState(() => timeDate().slice(0, 7))
  const [selectedUser, setSelectedUser] = useState('')
  const [workspace, setWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)
  const [forgotten, setForgotten] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [refresh, setRefresh] = useState(0)
  const requestId = useRef(0)
  const today = timeDate()
  const range = monthRange(month)
  const thisWeek = weekRange(today)
  const queryFrom = month === today.slice(0, 7) && thisWeek.from < range.from ? thisWeek.from : range.from
  const queryTo = month === today.slice(0, 7) && thisWeek.to > range.to ? thisWeek.to : range.to
  const targetUser = managed ? selectedUser || undefined : undefined

  const load = useCallback(async () => {
    const id = ++requestId.current
    try {
      const result = await listTimeWorkspace({ ...(targetUser ? { userId: targetUser } : {}), managed, from: queryFrom, to: queryTo })
      if (id === requestId.current) { setWorkspace(result); setError('') }
      return result
    } catch (failure) {
      if (id === requestId.current) setError(timeError(failure))
      throw failure
    } finally { if (id === requestId.current) setLoading(false) }
  }, [targetUser, managed, queryFrom, queryTo])

  useEffect(() => { void load().catch(() => {}); return () => { requestId.current += 1 } }, [load, refresh])
  useEffect(() => {
    const connected = () => { setOnline(true); setRefresh(value => value + 1) }
    const disconnected = () => setOnline(false)
    const focused = () => { if (navigator.onLine && !document.hidden) setRefresh(value => value + 1) }
    window.addEventListener('online', connected)
    window.addEventListener('offline', disconnected)
    window.addEventListener('focus', focused)
    document.addEventListener('visibilitychange', focused)
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected); window.removeEventListener('focus', focused); document.removeEventListener('visibilitychange', focused) }
  }, [])
  // Only today's view needs a periodic server refresh; no browser timer is stored as time data.
  useEffect(() => {
    if (managed || !online || month !== today.slice(0, 7)) return
    const timer = window.setInterval(() => { setRefresh(value => value + 1) }, 60000)
    return () => window.clearInterval(timer)
  }, [managed, online, month, today])

  const days = workspace?.days || []
  const selectedDays = days.filter(day => day.date >= range.from && day.date <= range.to)
  const todayDay = days.find(day => day.date === today)
  const status = todayDay?.status || 'away'
  const weekDays = days.filter(day => day.date >= thisWeek.from && day.date <= thisWeek.to)
  const sum = (items, key) => items.reduce((total, day) => total + (Number(day[key]) || 0), 0)
  const ownView = !managed || (workspace?.user?.id === user.uid)
  const incomplete = workspace?.unresolvedDays || days.filter(day => day.date < today && day.incomplete)
  const pendingSelection = managed && selectedUser && workspace?.user?.id !== selectedUser
  const viewUnavailable = loading || busy || !online || pendingSelection || Boolean(error)
  const ownEditable = canEdit(profile, 'timeTracking')
  const canManageSelected = managed && (profile?.role === 'superadmin' || profile?.timeManager === true && (profile.timeManagerAllDepartments === true || profile.timeManagerDepartments?.includes(workspace?.user?.departmentId)))
  const canCorrect = date => date <= today && (canManageSelected || ownView && ownEditable && date >= addDays(today, -7))

  async function stamp(type) {
    if (!online) return
    setBusy(true)
    setError('')
    try {
      await stampTime({ expectedUserId: user.uid, eventId: crypto.randomUUID(), type, at: new Date().toISOString(), offline: false })
      const result = await load()
      if (type === 'come') setForgotten([...(result?.unresolvedDays || result?.days || [])].reverse().find(day => day.date < today && day.incomplete) || null)
    } catch (failure) { setError(timeError(failure)) }
    finally { setBusy(false) }
  }

  function changeMonth(value) { if (/^\d{4}-\d{2}$/.test(value)) { setLoading(true); setMonth(value) } }

  return <div className="time-page">
    <div className="time-toolbar"><div><h2>{managed ? 'Zeitmanagement' : 'Meine Arbeitszeit'}</h2><p className="time-muted">{managed ? 'Buchungen prüfen und nachvollziehbar korrigieren.' : 'Arbeitszeit, Pausen und Zeitkonto im Blick.'}</p></div><div className="time-toolbar-fields">
      {managed && <label>Mitarbeiter<select value={selectedUser || workspace?.user?.id || ''} disabled={busy} onChange={event => { setLoading(true); setSelectedUser(event.target.value) }}>{(workspace?.employees || []).map(employee => <option key={employee.id} value={employee.id}>{[employee.firstName, employee.lastName].filter(Boolean).join(' ') || employee.id}</option>)}</select></label>}
      <label>Monat<input type="month" value={month} onChange={event => changeMonth(event.target.value)} /></label>{!managed && <TimeAppAccess />}<button type="button" className="button button--secondary" disabled={loading || busy || !online} onClick={() => { setLoading(true); setRefresh(value => value + 1) }}>Aktualisieren</button>
    </div></div>
    {!online && <p className="time-notice" role="status">Keine Internetverbindung. Im Web sind Buchungen und Korrekturen nur online möglich. Offline stempeln kannst du in der installierten PWA.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {workspace && !pendingSelection && <>
      {!workspace.account?.startDate && <p className="time-notice">Das Zeitkonto ist noch nicht eingerichtet. Bitte den Superadmin kontaktieren.</p>}
      <section className="time-summary" aria-label="Zeitübersicht">
        <div className="time-card"><span>Zeitkonto gesamt</span><strong className={workspace.balanceMinutes < 0 ? 'time-negative' : 'time-positive'}>{minutesLabel(workspace.balanceMinutes, true)} <small>Std.</small></strong><span>Seit {workspace.account?.startDate ? new Date(`${workspace.account.startDate}T12:00:00`).toLocaleDateString('de-DE') : '—'} · Anfangssaldo {minutesLabel(workspace.account?.openingBalanceMinutes, true)}</span>{workspace.balanceProvisional && <span className="time-warning">Vorläufig: Ungeklärte Buchungen oder fehlende Vorgaben sind noch nicht eingerechnet.</span>}</div>
        <div className="time-card"><span>{month === today.slice(0, 7) ? 'Diese Woche' : 'Ausgewählter Monat'}</span><strong>{minutesLabel(sum(month === today.slice(0, 7) ? weekDays : selectedDays, 'creditedMinutes'))} <small>/ {minutesLabel(sum(month === today.slice(0, 7) ? weekDays : selectedDays, 'targetMinutes'))} Std.</small></strong><span>Angerechnete Zeit / Sollzeit</span></div>
        <div className="time-card"><span>Monat · bisheriger Saldo</span><strong className={sum(selectedDays.filter(day => day.date <= today && !day.incomplete && !day.calculationIncomplete), 'balanceMinutes') < 0 ? 'time-negative' : 'time-positive'}>{minutesLabel(sum(selectedDays.filter(day => day.date <= today && !day.incomplete && !day.calculationIncomplete), 'balanceMinutes'), true)} <small>Std.</small></strong><span>{minutesLabel(sum(selectedDays, 'creditedMinutes'))} angerechnet / {minutesLabel(sum(selectedDays, 'targetMinutes'))} Soll</span><span>Überstundenabbau bisher: {minutesLabel(sum(selectedDays.filter(day => day.date <= today), 'overtimeDebitMinutes'))} Std.</span></div>
      </section>
      {!managed && month === today.slice(0, 7) && <section className="time-stamp-panel time-card"><div><h3>Heute · {new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' })}</h3><span className={`time-status time-status--${status}`}>{status === 'working' ? 'Bei der Arbeit' : status === 'break' ? 'In Pause' : 'Ausgestempelt'}</span></div><div className="time-stamp-buttons">
        <button type="button" className="button" disabled={viewUnavailable || !ownEditable || status !== 'away' || !workspace.account?.startDate} onClick={() => stamp('come')}>▶ Einstempeln</button>
        <button type="button" className="button button--secondary" disabled={viewUnavailable || !ownEditable || status === 'away'} onClick={() => stamp(status === 'break' ? 'pause_end' : 'pause_start')}>☕ {status === 'break' ? 'Pause beenden' : 'Pause starten'}</button>
        <button type="button" className="button button--secondary" disabled={viewUnavailable || !ownEditable || status === 'away'} onClick={() => stamp('go')}>↪ Ausstempeln</button>
      </div><div className="time-today-events">{todayDay?.events?.length ? todayDay.events.map(event => <span key={event.id}><strong>{formatTime(event.at)}</strong> {TIME_ACTIONS[event.type]}{event.source === 'offline' ? ' · offline erfasst' : ''}</span>) : <span>Noch keine Buchung heute.</span>}</div></section>}
      {incomplete.length > 0 && <div className="time-notice"><strong>{incomplete.length} unvollständige{incomplete.length === 1 ? 'r Tag' : ' Tage'}</strong><span> Fehlende Buchungen bleiben zur Klärung markiert. Arbeitszeit wird nicht über Nacht fortgeschrieben.</span></div>}
      <section className="time-card time-table-card"><header><h3>Tagesübersicht</h3><span className="time-muted">{ownView ? 'Eigene Korrekturen: heute und die vergangenen 7 Kalendertage.' : 'Korrekturen im zugewiesenen Zuständigkeitsbereich.'}</span></header><div className="time-table-scroll"><table className="data-table"><thead><tr><th>Tag</th><th>Buchungen</th><th>Arbeit</th><th>Pause gebucht</th><th>Zusatzabzug</th><th>Angerechnet</th><th>Soll</th><th>Überstundenabbau</th><th>Saldo</th><th>Hinweise</th><th><span className="sr-only">Bearbeiten</span></th></tr></thead><tbody>
        {selectedDays.map(day => <tr key={day.date}><td>{new Date(`${day.date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td><td className="time-event-cell">{day.events?.length ? day.events.map(event => <span key={event.id}>{formatTime(event.at)} {TIME_ACTIONS[event.type]}{event.source === 'offline' ? ' (offline)' : ''}</span>) : '—'}</td><td>{minutesLabel(day.workedMinutes)}</td><td>{minutesLabel(day.bookedBreakMinutes)}</td><td>{minutesLabel(day.automaticBreakMinutes)}</td><td>{day.calculationIncomplete ? '—' : minutesLabel(day.creditedMinutes)}</td><td>{day.calculationIncomplete ? '—' : minutesLabel(day.targetMinutes)}</td><td>{minutesLabel(day.overtimeDebitMinutes)}{day.overtimeDebitMinutes > 0 && <span className="time-issue">Genehmigter Freizeitausgleich</span>}</td><td className={day.balanceMinutes < 0 ? 'time-negative' : ''}>{day.date <= today && !day.incomplete && !day.calculationIncomplete ? minutesLabel(day.balanceMinutes, true) : '—'}</td><td>{day.incomplete && <span className="time-status">Unvollständig</span>}{(day.issues || []).map((issue, i) => <span className="time-issue" key={i}>{typeof issue === 'string' ? issue : issue.message || 'Bitte prüfen'}</span>)}{(workspace.history || []).some(item => item.date === day.date) && <span className="time-issue">Nachtrag / Korrektur · siehe Verlauf</span>}</td><td><button className="button button--secondary" type="button" disabled={viewUnavailable || !canCorrect(day.date)} onClick={() => setEditing(day)}>Bearbeiten</button></td></tr>)}
        {!selectedDays.length && <tr><td colSpan="11">Keine Zeitdaten für diesen Zeitraum.</td></tr>}
      </tbody></table></div></section>
      <section className="time-card"><h3>Änderungsverlauf</h3><p className="time-muted">Nachträge und Korrekturen: {(workspace.history || []).length} im geladenen Verlauf.</p><div className="time-history">{(workspace.history || []).map(item => <article key={item.id}><strong>{item.date || item.day || 'Änderung'} · {TIME_REASONS[item.reason] || item.reason || item.type || 'Buchung'}</strong><span>{item.createdByName || item.actorName || item.createdBy || item.actorId || '—'} · {item.createdAt ? new Date(typeof item.createdAt === 'string' ? item.createdAt : item.createdAt._seconds * 1000).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'}</span>{item.note && <span>{item.note}</span>}{(item.before || item.after) && <details><summary>Vorher / Nachher</summary><p>Vorher: {(item.before?.events || item.before || []).map(event => `${formatTime(event.at)} ${TIME_ACTIONS[event.type]}`).join(', ') || 'Keine Buchungen'}</p><p>Nachher: {(item.after?.events || item.after || []).map(event => `${formatTime(event.at)} ${TIME_ACTIONS[event.type]}`).join(', ') || 'Keine Buchungen'}</p></details>}</article>)}{!workspace.history?.length && <p className="time-muted">Keine Änderungen vorhanden.</p>}</div></section>
    </>}
    {loading && <p role="status" className="time-muted">Zeitdaten werden geladen …</p>}
    {editing && <DayCorrection key={`${workspace?.user?.id}-${editing.date}`} day={editing} userId={workspace?.user?.id} onClose={() => setEditing(null)} onSaved={load} />}
    {forgotten && <MissingStampReminder day={forgotten} onEdit={() => { if (canCorrect(forgotten.date)) { setEditing(forgotten); setForgotten(null) } else { setError('Diese Buchung liegt außerhalb deiner Korrekturfrist. Bitte den Zeitmanager kontaktieren.'); setForgotten(null) } }} onClose={() => setForgotten(null)} />}
  </div>
}

export default function TimeTrackingPage() {
  return <TimeWorkspace />
}
