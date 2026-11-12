import { useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth.js'
import { EditIcon, TrashIcon } from '../icons.jsx'
import { berlinTimestamp, correctTimeDay, formatTime, localTimeValue, TIME_ACTIONS, TIME_REASONS, timeError } from '../../lib/timeTracking.js'

function BookingDialog({ title, children, busy, onClose }) {
  const ref = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement
    const node = ref.current
    node.showModal()
    return () => { node.close(); previous?.focus?.() }
  }, [])
  return <dialog ref={ref} className="time-dialog time-single-booking-dialog" aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); else onClose() }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" className="button button--secondary" aria-label="Schließen" disabled={busy} onClick={onClose}>×</button></header>{children}
  </dialog>
}

function ReasonFields({ reason, note, onReason, onNote, disabled }) {
  return <><label>Grund<select required value={reason} disabled={disabled} onChange={event => onReason(event.target.value)}><option value="">Bitte auswählen</option>{Object.entries(TIME_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Hinweis (optional)<textarea rows="2" maxLength="1000" value={note} disabled={disabled} onChange={event => onNote(event.target.value)} /></label></>
}

export function TimeDayBookings({ day, onSelect, onClose }) {
  return <BookingDialog title={`Buchungen · ${new Date(`${day.date}T12:00:00Z`).toLocaleDateString('de-DE')}`} onClose={onClose}>
    <div className="time-day-booking-choices">{[...(day.events || [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map(event => <div key={event.id}><strong>{formatTime(event.at)}</strong><span>{TIME_ACTIONS[event.type]}</span><button type="button" className="time-week-edit" aria-label={`${TIME_ACTIONS[event.type]} um ${formatTime(event.at)} bearbeiten`} onClick={() => onSelect(event)}><EditIcon size={15} /></button></div>)}</div>
    <button type="button" className="button button--secondary" onClick={() => onSelect(null)}>Buchung hinzufügen</button>
  </BookingDialog>
}

export default function TimeBookingEditor({ day, event, userId, onClose, onSaved }) {
  const { user } = useAuth()
  const [actorId] = useState(user.uid)
  const [eventId] = useState(() => event?.id || crypto.randomUUID())
  const [snapshot, setSnapshot] = useState(day)
  const [type, setType] = useState(event?.type || 'come')
  const [time, setTime] = useState(event ? localTimeValue(event.at) : '')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteNote, setDeleteNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const current = snapshot.events?.find(item => item.id === eventId)
  const disabled = saving || saved || conflict || missing
  const unchanged = Boolean(event && current && current.type === type && localTimeValue(current.at) === time)
  const date = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('de-DE')

  async function persist(deleting = false) {
    if (disabled) return
    const selectedReason = deleting ? deleteReason : reason
    if (!selectedReason) { setError('Bitte einen Grund auswählen.'); return }
    if (!navigator.onLine) { setError('Änderungen sind nur mit Internetverbindung möglich.'); return }
    setSaving(true); setError('')
    let accepted = false
    try {
      let events = (snapshot.events || []).map(({ id, type: action, at }) => ({ id, type: action, at }))
      if (event && !current) throw new Error('Diese Buchung ist nicht mehr vorhanden. Bitte neu laden.')
      if (deleting) events = events.filter(item => item.id !== eventId)
      else {
        const at = current && time === localTimeValue(current.at) ? current.at : berlinTimestamp(day.date, time)
        const replacement = { id: eventId, type, at }
        events = event ? events.map(item => item.id === eventId ? replacement : item) : [...events, replacement]
      }
      await correctTimeDay({ expectedUserId: actorId, userId, date: day.date, expectedRevision: snapshot.revision || 0, events, reason: selectedReason, note: deleting ? deleteNote : note })
      accepted = true; setSaved(true); setDeleteOpen(false)
      await onSaved(); onClose()
    } catch (failure) {
      setError(accepted ? 'Die Änderung ist gespeichert. Die Ansicht konnte noch nicht aktualisiert werden.' : timeError(failure))
      if (failure?.code === 'functions/aborted') { setConflict(true); setDeleteOpen(false) }
    } finally { setSaving(false) }
  }

  async function reload() {
    setSaving(true)
    try {
      const fresh = await onSaved()
      if (saved) { onClose(); return }
      const latest = [...(fresh?.days || []), ...(fresh?.unresolvedDays || [])].find(value => value.date === day.date)
      if (!latest) throw new Error('Der Buchungstag konnte nicht geladen werden.')
      const selected = latest.events?.find(value => value.id === eventId)
      if (!event && selected) { onClose(); return }
      setSnapshot(latest); setConflict(false); setReason(''); setNote(''); setDeleteReason(''); setDeleteNote('')
      if (event && !selected) { setMissing(true); setError('Diese Buchung wurde inzwischen gelöscht. Bitte das Fenster schließen.'); return }
      setType(selected?.type || 'come'); setTime(selected ? localTimeValue(selected.at) : ''); setError('')
    } catch (failure) { setError(timeError(failure)) }
    finally { setSaving(false) }
  }

  return <>
    <BookingDialog title={`${event ? 'Buchung bearbeiten' : 'Buchung nachtragen'} · ${date}`} busy={saving} onClose={onClose}>
      <form onSubmit={submit => { submit.preventDefault(); void persist() }}>
        <div className="time-single-booking-fields"><label>Buchung<select value={type} disabled={disabled} onChange={change => setType(change.target.value)}>{Object.entries(TIME_ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Uhrzeit<input required type="time" value={time} disabled={disabled} onChange={change => setTime(change.target.value)} /></label></div>
        <ReasonFields reason={reason} note={note} onReason={setReason} onNote={setNote} disabled={disabled} />
        {error && <p className="form-error" role="alert">{error}</p>}
        {conflict && <><p className="time-muted">Der Tagesstand wurde zwischenzeitlich geändert. Lade ihn neu; deine Eingaben werden dabei verworfen.</p><button type="button" className="button button--secondary" disabled={saving} onClick={reload}>Aktuellen Stand laden</button></>}
        {saved && <button type="button" className="button button--secondary" disabled={saving} onClick={reload}>Ansicht aktualisieren</button>}
        <footer>{event && <button type="button" className="time-booking-delete" aria-label="Buchung löschen" title="Buchung löschen" disabled={disabled} onClick={() => { setDeleteReason(''); setDeleteNote(''); setError(''); setDeleteOpen(true) }}><TrashIcon size={18} /></button>}<button type="button" className="button button--secondary" disabled={saving} onClick={onClose}>Abbrechen</button><button className="button" disabled={disabled || unchanged}>{saving ? 'Wird gespeichert …' : event ? 'Änderung speichern' : 'Buchung hinzufügen'}</button></footer>
      </form>
    </BookingDialog>
    {deleteOpen && <BookingDialog title="Buchung löschen?" busy={saving} onClose={() => setDeleteOpen(false)}>
      <form onSubmit={submit => { submit.preventDefault(); void persist(true) }}>
        <p>{TIME_ACTIONS[current?.type]} am {date} um {formatTime(current?.at)} wirklich löschen? Die Buchung bleibt im Verlauf nachvollziehbar.</p>
        <ReasonFields reason={deleteReason} note={deleteNote} onReason={setDeleteReason} onNote={setDeleteNote} disabled={saving} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer><button type="button" className="button button--secondary" disabled={saving} onClick={() => setDeleteOpen(false)}>Abbrechen</button><button className="button button--danger" disabled={saving}>{saving ? 'Wird gelöscht …' : 'Buchung löschen'}</button></footer>
      </form>
    </BookingDialog>}
  </>
}
