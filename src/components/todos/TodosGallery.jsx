import { TODO_PRIORITY, TODO_STATUS, todoDuePresentation, todoPriority } from '../../lib/todos.js'

function formatTimestamp(value) {
  const date = value?.toDate?.()
  return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—'
}

function PriorityChip({ priority }) {
  const symbol = { high: '!', medium: '•', low: '↓' }[priority]
  return <span className={`todo-priority todo-priority--${priority}`}><span className="todo-priority__icon" aria-hidden="true">{symbol}</span><span>{TODO_PRIORITY[priority]}</span></span>
}

export default function TodosGallery({ formatDate, getDueClass, loading, onOpen, todos }) {
  if (loading) return <p className="todos-gallery__state">To-dos werden geladen …</p>
  if (!todos.length) return <p className="todos-gallery__state">Keine To-dos vorhanden.</p>

  return <div className="todos-gallery">
    {todos.map((todo) => {
      const due = todoDuePresentation(todo)
      const contextLabel = todo.assignedUserId ? (todo.status === 'in_progress' ? 'Bearbeitet von' : 'Bearbeiter') : 'Zielgruppe'
      const contextValue = todo.assignedUserId ? todo.assignedUserName || 'Unbekannt' : todo.audienceLabel || '—'
      const dueLabel = !todo.dueDate
        ? 'Keine Fälligkeit'
        : due.kind === 'none' && due.days !== null
          ? `Fällig in ${due.days} ${due.days === 1 ? 'Tag' : 'Tagen'} – ${formatDate(todo.dueDate)}`
          : `${due.label} – ${formatDate(todo.dueDate)}`
      const dueAppearance = due.kind === 'soon' ? (due.days === 1 ? 'tomorrow' : due.days === 2 ? 'soon' : 'none') : due.kind
      const priority = todoPriority(todo)
      return <article className={`todo-card todo-card--${dueAppearance}`} key={todo.id}>
      <div className="todo-card__content">
        <div className="todo-card__meta"><h2 className="todo-card__title" title={todo.title}>{todo.title}</h2><PriorityChip priority={priority} /></div>
        <p className={`todo-card__due ${getDueClass(todo)}`}>{dueLabel}</p>
        <dl className="todo-card__details">
          <div><dt>Erstellt von</dt><dd>{todo.creatorName || '—'}</dd></div>
          <div><dt>{contextLabel}</dt><dd>{contextValue}</dd></div>
          <div><dt>Erstellt am</dt><dd>{formatTimestamp(todo.createdAt)}</dd></div>
          <div className="todo-card__updated"><dt>Zuletzt aktualisiert</dt><dd>{formatTimestamp(todo.updatedAt)}</dd></div>
        </dl>
      </div>
      <div className="todo-card__footer"><span className={`todo-status todo-card__status todo-status--${todo.status}`}>{TODO_STATUS[todo.status] || '—'}</span><button className="todo-card__open" type="button" onClick={() => onOpen(todo)}>Öffnen</button></div>
    </article>
    })}
  </div>
}
