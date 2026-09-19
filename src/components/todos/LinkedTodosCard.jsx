import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TodoPriority } from './TodoPriority.jsx'
import { TODO_STATUS, todoPriority, todoStatus } from '../../lib/todos.js'

function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }

export default function LinkedTodosCard({ loading, todos }) {
  const [selected, setSelected] = useState(null)
  const selectedTodo = selected ? todos.find((todo) => todo.id === selected.id) || selected : null

  return <>
    <section className="todo-detail-content linked-todos-card" aria-labelledby="linked-todos-title">
      <div className="todo-detail-section-heading"><h3 id="linked-todos-title">Bestehende To-dos</h3></div>
      <div className="todos-table-frame"><table className="data-table todos-table"><thead><tr><th>Aufgabe</th><th>Status</th><th>Fällig am</th></tr></thead><tbody>{loading ? <tr><td className="table-state" colSpan="3">To-dos werden geladen …</td></tr> : !todos.length ? <tr><td className="table-state" colSpan="3">Keine To-dos mit diesem Fall verknüpft.</td></tr> : todos.map((todo) => <tr key={todo.id} className="damage-deadlines__row" tabIndex="0" role="button" onClick={() => setSelected(todo)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(todo) } }} aria-label={`To-do ${todo.title} öffnen`}><td>{todo.title}</td><td><span className={`todo-status todo-status--${todoStatus(todo)}`}>{TODO_STATUS[todoStatus(todo)] || '—'}</span></td><td>{formatDate(todo.dueDate)}</td></tr>)}</tbody></table></div>
    </section>
    {selectedTodo && <section className="todo-detail-content linked-todos-card linked-todos-card__details" aria-labelledby="linked-todo-details-title"><div className="todo-detail-section-heading"><h3 id="linked-todo-details-title">To-do-Details</h3></div><dl><div><dt>Aufgabe</dt><dd>{selectedTodo.title}</dd></div><div><dt>Status</dt><dd><span className={`todo-status todo-status--${todoStatus(selectedTodo)}`}>{TODO_STATUS[todoStatus(selectedTodo)] || '—'}</span></dd></div><div><dt>Wichtigkeit</dt><dd><TodoPriority priority={todoPriority(selectedTodo)} /></dd></div><div><dt>Fällig am</dt><dd>{formatDate(selectedTodo.dueDate)}</dd></div><div><dt>Bearbeiter</dt><dd>{selectedTodo.assignedUserName || 'Noch nicht übernommen'}</dd></div><div><dt>Beschreibung</dt><dd>{selectedTodo.description || '—'}</dd></div></dl><div className="form-actions"><Link className="button" to={`/todos/${selectedTodo.id}`}>Zum To-do</Link></div></section>}
  </>
}
