import TodoReminderHelp from './TodoReminderHelp.jsx'
import TodoReminderRecipients, { TodoCalendarPlacement } from './TodoReminderRecipients.jsx'
import { todoFormRecipientValues } from '../../lib/todoFormRecipients.js'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReminderFields from '../reminders/ReminderFields.jsx'
import ReminderStatus from '../reminders/ReminderStatus.jsx'
import { reminderTimestampKey, reminderValidationMessage, validateReminderForm } from '../../lib/reminderForm.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { TODO_SCHEDULE_TYPES, createEmptyTodoDeadline, todoDeadlinePresentation, todoScheduleTypeLabel } from '../../lib/todos.js'
import { getUserDisplayName } from '../../lib/userProfiles.js'
import { todoReminderRecipientIds } from '../../../shared/todoCollaboration.js'
import { CalendarIcon, CloseIcon, EditIcon } from '../icons.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'

function formatDate(value, language = 'de') {
  return value ? new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : '—'
}

export function DeadlineModal({ deadline, todo, users = [], onClose, onDelete, onSave }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const [values, setValues] = useState(() => ({ type: deadline?.type || createEmptyTodoDeadline().type, date: deadline ? deadline.date || '' : createEmptyTodoDeadline().date, time: deadline?.time || '', reminderOccurrence: deadline?.reminderOccurrence || null, reminderEnabled: Boolean(deadline?.reminderEnabled), reminderRecipientMode: deadline?.reminderRecipientMode || 'all', reminderRecipientUserIds: deadline?.reminderRecipientUserIds || [], note: deadline?.note || '' }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState(false)
  const savingRef = useRef(false)
  const deleteConfirmationRef = useRef(false)
  const dialogRef = useRef(null)
  // Preserve the parent audience that authorized opening this editor. Live
  // props may change while a draft is open; the service must compare against
  // the original audience before saving or deleting the source date.
  const originalTodoRef = useRef({ ...todo, ...(Array.isArray(todo?.audienceIds) ? { audienceIds: [...todo.audienceIds] } : {}) })
  const isNew = !deadline
  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.querySelector('select, input, textarea, button')?.focus())
    function keyDown(event) {
      // The confirmation owns focus and Escape until it closes. One Escape
      // must never cancel both the confirmation and the underlying draft.
      if (deleteConfirmationRef.current) return
      if (event.key === 'Escape') { if (!savingRef.current) { event.preventDefault(); onClose() }; return }
      if (event.key !== 'Tab') return
      const items = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])]
      if (!items.length) { event.preventDefault(); return }
      const first = items[0]; const last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keyDown)
    return () => { cancelAnimationFrame(focusFrame); document.removeEventListener('keydown', keyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus?.() }
  }, [onClose])
  const cancelDelete = useCallback(() => {
    if (savingRef.current) return
    deleteConfirmationRef.current = false
    setDeleteConfirmation(false)
  }, [])
  function requestDelete() {
    if (savingRef.current) return
    deleteConfirmationRef.current = true
    setDeleteConfirmation(true)
  }
  function update(field, value) { setValues((current) => ({ ...current, [field]: value })) }
  async function submit(event) {
    event.preventDefault()
    if (savingRef.current || deleteConfirmationRef.current) return
    try { validateReminderForm({ date: values.date, time: values.reminderEnabled ? values.time : '12:00', occurrence: values.reminderEnabled ? values.reminderOccurrence : null }) }
    catch (validationError) { setError(reminderValidationMessage(validationError, language)); return }
    savingRef.current = true; setSaving(true); setError('')
    try {
      const { reminderRecipientMode, reminderRecipientUserIds } = todoFormRecipientValues({ ...todo, ...values }, users)
      await onSave(deadline, { ...values, reminderRecipientMode, reminderRecipientUserIds }, originalTodoRef.current); onClose()
    } catch (saveError) { setError(reminderValidationMessage(saveError, language)) }
    finally { savingRef.current = false; setSaving(false) }
  }
  async function remove() {
    if (savingRef.current || !deadline || !deleteConfirmationRef.current) return
    savingRef.current = true; setSaving(true); setError('')
    try {
      await onDelete(deadline, originalTodoRef.current)
      deleteConfirmationRef.current = false; setDeleteConfirmation(false); onClose()
    }
    catch (deleteError) { setError(deleteError.message || (en ? 'The entry could not be deleted.' : 'Der Termin oder die Frist konnte nicht gelöscht werden.')) }
    finally { savingRef.current = false; setSaving(false); deleteConfirmationRef.current = false; setDeleteConfirmation(false) }
  }
  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingRef.current && !deleteConfirmationRef.current) onClose() }}>
    <section ref={dialogRef} inert={deleteConfirmation || undefined} aria-hidden={deleteConfirmation || undefined} className="todo-quick-edit-modal todo-deadline-modal" role="dialog" aria-modal="true" aria-labelledby="todo-deadline-modal-title">
      <form className="todo-quick-editor" onSubmit={submit} noValidate aria-busy={saving}>
        <header className="todo-deadline-modal__header"><div><span className="todo-deadline-modal__eyebrow">{en ? 'To-do · schedule' : 'To-do · Terminplanung'}</span><h2 id="todo-deadline-modal-title"><StaticText source={isNew ? 'Termin / Frist hinzufügen' : 'Termin / Frist bearbeiten'} /></h2></div><button className="todo-deadline-modal__close" type="button" disabled={saving} onClick={onClose} aria-label={en ? 'Close' : 'Schließen'}><CloseIcon size={19} /></button></header>
        <fieldset disabled={saving} className="todo-deadline-modal__body">
          <section className="todo-deadline-modal__section" aria-labelledby="todo-deadline-schedule-title"><h3 id="todo-deadline-schedule-title">{en ? 'Date and time' : 'Termin festlegen'}</h3><div className="todo-deadline-modal__fields"><label className="form-field"><span><StaticText source="Art *" /></span><select value={values.type} onChange={(event) => update('type', event.target.value)}>{TODO_SCHEDULE_TYPES.map((item) => <option key={item.value} value={item.value}><StaticText source={item.label} /></option>)}</select></label><ReminderFields values={{ date: values.date, time: values.time, occurrence: values.reminderOccurrence }} onChange={(field, value) => update(field === 'occurrence' ? 'reminderOccurrence' : field, value)} required={values.reminderEnabled} dateLabel={values.reminderEnabled ? 'Datum' : 'Datum *'} timeLabel="Uhrzeit" disabled={saving} recipientRule="none" showHint={false} /></div></section>
          <TodoCalendarPlacement todo={todo} values={values} users={users} />
          <section className="todo-deadline-modal__section todo-deadline-modal__delivery" aria-labelledby="todo-deadline-reminder-title"><div className="todo-deadline-modal__delivery-heading"><div><div className="todo-schedule__reminder-heading"><h3 id="todo-deadline-reminder-title">{en ? 'Email reminder' : 'Mail-Erinnerung'}</h3><TodoReminderHelp /></div></div><label className="form-field"><span className="sr-only"><StaticText source="Erinnerung" /></span><select aria-label={en ? 'Email reminder' : 'Mail-Erinnerung'} value={values.reminderEnabled ? 'on' : 'off'} onChange={(event) => update('reminderEnabled', event.target.value === 'on')}><option value="off"><StaticText source="Aus" /></option><option value="on"><StaticText source="An" /></option></select></label></div><TodoReminderRecipients showCalendar={false} todo={todo} values={values} users={users} enabled={values.reminderEnabled} disabled={saving} onChange={(changes) => setValues((current) => ({ ...current, ...changes }))} /></section>
          <label className="form-field todo-deadline-modal__note"><span><StaticText source="Hinweis" /></span><textarea rows="3" value={values.note} maxLength="4000" placeholder={en ? 'Optional context for this entry' : 'Optionaler Kontext zu diesem Eintrag'} onChange={(event) => update('note', event.target.value)} /></label>
        </fieldset>
        {error && <p className="form-error todo-deadline-modal__error" role="alert"><StaticText source={error} /></p>}
        <footer className="form-actions todo-deadline-modal__actions">{!isNew && <button className="button button--danger" type="button" disabled={saving} onClick={requestDelete}><StaticText source="Löschen" /></button>}<span className="todo-deadline-modal__action-spacer" /><button className="button button--secondary" type="button" disabled={saving} onClick={onClose}><StaticText source="Abbrechen" /></button><button className="button" type="submit" disabled={saving}><StaticText source={saving ? 'Wird gespeichert …' : 'Speichern'} /></button></footer>
      </form>
    </section>
    <ConfirmDialog open={deleteConfirmation} title={en ? 'Delete this appointment or deadline?' : 'Termin oder Frist löschen?'} message={en ? 'This entry and its associated calendar entries and reminder will be removed. Your other to-do dates remain unchanged.' : 'Dieser Eintrag mit seinen Kalendereinträgen und seiner Erinnerung wird entfernt. Die übrigen Termine des To-dos bleiben erhalten.'} confirmLabel={en ? 'Delete entry' : 'Ja, löschen'} cancelLabel={en ? 'Cancel' : 'Abbrechen'} submittingLabel={en ? 'Deleting …' : 'Wird gelöscht …'} isSubmitting={saving} onCancel={cancelDelete} onConfirm={remove} variant="danger" />
  </div>
}

function sourceRecipients(todo, deadline, users, en) {
  if (!users.length) return deadline.reminderRecipientMode === 'selected' ? `${deadline.reminderRecipientUserIds?.length || 0} ${en ? 'selected people' : 'ausgewählte Personen'}` : (en ? 'All current participants' : 'Alle aktuellen Beteiligten')
  const ids = todoReminderRecipientIds(todo, deadline, users)
  const names = users.filter((entry) => ids.includes(entry.id)).map((entry) => getUserDisplayName(entry, entry))
  return names.length ? names.join(', ') : (en ? 'No current recipients' : 'Keine aktuellen Empfänger')
}

export default function TodoDeadlinesCard({ todo, users = [], todoId, refreshKey, canEdit, deadlines, loading, onDelete, onSave }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const parentInactive = ['completed', 'withdrawn'].includes(todo?.status)
  const canEditDates = Boolean(canEdit) && !parentInactive
  const [editing, setEditing] = useState(null)
  const closeEditor = useCallback(() => setEditing(null), [])
  useEffect(() => { if (!canEditDates) { let active = true; queueMicrotask(() => { if (active) setEditing(null) }); return () => { active = false } } }, [canEditDates])
  const groups = useMemo(() => {
    const upcoming = []; const past = []
    for (const deadline of deadlines) (todoDeadlinePresentation(deadline).days < 0 ? past : upcoming).push(deadline)
    const compare = (left, right) => `${left.date || ''}T${left.time || '00:00'}`.localeCompare(`${right.date || ''}T${right.time || '00:00'}`) || String(left.id).localeCompare(String(right.id))
    return [{ key: 'upcoming', title: en ? 'Upcoming' : 'Bevorstehend', entries: upcoming.sort(compare) }, { key: 'past', title: en ? 'Past' : 'Vergangen', entries: past.sort((left, right) => compare(right, left)) }]
  }, [deadlines, en])
  function openDeadline(deadline) { if (canEditDates) setEditing(deadline) }
  function handleRowKeyDown(event, deadline) { if (event.target === event.currentTarget && canEditDates && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDeadline(deadline) } }
  return <section className="todo-detail-content todo-deadlines" aria-labelledby="todo-deadlines-title">
    {canEditDates && editing !== null && <DeadlineModal todo={todo} users={users} deadline={editing === 'new' ? null : editing} onClose={closeEditor} onDelete={onDelete} onSave={onSave} />}
    <div className="todo-detail-section-heading todo-deadlines__heading"><div><h3 id="todo-deadlines-title"><StaticText source="Termine & Fristen" /></h3></div>{canEditDates && <button className="button damage-deadlines__add" type="button" onClick={() => setEditing('new')}><StaticText source="Termin / Frist hinzufügen" /></button>}</div>
    {loading ? <p className="todo-deadlines__empty"><StaticText source="Termine und Fristen werden geladen …" /></p> : !deadlines.length ? <p className="todo-deadlines__empty"><CalendarIcon size={22} /><StaticText source="Noch keine Termine oder Fristen hinterlegt." /></p> : <div className="todo-deadlines__groups">{groups.filter((group) => group.entries.length).map((group) => <section key={group.key} className={`todo-deadlines__group todo-deadlines__group--${group.key}`} aria-labelledby={`todo-deadlines-${group.key}`}><h4 id={`todo-deadlines-${group.key}`}>{group.title}<span>{group.entries.length}</span></h4><ul>{group.entries.map((deadline) => {
      const presentation = todoDeadlinePresentation(deadline)
      const recipients = sourceRecipients(todo, deadline, users, en)
      const department = todo?.audienceType === 'department'
      return <li key={deadline.id} className={`todo-deadline-row todo-deadline-row--${presentation.kind}`}>
        <div className={`todo-deadline-row__main${canEditDates ? ' is-editable' : ''}`} role={canEditDates ? 'button' : undefined} tabIndex={canEditDates ? 0 : undefined} onClick={() => openDeadline(deadline)} onKeyDown={(event) => handleRowKeyDown(event, deadline)} aria-label={canEditDates ? `${todoScheduleTypeLabel(deadline.type)} vom ${formatDate(deadline.date, language)} bearbeiten` : undefined}>
          <div className="todo-deadline-row__title"><span className="todo-deadline-row__type">{todoScheduleTypeLabel(deadline.type)}</span><time dateTime={deadline.time ? `${deadline.date}T${deadline.time}` : deadline.date}>{formatDate(deadline.date, language)}{deadline.time && <span> · {deadline.time}</span>}</time>{canEditDates && <span className="todo-deadline-row__edit" aria-hidden="true"><EditIcon size={15} /></span>}</div>
          <span className="todo-deadline-row__timing">{presentation.days < 0 && deadline.type === 'appointment' ? (en ? 'Past' : 'Vergangen') : presentation.label}</span>
          {deadline.note && <p className="todo-deadline-row__note" title={deadline.note}>{deadline.note}</p>}
        </div>
        <div className="todo-deadline-row__meta"><span className="todo-deadline-row__calendar"><CalendarIcon size={14} />{department ? `${en ? 'Department calendar' : 'Abteilungskalender'} ${todo.audienceId}` : `${en ? 'Personal calendars' : 'Persönliche Kalender'} · ${recipients}`}</span><span className={`todo-deadline-row__reminder${deadline.reminderEnabled ? parentInactive ? ' is-paused' : ' is-enabled' : ''}`}>{deadline.reminderEnabled && parentInactive ? (en ? `Reminder paused · to-do ${todo.status === 'completed' ? 'completed' : 'withdrawn'}` : `Mail-Erinnerung pausiert · To-do ${todo.status === 'completed' ? 'erledigt' : 'zurückgezogen'}`) : <>{en ? 'Email reminder' : 'Mail-Erinnerung'} {deadline.reminderEnabled ? (en ? 'on' : 'an') : (en ? 'off' : 'aus')}</>}</span></div>
        {deadline.reminderEnabled && <details className="todo-deadline-row__status"><summary>{en ? 'Recipients and delivery status' : 'Empfänger & Versandstatus'}<span>{recipients}</span></summary>{parentInactive ? <p className="todo-deadline-row__paused">{en ? 'No email is sent while the to-do is completed or withdrawn. The reminder settings are retained for reopening; missed times are not sent later.' : 'Bei erledigten oder zurückgezogenen To-dos wird keine Mail versendet. Die Erinnerung bleibt für ein Wiederöffnen gespeichert; verpasste Zeitpunkte werden nicht nachgeholt.'}</p> : <ReminderStatus sourcePath={todoId ? `todos/${todoId}/deadlines/${deadline.id}` : null} enabled recipientRule="todo" refreshKey={`${refreshKey || ''}:${reminderTimestampKey(deadline.updatedAt)}`} />}</details>}
      </li>
    })}</ul></section>)}</div>}
  </section>
}
