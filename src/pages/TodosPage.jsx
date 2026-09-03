import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TodoDetailsModal from '../components/todos/TodoDetailsModal.jsx'
import TodoForm from '../components/todos/TodoForm.jsx'
import TodosGallery from '../components/todos/TodosGallery.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getUserDisplayName, listUserProfiles } from '../lib/userProfiles.js'
import {
  assignTodoToCurrentUser,
  completeTodoForCurrentUser,
  createTodo,
  isAudienceMember,
  listTodosForActor,
  releaseTodoFromCurrentUser,
  updateTodoByCreator,
  withdrawTodo,
} from '../lib/todos.js'

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function dueClass(todo) {
  if (!todo.dueDate || ['completed', 'withdrawn'].includes(todo.status)) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${todo.dueDate}T12:00:00`)
  const diff = Math.round((due - today) / 86400000)
  return diff < 0 ? 'due-date due-date--overdue' : diff <= 7 ? 'due-date due-date--soon' : 'due-date'
}

function TodoActions({ actor, editable, onAction, onEdit, todo }) {
  const canManage = actor.profile?.role === 'superadmin' || todo.creatorUserId === actor.user.uid
  const isAssignee = todo.assignedUserId === actor.user.uid
  const isPersonalOwnTodo = todo.creatorUserId === actor.user.uid && todo.audienceType === 'person' && todo.audienceId === actor.user.uid
  const canTake = editable && todo.status === 'open' && !todo.assignedUserId && isAudienceMember(todo, actor)
  if (!editable) return null
  return <div className="todo-actions">
    {canTake && <button type="button" onClick={() => onAction('assign', todo)}>Übernehmen</button>}
    {isAssignee && todo.status === 'in_progress' && <>{!isPersonalOwnTodo && <button type="button" onClick={() => onAction('release', todo)}>Freigeben</button>}<button type="button" onClick={() => onAction('complete', todo)}>Erledigen</button></>}
    {canManage && ['open', 'in_progress'].includes(todo.status) && <><button type="button" onClick={() => onEdit(todo, false)}>Bearbeiten</button><button type="button" onClick={() => onEdit(todo, true)}>Neu zuweisen</button><button className="todo-actions__withdraw" type="button" onClick={() => onAction('withdraw', todo)}>Zurückziehen</button></>}
  </div>
}

export default function TodosPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { canEdit } = usePermissions()
  const actor = useMemo(() => ({ user, profile }), [profile, user])
  const [todos, setTodos] = useState([])
  const [users, setUsers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [detailsTodo, setDetailsTodo] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const editable = canEdit('todos')
  const activeUsers = useMemo(() => users.filter((item) => item.active !== false).sort((left, right) => getUserDisplayName(left, left).localeCompare(getUserDisplayName(right, right), 'de')), [users])
  const usersById = useMemo(() => new Map(activeUsers.map((item) => [item.id, item])), [activeUsers])

  async function loadTodos() {
    setTodos(await listTodosForActor(actor))
  }

  useEffect(() => {
    let current = true
    Promise.all([listTodosForActor(actor), editable ? listUserProfiles() : Promise.resolve([])])
      .then(([entries, profiles]) => { if (current) { setTodos(entries); setUsers(profiles) } })
      .catch(() => { if (current) setError('Die To-dos konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [actor, editable])

  const todoGroups = useMemo(() => ({
    mine: todos.filter((todo) => todo.assignedUserId === user.uid),
    created: todos.filter((todo) => todo.creatorUserId === user.uid && !(todo.audienceType === 'person' && todo.audienceId === user.uid)),
    pool: todos.filter((todo) => isAudienceMember(todo, actor) && todo.status !== 'withdrawn' && !(todo.creatorUserId === user.uid && todo.audienceType === 'person' && todo.audienceId === user.uid)),
  }), [actor, todos, user.uid])

  async function addTodo(values) {
    await createTodo(values, actor, usersById)
    await loadTodos()
    setToast('To-do gespeichert.')
  }

  async function saveEdit(values) {
    const audienceChanged = editing.todo.audienceType !== values.audienceType || editing.todo.audienceId !== (values.audienceType === 'all' ? null : values.audienceId)
    const resetAssignment = editing.reassign || audienceChanged
    if (editing.todo.assignedUserId && resetAssignment) {
      setConfirmation({
        type: 'save', values,
        title: 'Übernahme zurücksetzen?',
        message: 'Das To-do wurde bereits übernommen. Durch diese Änderung wird die Bearbeitung beendet und das To-do wieder geöffnet.',
      })
      return
    }
    await performSave(values, resetAssignment)
  }

  async function performSave(values, resetAssignment) {
    await updateTodoByCreator(editing.todo.id, values, usersById, resetAssignment)
    await loadTodos()
    setEditing(null)
    setToast(resetAssignment ? 'To-do neu zugewiesen und wieder geöffnet.' : 'To-do aktualisiert.')
  }

  async function handleAction(action, todo) {
    setError('')
    if (action === 'withdraw' && todo.assignedUserId) {
      setConfirmation({ type: 'withdraw', todo, title: 'To-do zurückziehen?', message: 'Die laufende Bearbeitung wird beendet. Das To-do bleibt zur Nachvollziehbarkeit gespeichert.' })
      return
    }
    try {
      if (action === 'assign') await assignTodoToCurrentUser(todo.id, actor)
      if (action === 'release') await releaseTodoFromCurrentUser(todo.id, actor)
      if (action === 'complete') await completeTodoForCurrentUser(todo.id, actor)
      if (action === 'withdraw') await withdrawTodo(todo.id, actor)
      await loadTodos()
      setToast({ assign: 'To-do übernommen.', release: 'Bearbeitung freigegeben.', complete: 'To-do erledigt.', withdraw: 'To-do zurückgezogen.' }[action])
    } catch (actionError) {
      setError(actionError.message || 'Die Änderung konnte nicht gespeichert werden.')
    }
  }

  async function confirmAction() {
    try {
      if (confirmation.type === 'save') await performSave(confirmation.values, true)
      if (confirmation.type === 'withdraw') {
        await withdrawTodo(confirmation.todo.id, actor)
        await loadTodos()
        setToast('To-do zurückgezogen.')
      }
      setConfirmation(null)
    } catch (actionError) {
      setConfirmation(null)
      setError(actionError.message || 'Die Änderung konnte nicht gespeichert werden.')
    }
  }

  return <div className="todos-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title || ''} message={confirmation?.message || ''} confirmLabel="Bestätigen" onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />
    {detailsTodo && <TodoDetailsModal todo={detailsTodo} formatDate={formatDate} getDueClass={dueClass} onClose={() => setDetailsTodo(null)}><TodoActions actor={actor} editable={editable} onAction={(action, todo) => { setDetailsTodo(null); handleAction(action, todo) }} onEdit={(todo, reassign) => { setDetailsTodo(null); setShowForm(false); setEditing({ todo, reassign }) }} todo={detailsTodo} /></TodoDetailsModal>}
    <div className="list-toolbar todo-toolbar">{editable && <button className="button" type="button" onClick={() => { setEditing(null); setShowForm(true) }}>To-do anlegen</button>}</div>
    {showForm && <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false) }}><section className="todo-form-modal" role="dialog" aria-modal="true" aria-label="To-do anlegen"><TodoForm key="new" currentUserId={user.uid} users={activeUsers} onCancel={() => setShowForm(false)} onSubmit={addTodo} /></section></div>}
    {editing && <TodoForm key={editing.todo.id} currentUserId={user.uid} initialTodo={editing.todo} users={activeUsers} onCancel={() => setEditing(null)} onSubmit={saveEdit} />}
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="todos-gallery__state">To-dos werden geladen …</p> : <div className="todo-sections"><section className="todo-section"><div className="todo-section__heading"><h2>Meine Aufgaben</h2><span>{todoGroups.mine.length}</span></div><TodosGallery todos={todoGroups.mine} formatDate={formatDate} getDueClass={dueClass} onPreview={setDetailsTodo} onOpen={(todo) => navigate(`/todos/${todo.id}`)} /></section><section className="todo-section"><div className="todo-section__heading"><h2>Von mir erstellt</h2><span>{todoGroups.created.length}</span></div><TodosGallery todos={todoGroups.created} formatDate={formatDate} getDueClass={dueClass} onPreview={setDetailsTodo} onOpen={(todo) => navigate(`/todos/${todo.id}`)} /></section><section className="todo-section"><div className="todo-section__heading"><h2>Aufgabenpool</h2><span>{todoGroups.pool.length}</span></div><TodosGallery todos={todoGroups.pool} formatDate={formatDate} getDueClass={dueClass} onPreview={setDetailsTodo} onOpen={(todo) => navigate(`/todos/${todo.id}`)} /></section></div>}
  </div>
}
