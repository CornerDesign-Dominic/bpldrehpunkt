import { TODO_PRIORITY, TODO_STATUS, todoDuePresentation, todoPriority } from '../../lib/todos.js'

function formatTimestamp(value) {
  const date = value?.toDate?.()
  return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—'
}

function PriorityChip({ priority }) {
  const symbol = { high: '!', medium: '•', low: '↓' }[priority]
  return <span className={`todo-priority todo-priority--${priority}`}><span className="todo-priority__icon" aria-hidden="true">{symbol}</span><span>{TODO_PRIORITY[priority]}</span></span>
}

export default function TodosGallery({ formatDate, getDueClass, loading, onOpen, onPreview, onTake, todos }) {
  if (loading) return <p className="todos-gallery__state">To-dos werden geladen …</p>
  if (!todos.length) return <p className="todos-gallery__state">Keine To-dos vorhanden.</p>

  return <div className="todos-gallery">
    {todos.map((todo) => {
      const due = todoDuePresentation(todo)
      const canTake = Boolean(onTake) && todo.status === 'open' && !todo.assignedUserId
      const contextLabel = todo.assignedUserId ? (todo.status === 'in_progress' ? 'Bearbeitet von' : 'Bearbeiter') : 'Zielgruppe'
      const contextValue = todo.assignedUserId ? todo.assignedUserName || 'Unbekannt' : todo.audienceLabel || '—'
      const dueLabel = due.kind === 'none' ? (todo.dueDate ? formatDate(todo.dueDate) : 'Keine Fälligkeit') : due.label
      const dueAppearance = due.kind === 'soon' ? (due.days === 1 ? 'tomorrow' : due.days === 2 ? 'soon' : 'none') : due.kind
      const priority = todoPriority(todo)
      return <article className={`todo-card todo-card--${dueAppearance}`} key={todo.id}>
      <div className="todo-card__content">
        <div className="todo-card__meta"><span className={`todo-status todo-status--${todo.status}`}>{TODO_STATUS[todo.status] || '—'}</span><PriorityChip priority={priority} /></div>
        <h2 className="todo-card__title" title={todo.title}>{todo.title}</h2>
        <p className="todo-card__description">{todo.description || 'Keine zusätzliche Beschreibung.'}</p>
        <dl className="todo-card__details">
          <div className="todo-card__due"><dt>Fälligkeit</dt><dd className={getDueClass(todo)}>{dueLabel}</dd></div>
          <div><dt>{contextLabel}</dt><dd>{contextValue}</dd></div>
          <div className="todo-card__updated"><dt>Zuletzt aktualisiert</dt><dd>{formatTimestamp(todo.updatedAt)}</dd></div>
        </dl>
      </div>
      <div className="todo-card__footer">{canTake && <button className="todo-card__take" type="button" onClick={() => onTake(todo)}>Aufgabe annehmen</button>}<button type="button" onClick={() => onPreview(todo)}>Vorschau</button><button type="button" onClick={() => onOpen(todo)}>Öffnen</button></div>
    </article>
    })}
  </div>
}
