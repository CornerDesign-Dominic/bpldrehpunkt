import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'
import { localeForLanguage } from '../../i18n/translations.js'
import { translateStatic } from '../../i18n/autoTranslate.js'
import { TODO_STATUS, todoDuePresentation, todoPriority, todoStatus } from '../../lib/todos.js'
import { ChevronIcon } from '../icons.jsx'
import { TodoPriority } from './TodoPriority.jsx'

function formatTimestamp(value, language) {
  const date = value?.toDate?.()
  return date ? new Intl.DateTimeFormat(localeForLanguage(language), { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—'
}

function StatusChip({ status }) {
  const symbol = { open: '○', in_progress: '●', completed: '✓', withdrawn: '–' }[status]
  return <span className={`todo-status todo-card__status todo-status--${status}`}><span className="todo-status__icon" aria-hidden="true">{symbol}</span><span><StaticText source={TODO_STATUS[status] || '—'} /></span></span>
}

export default function TodosGallery({ formatDate, getDueClass, loading, onOpen, todos }) {
  const { language, t } = useLanguage()
  if (loading) return <p className="todos-gallery__state"><StaticText source={"To-dos werden geladen …"} /></p>
  if (!todos.length) return <p className="todos-gallery__state"><StaticText source={"Keine To-dos vorhanden."} /></p>

  return <div className="todos-gallery">
    {todos.map((todo) => {
      const due = todoDuePresentation(todo)
      const contextLabel = todo.assignedUserId ? (todo.status === 'in_progress' ? 'Bearbeitet von' : 'Bearbeiter') : 'Zielgruppe'
      const contextValue = todo.assignedUserId ? todo.assignedUserName || 'Unbekannt' : todo.audienceLabel || '—'
      const dueLabel = !todo.dueDate
        ? t('todos.noDue')
        : due.kind === 'none' && due.days !== null
          ? t('todos.dueIn', { days: due.days, unit: t(due.days === 1 ? 'todos.day' : 'todos.days'), date: formatDate(todo.dueDate) })
          : `${translateStatic(language, due.label)} – ${formatDate(todo.dueDate)}`
      const dueAppearance = due.days === null ? 'none' : due.days <= 0 ? 'critical' : due.days <= 2 ? 'urgent' : due.days <= 5 ? 'warning' : 'none'
      const priority = todoPriority(todo)
      return <article className={`todo-card todo-card--${dueAppearance}`} key={todo.id}>
      <div className="todo-card__content">
        <div className="todo-card__meta"><h2 className="todo-card__title" title={todo.title}>{todo.title}</h2><TodoPriority priority={priority} /></div>
        <p className={`todo-card__due ${getDueClass(todo)}`}>{dueLabel}</p>
        <dl className="todo-card__details">
          <div><dt><StaticText source={"Erstellt von"} /></dt><dd>{todo.creatorName || '—'}</dd></div>
          <div><dt><StaticText source={contextLabel} /></dt><dd>{contextValue}</dd></div>
          <div><dt><StaticText source={"Erstellt am"} /></dt><dd>{formatTimestamp(todo.createdAt, language)}</dd></div>
          <div className="todo-card__updated"><dt><StaticText source={"Zuletzt aktualisiert"} /></dt><dd>{formatTimestamp(todo.updatedAt, language)}</dd></div>
        </dl>
      </div>
      <div className="todo-card__footer"><StatusChip status={todoStatus(todo)} /><button className="todo-card__open" type="button" onClick={() => onOpen(todo)}><StaticText source={"Öffnen"} /> <ChevronIcon size={14} /></button></div>
    </article>
    })}
  </div>
}
