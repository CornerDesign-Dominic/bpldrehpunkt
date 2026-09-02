import { useEffect, useMemo, useState } from 'react'
import TodoForm from '../components/todos/TodoForm.jsx'
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
  TODO_STATUS,
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
  const canTake = editable && todo.status === 'open' && !todo.assignedUserId && isAudienceMember(todo, actor)
  if (!editable) return null
  return <div className="todo-actions">
    {canTake && <button type="button" onClick={() => onAction('assign', todo)}>Übernehmen</button>}
    {isAssignee && todo.status === 'in_progress' && <><button type="button" onClick={() => onAction('release', todo)}>Freigeben</button><button type="button" onClick={() => onAction('complete', todo)}>Erledigen</button></>}
    {canManage && ['open', 'in_progress'].includes(todo.status) && <><button type="button" onClick={() => onEdit(todo, false)}>Bearbeiten</button><button type="button" onClick={() => onEdit(todo, true)}>Neu zuweisen</button><button className="todo-actions__withdraw" type="button" onClick={() => onAction('withdraw', todo)}>Zurückziehen</button></>}
  </div>
}

export default function TodosPage() {
  const { user, profile } = useAuth()
  const { canEdit } = usePermissions()
  const actor = useMemo(() => ({ user, profile }), [profile, user])
  const [todos, setTodos] = useState([])
  const [users, setUsers] = useState([])
  const [tab, setTab] = useState('mine')
  const [statusFilter, setStatusFilter] = useState('active')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
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

  const visibleTodos = useMemo(() => todos.filter((todo) => {
    if (tab === 'mine') return todo.assignedUserId === user.uid && (statusFilter === 'active' ? todo.status === 'in_progress' : statusFilter === 'all' || todo.status === statusFilter)
    if (tab === 'created') return todo.creatorUserId === user.uid || profile?.role === 'superadmin'
    if (!isAudienceMember(todo, actor) || todo.status === 'withdrawn') return false
    if (statusFilter === 'available') return todo.status === 'open' && !todo.assignedUserId
    return statusFilter === 'all' || todo.status === statusFilter
  }), [actor, profile?.role, statusFilter, tab, todos, user.uid])

  function selectTab(nextTab) {
    setTab(nextTab)
    setStatusFilter(nextTab === 'pool' ? 'available' : nextTab === 'mine' ? 'active' : 'all')
  }

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
    <div className="todo-tabs" role="tablist" aria-label="To-do-Bereich"><button className={tab === 'mine' ? 'todo-tabs__tab todo-tabs__tab--active' : 'todo-tabs__tab'} type="button" onClick={() => selectTab('mine')}>Meine Aufgaben</button><button className={tab === 'created' ? 'todo-tabs__tab todo-tabs__tab--active' : 'todo-tabs__tab'} type="button" onClick={() => selectTab('created')}>Von mir erstellt</button><button className={tab === 'pool' ? 'todo-tabs__tab todo-tabs__tab--active' : 'todo-tabs__tab'} type="button" onClick={() => selectTab('pool')}>Aufgabenpool</button></div>
    <div className="list-toolbar todo-toolbar"><div className="list-controls"><label className="filter-field"><span className="sr-only">Status filtern</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{tab === 'pool' ? <><option value="available">Verfügbar</option><option value="in_progress">In Bearbeitung</option><option value="completed">Erledigt</option><option value="all">Alle</option></> : tab === 'mine' ? <><option value="active">Aktive Aufgaben</option><option value="completed">Erledigt</option><option value="all">Alle</option></> : <option value="all">Alle Status</option>}</select></label></div>{editable && <button className="button" type="button" onClick={() => { setEditing(null); setShowForm(true) }}>To-do anlegen</button>}</div>
    {showForm && <TodoForm key="new" users={activeUsers} onCancel={() => setShowForm(false)} onSubmit={addTodo} />}
    {editing && <TodoForm key={editing.todo.id} initialTodo={editing.todo} users={activeUsers} onCancel={() => setEditing(null)} onSubmit={saveEdit} />}
    {error && <p className="form-error">{error}</p>}
    <div className="table-frame todos-table"><table><thead><tr><th>To-do</th><th>Zielgruppe</th><th>Ersteller</th><th>Bearbeiter</th><th>Fälligkeit</th><th>Status</th><th>Aktion</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="7" className="table-state">To-dos werden geladen …</td></tr> : visibleTodos.length ? visibleTodos.map((todo) => <tr key={todo.id}><td><strong>{todo.title}</strong>{todo.description && <span className="table-subline">{todo.description}</span>}</td><td>{todo.audienceLabel || '—'}</td><td>{todo.creatorName || '—'}</td><td>{todo.assignedUserName || '—'}</td><td><span className={dueClass(todo)}>{formatDate(todo.dueDate)}</span></td><td><span className={`todo-status todo-status--${todo.status}`}>{TODO_STATUS[todo.status] || '—'}</span></td><td><TodoActions actor={actor} editable={editable} onAction={handleAction} onEdit={(todo, reassign) => { setShowForm(false); setEditing({ todo, reassign }) }} todo={todo} /></td></tr>) : <tr><td colSpan="7" className="table-state">Für diese Auswahl gibt es keine To-dos.</td></tr>}
    </tbody></table></div>
  </div>
}
