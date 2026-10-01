import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TodoPriority } from './TodoPriority.jsx'
import { TODO_STATUS, todoPriority, todoStatus } from '../../lib/todos.js'

function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }

export default function LinkedTodosCard({ canCreate = false, loading, onCreate, todos }) {
  const [selected, setSelected] = useState(null)
  const selectedTodo = selected ? todos.find((todo) => todo.id === selected.id) || selected : null

  return <>
    <section className="todo-detail-content linked-todos-card" aria-labelledby="linked-todos-title">
      <div className="todo-detail-section-heading"><h3 id="linked-todos-title"><StaticText source={"Bestehende To-dos"} /></h3>{canCreate && <button className="button linked-todos-card__add" type="button" onClick={onCreate}><StaticText source={"To-do hinzufügen"} /></button>}</div>
      {!loading && !todos.length ? <p className="todo-updates__empty linked-todos-card__empty"><StaticText source={"Keine To-dos mit diesem Fall verknüpft."} /></p> : <div className="todos-table-frame"><table className="data-table todos-table"><thead><tr><th><StaticText source={"Aufgabe"} /></th><th>Status</th><th><StaticText source={"Fällig am"} /></th></tr></thead><tbody>{loading ? <tr><td className="table-state" colSpan="3"><StaticText source={"To-dos werden geladen …"} /></td></tr> : todos.map((todo) => <tr key={todo.id} className="damage-deadlines__row" tabIndex="0" role="button" onClick={() => setSelected(todo)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(todo) } }} aria-label={`To-do ${todo.title} öffnen`}><td>{todo.title}</td><td><span className={`todo-status todo-status--${todoStatus(todo)}`}>{TODO_STATUS[todoStatus(todo)] || '—'}</span></td><td>{formatDate(todo.dueDate)}</td></tr>)}</tbody></table></div>}
    </section>
    {selectedTodo && <section className="todo-detail-content linked-todos-card linked-todos-card__details" aria-labelledby="linked-todo-details-title"><div className="todo-detail-section-heading"><h3 id="linked-todo-details-title"><StaticText source={"To-do-Details"} /></h3></div><dl><div><dt><StaticText source={"Aufgabe"} /></dt><dd>{selectedTodo.title}</dd></div><div><dt>Status</dt><dd><span className={`todo-status todo-status--${todoStatus(selectedTodo)}`}>{TODO_STATUS[todoStatus(selectedTodo)] || '—'}</span></dd></div><div><dt><StaticText source={"Wichtigkeit"} /></dt><dd><TodoPriority priority={todoPriority(selectedTodo)} /></dd></div><div><dt><StaticText source={"Fällig am"} /></dt><dd>{formatDate(selectedTodo.dueDate)}</dd></div><div><dt><StaticText source={"Bearbeiter"} /></dt><dd>{selectedTodo.assignedUserName || <StaticText source={"Noch nicht übernommen"} />}</dd></div><div><dt><StaticText source={"Beschreibung"} /></dt><dd>{selectedTodo.description || '—'}</dd></div></dl><div className="form-actions"><Link className="button" to={`/todos/${selectedTodo.id}`}><StaticText source={"Zum To-do"} /></Link></div></section>}
  </>
}
