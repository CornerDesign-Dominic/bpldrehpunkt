import { useEffect, useMemo, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../../auth/useAuth.js'
import { usePermissions } from '../../auth/usePermissions.js'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { functions } from '../../lib/firebase.js'
import { createTodo } from '../../lib/todos.js'
import { listVisibleUserDirectory } from '../../lib/userProfiles.js'
import TodoForm from '../todos/TodoForm.jsx'
import { BugIcon, CloseIcon, TodoIcon } from '../icons.jsx'
import Toast from '../ui/Toast.jsx'

const modules = ['Dashboard', 'Urlaub', 'Kalender', 'Urlaubsmanagement', 'Team Brennpunkt', 'Kunden & Unternehmer', 'CRM', 'Palettenmanagement', 'News', 'Dokumente', 'To-dos', 'Mein Profil', 'Adminbereich', 'Sonstiges']
const emptyForm = () => ({ module: '', description: '' })

function submissionErrorMessage(error) {
  switch (error?.code) {
    case 'functions/unauthenticated': return 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.'
    case 'functions/permission-denied': return 'Dein Benutzerkonto ist nicht aktiv. Bitte wende dich an die Administration.'
    case 'functions/invalid-argument': return 'Bitte prüfe Modul und Beschreibung.'
    case 'functions/failed-precondition': return 'Der E-Mail-Empfängerkreis ist noch nicht vollständig eingerichtet.'
    case 'functions/unavailable': return 'Die Meldung konnte gerade nicht versendet werden. Bitte versuche es später erneut.'
    default: return 'Die Meldung konnte nicht versendet werden. Bitte versuche es später erneut.'
  }
}

function BugReportModal({ onClose, onSuccess }) {
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
      setError('Bitte Modul und Beschreibung ausfüllen.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await httpsCallable(functions, 'submitBugReport')({ module, description })
      onSuccess()
    } catch (submitError) {
      setError(submissionErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="bug-report-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
    <section ref={dialogRef} className="bug-report-modal" role="dialog" aria-modal="true" aria-labelledby="bug-report-title" tabIndex="-1">
      <div className="bug-report-modal__heading"><div><h2 id="bug-report-title">Fehler melden</h2><p>Beschreibe kurz, was passiert ist.</p></div></div>
      <form onSubmit={submit} noValidate>
        <div className="bug-report-modal__fields">
          <label className="form-field"><span>Modul *</span><select ref={moduleRef} required value={form.module} onChange={(event) => setForm((current) => ({ ...current, module: event.target.value }))}><option value="">Bitte wählen</option>{modules.map((module) => <option key={module} value={module}>{module}</option>)}</select></label>
          <label className="form-field"><span>Was ist passiert? *</span><textarea required rows="7" maxLength="4000" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="bug-report-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={submitting}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gesendet …' : 'Meldung senden'}</button></div>
      </form>
    </section>
  </div>
}

export default function BugReportButton() {
  const { profile, user } = useAuth()
  const { canEdit, canView } = usePermissions()
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
      setTodoSetupError('Die Angaben für das To-do konnten nicht geladen werden. Bitte versuche es erneut.')
    } finally {
      setTodoSetupLoading(false)
    }
  }

  async function createGlobalTodo(values) {
    await createTodo(values, { profile, user }, todoUsersById)
    setToast('To-do gespeichert.')
  }

  if (!user) return null

  return <>
    <div ref={menuRef} className="global-action-menu">
      {menuOpen && <div className="global-action-menu__options" role="menu" aria-label="Schnellaktionen">
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setBugReportOpen(true) }}><BugIcon size={18} /><span>Bug melden</span></button>
        {canCreateTodos && <button type="button" role="menuitem" onClick={openTodoModal}><TodoIcon size={18} /><span>To-do anlegen</span></button>}
      </div>}
      <button className="global-action-menu__toggle" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Schnellaktionen schließen' : 'Schnellaktionen öffnen'} title={menuOpen ? 'Schließen' : 'Schnellaktionen'} aria-expanded={menuOpen}>{menuOpen ? <CloseIcon size={20} /> : <span aria-hidden="true">+</span>}</button>
    </div>
    {bugReportOpen && <BugReportModal onClose={() => setBugReportOpen(false)} onSuccess={() => { setBugReportOpen(false); setToast('Danke, deine Meldung wurde versendet.') }} />}
    {todoOpen && <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !todoSetupLoading) setTodoOpen(false) }}><section className="todo-form-modal" role="dialog" aria-modal="true" aria-label="To-do anlegen">{todoSetupLoading ? <p className="page-state">To-do wird vorbereitet …</p> : todoSetupError ? <div className="global-action-menu__todo-error"><p className="form-error">{todoSetupError}</p><button className="button button--secondary" type="button" onClick={() => setTodoOpen(false)}>Schließen</button></div> : <TodoForm key="global-new-todo" currentUserId={user.uid} partners={todoPartners} users={todoUsers.filter((item) => item.active !== false)} onCancel={() => setTodoOpen(false)} onSubmit={createGlobalTodo} />}</section></div>}
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
  </>
}
