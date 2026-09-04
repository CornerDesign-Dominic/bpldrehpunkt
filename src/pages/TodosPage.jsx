import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TodoForm from '../components/todos/TodoForm.jsx'
import TodosGallery from '../components/todos/TodosGallery.jsx'
import TodosTable from '../components/todos/TodosTable.jsx'
import { GridViewIcon, TableViewIcon } from '../components/icons.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getUserDisplayName, listUserProfiles } from '../lib/userProfiles.js'
import { listBusinessPartners } from '../lib/businessPartners.js'
import {
  audienceHasChanged,
  createTodo,
  isAudienceMember,
  isSelfTodo,
  listTodosForActor,
  sortTodosForGroup,
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

export default function TodosPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { canEdit, canView } = usePermissions()
  const actor = useMemo(() => ({ user, profile }), [profile, user])
  const [todos, setTodos] = useState([])
  const [users, setUsers] = useState([])
  const [partners, setPartners] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState('active')
  const [view, setView] = useState(() => window.localStorage.getItem('todos-view') === 'table' ? 'table' : 'grid')
  const editable = canEdit('todos')
  const canViewMasterData = canView('masterData')
  const activeUsers = useMemo(() => users.filter((item) => item.active !== false).sort((left, right) => getUserDisplayName(left, left).localeCompare(getUserDisplayName(right, right), 'de')), [users])
  const usersById = useMemo(() => new Map(activeUsers.map((item) => [item.id, item])), [activeUsers])

  useEffect(() => { window.localStorage.setItem('todos-view', view) }, [view])

  async function loadTodos() {
    setTodos(await listTodosForActor(actor))
  }

  useEffect(() => {
    let current = true
    Promise.all([listTodosForActor(actor), editable ? listUserProfiles() : Promise.resolve([]), canViewMasterData ? listBusinessPartners() : Promise.resolve([])])
      .then(([entries, profiles, businessPartners]) => { if (current) { setTodos(entries); setUsers(profiles); setPartners(businessPartners) } })
      .catch(() => { if (current) setError('Die To-dos konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [actor, canViewMasterData, editable])

  const todoGroups = useMemo(() => {
    const visible = todos.filter((todo) => filter === 'all' || (filter === 'active' ? ['open', 'in_progress'].includes(todo.status) : todo.status === 'completed'))
    return {
    mine: sortTodosForGroup(visible.filter((todo) => todo.assignedUserId === user.uid), 'mine'),
    created: sortTodosForGroup(visible.filter((todo) => todo.creatorUserId === user.uid && !isSelfTodo(todo, user.uid)), 'created'),
    // Übernommene Aufgaben bleiben für die berechtigte Zielgruppe sichtbar;
    // nur die Übernahmeaktion selbst verschwindet dann.
    pool: sortTodosForGroup(visible.filter((todo) => isAudienceMember(todo, actor) && !isSelfTodo(todo, user.uid)), 'pool'),
    }
  }, [actor, filter, todos, user.uid])

  async function addTodo(values) {
    await createTodo(values, actor, usersById)
    await loadTodos()
    setToast('To-do gespeichert.')
  }

  async function saveEdit(values) {
    const audienceChanged = audienceHasChanged(editing.todo, values, user.uid)
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
    await updateTodoByCreator(editing.todo, values, usersById, resetAssignment, actor)
    await loadTodos()
    setEditing(null)
    setToast(resetAssignment ? 'To-do neu zugewiesen und wieder geöffnet.' : 'To-do aktualisiert.')
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
    <div className="list-toolbar todo-toolbar"><div className="todo-toolbar__views"><div className="todo-tabs" role="tablist" aria-label="To-dos filtern"><button className={`todo-tabs__tab ${filter === 'active' ? 'todo-tabs__tab--active' : ''}`} type="button" role="tab" aria-selected={filter === 'active'} onClick={() => setFilter('active')}>Aktiv</button><button className={`todo-tabs__tab ${filter === 'completed' ? 'todo-tabs__tab--active' : ''}`} type="button" role="tab" aria-selected={filter === 'completed'} onClick={() => setFilter('completed')}>Erledigt</button><button className={`todo-tabs__tab ${filter === 'all' ? 'todo-tabs__tab--active' : ''}`} type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>Alle</button></div><div className="todo-view-switcher" aria-label="Ansicht auswählen"><button className={view === 'grid' ? 'todo-view-switcher__button todo-view-switcher__button--active' : 'todo-view-switcher__button'} type="button" title="Card-Ansicht" aria-label="Card-Ansicht" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><GridViewIcon /></button><button className={view === 'table' ? 'todo-view-switcher__button todo-view-switcher__button--active' : 'todo-view-switcher__button'} type="button" title="Tabellenansicht" aria-label="Tabellenansicht" aria-pressed={view === 'table'} onClick={() => setView('table')}><TableViewIcon /></button></div></div>{editable && <button className="button" type="button" onClick={() => { setEditing(null); setShowForm(true) }}>To-do anlegen</button>}</div>
    {showForm && <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false) }}><section className="todo-form-modal" role="dialog" aria-modal="true" aria-label="To-do anlegen"><TodoForm key="new" currentUserId={user.uid} partners={partners} users={activeUsers} onCancel={() => setShowForm(false)} onSubmit={addTodo} /></section></div>}
    {editing && <TodoForm key={editing.todo.id} currentUserId={user.uid} initialTodo={editing.todo} partners={partners} users={activeUsers} onCancel={() => setEditing(null)} onSubmit={saveEdit} />}
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="todos-gallery__state">To-dos werden geladen …</p> : <div className="todo-sections">{[['mine', 'Meine Aufgaben'], ['created', 'Von mir erstellt'], ['pool', 'Aufgabenpool']].map(([key, title]) => <section className="todo-section" key={key}><div className="todo-section__heading"><h2>{title}</h2><span>{todoGroups[key].length}</span></div>{view === 'grid' ? <TodosGallery todos={todoGroups[key]} formatDate={formatDate} getDueClass={dueClass} onOpen={(todo) => navigate(`/todos/${todo.id}`)} /> : <TodosTable todos={todoGroups[key]} formatDate={formatDate} onOpen={(todo) => navigate(`/todos/${todo.id}`)} />}</section>)}</div>}
  </div>
}
