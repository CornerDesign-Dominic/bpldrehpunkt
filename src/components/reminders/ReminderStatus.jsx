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

export default function ReminderStatus({ sourcePath, enabled = false, configured = false, recipientRule, refreshKey }) {
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
    }).then((value) => { if (current) setResult({ sessionId, sourcePath, value }) }).catch(() => { if (current) setError(true) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [active, sourcePath, refreshKey, revision, sessionId])
  if (!active) return null
  const status = result?.sessionId === sessionId && result?.sourcePath === sourcePath ? result.value : null
  const label = (status) => labels[status]?.[en ? 1 : 0] || (en ? 'Status unknown' : 'Status unbekannt')
  const due = reminderDueAtLabel(status?.dueAt, language)
  const developmentBlocked = status?.reason?.startsWith('Dev-Testmodus:')
  return <div className="reminder-status" data-recipient-rule={recipientRule || undefined} role="status">
    <span>{loading ? (en ? 'Loading reminder status…' : 'Erinnerungsstatus wird geladen …') : error ? (en ? 'Reminder status could not be loaded.' : 'Erinnerungsstatus konnte nicht geladen werden.') : label(status?.status)}</span>
    {!loading && !error && due && <span> · {due} (Berlin)</span>}
    {!loading && !error && developmentBlocked && <p>{en ? 'Dev test mode: reminders can only be sent to the approved test addresses.' : status.reason}</p>}
    {!loading && !error && status?.recipients?.length > 0 && <ul>{status.recipients.map((recipient) => <li key={recipient.userId}>{recipient.name || (en ? 'Responsible user' : 'Zuständiger Nutzer')}: {label(recipient.status)}</li>)}</ul>}
    <button className="button button--secondary" type="button" disabled={loading} onClick={(event) => { event.stopPropagation(); setRevision((value) => value + 1) }}>{en ? 'Refresh status' : 'Status aktualisieren'}</button>
  </div>
}
