import { TODO_PRIORITY } from '../../lib/todos.js'
import { TodoPriorityIcon } from '../icons.jsx'

const priorityValues = ['high', 'medium', 'low']

function normalizedPriority(priority) {
  return priorityValues.includes(priority) ? priority : 'medium'
}

export function TodoPriority({ priority }) {
  const value = normalizedPriority(priority)
  const symbol = value === 'high' ? '!' : null
  return <span className={`todo-priority-text todo-priority-text--${value}`}><span className="todo-priority-text__symbol" aria-hidden="true">{symbol || <TodoPriorityIcon priority={value} />}</span><span>{TODO_PRIORITY[value]}</span></span>
}

export function TodoPriorityPicker({ disabled = false, onChange, value }) {
  const selected = normalizedPriority(value)
  return <fieldset className="todo-priority-picker"><legend>Wichtigkeit</legend><div>{priorityValues.map((priority) => <label className={`todo-priority-picker__option${selected === priority ? ' todo-priority-picker__option--selected' : ''}`} key={priority}><input className="sr-only" type="radio" name="priority" value={priority} checked={selected === priority} disabled={disabled} onChange={(event) => onChange(event.target.value)} /><TodoPriority priority={priority} /></label>)}</div></fieldset>
}
