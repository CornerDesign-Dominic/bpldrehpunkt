import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useState } from 'react'
import HolidayDetailModal from '../holidays/HolidayDetailModal.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import '../../styles/calendar.css'

const dateFormatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

function todayValue() {
  return new Date().toISOString().slice(0, 10)
}

function formatPeriod(event) {
  const start = dateFormatter.format(new Date(`${event.startDate}T12:00:00`))
  const end = dateFormatter.format(new Date(`${event.endDate}T12:00:00`))
  const dates = event.startDate === event.endDate ? start : `${start} – ${end}`
  if (event.allDay || !event.startTime) return dates
  return `${dates} · ${event.startTime}${event.endTime ? `–${event.endTime}` : ''}`
}

export default function CalendarEventModal({ event, calendars, initialDate, editable, onClose, onSave, onDelete }) {
  const isExisting = Boolean(event)
  const [form, setForm] = useState(() => ({
    title: event?.title || '',
    calendarId: event?.calendarId || calendars[0]?.id || '',
    startDate: event?.startDate || initialDate || todayValue(),
    endDate: event?.endDate || initialDate || todayValue(),
    allDay: event?.allDay !== false,
    startTime: event?.startTime || '',
    endTime: event?.endTime || '',
    description: event?.description || '',
  }))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)

  if (event?.kind === 'company-holiday') return <HolidayDetailModal holiday={event.holidayDetail} onClose={onClose} />

  async function submit(eventSubmit) {
    eventSubmit.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await onSave(form)
    } catch (saveError) {
      setError(saveError?.message || 'Der Termin konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  function remove() {
    setDeleteConfirmationOpen(true)
  }

  async function confirmRemove() {
    setSubmitting(true)
    setError('')
    try {
      await onDelete()
    } catch {
      setError('Der Termin konnte nicht gelöscht werden.')
      setSubmitting(false)
      setDeleteConfirmationOpen(false)
    }
  }

  if (deleteConfirmationOpen) return <TranslatedProps sources={{ title: 'Termin wirklich löschen?' }}><ConfirmDialog open title="Termin wirklich löschen?" message="Dieser Termin wird endgültig gelöscht." confirmLabel="Termin löschen" submittingLabel="Wird gelöscht …" variant="danger" isSubmitting={submitting} onCancel={() => setDeleteConfirmationOpen(false)} onConfirm={confirmRemove} /></TranslatedProps>

  return <div className="calendar-modal-backdrop" role="presentation" onMouseDown={(eventMouse) => { if (eventMouse.target === eventMouse.currentTarget) onClose() }}>
    <section className="calendar-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title">
      <div className="calendar-modal__heading">
        <div><h2 id="calendar-event-title"><StaticText source={isExisting ? editable ? 'Termin bearbeiten' : 'Termin' : 'Neuer Termin'} /></h2>{isExisting && <p>{event.calendarName} · {formatPeriod(event)}</p>}</div>
        <TranslatedProps sources={{ 'aria-label': 'Dialog schließen' }}><button type="button" className="calendar-modal__close" onClick={onClose} aria-label="Dialog schließen">×</button></TranslatedProps>
      </div>
      {!editable ? <>
        <dl className="calendar-event-detail">
          <div><dt><StaticText source="Zeitraum" /></dt><dd>{formatPeriod(event)}</dd></div>
          <div><dt><StaticText source="Kalender" /></dt><dd><span className="calendar-color-dot" style={{ background: event.calendarColor }} />{event.calendarName}</dd></div>
          {event.systemCalendar && event.hasReminder && <div><dt><StaticText source="Erinnerung" /></dt><dd><StaticText source={event.reminderEnabled ? 'An' : 'Aus'} /></dd></div>}
          {event.description && <div className="calendar-event-detail__wide"><dt><StaticText source="Beschreibung" /></dt><dd>{event.description}</dd></div>}
        </dl>
        <div className="calendar-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}><StaticText source="Schließen" /></button></div>
      </> : <form onSubmit={submit} noValidate>
        <div className="calendar-modal__fields">
          <label className="form-field calendar-modal__title"><span><StaticText source="Titel *" /></span><input required autoFocus value={form.title} onChange={(input) => setForm((current) => ({ ...current, title: input.target.value }))} /></label>
          {!isExisting && <label className="form-field"><span><StaticText source="Kalender" /></span><select value={form.calendarId} onChange={(input) => setForm((current) => ({ ...current, calendarId: input.target.value }))}>{calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</select></label>}
          <label className="form-field"><span><StaticText source="Von" /></span><input type="date" required value={form.startDate} onChange={(input) => setForm((current) => ({ ...current, startDate: input.target.value, endDate: input.target.value > current.endDate ? input.target.value : current.endDate }))} /></label>
          <label className="form-field"><span><StaticText source="Bis" /></span><input type="date" required min={form.startDate} value={form.endDate} onChange={(input) => setForm((current) => ({ ...current, endDate: input.target.value }))} /></label>
          <label className="calendar-checkbox"><input type="checkbox" checked={form.allDay} onChange={(input) => setForm((current) => ({ ...current, allDay: input.target.checked }))} /><StaticText source="Ganztägig" /></label>
          {!form.allDay && <>
            <label className="form-field"><span><StaticText source="Von" /></span><input type="time" value={form.startTime} onChange={(input) => setForm((current) => ({ ...current, startTime: input.target.value }))} /></label>
            <label className="form-field"><span><StaticText source="Bis" /></span><input type="time" value={form.endTime} onChange={(input) => setForm((current) => ({ ...current, endTime: input.target.value }))} /></label>
          </>}
          <label className="form-field calendar-modal__description"><span><StaticText source="Beschreibung (optional)" /></span><textarea rows="4" value={form.description} onChange={(input) => setForm((current) => ({ ...current, description: input.target.value }))} /></label>
        </div>
        {error && <p className="form-error"><StaticText source={error} /></p>}
        <div className="calendar-modal__actions">{isExisting && <button className="button button--danger" type="button" disabled={submitting} onClick={remove}><StaticText source="Löschen" /></button>}<span /><button className="button button--secondary" type="button" disabled={submitting} onClick={onClose}><StaticText source="Abbrechen" /></button><button className="button" type="submit" disabled={submitting}><StaticText source={submitting ? 'Wird gespeichert …' : 'Speichern'} /></button></div>
      </form>}
    </section>
  </div>
}
