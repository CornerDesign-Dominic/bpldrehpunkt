import { useLanguage } from '../../i18n/useLanguage.js'
import ReminderFields from '../reminders/ReminderFields.jsx'
import { TodoPriorityPicker } from './TodoPriority.jsx'
import TodoReminderHelp from './TodoReminderHelp.jsx'
import TodoReminderRecipients from './TodoReminderRecipients.jsx'
import '../../styles/todos.css'

export default function TodoScheduleFields({ values, onChange, users, currentUserId, disabled = false }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const update = (field, value) => onChange({ [field]: value })
  return <div className="todo-schedule">
    <div className="todo-schedule__overview">
      <TodoPriorityPicker value={values.priority} onChange={value => update('priority', value)} />
      <label className="form-field"><span>{en ? 'Due date' : 'Fällig am'}</span><input type="date" value={values.dueDate || ''} disabled={disabled} onChange={event => update('dueDate', event.target.value)} /></label>
    </div>
    <section className="todo-schedule__reminder" aria-label={en ? 'Email reminder' : 'Mail-Erinnerung'}>
      <header><h4>{en ? 'Email reminder' : 'Mail-Erinnerung'} <span>optional</span></h4><TodoReminderHelp /></header>
      <div className="todo-schedule__reminder-fields"><ReminderFields values={{ date: values.reminderDate, time: values.reminderTime, occurrence: values.reminderOccurrence }} onChange={(field, value) => update({ date: 'reminderDate', time: 'reminderTime', occurrence: 'reminderOccurrence' }[field], value)} required={Boolean(values.reminderDate)} recipientRule="todo" disabled={disabled} showHint={false} timeLabel="Uhrzeit" /></div>
    </section>
    {(values.dueDate || values.reminderDate) && <TodoReminderRecipients todo={values} values={values} users={users} currentUserId={currentUserId} enabled={Boolean(values.reminderDate)} disabled={disabled} onChange={onChange} />}
  </div>
}
