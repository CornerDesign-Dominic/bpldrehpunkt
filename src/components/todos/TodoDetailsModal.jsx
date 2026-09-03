import { useEffect } from 'react'
import { TODO_STATUS } from '../../lib/todos.js'

function Detail({ label, children }) {
  return <div><dt>{label}</dt><dd>{children || '—'}</dd></div>
}

function formatTimestamp(timestamp) {
  const value = timestamp?.toDate?.()
  return value ? new Intl.DateTimeFormat('de-DE').format(value) : '—'
}

export default function TodoDetailsModal({ formatDate, getDueClass, onClose, todo, children }) {
  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape') onClose() }
    window.document.addEventListener('keydown', closeOnEscape)
    return () => window.document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="todo-details-modal" role="dialog" aria-modal="true" aria-labelledby="todo-details-title"><div className="todo-details-modal__heading"><div><span className={`todo-status todo-status--${todo.status}`}>{TODO_STATUS[todo.status] || '—'}</span><h2 id="todo-details-title">{todo.title}</h2></div><button type="button" onClick={onClose} aria-label="Details schließen" title="Schließen">×</button></div><dl className="todo-details"><Detail label="Beschreibung"><span className="todo-details__description">{todo.description || 'Keine zusätzliche Beschreibung.'}</span></Detail><Detail label="Fälligkeit"><span className={getDueClass(todo)}>{formatDate(todo.dueDate)}</span></Detail><Detail label="Zielgruppe">{todo.audienceLabel}</Detail><Detail label="Ersteller">{todo.creatorName}</Detail><Detail label="Bearbeiter">{todo.assignedUserName || 'Noch nicht übernommen'}</Detail><Detail label="Übernommen am">{formatTimestamp(todo.assignedAt)}</Detail>{todo.completedAt && <Detail label="Erledigt am">{formatTimestamp(todo.completedAt)}</Detail>}</dl>{children && <div className="todo-details-modal__actions">{children}</div>}</section></div>
}
