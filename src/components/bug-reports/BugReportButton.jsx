import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../../auth/useAuth.js'
import { usePermissions } from '../../auth/usePermissions.js'
import { useTheme } from '../../theme/useTheme.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { functions } from '../../lib/firebase.js'
import { createTodo } from '../../lib/todos.js'
import { listVisibleUserDirectory } from '../../lib/userProfiles.js'
import TodoForm from '../todos/TodoForm.jsx'
import { BugIcon, CloseIcon, MoonIcon, SunIcon, TodoIcon } from '../icons.jsx'
import Toast from '../ui/Toast.jsx'

const modules = ['Dashboard', 'Mein Urlaub', 'Kalender', 'Urlaubsmanagement', 'Team Brennpunkt', 'Kunden & Unternehmer', 'CRM', 'Palettenmanagement', 'News', 'Dokumente', 'To-dos', 'Mein Profil', 'Adminbereich', 'Sonstiges']
const emptyForm = () => ({ module: '', description: '' })

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
  const moduleRef = useRef(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => moduleRef.current?.focus())
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) onClose()
      if (event.key !== 'Tab') return
      const focusableElements = dialogRef.current?.querySelectorAll('button:not([disabled]), select:not([disabled]), textarea:not([disabled])')
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
    const module = form.module.trim()
    const description = form.description.trim()
    if (!module || !description) {
      setError(t('quick.required'))
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await httpsCallable(functions, 'submitBugReport')({ module, description })
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
          <label className="form-field"><span>{t('quick.module')}</span><select ref={moduleRef} required value={form.module} onChange={(event) => setForm((current) => ({ ...current, module: event.target.value }))}><option value="">{t('quick.choose')}</option>{modules.map((module) => <option key={module} value={module}>{<StaticText source={t({ 'Mein Urlaub': 'nav.vacation', 'Kalender': 'nav.calendar', 'Urlaubsmanagement': 'nav.vacationManagement', 'Team Brennpunkt': 'title.team', 'Kunden & Unternehmer': 'nav.partners', 'Palettenmanagement': 'nav.pallets', 'Dokumente': 'nav.documents', 'Mein Profil': 'nav.profile', 'Adminbereich': 'nav.admin', 'Sonstiges': 'quick.other' }[module] || module)} />}</option>)}</select></label>
          <label className="form-field"><span>{t('quick.description')}</span><textarea required rows="7" maxLength="4000" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
        </div>
        {error && <p className="form-error">{<StaticText source={error} />}</p>}
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
  const [bugReportOpen, setBugReportOpen] = useState(false)
  const [todoOpen, setTodoOpen] = useState(false)
  const [todoSetupLoading, setTodoSetupLoading] = useState(false)
  const [todoSetupError, setTodoSetupError] = useState('')
  const [todoUsers, setTodoUsers] = useState([])
  const [todoPartners, setTodoPartners] = useState([])
  const [toast, setToast] = useState('')
  const menuRef = useRef(null)
  const canCreateTodos = canEdit('todos')
  const canViewMasterData = canView('masterData')
  const canViewTransportOrders = canView('transportOrders')
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

  if (!user) return null

  return <>
    <div ref={menuRef} className="global-action-menu">
      {menuOpen && <div className="global-action-menu__options" role="menu" aria-label={t('quick.actions')}>
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setBugReportOpen(true) }}><BugIcon size={18} /><span>{t('quick.bug')}</span></button>
        {canCreateTodos && <button type="button" role="menuitem" onClick={openTodoModal}><TodoIcon size={18} /><span>{t('quick.createTodo')}</span></button>}
        <label className="global-action-menu__theme-switch" title={t(theme === 'dark' ? 'quick.lightTheme' : 'quick.darkTheme')}>
          <SunIcon size={16} />
          <input type="checkbox" checked={theme === 'dark'} onChange={(event) => setTheme(event.target.checked ? 'dark' : 'light')} aria-label={t(theme === 'dark' ? 'quick.lightTheme' : 'quick.darkTheme')} />
          <i aria-hidden="true" />
          <MoonIcon size={16} />
        </label>
      </div>}
      <button className="global-action-menu__toggle" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={t(menuOpen ? 'quick.close' : 'quick.open')} title={t(menuOpen ? 'quick.close' : 'quick.open')} aria-expanded={menuOpen}>{menuOpen ? <CloseIcon size={20} /> : <span aria-hidden="true">+</span>}</button>
    </div>
    {bugReportOpen && <BugReportModal onClose={() => setBugReportOpen(false)} onSuccess={() => { setBugReportOpen(false); setToast(t('quick.sendThanks')) }} />}
    {todoOpen && <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !todoSetupLoading) setTodoOpen(false) }}><section className="todo-form-modal" role="dialog" aria-modal="true" aria-label={t('quick.createTodo')}>{todoSetupLoading ? <p className="page-state">{t('quick.todoPrepare')}</p> : todoSetupError ? <div className="global-action-menu__todo-error"><p className="form-error">{todoSetupError}</p><button className="button button--secondary" type="button" onClick={() => setTodoOpen(false)}>{t('quick.closeButton')}</button></div> : <TodoForm key="global-new-todo" canViewTransportOrders={canViewTransportOrders} currentUserId={user.uid} partners={todoPartners} users={todoUsers.filter((item) => item.active !== false)} onCancel={() => setTodoOpen(false)} onSubmit={createGlobalTodo} />}</section></div>}
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
  </>
}
