import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { canEdit } from '../lib/permissions.js'
import { addDays, formatTime, listTimeWorkspace, minutesLabel, monthRange, stampTime, TIME_ACTIONS, TIME_REASONS, timeDate, timeError, weekRange } from '../lib/timeTracking.js'
import TimeAppAccess from '../components/time/TimeAppAccess.jsx'
import TimeBookings from '../components/time/TimeBookings.jsx'
import TimeMonthSummary from '../components/time/TimeMonthSummary.jsx'
import TimeWeekOverview from '../components/time/TimeWeekOverview.jsx'
import TimeBookingEditor, { TimeDayBookings } from '../components/time/TimeBookingEditor.jsx'
import '../styles/moduleSections.css'
import '../styles/timeTracking.css'

async function loadTimeViews(targetUser, managed, month, today, weekStart) {
  const range = monthRange(month)
  const { from: weekFrom, to: weekTo } = weekRange(today)
  const currentMonth = monthRange(today.slice(0, 7))
  const contextFrom = currentMonth.from < weekFrom ? currentMonth.from : weekFrom
  const contextTo = currentMonth.to > weekTo ? currentMonth.to : weekTo
  const queryFrom = month === today.slice(0, 7) && weekFrom < range.from ? weekFrom : range.from
  const queryTo = month === today.slice(0, 7) && weekTo > range.to ? weekTo : range.to
  const selectedWeek = weekRange(weekStart || today)
  const inside = (from, to) => selectedWeek.from >= from && selectedWeek.to <= to
  const [monthWorkspace, currentWeek, selected] = await Promise.all([
    listTimeWorkspace({ ...(targetUser ? { userId: targetUser } : {}), managed, ownOnly: !managed, from: queryFrom, to: queryTo }),
    !managed && (contextFrom < queryFrom || contextTo > queryTo) ? listTimeWorkspace({ ownOnly: true, from: contextFrom, to: contextTo }) : null,
    !managed && !inside(queryFrom, queryTo) && !inside(contextFrom, contextTo) ? listTimeWorkspace({ ownOnly: true, from: selectedWeek.from, to: selectedWeek.to }) : null,
  ])
  return { ...monthWorkspace, days: [...new Map([...monthWorkspace.days, ...(currentWeek?.days || []), ...(selected?.days || [])].map(day => [day.date, day])).values()] }
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
  const [tab, setTab] = useState('week')
  const [weekStart, setWeekStart] = useState(null)
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
  const selectedWeekFrom = weekStart || thisWeek.from
  const targetUser = managed ? selectedUser || undefined : undefined

  const load = useCallback(async () => {
    const id = ++requestId.current
    try {
      const result = await loadTimeViews(targetUser, managed, month, today, weekStart)
      if (id === requestId.current) { setWorkspace(result); setError('') }
      return result
    } catch (failure) {
      if (id === requestId.current) setError(timeError(failure))
      throw failure
    } finally { if (id === requestId.current) setLoading(false) }
  }, [targetUser, managed, month, today, weekStart])

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
    if (managed || !online) return
    const timer = window.setInterval(() => { setRefresh(value => value + 1) }, 60000)
    return () => window.clearInterval(timer)
  }, [managed, online, month, today])

  const days = workspace?.days || []
  const selectedDays = days.filter(day => day.date >= range.from && day.date <= range.to)
  const todayDay = days.find(day => day.date === today)
  const status = todayDay?.status || 'away'
  const currentMonthDays = days.filter(day => day.date >= `${today.slice(0, 7)}-01` && day.date <= today)
  const currentWeekDays = days.filter(day => day.date >= thisWeek.from && day.date <= thisWeek.to)
  const weekDays = days.filter(day => day.date >= selectedWeekFrom && day.date <= addDays(selectedWeekFrom, 6))
  const visibleDays = !managed && tab === 'week' ? weekDays : selectedDays
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
    <div className="time-toolbar"><div>{managed && <><h2>Zeitmanagement</h2><p className="time-muted">Buchungen prüfen und nachvollziehbar korrigieren.</p></>}</div><div className="time-toolbar-fields">
      {managed && <label>Mitarbeiter<select value={selectedUser || workspace?.user?.id || ''} disabled={busy} onChange={event => { setLoading(true); setSelectedUser(event.target.value) }}>{(workspace?.employees || []).map(employee => <option key={employee.id} value={employee.id}>{[employee.firstName, employee.lastName].filter(Boolean).join(' ') || employee.id}</option>)}</select></label>}
      {managed && <label>Monat<input type="month" value={month} onChange={event => changeMonth(event.target.value)} /></label>}{!managed && <TimeAppAccess />}<button type="button" className="button button--secondary" disabled={loading || busy || !online} onClick={() => { setLoading(true); setRefresh(value => value + 1) }}>Aktualisieren</button>
    </div></div>
    {!online && <p className="time-notice" role="status">Keine Internetverbindung. Im Web sind Buchungen und Korrekturen nur online möglich. Offline stempeln kannst du in der installierten PWA.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {workspace && !pendingSelection && <>
      {!workspace.account?.startDate && <p className="time-notice">Das Zeitkonto ist noch nicht eingerichtet. Bitte den Superadmin kontaktieren.</p>}
      {!managed ? <section className="time-summary time-summary--simple" aria-label="Zeitübersicht">
        <div className="time-card"><span>Diese Woche</span><strong>{minutesLabel(sum(currentWeekDays.filter(day => day.date <= today), 'creditedMinutes'))} <small>Std.</small></strong></div>
        <div className="time-card"><span>Dieser Monat</span><strong>{minutesLabel(sum(currentMonthDays, 'creditedMinutes'))} <small>Std.</small></strong></div>
        <div className="time-card"><span>Gesamt{workspace.balanceProvisional && <span className="time-summary-info" role="img" aria-label="Vorläufiger Kontostand" title="Vorläufig: Ungeklärte Buchungen oder fehlende Vorgaben sind noch nicht eingerechnet."> ⓘ</span>}</span><strong>{minutesLabel(workspace.balanceMinutes, true)} <small>Std.</small></strong></div>
      </section> : <>
      <section className="time-summary" aria-label="Zeitübersicht">
        <div className="time-card"><span>Zeitkonto gesamt</span><strong className={workspace.balanceMinutes < 0 ? 'time-negative' : 'time-positive'}>{minutesLabel(workspace.balanceMinutes, true)} <small>Std.</small></strong><span>Seit {workspace.account?.startDate ? new Date(`${workspace.account.startDate}T12:00:00`).toLocaleDateString('de-DE') : '—'} · Anfangssaldo {minutesLabel(workspace.account?.openingBalanceMinutes, true)}</span>{workspace.balanceProvisional && <span className="time-warning">Vorläufig: Ungeklärte Buchungen oder fehlende Vorgaben sind noch nicht eingerechnet.</span>}</div>
        <div className="time-card"><span>{!managed ? 'Diese Woche' : 'Ausgewählter Monat'}</span><strong>{minutesLabel(sum(!managed ? weekDays : selectedDays, 'creditedMinutes'))} <small>/ {minutesLabel(sum(!managed ? weekDays : selectedDays, 'targetMinutes'))} Std.</small></strong><span>Angerechnete Zeit / Sollzeit</span></div>
        <div className="time-card"><span>Monat · bisheriger Saldo</span><strong className={sum(selectedDays.filter(day => day.date <= today && !day.incomplete && !day.calculationIncomplete), 'balanceMinutes') < 0 ? 'time-negative' : 'time-positive'}>{minutesLabel(sum(selectedDays.filter(day => day.date <= today && !day.incomplete && !day.calculationIncomplete), 'balanceMinutes'), true)} <small>Std.</small></strong><span>{minutesLabel(sum(selectedDays, 'creditedMinutes'))} angerechnet / {minutesLabel(sum(selectedDays, 'targetMinutes'))} Soll</span><span>Überstundenabbau bisher: {minutesLabel(sum(selectedDays.filter(day => day.date <= today), 'overtimeDebitMinutes'))} Std.</span></div>
      </section>
      </>}
      {!managed && <section className="time-stamp-panel time-card time-stamp-panel--focus"><div><h3>Heute · {new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' })}</h3><span className={`time-status time-status--${status}`} role="status" aria-live="polite" aria-atomic="true"><span className="time-status-symbol" aria-hidden="true">{status === 'break' ? 'Ⅱ' : status === 'working' ? '●' : '○'}</span> {status === 'working' ? 'Bei der Arbeit' : status === 'break' ? 'Pause läuft' : 'Ausgestempelt'}</span></div><div className="time-stamp-buttons">
        <button type="button" className="button" disabled={viewUnavailable || !ownEditable || status !== 'away' || !workspace.account?.startDate} onClick={() => stamp('come')}><span aria-hidden="true">▶</span> Einstempeln</button>
        <button type="button" className={`button button--secondary${status === 'break' ? ' time-stamp-resume' : ''}`} disabled={viewUnavailable || !ownEditable || status === 'away'} onClick={() => stamp(status === 'break' ? 'pause_end' : 'pause_start')}><span aria-hidden="true">{status === 'break' ? '▶' : 'Ⅱ'}</span> {status === 'break' ? 'Pause beenden' : 'Pause starten'}</button>
        <button type="button" className="button button--secondary" disabled={viewUnavailable || !ownEditable || status === 'away'} onClick={() => stamp('go')}><span aria-hidden="true">↪</span> Ausstempeln</button>
      </div></section>}
      {!managed && <div className="module-sections__tabs time-tabs" role="tablist" aria-label="Arbeitszeitansichten">{[['week', 'Aktuelle Woche'], ['month', 'Monatsübersicht'], ['bookings', 'Alle Buchungen']].map(([value, label], index, tabs) => <button key={value} type="button" role="tab" id={`time-tab-${value}`} aria-controls="time-tab-panel" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} className={`module-sections__tab${tab === value ? ' module-sections__tab--active' : ''}`} onClick={() => setTab(value)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
        if (next >= 0) { event.preventDefault(); setTab(tabs[next][0]); document.getElementById(`time-tab-${tabs[next][0]}`)?.focus() }
      }}>{label}</button>)}</div>}
      <div id={!managed ? 'time-tab-panel' : undefined} role={!managed ? 'tabpanel' : undefined} aria-labelledby={!managed ? `time-tab-${tab}` : undefined} className="time-tab-content">
      {!managed && tab === 'bookings' ? <TimeBookings key={user.uid} /> : <>
      {!managed && tab === 'month' && <div className="time-toolbar"><h3>Monatsübersicht</h3><label>Monat<input type="month" value={month} onChange={event => changeMonth(event.target.value)} /></label></div>}
      {!managed && tab === 'month' ? <TimeMonthSummary days={selectedDays} today={today} /> : <>
      {incomplete.length > 0 && <div className="time-notice"><strong>{incomplete.length} unvollständige{incomplete.length === 1 ? 'r Tag' : ' Tage'}</strong><span> Fehlende Buchungen bleiben zur Klärung markiert. Arbeitszeit wird nicht über Nacht fortgeschrieben.</span></div>}
      {!managed ? <TimeWeekOverview days={weekDays} from={selectedWeekFrom} today={today} navigationDisabled={loading || busy || !online} onWeekChange={value => { if (value === selectedWeekFrom) return; setLoading(true); setWeekStart(value === thisWeek.from ? null : value) }} disabled={viewUnavailable} canCorrect={canCorrect} onEdit={(day, event) => setEditing({ day, event })} /> : <section className="time-card time-table-card"><header><h3>{!managed && tab === 'week' ? `Aktuelle Woche · ${new Date(`${thisWeek.from}T12:00:00Z`).toLocaleDateString('de-DE')} – ${new Date(`${thisWeek.to}T12:00:00Z`).toLocaleDateString('de-DE')}` : 'Tagesübersicht'}</h3><span className="time-muted">{ownView ? 'Eigene Korrekturen: heute und die vergangenen 7 Kalendertage.' : 'Korrekturen im zugewiesenen Zuständigkeitsbereich.'}</span></header><div className="time-table-scroll"><table className="data-table"><thead><tr><th>Tag</th><th>Buchungen</th><th>Arbeit</th><th>Pause gebucht</th><th>Zusatzabzug</th><th>Angerechnet</th><th>Soll</th><th>Überstundenabbau</th><th>Saldo</th><th>Hinweise</th><th><span className="sr-only">Bearbeiten</span></th></tr></thead><tbody>
        {visibleDays.map(day => <tr key={day.date}><td>{new Date(`${day.date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td><td className="time-event-cell">{day.events?.length ? day.events.map(event => <span key={event.id}>{formatTime(event.at)} {TIME_ACTIONS[event.type]}{event.source === 'offline' ? ' (offline)' : ''}</span>) : '—'}</td><td>{minutesLabel(day.workedMinutes)}</td><td>{minutesLabel(day.bookedBreakMinutes)}</td><td>{minutesLabel(day.automaticBreakMinutes)}</td><td>{day.calculationIncomplete ? '—' : minutesLabel(day.creditedMinutes)}</td><td>{day.calculationIncomplete ? '—' : minutesLabel(day.targetMinutes)}</td><td>{minutesLabel(day.overtimeDebitMinutes)}{day.overtimeDebitMinutes > 0 && <span className="time-issue">Genehmigter Freizeitausgleich</span>}</td><td className={day.balanceMinutes < 0 ? 'time-negative' : ''}>{day.date <= today && !day.incomplete && !day.calculationIncomplete ? minutesLabel(day.balanceMinutes, true) : '—'}</td><td>{day.incomplete && <span className="time-status">Unvollständig</span>}{(day.issues || []).map((issue, i) => <span className="time-issue" key={i}>{typeof issue === 'string' ? issue : issue.message || 'Bitte prüfen'}</span>)}{(workspace.history || []).some(item => item.date === day.date) && <span className="time-issue">Nachtrag / Korrektur · siehe Verlauf</span>}</td><td><button className="button button--secondary" type="button" disabled={viewUnavailable || !canCorrect(day.date)} onClick={() => setEditing({ day, choose: true })}>Bearbeiten</button></td></tr>)}
        {!visibleDays.length && <tr><td colSpan="11">Keine Zeitdaten für diesen Zeitraum.</td></tr>}
      </tbody></table></div></section>}
      </>}
      {managed && <>
      <section className="time-card"><h3>Änderungsverlauf</h3><p className="time-muted">Nachträge und Korrekturen: {(workspace.history || []).length} im geladenen Verlauf.</p><div className="time-history">{(workspace.history || []).map(item => <article key={item.id}><strong>{item.date || item.day || 'Änderung'} · {TIME_REASONS[item.reason] || item.reason || item.type || 'Buchung'}</strong><span>{item.createdByName || item.actorName || item.createdBy || item.actorId || '—'} · {item.createdAt ? new Date(typeof item.createdAt === 'string' ? item.createdAt : item.createdAt._seconds * 1000).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'}</span>{item.note && <span>{item.note}</span>}{(item.before || item.after) && <details><summary>Vorher / Nachher</summary><p>Vorher: {(item.before?.events || item.before || []).map(event => `${formatTime(event.at)} ${TIME_ACTIONS[event.type]}`).join(', ') || 'Keine Buchungen'}</p><p>Nachher: {(item.after?.events || item.after || []).map(event => `${formatTime(event.at)} ${TIME_ACTIONS[event.type]}`).join(', ') || 'Keine Buchungen'}</p></details>}</article>)}{!workspace.history?.length && <p className="time-muted">Keine Änderungen vorhanden.</p>}</div></section>
      </>}
      </>}
      </div>
    </>}
    {loading && <p role="status" className="time-muted">Zeitdaten werden geladen …</p>}
    {editing && (editing.choose ? <TimeDayBookings day={editing.day} onClose={() => setEditing(null)} onSelect={event => setEditing({ day: editing.day, event })} /> : <TimeBookingEditor key={`${workspace?.user?.id}-${editing.day.date}-${editing.event?.id || 'new'}`} day={editing.day} event={editing.event} userId={workspace?.user?.id} onClose={() => setEditing(null)} onSaved={load} />)}
    {forgotten && <MissingStampReminder day={forgotten} onEdit={() => { if (canCorrect(forgotten.date)) { setEditing({ day: forgotten, choose: true }); setForgotten(null) } else { setError('Diese Buchung liegt außerhalb deiner Korrekturfrist. Bitte den Zeitmanager kontaktieren.'); setForgotten(null) } }} onClose={() => setForgotten(null)} />}
  </div>
}

export default function TimeTrackingPage() {
  return <TimeWorkspace />
}
