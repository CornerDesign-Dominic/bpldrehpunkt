import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth.js'
import { createDashboardTimeSession, dashboardTimeAccess } from '../../lib/dashboardTime.js'
import { listTimeWorkspace, minutesLabel, stampTime, timeDate } from '../../lib/timeTracking.js'
import TimeAppAccess from './TimeAppAccess.jsx'
import '../../styles/timeDashboard.css'

function ForgottenDayDialog({ day, onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const node = dialog.current
    node.showModal()
    return () => { node.close(); previous?.focus?.() }
  }, [])
  return <dialog ref={dialog} className="time-phone-dialog" aria-labelledby="dashboard-missing-time-title" onCancel={onClose}><header><h2 id="dashboard-missing-time-title">Buchung vom letzten Arbeitstag fehlt</h2><button type="button" className="button button--secondary" aria-label="Schließen" onClick={onClose}>×</button></header><p>Dein heutiger Arbeitsstart ist gespeichert. Für den {new Date(`${day.date}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} fehlen noch Buchungen. Bitte trage sie in der Zeitübersicht nach.</p><footer><button type="button" className="button button--secondary" onClick={onClose}>Später</button><Link className="button" to="/zeiterfassung">Jetzt nachtragen</Link></footer></dialog>
}

function ActiveTimeCard({ uid, editable }) {
  const session = useMemo(() => createDashboardTimeSession({ userId: uid, editable, getOnline: () => navigator.onLine, getDate: timeDate, load: listTimeWorkspace, stamp: stampTime, uuid: () => crypto.randomUUID(), now: () => new Date() }), [uid, editable])
  const [view, setView] = useState(() => session.snapshot())
  const [online, setOnline] = useState(navigator.onLine)
  const [forgotten, setForgotten] = useState(null)
  useEffect(() => {
    session.activate(setView)
    void session.refresh()
    const connected = () => { setOnline(true); void session.refresh() }
    const disconnected = () => setOnline(false)
    const focused = () => { if (!document.hidden) void session.refresh() }
    window.addEventListener('online', connected); window.addEventListener('offline', disconnected); window.addEventListener('focus', focused)
    document.addEventListener('visibilitychange', focused)
    const timer = window.setInterval(focused, 60000)
    return () => { session.dispose(); window.clearInterval(timer); window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected); window.removeEventListener('focus', focused); document.removeEventListener('visibilitychange', focused) }
  }, [session])
  const day = view.workspace?.days?.find(item => item.date === timeDate())
  const status = day?.status || 'away'
  const unavailable = !online || view.loading || view.busy || !view.workspace || !editable || Boolean(view.error)
  async function record(type) {
    const accepted = await session.record(type)
    if (accepted && type === 'come' && session.isActive()) {
      const missing = session.snapshot().workspace?.unresolvedDays?.at(-1)
      if (missing) setForgotten(missing)
    }
  }
  return <section className="dashboard-card dashboard-time-card" aria-labelledby="dashboard-time-title">
    <header><div><h2 id="dashboard-time-title">Meine Arbeitszeit</h2><p>{new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p></div><span className={`dashboard-time-status dashboard-time-status--${status}`} role="status" aria-live="polite" aria-atomic="true"><span aria-hidden="true">{status === 'break' ? 'Ⅱ' : status === 'working' ? '●' : '○'}</span>{status === 'working' ? 'Bei der Arbeit' : status === 'break' ? 'Pause läuft' : 'Ausgestempelt'}</span></header>
    {view.loading && <p role="status">Zeitdaten werden geladen …</p>}
    {!online && <p className="dashboard-time-warning">Keine Internetverbindung. Offline stempeln kannst du in der mobilen App.</p>}
    {view.error && <p className="form-error" role="alert">{view.error}</p>}
    {view.notice && <p className="dashboard-time-feedback" role="status">{view.notice}</p>}
    <div className="dashboard-time-main">
      <div className="dashboard-time-actions">
        <button type="button" className="button" disabled={unavailable || status !== 'away'} onClick={() => record('come')}><span aria-hidden="true">▶</span> Einstempeln</button>
        <button type="button" className={`button button--secondary${status === 'break' ? ' dashboard-time-resume' : ''}`} disabled={unavailable || status === 'away'} onClick={() => record(status === 'break' ? 'pause_end' : 'pause_start')}><span aria-hidden="true">{status === 'break' ? '▶' : 'Ⅱ'}</span> {status === 'break' ? 'Pause beenden' : 'Pause starten'}</button>
        <button type="button" className="button button--secondary" disabled={unavailable || status === 'away'} onClick={() => record('go')}><span aria-hidden="true">↪</span> Ausstempeln</button>
      </div>
      {!editable && <p className="dashboard-time-muted">Du kannst deine Zeiten ansehen. Zum Stempeln ist das Bearbeitungsrecht erforderlich.</p>}
      {day && <dl className="dashboard-time-totals"><div><dt>Heute gearbeitet</dt><dd>{day.calculationIncomplete ? '—' : minutesLabel(day.creditedMinutes)} <small>Std.</small></dd></div><div><dt>Gebuchte Pause</dt><dd>{minutesLabel(day.bookedBreakMinutes)} <small>Std.</small></dd>{day.automaticBreakMinutes > 0 && <small className="dashboard-time-deduction">Zusatzabzug {minutesLabel(day.automaticBreakMinutes)}</small>}</div><div><dt>Zeitkonto</dt><dd>{minutesLabel(view.workspace.balanceMinutes, true)} <small>Std.</small></dd></div></dl>}
    </div>
    {view.workspace?.balanceProvisional && <p className="dashboard-time-warning">Zeitkonto vorläufig: Unvollständige Buchungen oder fehlende Arbeitszeitvorgaben bitte in der Zeitübersicht prüfen.</p>}
    {view.workspace?.unresolvedDays?.length > 0 && <p className="dashboard-time-warning">Bei {view.workspace.unresolvedDays.length} früheren Arbeitstagen fehlen Buchungen. Bitte in der Zeitübersicht nachtragen.</p>}
    <footer><Link to="/zeiterfassung" className="button button--secondary">Zeitübersicht öffnen</Link><TimeAppAccess /><button type="button" className="dashboard-time-refresh" disabled={!online || view.busy} onClick={() => session.refresh()}>Aktualisieren</button></footer>
    {forgotten && <ForgottenDayDialog day={forgotten} onClose={() => setForgotten(null)} />}
  </section>
}

export default function DashboardTimeCard() {
  const { user, profile } = useAuth()
  const { visible, editable } = dashboardTimeAccess(profile)
  if (!user || !visible) return <section className="dashboard-card dashboard-time-card"><h2>Meine Arbeitszeit</h2><p>Die Zeiterfassung ist für dein Konto noch nicht freigegeben.</p></section>
  return <ActiveTimeCard key={`${user.uid}:${editable}`} uid={user.uid} editable={editable} />
}
