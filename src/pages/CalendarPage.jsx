import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import Toast from '../components/ui/Toast.jsx'
import { createCalendarEvent, deleteCalendarEvent, listCalendarEvents, listUserCalendars, updateCalendarEvent } from '../lib/calendars.js'
import '../styles/calendar.css'

const weekdayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const monthFormatter = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' })
const dateFormatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

function todayValue() {
  return new Date().toISOString().slice(0, 10)
}

function dateValue(year, month, day) {
  const date = new Date(year, month, day)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatPeriod(event) {
  const start = dateFormatter.format(new Date(`${event.startDate}T12:00:00`))
  const end = dateFormatter.format(new Date(`${event.endDate}T12:00:00`))
  const dates = event.startDate === event.endDate ? start : `${start} – ${end}`
  if (event.allDay || !event.startTime) return dates
  return `${dates} · ${event.startTime}${event.endTime ? `–${event.endTime}` : ''}`
}

function overlaps(event, start, end) {
  return event.startDate <= end && event.endDate >= start
}

async function loadCalendarData(userId, isSuperadmin) {
  const availableCalendars = await listUserCalendars(userId, isSuperadmin)
  return { availableCalendars, calendarEvents: await listCalendarEvents(availableCalendars) }
}

function resolvedVisibleCalendarIds(availableCalendars, current, storageKey) {
  const availableIds = availableCalendars.map((calendar) => calendar.id)
  const stored = current.length ? current : (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '[]') } catch { return [] } })()
  const valid = stored.filter((id) => availableIds.includes(id))
  return valid.length ? valid : availableIds
}

function EventModal({ event, calendars, initialDate, editable, onClose, onSave, onDelete }) {
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

  async function remove() {
    if (!window.confirm('Diesen Termin wirklich löschen?')) return
    setSubmitting(true)
    setError('')
    try {
      await onDelete()
    } catch {
      setError('Der Termin konnte nicht gelöscht werden.')
      setSubmitting(false)
    }
  }

  return <div className="calendar-modal-backdrop" role="presentation" onMouseDown={(eventMouse) => { if (eventMouse.target === eventMouse.currentTarget) onClose() }}><section className="calendar-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title"><div className="calendar-modal__heading"><div><h2 id="calendar-event-title">{isExisting ? editable ? 'Termin bearbeiten' : 'Termin' : 'Neuer Termin'}</h2>{isExisting && <p>{event.calendarName} · {formatPeriod(event)}</p>}</div><button type="button" className="calendar-modal__close" onClick={onClose} aria-label="Dialog schließen">×</button></div>{!editable ? <><dl className="calendar-event-detail"><div><dt>Zeitraum</dt><dd>{formatPeriod(event)}</dd></div><div><dt>Kalender</dt><dd><span className="calendar-color-dot" style={{ background: event.calendarColor }} />{event.calendarName}</dd></div>{event.description && <div className="calendar-event-detail__wide"><dt>Beschreibung</dt><dd>{event.description}</dd></div>}</dl><div className="calendar-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Schließen</button></div></> : <form onSubmit={submit} noValidate><div className="calendar-modal__fields"><label className="form-field calendar-modal__title"><span>Titel *</span><input required autoFocus value={form.title} onChange={(input) => setForm((current) => ({ ...current, title: input.target.value }))} /></label>{!isExisting && <label className="form-field"><span>Kalender</span><select value={form.calendarId} onChange={(input) => setForm((current) => ({ ...current, calendarId: input.target.value }))}>{calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</select></label>}<label className="form-field"><span>Von</span><input type="date" required value={form.startDate} onChange={(input) => setForm((current) => ({ ...current, startDate: input.target.value, endDate: input.target.value > current.endDate ? input.target.value : current.endDate }))} /></label><label className="form-field"><span>Bis</span><input type="date" required min={form.startDate} value={form.endDate} onChange={(input) => setForm((current) => ({ ...current, endDate: input.target.value }))} /></label><label className="calendar-checkbox"><input type="checkbox" checked={form.allDay} onChange={(input) => setForm((current) => ({ ...current, allDay: input.target.checked }))} />Ganztägig</label>{!form.allDay && <><label className="form-field"><span>Von</span><input type="time" value={form.startTime} onChange={(input) => setForm((current) => ({ ...current, startTime: input.target.value }))} /></label><label className="form-field"><span>Bis</span><input type="time" value={form.endTime} onChange={(input) => setForm((current) => ({ ...current, endTime: input.target.value }))} /></label></>}<label className="form-field calendar-modal__description"><span>Beschreibung (optional)</span><textarea rows="4" value={form.description} onChange={(input) => setForm((current) => ({ ...current, description: input.target.value }))} /></label></div>{error && <p className="form-error">{error}</p>}<div className="calendar-modal__actions">{isExisting && <button className="button button--danger" type="button" disabled={submitting} onClick={remove}>Löschen</button>}<span /><button className="button button--secondary" type="button" disabled={submitting} onClick={onClose}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gespeichert …' : 'Speichern'}</button></div></form>}</section></div>
}

function MonthGrid({ year, month, events, onDayClick, onEventClick }) {
  const firstDay = new Date(year, month, 1)
  const firstWeekday = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const previousMonthDays = new Date(year, month, 0).getDate()
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1
    if (day < 1) return { date: dateValue(year, month - 1, previousMonthDays + day), day: previousMonthDays + day, outside: true }
    if (day > daysInMonth) return { date: dateValue(year, month + 1, day - daysInMonth), day: day - daysInMonth, outside: true }
    return { date: dateValue(year, month, day), day, outside: false }
  })
  const today = todayValue()
  return <div className="calendar-month"><div className="calendar-month__weekdays">{weekdayLabels.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-month__days">{cells.map((cell) => { const dayEvents = events.filter((event) => overlaps(event, cell.date, cell.date)); return <div className={`calendar-day${cell.outside ? ' calendar-day--outside' : ''}${cell.date === today ? ' calendar-day--today' : ''}`} key={cell.date}><button type="button" className="calendar-day__number" onClick={() => onDayClick(cell.date)} aria-label={`Termin am ${cell.date} anlegen`}>{cell.day}</button><div className="calendar-day__events">{dayEvents.slice(0, 3).map((event) => <button type="button" className="calendar-event-chip" key={event.id} style={{ '--calendar-color': event.calendarColor }} title={`${event.title} · ${event.calendarName}`} onClick={() => onEventClick(event)}>{!event.allDay && event.startTime && <time>{event.startTime}</time>}<span>{event.title}</span></button>)}{dayEvents.length > 3 && <span className="calendar-day__more">+ {dayEvents.length - 3} weitere</span>}</div></div>})}</div></div>
}

export default function CalendarPage() {
  const { user, profile } = useAuth()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [calendars, setCalendars] = useState([])
  const [events, setEvents] = useState([])
  const [visibleCalendarIds, setVisibleCalendarIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState('')
  const isSuperadmin = profile?.role === 'superadmin'
  const userId = user?.uid || ''
  const storageKey = userId ? `drehpunkt.calendar.visible.${userId}` : ''

  async function reload() {
    const { availableCalendars, calendarEvents } = await loadCalendarData(userId, isSuperadmin)
    setCalendars(availableCalendars)
    setEvents(calendarEvents)
    setVisibleCalendarIds((current) => resolvedVisibleCalendarIds(availableCalendars, current, storageKey))
  }

  useEffect(() => {
    let active = true
    loadCalendarData(userId, isSuperadmin)
      .then(({ availableCalendars, calendarEvents }) => {
        if (!active) return
        setCalendars(availableCalendars)
        setEvents(calendarEvents)
        setVisibleCalendarIds((current) => resolvedVisibleCalendarIds(availableCalendars, current, storageKey))
      })
      .catch(() => { if (active) setError('Kalenderdaten konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isSuperadmin, storageKey, userId])

  useEffect(() => {
    if (storageKey && visibleCalendarIds.length) localStorage.setItem(storageKey, JSON.stringify(visibleCalendarIds))
  }, [storageKey, visibleCalendarIds])

  const visibleEvents = useMemo(() => events.filter((event) => visibleCalendarIds.includes(event.calendarId)), [events, visibleCalendarIds])
  const editableCalendars = useMemo(() => calendars.filter((calendar) => calendar.accessLevel === 'edit' || calendar.ownerUserId === userId || isSuperadmin), [calendars, isSuperadmin, userId])
  const monthStart = dateValue(year, month, 1)
  const monthEnd = dateValue(year, month + 1, 0)
  const upcoming = useMemo(() => visibleEvents.filter((event) => event.endDate >= todayValue()).sort((left, right) => left.startDate.localeCompare(right.startDate) || (left.startTime || '').localeCompare(right.startTime || '')).slice(0, 10), [visibleEvents])
  const monthEvents = useMemo(() => visibleEvents.filter((event) => overlaps(event, monthStart, monthEnd)), [monthEnd, monthStart, visibleEvents])

  function moveMonth(delta) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  function toggleCalendar(id) {
    setVisibleCalendarIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  async function saveEvent(values) {
    if (modal?.event) {
      await updateCalendarEvent(modal.event.calendarId, modal.event.id, values, modal.event)
      setToast('Termin aktualisiert.')
    } else {
      await createCalendarEvent(values.calendarId, values, userId)
      setToast('Termin angelegt.')
    }
    setModal(null)
    await reload()
  }

  async function removeEvent() {
    await deleteCalendarEvent(modal.event.calendarId, modal.event.id)
    setModal(null)
    await reload()
    setToast('Termin gelöscht.')
  }

  function openDay(date) {
    if (!editableCalendars.length) return
    setModal({ initialDate: date })
  }

  const eventCanEdit = (event) => editableCalendars.some((calendar) => calendar.id === event.calendarId)
  return <div className="calendar-page">{toast && <Toast message={toast} onDismiss={() => setToast('')} />}{modal && <EventModal event={modal.event} calendars={editableCalendars} initialDate={modal.initialDate} editable={!modal.event || eventCanEdit(modal.event)} onClose={() => setModal(null)} onSave={saveEvent} onDelete={removeEvent} />}<section className="calendar-workspace"><aside className="calendar-sidebar"><div className="calendar-sidebar__heading"><h2>Meine Kalender</h2><p>Einblendung nur für diese Ansicht.</p></div><div className="calendar-selector">{calendars.map((calendar) => <label key={calendar.id} className="calendar-selector__item"><input type="checkbox" checked={visibleCalendarIds.includes(calendar.id)} onChange={() => toggleCalendar(calendar.id)} /><span className="calendar-color-dot" style={{ background: calendar.color }} /><span>{calendar.name}</span>{calendar.kind === 'personal' && <small>Persönlich</small>}</label>)}</div>{editableCalendars.length > 0 && <button className="button calendar-sidebar__new" type="button" onClick={() => setModal({ initialDate: todayValue() })}>Termin anlegen</button>}</aside><main className="calendar-main"><div className="calendar-toolbar"><div className="calendar-toolbar__navigation"><button className="button button--secondary" type="button" onClick={() => moveMonth(-1)} aria-label="Vorheriger Monat">‹</button><button className="button button--secondary" type="button" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}>Heute</button><button className="button button--secondary" type="button" onClick={() => moveMonth(1)} aria-label="Nächster Monat">›</button></div><h2>{monthFormatter.format(new Date(year, month, 1))}</h2></div>{loading ? <p className="calendar-state">Kalender werden geladen …</p> : error ? <p className="calendar-state">{error}</p> : <MonthGrid year={year} month={month} events={monthEvents} onDayClick={openDay} onEventClick={(event) => setModal({ event })} />}</main><aside className="calendar-upcoming"><div className="calendar-sidebar__heading"><h2>Nächste Termine</h2><p>Aus den eingeblendeten Kalendern.</p></div><div className="calendar-upcoming__list">{loading ? <p>Termine werden geladen …</p> : upcoming.length ? upcoming.map((event) => <button type="button" key={event.id} className="calendar-upcoming__item" onClick={() => setModal({ event })}><span className="calendar-color-dot" style={{ background: event.calendarColor }} /><span><strong>{event.title}</strong><small>{formatPeriod(event)} · {event.calendarName}</small></span></button>) : <p>Keine anstehenden Termine.</p>}</div></aside></section></div>
}
