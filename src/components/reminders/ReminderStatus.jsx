import { useEffect, useRef, useState } from 'react'
import { getReminderStatus } from '../../lib/reminders.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { reminderDueAtLabel } from '../../lib/reminderForm.js'
import { useAuth } from '../../auth/useAuth.js'

const labels = {
  scheduled: ['Geplant', 'Scheduled'], planned: ['Geplant', 'Scheduled'], pending: ['Ausstehend', 'Pending'],
  sent: ['An den Maildienst übergeben', 'Handed to the mail service'], accepted: ['An den Maildienst übergeben', 'Handed to the mail service'],
  failed: ['Versand fehlgeschlagen', 'Sending failed'], error: ['Fehler', 'Error'], missed: ['Verpasst – wird nicht nachgeholt', 'Missed – will not be sent later'],
  disabled: ['Erinnerung ausgeschaltet', 'Reminder disabled'], incomplete: ['Unvollständig – Datum oder Uhrzeit ergänzen', 'Incomplete – add a date or time'],
  invalid: ['Ungültige Erinnerung', 'Invalid reminder'], 'no-recipients': ['Keine berechtigten Empfänger', 'No eligible recipients'],
  paused: ['Automatischer Versand pausiert', 'Automatic mail paused'], sending: ['Versand läuft', 'Sending'], processing: ['Wird verarbeitet', 'Processing'],
  cancelled: ['Nicht mehr vorgesehen', 'No longer scheduled'], none: ['Keine Erinnerung vorgesehen', 'No reminder configured'],
  configuration_required: ['Einrichtung unvollständig – Termin, Zuständigkeit, Profil-Mail und Rechte prüfen', 'Configuration incomplete – check the schedule, responsibility, profile email and access'],
  due: ['Jetzt fällig', 'Due now'], suppressed: ['Versand unterdrückt', 'Sending suppressed'],
  uncertain: ['Versandausgang unklar – nicht automatisch wiederholen', 'Sending outcome uncertain – do not retry automatically'],
  partial: ['Teilweise an den Maildienst übergeben', 'Partially handed to the mail service'], blocked: ['Empfang blockiert – Profil, Rechte und Mailpause prüfen', 'Recipient blocked – check the profile, access and mail pause'],
}

const compactLabels = {
  scheduled: ['Ausstehend', 'Pending'], planned: ['Ausstehend', 'Pending'], pending: ['Ausstehend', 'Pending'], due: ['Ausstehend', 'Pending'],
  sent: ['Versendet', 'Sent'], accepted: ['Versendet', 'Sent'], partial: ['Teilweise versendet', 'Partly sent'],
  failed: ['Fehlgeschlagen', 'Failed'], error: ['Fehler', 'Error'], missed: ['Verpasst', 'Missed'],
  disabled: ['Ausgeschaltet', 'Disabled'], incomplete: ['Unvollständig', 'Incomplete'], invalid: ['Ungültig', 'Invalid'],
  'no-recipients': ['Keine Empfänger', 'No recipients'], paused: ['Pausiert', 'Paused'], sending: ['Wird versendet', 'Sending'], processing: ['In Bearbeitung', 'Processing'],
  cancelled: ['Abgebrochen', 'Cancelled'], none: ['Keine Erinnerung', 'No reminder'], configuration_required: ['Bitte prüfen', 'Check settings'],
  suppressed: ['Pausiert', 'Paused'], uncertain: ['Versand unklar', 'Outcome unclear'], blocked: ['Blockiert', 'Blocked'],
}

export default function ReminderStatus({ sourcePath, enabled = false, configured = false, recipientRule, refreshKey, compact = false }) {
  const { language } = useLanguage()
  const { user } = useAuth()
  const sessionId = user?.uid || null
  const en = language === 'en'
  const [result, setResult] = useState(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const previousRequest = useRef(null)
  const active = Boolean(sessionId && sourcePath && (enabled || configured))
  useEffect(() => {
    if (!active) return undefined
    let current = true
    Promise.resolve().then(() => {
      if (!current) return null
      setLoading(true); setError(false)
      const previous = previousRequest.current
      const changed = previous?.sourcePath === sourcePath && previous.refreshKey !== refreshKey
      previousRequest.current = { sourcePath, refreshKey }
      return getReminderStatus(sourcePath, { refresh: revision > 0 || changed })
    }).then((value) => { if (current) setResult({ sessionId, sourcePath, refreshKey, revision, value }) }).catch(() => { if (current) setError(true) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [active, sourcePath, refreshKey, revision, sessionId])
  useEffect(() => {
    if (!compact || !active) return undefined
    // Keep a pending badge current without adding status controls to the card.
    // The shared loader batches the visible entries into one status request.
    const refresh = () => { if (document.visibilityState === 'visible') setRevision((value) => value + 1) }
    const timer = setInterval(refresh, 60000)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [compact, active])
  if (!active) return null
  const status = result?.sessionId === sessionId && result?.sourcePath === sourcePath ? result.value : null
  const label = (status) => recipientRule === 'todo' && status === 'configuration_required'
    ? (en ? 'Reminder incomplete – check the date, recipients and access' : 'Erinnerung unvollständig – Termin, Empfänger und Rechte prüfen')
    : labels[status]?.[en ? 1 : 0] || (en ? 'Status unknown' : 'Status unbekannt')
  if (compact) {
    const current = result?.refreshKey === refreshKey && result?.revision === revision ? status : null
    const pending = loading || (!error && !current)
    const text = pending ? (en ? 'Loading…' : 'Lädt …') : error ? (en ? 'Status unknown' : 'Status unbekannt') : compactLabels[current?.status]?.[en ? 1 : 0] || (en ? 'Status unknown' : 'Status unbekannt')
    return <span className="reminder-status-badge" role="status" data-status={pending ? 'loading' : error ? 'unknown' : current?.status} title={error ? (en ? 'Reminder status could not be loaded.' : 'Erinnerungsstatus konnte nicht geladen werden.') : pending ? undefined : label(current?.status)} aria-label={`${en ? 'Email reminder' : 'Mail-Erinnerung'}: ${text}`}>{text}</span>
  }
  const due = reminderDueAtLabel(status?.dueAt, language)
  const developmentBlocked = status?.reason?.startsWith('Dev-Testmodus:')
  return <div className="reminder-status" data-recipient-rule={recipientRule || undefined} role="status">
    <span>{loading ? (en ? 'Loading reminder status…' : 'Erinnerungsstatus wird geladen …') : error ? (en ? 'Reminder status could not be loaded.' : 'Erinnerungsstatus konnte nicht geladen werden.') : label(status?.status)}</span>
    {!loading && !error && due && <span> · {due} (Berlin)</span>}
    {!loading && !error && developmentBlocked && <p>{en ? 'Dev test mode: reminders can only be sent to the approved test addresses.' : status.reason}</p>}
    {!loading && !error && status?.recipients?.length > 0 && <ul>{status.recipients.map((recipient) => <li key={recipient.userId}>{recipient.name || (recipientRule === 'todo' ? (en ? 'Recipient' : 'Empfänger') : (en ? 'Responsible user' : 'Zuständiger Nutzer'))}: {label(recipient.status)}</li>)}</ul>}
    <button className="button button--secondary" type="button" disabled={loading} onClick={(event) => { event.stopPropagation(); setRevision((value) => value + 1) }}>{en ? 'Refresh status' : 'Status aktualisieren'}</button>
  </div>
}
