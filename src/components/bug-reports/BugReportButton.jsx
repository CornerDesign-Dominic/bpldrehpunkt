import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../../auth/useAuth.js'
import { usePermissions } from '../../auth/usePermissions.js'
import { useTheme } from '../../theme/useTheme.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { functions } from '../../lib/firebase.js'
import { createCalendarEvent, listUserCalendars } from '../../lib/calendars.js'
import { createPersonalNote } from '../../lib/personalNotes.js'
import { createTodo } from '../../lib/todos.js'
import { listVisibleUserDirectory } from '../../lib/userProfiles.js'
import CalendarEventModal from '../calendar/CalendarEventModal.jsx'
import PersonalNoteModal from '../notes/PersonalNoteModal.jsx'
import TodoForm from '../todos/TodoForm.jsx'
import { BugIcon, CalendarIcon, CloseIcon, DocumentsIcon, IdeaIcon, MoonIcon, SunIcon, TodoIcon } from '../icons.jsx'
import Toast from '../ui/Toast.jsx'

const emptyForm = () => ({ subject: '', module: '', description: '' })

function submissionErrorMessage(error, t) {
  switch (error?.code) {
    case 'functions/unauthenticated': return t('quick.error.unauthenticated')
    case 'functions/permission-denied': return t('quick.error.permissionDenied')
    case 'functions/invalid-argument': return t('quick.error.invalidArgument')
    case 'functions/failed-precondition': return t('quick.error.failedPrecondition')
    case 'functions/unavailable': return t('quick.error.unavailable')
    default: return t('quick.error.default')
  }
}

function BugReportModal({ onClose, onSuccess }) {
  const { t } = useLanguage()
  const dialogRef = useRef(null)
  const subjectRef = useRef(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => subjectRef.current?.focus())
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) onClose()
      if (event.key !== 'Tab') return
      const focusableElements = dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')
      if (!focusableElements?.length) return
      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocusedElement?.focus?.()
    }
  }, [onClose, submitting])

  async function submit(event) {
    event.preventDefault()
    const subject = form.subject.trim()
    const module = form.module.trim()
    const description = form.description.trim()
    if (!subject || !description) {
      setError(t('quick.required'))
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await httpsCallable(functions, 'submitBugReport')({ subject, module, description })
      onSuccess()
    } catch (submitError) {
      setError(submissionErrorMessage(submitError, t))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="bug-report-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
    <section ref={dialogRef} className="bug-report-modal" role="dialog" aria-modal="true" aria-labelledby="bug-report-title" tabIndex="-1">
      <div className="bug-report-modal__heading"><div><h2 id="bug-report-title">{t('quick.bugTitle')}</h2><p>{t('quick.bugHint')}</p></div></div>
      <form onSubmit={submit} noValidate>
        <div className="bug-report-modal__fields">
          <label className="form-field"><span>{t('quick.bugSubject')}</span><input ref={subjectRef} required maxLength="160" value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} /></label>
          <label className="form-field"><span>{t('quick.bugModuleOptional')}</span><input maxLength="100" value={form.module} onChange={(event) => setForm((current) => ({ ...current, module: event.target.value }))} /></label>
          <label className="form-field"><span>{t('quick.description')}</span><textarea required rows="7" maxLength="4000" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
        </div>
        {error && <p className="form-error">{<StaticText source={error} />}</p>}
        <div className="bug-report-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={submitting}>{t('quick.cancel')}</button><button className="button" type="submit" disabled={submitting}>{t(submitting ? 'quick.sending' : 'quick.send')}</button></div>
      </form>
    </section>
  </div>
}

function IdeaModal({ onClose, onSuccess }) {
  const { t } = useLanguage()
  const dialogRef = useRef(null)
  const subjectRef = useRef(null)
  const [form, setForm] = useState({ subject: '', text: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => subjectRef.current?.focus())
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) onClose()
      if (event.key !== 'Tab') return
      const focusableElements = dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')
      if (!focusableElements?.length) return
      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocusedElement?.focus?.()
    }
  }, [onClose, submitting])

  async function submit(event) {
    event.preventDefault()
    const subject = form.subject.trim()
    const text = form.text.trim()
    if (!subject || !text) {
      setError(t('quick.required'))
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await httpsCallable(functions, 'submitIdea')({ subject, text })
      onSuccess()
    } catch (submitError) {
      setError(submissionErrorMessage(submitError, t))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="bug-report-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
    <section ref={dialogRef} className="bug-report-modal" role="dialog" aria-modal="true" aria-labelledby="idea-title" tabIndex="-1">
      <div className="bug-report-modal__heading"><div><h2 id="idea-title">{t('quick.ideaTitle')}</h2><p>{t('quick.ideaHint')}</p></div></div>
      <form onSubmit={submit} noValidate>
        <div className="bug-report-modal__fields">
          <label className="form-field"><span>{t('quick.ideaSubject')}</span><input ref={subjectRef} required maxLength="160" value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} /></label>
          <label className="form-field"><span>{t('quick.ideaText')}</span><textarea required rows="7" maxLength="4000" value={form.text} onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))} /></label>
        </div>
        {error && <p className="form-error"><StaticText source={error} /></p>}
        <div className="bug-report-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={submitting}>{t('quick.cancel')}</button><button className="button" type="submit" disabled={submitting}>{t(submitting ? 'quick.sending' : 'quick.send')}</button></div>
      </form>
    </section>
  </div>
}

export default function BugReportButton() {
  const { profile, user } = useAuth()
  const { canEdit, canView } = usePermissions()
  const { theme, setTheme } = useTheme()
  const { t } = useLanguage()
  const [menuOpen, setMenuOpen] = useState(false)
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [bugReportOpen, setBugReportOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [calendarEventOpen, setCalendarEventOpen] = useState(false)
  const [calendarSetupLoading, setCalendarSetupLoading] = useState(false)
  const [calendarSetupError, setCalendarSetupError] = useState('')
  const [eventCalendars, setEventCalendars] = useState([])
  const [todoOpen, setTodoOpen] = useState(false)
  const [todoSetupLoading, setTodoSetupLoading] = useState(false)
  const [todoSetupError, setTodoSetupError] = useState('')
  const [todoUsers, setTodoUsers] = useState([])
  const [todoPartners, setTodoPartners] = useState([])
  const [toast, setToast] = useState('')
  const menuRef = useRef(null)
  const canCreateTodos = canEdit('todos')
  const canViewCalendar = canView('calendar')
  const canViewMasterData = canView('masterData')
  const canViewTransportOrders = canView('transportOrders')
  const isSuperadmin = profile?.role === 'superadmin'
  const todoUsersById = useMemo(() => new Map(todoUsers.filter((item) => item.active !== false).map((item) => [item.id, item])), [todoUsers])

  useEffect(() => {
    if (!menuOpen) return undefined
    function closeMenu(event) {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !menuRef.current?.contains(event.target))) setMenuOpen(false)
    }
    document.addEventListener('keydown', closeMenu)
    document.addEventListener('pointerdown', closeMenu)
    return () => {
      document.removeEventListener('keydown', closeMenu)
      document.removeEventListener('pointerdown', closeMenu)
    }
  }, [menuOpen])

  async function openTodoModal() {
    setMenuOpen(false)
    setTodoOpen(true)
    setTodoSetupLoading(true)
    setTodoSetupError('')
    try {
      const [users, partners] = await Promise.all([listVisibleUserDirectory(), canViewMasterData ? listBusinessPartners() : Promise.resolve([])])
      setTodoUsers(users)
      setTodoPartners(partners)
    } catch {
      setTodoSetupError(t('quick.todoLoadError'))
    } finally {
      setTodoSetupLoading(false)
    }
  }

  async function createGlobalTodo(values) {
    await createTodo(values, { profile, user }, todoUsersById)
    setToast(t('quick.todoSaved'))
  }

  async function createGlobalNote(values) {
    await createPersonalNote(user.uid, values)
  }

  async function openCalendarEventModal() {
    setMenuOpen(false)
    setCalendarEventOpen(true)
    setCalendarSetupLoading(true)
    setCalendarSetupError('')
    try {
      const calendars = await listUserCalendars(user.uid, isSuperadmin)
      const editableCalendars = calendars.filter((calendar) => calendar.accessLevel === 'edit' || calendar.ownerUserId === user.uid || isSuperadmin)
      if (!editableCalendars.length) {
        setCalendarSetupError(t('quick.calendarUnavailable'))
        return
      }
      setEventCalendars(editableCalendars)
    } catch {
      setCalendarSetupError(t('quick.calendarLoadError'))
    } finally {
      setCalendarSetupLoading(false)
    }
  }

  async function createGlobalCalendarEvent(values) {
    await createCalendarEvent(values.calendarId, values, user.uid)
    setCalendarEventOpen(false)
  }

  if (!user) return null

  return <>
    <div ref={menuRef} className="global-action-menu">
      {menuOpen && <div className="global-action-menu__options" role="menu" aria-label={t('quick.actions')}>
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setIdeaOpen(true) }}><IdeaIcon size={18} /><span>{t('quick.sendIdea')}</span></button>
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setBugReportOpen(true) }}><BugIcon size={18} /><span>{t('quick.bug')}</span></button>
        {canCreateTodos && <button type="button" role="menuitem" onClick={openTodoModal}><TodoIcon size={18} /><span>{t('quick.createTodo')}</span></button>}
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setNoteOpen(true) }}><DocumentsIcon size={18} /><span>{t('quick.createNote')}</span></button>
        {canViewCalendar && <button type="button" role="menuitem" onClick={openCalendarEventModal}><CalendarIcon size={18} /><span>{t('quick.createCalendarEvent')}</span></button>}
        <label className="global-action-menu__theme-switch" title={t(theme === 'dark' ? 'quick.lightTheme' : 'quick.darkTheme')}>
          <SunIcon size={16} />
          <input type="checkbox" checked={theme === 'dark'} onChange={(event) => setTheme(event.target.checked ? 'dark' : 'light')} aria-label={t(theme === 'dark' ? 'quick.lightTheme' : 'quick.darkTheme')} />
          <i aria-hidden="true" />
          <MoonIcon size={16} />
        </label>
      </div>}
      <button className="global-action-menu__toggle" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={t(menuOpen ? 'quick.close' : 'quick.open')} title={t(menuOpen ? 'quick.close' : 'quick.open')} aria-expanded={menuOpen}>{menuOpen ? <CloseIcon size={20} /> : <span aria-hidden="true">+</span>}</button>
    </div>
    {ideaOpen && <IdeaModal onClose={() => setIdeaOpen(false)} onSuccess={() => { setIdeaOpen(false); setToast(t('quick.ideaThanks')) }} />}
    {bugReportOpen && <BugReportModal onClose={() => setBugReportOpen(false)} onSuccess={() => { setBugReportOpen(false); setToast(t('quick.sendThanks')) }} />}
    {noteOpen && <PersonalNoteModal note={null} onClose={() => setNoteOpen(false)} onSave={createGlobalNote} />}
    {calendarEventOpen && (calendarSetupLoading ? <div className="calendar-modal-backdrop" role="presentation"><section className="calendar-modal" role="dialog" aria-modal="true" aria-label={t('quick.createCalendarEvent')}><p className="calendar-state">{t('quick.calendarPrepare')}</p></section></div> : calendarSetupError ? <div className="calendar-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCalendarEventOpen(false) }}><section className="calendar-modal" role="dialog" aria-modal="true" aria-label={t('quick.createCalendarEvent')}><div className="global-action-menu__todo-error"><p className="form-error">{calendarSetupError}</p><button className="button button--secondary" type="button" onClick={() => setCalendarEventOpen(false)}>{t('quick.closeButton')}</button></div></section></div> : <CalendarEventModal event={null} calendars={eventCalendars} editable onClose={() => setCalendarEventOpen(false)} onSave={createGlobalCalendarEvent} />)}
    {todoOpen && <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !todoSetupLoading) setTodoOpen(false) }}><section className="todo-form-modal" role="dialog" aria-modal="true" aria-label={t('quick.createTodo')}>{todoSetupLoading ? <p className="page-state">{t('quick.todoPrepare')}</p> : todoSetupError ? <div className="global-action-menu__todo-error"><p className="form-error">{todoSetupError}</p><button className="button button--secondary" type="button" onClick={() => setTodoOpen(false)}>{t('quick.closeButton')}</button></div> : <TodoForm key="global-new-todo" canViewTransportOrders={canViewTransportOrders} currentUserId={user.uid} partners={todoPartners} users={todoUsers.filter((item) => item.active !== false)} onCancel={() => setTodoOpen(false)} onSubmit={createGlobalTodo} />}</section></div>}
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
  </>
}
