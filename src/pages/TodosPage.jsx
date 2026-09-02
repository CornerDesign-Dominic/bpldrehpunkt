import { useEffect, useMemo, useState } from 'react'
import TodoForm from '../components/todos/TodoForm.jsx'
import Toast from '../components/ui/Toast.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import {
  assignTodoToCurrentUser,
  completeTodoForCurrentUser,
  createTodo,
  DEMO_CURRENT_USER,
  getTodoDepartmentLabel,
  getTodoUserLabel,
  isCurrentUserEligible,
  listTodos,
  releaseTodoFromCurrentUser,
  TODO_DEPARTMENTS,
  TODO_STATUS,
} from '../lib/todos.js'

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function dueClass(todo) {
  if (!todo.dueDate || todo.status === 'completed') return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${todo.dueDate}T12:00:00`)
  const diff = Math.round((due - today) / 86400000)
  return diff < 0 ? 'due-date due-date--overdue' : diff <= 7 ? 'due-date due-date--soon' : 'due-date'
}

function recipientLabel(todo) {
  return todo.recipientType === 'personal' ? getTodoUserLabel(todo.recipientUserId) : getTodoDepartmentLabel(todo.recipientDepartment)
}

export default function TodosPage() {
  const { canEdit } = usePermissions()
  const [todos, setTodos] = useState([])
  const [tab, setTab] = useState('personal')
  const [department, setDepartment] = useState('all')
  const [status, setStatus] = useState('open')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  async function loadTodos() {
    const entries = await listTodos()
    setTodos(entries)
  }

  useEffect(() => {
    let current = true
    listTodos()
      .then((entries) => { if (current) setTodos(entries) })
      .catch(() => { if (current) setError('Die To-dos konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  const visibleTodos = useMemo(() => todos.filter((todo) => {
    const matchesTab = tab === 'personal'
      ? todo.recipientType === 'personal' && todo.recipientUserId === DEMO_CURRENT_USER.id
      : todo.recipientType === 'department' && (department === 'all' || todo.recipientDepartment === department)
    const matchesStatus = status === 'all' || todo.status === status
    return matchesTab && matchesStatus
  }), [department, status, tab, todos])

  async function addTodo(values) {
    await createTodo(values)
    await loadTodos()
    setToast('To-do gespeichert.')
  }

  async function handleAction(action, todo) {
    setError('')
    try {
      if (action === 'assign') await assignTodoToCurrentUser(todo.id)
      if (action === 'release') await releaseTodoFromCurrentUser(todo.id)
      if (action === 'complete') await completeTodoForCurrentUser(todo.id)
      await loadTodos()
      setToast(action === 'assign' ? 'To-do übernommen.' : action === 'release' ? 'Bearbeitung freigegeben.' : 'To-do erledigt.')
    } catch {
      setError('Die Änderung konnte nicht gespeichert werden.')
    }
  }

  const editable = canEdit('todos')
  return <div className="todos-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <div className="todo-tabs" role="tablist" aria-label="To-do-Bereich"><button className={tab === 'personal' ? 'todo-tabs__tab todo-tabs__tab--active' : 'todo-tabs__tab'} type="button" onClick={() => setTab('personal')}>Persönlich</button><button className={tab === 'department' ? 'todo-tabs__tab todo-tabs__tab--active' : 'todo-tabs__tab'} type="button" onClick={() => setTab('department')}>Abteilungen</button></div>
    <div className="list-toolbar todo-toolbar"><div className="list-controls">{tab === 'department' && <label className="filter-field"><span className="sr-only">Abteilung filtern</span><select value={department} onChange={(event) => setDepartment(event.target.value)}>{TODO_DEPARTMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}<label className="filter-field"><span className="sr-only">Status filtern</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">Aktiv</option><option value="completed">Erledigt</option><option value="all">Alle</option></select></label></div>{editable && <button className="button" type="button" onClick={() => setShowForm(true)}>To-do anlegen</button>}</div>
    <p className="todo-demo-hint">Demo-Benutzer: {DEMO_CURRENT_USER.name} · ohne Benutzer- oder Rechteprüfung</p>
    {showForm && <TodoForm onCancel={() => setShowForm(false)} onSubmit={addTodo} />}
    {error && <p className="form-error">{error}</p>}
    <div className="table-frame todos-table"><table><thead><tr><th>To-do</th><th>Empfänger</th><th>Ersteller</th><th>Bearbeiter</th><th>Fälligkeit</th><th>Status</th><th>Aktion</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="7" className="table-state">To-dos werden geladen …</td></tr> : visibleTodos.length ? visibleTodos.map((todo) => <tr key={todo.id}><td><strong>{todo.title}</strong>{todo.description && <span className="table-subline">{todo.description}</span>}</td><td>{recipientLabel(todo)}</td><td>{todo.creatorName || '—'}</td><td>{todo.assignedUserName ? `Bearbeiter: ${todo.assignedUserName}` : '—'}</td><td><span className={dueClass(todo)}>{formatDate(todo.dueDate)}</span></td><td><span className={`todo-status todo-status--${todo.status}`}>{TODO_STATUS[todo.status] || '—'}</span></td><td className="todo-actions">{editable && todo.status === 'open' && isCurrentUserEligible(todo) && <>{!todo.assignedUserId && todo.recipientType === 'department' && <button type="button" onClick={() => handleAction('assign', todo)}>Übernehmen</button>}{todo.assignedUserId === DEMO_CURRENT_USER.id && <button type="button" onClick={() => handleAction('release', todo)}>Freigeben</button>}<button type="button" onClick={() => handleAction('complete', todo)}>Erledigen</button></>}</td></tr>) : <tr><td colSpan="7" className="table-state">Für diese Auswahl gibt es keine To-dos.</td></tr>}
    </tbody></table></div>
  </div>
}
