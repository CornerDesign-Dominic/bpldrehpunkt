import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import TodoQuickEditModal from '../components/todos/TodoQuickEditModal.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import { EditIcon } from '../components/icons.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getUserDisplayName, listUserProfiles } from '../lib/userProfiles.js'
import { listBusinessPartners } from '../lib/businessPartners.js'
import {
  assignTodoToCurrentUser,
  addTodoNote,
  audienceHasChanged,
  completeTodoForCurrentUser,
  getTodoById,
  isAudienceMember,
  listTodoUpdates,
  reactivateTodoForCurrentUser,
  releaseTodoFromCurrentUser,
  TODO_STATUS,
  TODO_PRIORITY,
  todoStatus,
  todoPriority,
  updateTodoByCreator,
  withdrawTodo,
} from '../lib/todos.js'

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function formatTimestamp(value) {
  const date = value?.toDate?.()
  return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—'
}

function dueClass(todo) {
  if (!todo.dueDate || ['completed', 'withdrawn'].includes(todo.status)) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${todo.dueDate}T12:00:00`)
  const diff = Math.round((due - today) / 86400000)
  return diff < 0 ? 'due-date due-date--overdue' : diff <= 7 ? 'due-date due-date--soon' : 'due-date'
}

function Detail({ label, children }) {
  const labels = { Zielgruppe: 'Zugewiesen an', 'Aktueller Bearbeiter': 'In Bearbeitung durch' }
  return <div><dt>{labels[label] || label}</dt><dd>{children || '—'}</dd></div>
}

function DetailSectionHeading({ children, onEdit }) {
  return <div className="todo-detail-section-heading"><h3>{children}</h3>{onEdit && <button className="todo-detail-section-edit" type="button" onClick={onEdit} title={`${children} bearbeiten`} aria-label={`${children} bearbeiten`}><EditIcon size={14} /></button>}</div>
}

function TodoActions({ actor, editable, onAction, todo }) {
  const status = todoStatus(todo)
  const isAssignee = todo.assignedUserId === actor.user.uid
  const canTake = editable && status === 'open' && !todo.assignedUserId && isAudienceMember(todo, actor)
  const canReactivate = editable && status === 'completed' && isAssignee
  if (!editable) return null
  return <div className="todo-detail-actions">
    {canTake && <button className="button" type="button" onClick={() => onAction('assign', todo)}>Aufgabe annehmen</button>}
    {isAssignee && status === 'in_progress' && <button className="button" type="button" onClick={() => onAction('complete', todo)}>Erledigen</button>}
    {canReactivate && <button className="button" type="button" onClick={() => onAction('reactivate', todo)}>Reaktivieren</button>}
  </div>
}

export default function TodoDetailPage() {
  const { todoId } = useParams()
  const { user, profile } = useAuth()
  const { canEdit, canView } = usePermissions()
  const actor = useMemo(() => ({ user, profile }), [profile, user])
  const [result, setResult] = useState(null)
  const [users, setUsers] = useState([])
  const [partners, setPartners] = useState([])
  const [updates, setUpdates] = useState([])
  const [updatesLoading, setUpdatesLoading] = useState(true)
  const [note, setNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [quickEditing, setQuickEditing] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const editable = canEdit('todos')
  const canViewMasterData = canView('masterData')
  const activeUsers = useMemo(() => users.filter((item) => item.active !== false).sort((left, right) => getUserDisplayName(left, left).localeCompare(getUserDisplayName(right, right), 'de')), [users])
  const usersById = useMemo(() => new Map(activeUsers.map((item) => [item.id, item])), [activeUsers])

  async function loadTodo() {
    const [todo, todoUpdates] = await Promise.all([getTodoById(todoId), listTodoUpdates(todoId)])
    setResult({ todo, error: todo ? '' : 'Aufgabe nicht gefunden.' })
    setUpdates(todoUpdates)
    setUpdatesLoading(false)
  }

  useEffect(() => {
    let current = true
    Promise.all([getTodoById(todoId), listTodoUpdates(todoId), editable ? listUserProfiles() : Promise.resolve([]), canViewMasterData ? listBusinessPartners() : Promise.resolve([])])
      .then(([todo, todoUpdates, profiles, businessPartners]) => { if (current) { setResult({ todo, error: todo ? '' : 'Aufgabe nicht gefunden.' }); setUpdates(todoUpdates); setUpdatesLoading(false); setUsers(profiles); setPartners(businessPartners) } })
      .catch((loadError) => { if (current) { setResult({ todo: null, error: loadError.code === 'permission-denied' ? 'Kein Zugriff auf diese Aufgabe.' : 'Aufgabe nicht gefunden.' }); setUpdatesLoading(false) } })
    return () => { current = false }
  }, [canViewMasterData, editable, todoId])

  async function saveQuickEdit(values, options = {}) {
    const todo = result.todo
    const audienceChanged = audienceHasChanged(todo, values, user.uid)
    const resetAssignment = audienceChanged || options.releaseAssignment
    if (todo.assignedUserId && resetAssignment) {
      setConfirmation({ type: 'quick-save', values, title: 'Übernahme zurücksetzen?', message: 'Das To-do wurde bereits übernommen. Durch diese Änderung wird die Bearbeitung beendet und das To-do wieder geöffnet.' })
      return
    }
    await persistQuickEdit(values, resetAssignment)
  }

  async function persistQuickEdit(values, resetAssignment) {
    await updateTodoByCreator(result.todo, values, usersById, resetAssignment, actor)
    await loadTodo()
    setQuickEditing(null)
    setToast(resetAssignment ? 'To-do neu zugewiesen und wieder geöffnet.' : 'To-do aktualisiert.')
  }

  async function handleAction(action, todo) {
    setError('')
    if (action === 'complete') {
      setConfirmation({ type: 'complete', todo, title: 'To-do als erledigt ablegen?', message: 'Die Aufgabe wird als erledigt markiert und kann anschließend nicht mehr bearbeitet werden.' })
      return
    }
    if (action === 'withdraw' && todo.assignedUserId) {
      setConfirmation({ type: 'withdraw', todo, title: 'To-do zurückziehen?', message: 'Die laufende Bearbeitung wird beendet. Das To-do bleibt zur Nachvollziehbarkeit gespeichert.' })
      return
    }
    try {
      if (action === 'assign') await assignTodoToCurrentUser(todo.id, actor)
      if (action === 'release') await releaseTodoFromCurrentUser(todo.id, actor)
      if (action === 'reactivate') await reactivateTodoForCurrentUser(todo.id, actor)
      if (action === 'withdraw') await withdrawTodo(todo.id, actor)
      await loadTodo()
      setToast({ assign: 'Aufgabe angenommen.', release: 'Bearbeitung freigegeben.', reactivate: 'To-do reaktiviert.', complete: 'To-do erledigt.', withdraw: 'To-do zurückgezogen.' }[action])
    } catch (actionError) {
      setError(actionError.message || 'Die Änderung konnte nicht gespeichert werden.')
    }
  }

  async function confirmAction() {
    try {
      if (confirmation.type === 'quick-save') await persistQuickEdit(confirmation.values, true)
      if (confirmation.type === 'complete') {
        await completeTodoForCurrentUser(confirmation.todo.id, actor)
        await loadTodo()
        setToast('To-do erledigt.')
      }
      if (confirmation.type === 'withdraw') {
        await withdrawTodo(confirmation.todo.id, actor)
        await loadTodo()
        setToast('To-do zurückgezogen.')
      }
      setConfirmation(null)
    } catch (actionError) {
      setConfirmation(null)
      setError(actionError.message || 'Die Änderung konnte nicht gespeichert werden.')
    }
  }

  async function saveNote(event) {
    event.preventDefault()
    setError('')
    setNoteSaving(true)
    try {
      await addTodoNote(todoId, note, actor)
      setNote('')
      await loadTodo()
      setToast('Hinweis hinzugefügt.')
    } catch (noteError) {
      setError(noteError.message || 'Der Hinweis konnte nicht gespeichert werden.')
    } finally {
      setNoteSaving(false)
    }
  }

  if (!result) return <p className="page-state">Aufgabe wird geladen …</p>
  if (result.error) return <section className="todo-detail-empty"><h2>{result.error}</h2><Link className="button button--secondary" to="/todos">Zurück</Link></section>

  const { todo } = result
  const caseUpdates = updates.filter((update) => update.type === 'note')
  const history = updates.filter((update) => update.type === 'system')
  const canManageSections = editable && (profile?.role === 'superadmin' || todo.creatorUserId === user.uid) && ['open', 'in_progress'].includes(todo.status)
  return <>
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title || ''} message={confirmation?.message || ''} cancelLabel={confirmation?.type === 'complete' ? 'Nein' : 'Abbrechen'} confirmLabel={confirmation?.type === 'complete' ? 'Ja, erledigen' : 'Bestätigen'} variant={confirmation?.type === 'withdraw' ? 'danger' : 'primary'} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />
    <div className="todo-detail-navigation"><Link className="button button--secondary" to="/todos">Zurück</Link><TodoActions actor={actor} editable={editable} onAction={handleAction} todo={todo} /></div>
    <div className="todo-detail-page">
    <header className="todo-detail-header"><div className="todo-detail-header__title"><h2>{todo.title}</h2>{canManageSections && <button className="todo-detail-section-edit" type="button" onClick={() => setQuickEditing('content')} title="Titel bearbeiten" aria-label="Titel bearbeiten"><EditIcon size={14} /></button>}<span className={`todo-status todo-status--${todoStatus(todo)}`}>{TODO_STATUS[todoStatus(todo)] || '—'}</span></div></header>
    {error && <p className="form-error">{error}</p>}
    {quickEditing && <TodoQuickEditModal key={quickEditing} currentUserId={user.uid} partners={partners} section={quickEditing} todo={todo} users={activeUsers} onCancel={() => setQuickEditing(null)} onSubmit={saveQuickEdit} />}
    <div className="todo-detail-layout"><main className="todo-detail-main"><section className="todo-detail-content"><DetailSectionHeading onEdit={canManageSections ? () => setQuickEditing('content') : null}>Beschreibung</DetailSectionHeading><p className="todo-detail-description">{todo.description || 'Keine Beschreibung hinterlegt.'}</p></section><section className="todo-updates" aria-labelledby="todo-updates-title"><div className="todo-updates__heading"><h3 id="todo-updates-title">Updates zum Fall</h3><span>{caseUpdates.length}</span></div>{canView('todos') && <form className="todo-updates__form" onSubmit={saveNote}><textarea aria-label="Update zum Fall" rows="2" value={note} maxLength="1000" onChange={(event) => setNote(event.target.value)} placeholder="Update zum Fall hinzufügen …" /><button className="button" type="submit" disabled={noteSaving || !note.trim()}>{noteSaving ? 'Wird gespeichert …' : 'Update hinzufügen'}</button></form>}{updatesLoading ? <p className="todo-updates__empty">Updates werden geladen …</p> : caseUpdates.length ? <ol className="todo-updates__list">{caseUpdates.map((update) => <li key={update.id} className="todo-updates__item todo-updates__item--note"><div><strong>{update.createdByName}</strong><span>Update · {formatTimestamp(update.createdAt)}</span></div><p>{update.text}</p></li>)}</ol> : <p className="todo-updates__empty">Noch keine Updates zum Fall.</p>}</section><section className="todo-updates todo-history" aria-labelledby="todo-history-title"><div className="todo-updates__heading"><h3 id="todo-history-title">Historie</h3><span>{history.length}</span></div>{updatesLoading ? <p className="todo-updates__empty">Historie wird geladen …</p> : history.length ? <ol className="todo-updates__list">{history.map((update) => <li key={update.id} className={`todo-updates__item todo-updates__item--${update.type}`}><div><strong>{update.createdByName}</strong><span>{update.type === 'note' ? 'Update' : 'System'} · {formatTimestamp(update.createdAt)}</span></div><p>{update.text}</p></li>)}</ol> : <p className="todo-updates__empty">Noch keine Historieneinträge.</p>}</section></main><aside className="todo-detail-sidebar"><section><DetailSectionHeading onEdit={canManageSections ? () => setQuickEditing('schedule') : null}>Priorität &amp; Termine</DetailSectionHeading><span className={`todo-priority todo-priority--${todoPriority(todo)}`}>{TODO_PRIORITY[todoPriority(todo)]}</span><dl><Detail label="Fällig am"><span className={dueClass(todo)}>{formatDate(todo.dueDate)}</span></Detail><Detail label="Erinnerung am">{formatDate(todo.reminderDate)}</Detail></dl></section><section><DetailSectionHeading onEdit={canManageSections ? () => setQuickEditing('responsibility') : null}>Zuständigkeit</DetailSectionHeading><dl><Detail label="Zielgruppe">{todo.audienceLabel}</Detail><Detail label="Aktueller Bearbeiter">{todo.assignedUserName || 'Noch nicht übernommen'}</Detail></dl></section><section><DetailSectionHeading onEdit={canManageSections ? () => setQuickEditing('links') : null}>Verknüpfungen</DetailSectionHeading><dl><Detail label="Kunde">{todo.customerId && canViewMasterData ? <Link to={`/kunden-unternehmer/${todo.customerId}`}>{todo.customerName || 'Kunde öffnen'}</Link> : todo.customerName}</Detail><Detail label="Unternehmer">{todo.carrierId && canViewMasterData ? <Link to={`/kunden-unternehmer/${todo.carrierId}`}>{todo.carrierName || 'Unternehmer öffnen'}</Link> : todo.carrierName}</Detail><Detail label="Referenz">{todo.reference}</Detail></dl></section><section className="todo-detail-system"><h3>Systemdaten</h3><dl><Detail label="Erstellt von">{todo.creatorName}</Detail><Detail label="Erstellt am">{formatTimestamp(todo.createdAt)}</Detail><Detail label="Zuletzt aktualisiert">{formatTimestamp(todo.updatedAt)}</Detail><Detail label="Übernommen am">{formatTimestamp(todo.assignedAt)}</Detail>{todo.completedAt && <><Detail label="Erledigt am">{formatTimestamp(todo.completedAt)}</Detail><Detail label="Erledigt von">{todo.completedByName}</Detail></>}{todo.withdrawnAt && <><Detail label="Zurückgezogen am">{formatTimestamp(todo.withdrawnAt)}</Detail><Detail label="Zurückgezogen von">{todo.withdrawnByUserId}</Detail></>}</dl></section></aside></div>
    </div>
  </>
}
