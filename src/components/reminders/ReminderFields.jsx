import { reminderMinuteState, resolveReminderTime } from '../../../shared/reminderTime.js'
import { reminderValidationMessage } from '../../lib/reminderForm.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { translateStatic } from '../../i18n/autoTranslate.js'

const rules = {
  todo: ['Erinnerungen erhalten die ausgewählten aktuellen Beteiligten dieses To-dos.', 'Reminders are sent to the selected current participants of this to-do.'],
  'calendar-personal': ['Die Erinnerung erhält der Eigentümer dieses persönlichen Kalenders.', 'The owner of this personal calendar receives the reminder.'],
  'calendar-shared': ['Die Erinnerung erhalten alle zum Versandzeitpunkt aktiven Nutzer mit Leserecht für diesen Kalender.', 'All users who are active and have read access to this calendar at send time receive the reminder.'],
  case: ['Die Erinnerung erhalten die aktuell für diesen Vorgang zuständigen Nutzer.', 'The users currently responsible for this case receive the reminder.'],
}

export default function ReminderFields({ values, onChange, dateLabel, timeLabel, required = true, disabled = false, recipientRule = 'case', showHint = true }) {
  const { language } = useLanguage()
  const en = language === 'en'
  // An inactive all-day deadline still has a mandatory date, but no reminder
  // time. The noon probe validates only that date; it is never persisted.
  const result = resolveReminderTime({ date: values.date || '', time: !required && !values.time ? '12:00' : values.time || '', occurrence: values.occurrence || null })
  const ambiguous = result.code === 'ambiguous-time' || result.ambiguous
  const change = (field, value) => { onChange(field, value); if (field !== 'occurrence') onChange('occurrence', null) }
  const hasInput = Boolean(values.date || values.time)
  return <>
    <label className="form-field"><span>{dateLabel ? translateStatic(language, dateLabel) : (en ? 'Reminder date' : 'Erinnerung am')}{required ? ' *' : ''}</span><input type="date" value={values.date || ''} required={required} disabled={disabled} onChange={(event) => change('date', event.target.value)} /></label>
    <label className="form-field"><span>{timeLabel ? translateStatic(language, timeLabel) : (en ? 'Reminder time' : 'Uhrzeit der Erinnerung')}{required ? ' *' : ''}</span><input type="time" value={values.time || ''} required={required} disabled={disabled} onChange={(event) => change('time', event.target.value)} /></label>
    {ambiguous && <label className="form-field"><span>{en ? 'Clock change: occurrence *' : 'Zeitumstellung: Vorkommen *'}</span><select required disabled={disabled} value={values.occurrence || ''} onChange={(event) => change('occurrence', event.target.value || null)}><option value="">{en ? 'Please select' : 'Bitte auswählen'}</option><option value="earlier">{en ? 'First occurrence (summer time)' : 'Erstes Vorkommen (Sommerzeit)'}</option><option value="later">{en ? 'Second occurrence (standard time)' : 'Zweites Vorkommen (Normalzeit)'}</option></select></label>}
    {hasInput && !result.valid && <p className="form-error" role="status">{reminderValidationMessage(result, language)}</p>}
    {required && result.valid && reminderMinuteState(result.dueAt) === 'missed' && <p className="form-field__hint" role="status">{en ? 'This time has already passed. No reminder will be sent for it.' : 'Dieser Zeitpunkt ist bereits verstrichen. Dafür wird keine Erinnerung versendet.'}</p>}
    {showHint && <p className="form-field__hint">{en ? 'Time zone: Europe/Berlin. Missed reminders are not sent later.' : 'Zeitzone: Europe/Berlin. Verpasste Erinnerungen werden nicht nachgeholt.'}{rules[recipientRule] ? ` ${rules[recipientRule][en ? 1 : 0]}` : ''}</p>}
  </>
}
