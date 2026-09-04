import { ChevronIcon } from '../icons.jsx'
import { TODO_PRIORITY, TODO_STATUS, todoDuePresentation, todoPriority, todoStatus } from '../../lib/todos.js'

function formatTimestamp(value) { const date = value?.toDate?.(); return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date) : '—' }
function PriorityChip({ priority }) { const symbol = { high: '!', medium: '•', low: '↓' }[priority]; return <span className={`todo-priority todo-priority--${priority}`}><span className="todo-priority__icon">{symbol}</span>{TODO_PRIORITY[priority]}</span> }
function StatusChip({ status }) { return <span className={`todo-status todo-status--${status}`}>{TODO_STATUS[status] || '—'}</span> }

export default function TodosTable({ formatDate, onOpen, todos }) {
  if (!todos.length) return <p className="todos-gallery__state">Keine To-dos vorhanden.</p>
  return <div className="todos-table-frame"><table className="todos-table"><thead><tr><th>Status</th><th>Aufgabe</th><th>Wichtigkeit</th><th>Fällig am</th><th>Bearbeiter</th><th>Erstellt von</th><th>Zuletzt aktualisiert</th><th><span className="sr-only">Öffnen</span></th></tr></thead><tbody>{todos.map((todo) => { const due = todoDuePresentation(todo); const appearance = due.days === null ? 'none' : due.days <= 0 ? 'critical' : due.days <= 2 ? 'urgent' : due.days <= 5 ? 'warning' : 'none'; const dueText = !todo.dueDate ? 'Keine Fälligkeit' : `${due.label} · ${formatDate(todo.dueDate)}`; return <tr className={`todos-table__row--${appearance}`} key={todo.id}><td><StatusChip status={todoStatus(todo)} /></td><td className="todos-table__title" title={todo.title}>{todo.title}</td><td><PriorityChip priority={todoPriority(todo)} /></td><td className={`todos-table__due todos-table__due--${appearance}`}>{dueText}</td><td>{todo.assignedUserName || 'Noch nicht übernommen'}</td><td>{todo.creatorName || '—'}</td><td>{formatTimestamp(todo.updatedAt)}</td><td><button className="todos-table__open" type="button" onClick={() => onOpen(todo)}>Öffnen <ChevronIcon size={13} /></button></td></tr> })}</tbody></table></div>
}
