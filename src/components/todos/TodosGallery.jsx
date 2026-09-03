import { TODO_STATUS } from '../../lib/todos.js'

export default function TodosGallery({ formatDate, getDueClass, loading, onDetails, todos }) {
  if (loading) return <p className="todos-gallery__state">To-dos werden geladen …</p>
  if (!todos.length) return <p className="todos-gallery__state">Keine To-dos vorhanden.</p>

  return <div className="todos-gallery">
    {todos.map((todo) => <article className="todo-card" key={todo.id}>
      <div className="todo-card__content">
        <div className="todo-card__heading"><h2 title={todo.title}>{todo.title}</h2><span className={`todo-status todo-status--${todo.status}`}>{TODO_STATUS[todo.status] || '—'}</span></div>
        <p className="todo-card__description">{todo.description || 'Keine zusätzliche Beschreibung.'}</p>
        <dl className="todo-card__details">
          <div><dt>Fälligkeit</dt><dd className={getDueClass(todo)}>{formatDate(todo.dueDate)}</dd></div>
          <div><dt>Zielgruppe</dt><dd>{todo.audienceLabel || '—'}</dd></div>
          <div><dt>Bearbeiter</dt><dd>{todo.assignedUserName || 'Noch nicht übernommen'}</dd></div>
          <div><dt>Ersteller</dt><dd>{todo.creatorName || '—'}</dd></div>
        </dl>
      </div>
      <div className="todo-card__footer"><button type="button" onClick={() => onDetails(todo)}>Details ansehen</button></div>
    </article>)}
  </div>
}
