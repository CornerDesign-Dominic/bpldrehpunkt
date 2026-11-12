import { useLanguage } from '../../i18n/useLanguage.js'
import { getUserDisplayName } from '../../lib/userProfiles.js'
import { todoFormAudience } from '../../lib/todoFormRecipients.js'
import { todoEligibleParticipants, todoReminderRecipientIds } from '../../../shared/todoCollaboration.js'
import { CalendarIcon } from '../icons.jsx'
import '../../styles/todos.css'

function recipientState(todo, values, users, currentUserId) {
  const audience = todoFormAudience(todo, currentUserId)
  const participants = todoEligibleParticipants(audience, users)
  const mode = values.reminderRecipientMode === 'selected' ? 'selected' : 'all'
  const selected = Array.isArray(values.reminderRecipientUserIds) ? values.reminderRecipientUserIds : []
  const ids = todoReminderRecipientIds(audience, { ...values, reminderRecipientMode: mode }, users)
  return { audience, participants, mode, selected, recipients: participants.filter((entry) => ids.includes(entry.id)) }
}

export function TodoCalendarPlacement({ todo, values, users = [], currentUserId }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const { audience, recipients } = recipientState(todo, values, users, currentUserId)
  const department = audience.audienceType === 'department'
  const names = recipients.map((entry) => getUserDisplayName(entry, entry)).join(', ')
  return <section className="todo-calendar-placement" aria-label={en ? 'Calendar placement' : 'Kalenderplatzierung'}>
    <span className="todo-calendar-placement__icon" aria-hidden="true"><CalendarIcon size={18} /></span>
    <div><h3>{en ? 'Calendar placement' : 'Kalenderplatzierung'}</h3><p>{department
      ? (en ? `Department calendar ${audience.audienceId || '—'}.` : `Abteilungskalender ${audience.audienceId || '—'}.`)
      : names ? (en ? `Personal calendars: ${names}.` : `Persönliche Kalender: ${names}.`) : (en ? 'No personal calendar selected.' : 'Kein persönlicher Kalender ausgewählt.')}</p>
    </div>
  </section>
}

export default function TodoReminderRecipients({ todo, users = [], currentUserId, values, onChange, enabled = false, disabled = false, showCalendar = true }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const { audience, participants, mode, selected, recipients } = recipientState(todo, values, users, currentUserId)
  const department = audience.audienceType === 'department'
  const selectable = !department || enabled
  const selectionLabel = department ? (en ? 'Email reminder for' : 'Mail-Erinnerung an')
    : enabled ? (en ? 'Calendar / email reminder for' : 'Kalender / Mail-Erinnerung an') : (en ? 'Calendar for' : 'Kalender für')
  if (!showCalendar && !selectable) return null
  return <section className="todo-recipient-selection" aria-label={en ? 'Calendar placement and reminder recipients' : 'Kalender und Erinnerungsempfänger'}>
    {showCalendar && <TodoCalendarPlacement todo={todo} values={values} users={users} currentUserId={currentUserId} />}
    {selectable && <div className="todo-recipient-selection__controls">
      <div className="todo-recipient-selection__heading"><label className="form-field"><span>{selectionLabel}</span><select disabled={disabled} value={mode} onChange={(event) => onChange({ reminderRecipientMode: event.target.value, reminderRecipientUserIds: event.target.value === 'all' ? [] : selected.filter((id) => participants.some((entry) => entry.id === id)) })}><option value="all">{en ? 'All current participants' : 'Alle aktuellen Beteiligten'}</option><option value="selected">{en ? 'Select people' : 'Personen auswählen'}</option></select></label><span className="todo-recipient-selection__count">{recipients.length} {recipients.length === 1 ? (en ? 'person' : 'Person') : (en ? 'people' : 'Personen')}</span></div>
      {mode === 'selected' && <fieldset disabled={disabled} className="todo-recipient-selection__people"><legend>{en ? 'People from this to-do' : 'Personen aus diesem To-do'}</legend>{participants.map((entry) => <label key={entry.id} className={selected.includes(entry.id) ? 'is-selected' : ''}><input type="checkbox" checked={selected.includes(entry.id)} onChange={(event) => onChange({ reminderRecipientMode: 'selected', reminderRecipientUserIds: event.target.checked ? [...new Set([...selected, entry.id])] : selected.filter((id) => id !== entry.id) })} /><span>{getUserDisplayName(entry, entry)}</span></label>)}</fieldset>}
      {!recipients.length && <p className="todo-recipient-selection__warning" role="status">{en ? 'No eligible recipients selected. No reminder will be sent.' : 'Keine berechtigten Empfänger ausgewählt. Es wird keine Erinnerung versendet.'}{!department && (en ? ' No personal calendar entry will be shown.' : ' Es erscheint kein persönlicher Kalendereintrag.')}</p>}
    </div>}
  </section>
}
